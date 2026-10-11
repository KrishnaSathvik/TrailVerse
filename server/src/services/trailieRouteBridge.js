'use strict';

const { isAcceptedCanonicalPlan, hasPriorPlanStructure } = require('../utils/canonicalPlanAcceptance');

/**
 * ROLLBACK ONLY — bridge from an admitted/prepared chat turn to the legacy
 * Trailie executor (`executeTrailieTurn`). Reached only when
 * TRAILIE_RUNTIME=legacy. The primary product path is modelFirstTrailie →
 * trailieSimpleRuntime (see docs/trailie-architecture.md).
 *
 * This bridge does NOT own admission/auth/quota/persistence/transport — the route
 * keeps those. It maps the prepared context into WP11A inputs, injects the real
 * evidence broker + a live OpenAI Responses adapter, runs `executeTrailieTurn`,
 * and returns the canonical result plus a rendered user-facing content string.
 */

const { executeTrailieTurn } = require('./trailieExecutionService');
const { buildProductionStopRouteResolver } = require('../utils/stopRouteArtifact');
const { buildProductionGeoCoordinateResolver } = require('../utils/productionGeoCoordinateResolver');
const { createEvidenceBrokerRuntime } = require('./evidenceBrokerRuntime');
const { createOpenAIResponsesAdapter } = require('./providers/openaiResponsesAdapter');
const { renderProseFromToolItinerary, isValidToolItinerary } = require('../utils/itineraryToolSchema');
const { mapInternalStageToProduct, PRODUCT_STAGES } = require('../utils/trailieTransportAdapter');
const { buildRevisionOneOutbound } = require('../utils/earlyRevisionEvents');
const { extractRefinementMutations } = require('../utils/itineraryCompleteness');
const { loadTargetPlanById } = require('../utils/targetPlanHydration');
const { sanitizeTrailieCitations } = require('../utils/sanitizeTrailieCitations');

let cachedAdapters = null;

// Live OpenAI Responses adapter — same construction the WP8 benchmark proved
// against the real API (new OpenAI({apiKey, maxRetries:0}) → responses adapter).
function getResponseAdapters() {
  if (cachedAdapters) return cachedAdapters;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('OPENAI_API_KEY missing'), { code: 'openai_api_key_missing' });
  // eslint-disable-next-line global-require
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  cachedAdapters = { openai: createOpenAIResponsesAdapter({ client }) };
  return cachedAdapters;
}

function resetForTests() { cachedAdapters = null; }

function latestUserMessage(messages) {
  for (let i = (messages || []).length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user' && typeof messages[i].content === 'string') return messages[i].content;
  }
  return '';
}

function priorHistory(messages) {
  const list = Array.isArray(messages) ? messages : [];
  // Everything up to (but not including) the final user message.
  let lastUserIdx = -1;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.role === 'user') { lastUserIdx = i; break; }
  }
  return list.slice(0, Math.max(0, lastUserIdx)).map((m) => ({ role: m.role, content: String(m.content || '') }));
}

function deriveRefinementManifestInput(preparedContext, messages) {
  const changes = extractRefinementMutations(latestUserMessage(messages)).flatMap((mutation) => {
    if (mutation.type === 'pace' && mutation.target === 'relaxed') return ['slower_pace'];
    if (mutation.type === 'avoid' && mutation.target === 'shuttle') return ['less_shuttle_reliance'];
    if (mutation.type === 'add' && mutation.target === 'sunset') return ['sunset_added'];
    return [];
  });
  const prior = buildClassifierPriorTripState(preparedContext);
  const currentAvoidsExposure = preparedContext?.planningState?.preferences?.avoidExposure === true
    || preparedContext?.constraints?.avoidExposure === true;
  if (prior?.preferences?.avoidExposure === true && currentAvoidsExposure) {
    changes.push('safety_constraint_preserved');
  }
  return { changes: [...new Set(changes)] };
}

function deriveTripDays(constraints) {
  const dates = constraints?.dates;
  if (dates && Number.isInteger(dates.durationDays) && dates.durationDays > 0) {
    return dates.durationDays;
  }
  // parseConstraints emits `numDays`; planningState uses `durationDays`.
  if (dates && Number.isInteger(dates.numDays) && dates.numDays > 0) {
    return dates.numDays;
  }
  if (dates?.start && dates?.end) {
    const start = new Date(dates.start);
    const end = new Date(dates.end);
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      return Math.round((end - start) / 86400000) + 1;
    }
  }
  return null;
}

function usableCoord(value, max) {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 && n >= -max && n <= max ? n : null;
}

// Map the legacy context's extracted parks (which carry real lat/lon) into the
// planner's resolved-entity shape. Without this, entities reach the planner with
// coordinates defaulted to 0,0 — which both (a) makes weather/astronomy collide on
// the shared `0|0` dedupeKey for multi-park turns and (b) queries evidence for the
// wrong physical location. Parks without usable coordinates are omitted (the WP2
// classifier can still resolve identity by name) rather than emitting 0,0.
function resolveEntitiesFromContext(preparedContext) {
  const {
    resolveDestinationsFromMessage,
    toPlannerEntities,
  } = require('../utils/genericDestinationResolver');
  const { buildTripScopeFromMessage } = require('../utils/roadTripContract');

  const tripScope =
    preparedContext?.constraints?.tripScope ||
    preparedContext?.tripState?.tripScope ||
    (preparedContext?.lastUserMessage
      ? buildTripScopeFromMessage(preparedContext.lastUserMessage)
      : null);

  // WP-TU Phase 2 Task 5 — `entryContext` (comparisonTargets/requestedDestinations)
  // is an ENTRY-TIME hint (e.g. a park_cta the traveler clicked before the
  // conversation started), not a current or persisted destination authority.
  // It must never outrank fresher signals: the persisted active trip
  // (`tripScope.destinations`, Task 4/4A's already-correct machinery) or the
  // CURRENT turn's actually-resolved destinations (`allExtractedParks`). Both
  // are checked first; entry targets are demoted to a fallback used only when
  // neither produces entities — e.g. a genuinely empty initial turn where a
  // park_cta entry is the only destination signal that exists yet.
  if (tripScope?.destinations?.length) {
    const destEntities = toPlannerEntities(tripScope.destinations, { includeUnresolvedCoords: false });
    if (destEntities.length > 0) return destEntities;
  }

  const parks = Array.isArray(preparedContext?.allExtractedParks) ? preparedContext.allExtractedParks : [];
  if (parks.length > 0) {
    // Hydrate missing lat/lon from the local catalog when parks were extracted without coords.
    const message = preparedContext?.lastUserMessage
      || parks.map((p) => p.parkName || p.parkCode).filter(Boolean).join(' and ');
    const catalogResolved = resolveDestinationsFromMessage(message);
    const byCode = new Map(catalogResolved.map((d) => [d.parkCode, d]));
    const entities = [];
    const seen = new Set();
    for (const park of parks) {
      const code = park?.parkCode ? String(park.parkCode).toLowerCase() : null;
      if (!code || seen.has(code)) continue;
      const catalog = byCode.get(code);
      const latitude = usableCoord(park.lat ?? park.latitude ?? catalog?.latitude, 90);
      const longitude = usableCoord(park.lon ?? park.longitude ?? catalog?.longitude, 180);
      if (latitude == null || longitude == null) continue;
      seen.add(code);
      entities.push({
        entityId: `nps:park:${code}`,
        displayName: park.parkName || park.fullName || catalog?.displayName || null,
        latitude,
        longitude,
        resolutionConfidence: 1,
      });
    }
    if (entities.length > 0) return entities;
  }

  // Entry-time fallback (Task 5) — used ONLY when neither the persisted
  // active trip nor the current turn's own extraction produced anything:
  // a genuinely empty initial turn (e.g. a park_cta entry with nothing else
  // yet) still deserves the destination the traveler arrived with.
  const entryTargets = [
    ...(preparedContext?.entryContext?.comparisonTargets || []),
    ...(preparedContext?.entryContext?.requestedDestinations || []),
  ];
  if (entryTargets.length) {
    const entryMessage = entryTargets.map((target) => target.name || target.parkName || target.parkCode).filter(Boolean).join(' and ');
    const catalogByCode = new Map(resolveDestinationsFromMessage(entryMessage).map((item) => [item.parkCode, item]));
    const entryEntities = [];
    const seen = new Set();
    for (const target of entryTargets) {
      const code = target?.parkCode ? String(target.parkCode).toLowerCase() : null;
      const catalog = code ? catalogByCode.get(code) : null;
      const latitude = usableCoord(target?.lat ?? target?.latitude ?? catalog?.latitude, 90);
      const longitude = usableCoord(target?.lon ?? target?.longitude ?? catalog?.longitude, 180);
      if (!code || seen.has(code) || latitude == null || longitude == null) continue;
      seen.add(code);
      entryEntities.push({
        entityId: `nps:park:${code}`,
        displayName: target.name || target.parkName || catalog?.displayName || null,
        latitude,
        longitude,
        resolutionConfidence: 1,
      });
    }
    if (entryEntities.length) return entryEntities;
  }

  // Non-NPS destinations (Valley of Fire, etc.) are geocoded in prep but never
  // appear in allExtractedParks. Without this, itinerary planning emits a hard
  // destination_identity requirement with a null entity and the broker throws.
  const meta = preparedContext?.resolvedMetadata || {};
  const latitude = usableCoord(meta.lat, 90);
  const longitude = usableCoord(meta.lon, 180);
  const displayName = meta.resolvedPlaceName || meta.parkName || null;
  if (latitude == null || longitude == null || !displayName) return [];
  const slug = String(displayName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!slug) return [];
  return [{
    entityId: `place:known:${slug}`,
    displayName,
    latitude,
    longitude,
    resolutionConfidence: 0.9,
  }];
}

function buildResolvedContext(preparedContext) {
  const constraints = preparedContext?.constraints || null;
  const parks = Array.isArray(preparedContext?.allExtractedParks) ? preparedContext.allExtractedParks : [];
  const primary = parks[0] || null;
  const meta = preparedContext?.resolvedMetadata || {};
  const primaryPark = (primary || meta.parkCode) ? {
    ...(primary || {}),
    parkCode: primary?.parkCode || meta.parkCode || null,
    parkName: primary?.parkName || primary?.fullName || meta.parkName || null,
    entityId: primary?.entityId
      || (primary?.parkCode || meta.parkCode
        ? `nps:park:${String(primary?.parkCode || meta.parkCode).toLowerCase()}`
        : null),
    latitude: primary?.latitude ?? primary?.lat ?? usableCoord(meta.lat, 90),
    longitude: primary?.longitude ?? primary?.lon ?? usableCoord(meta.lon, 180),
  } : null;
  const resolvedEntities = resolveEntitiesFromContext(preparedContext);
  return {
    resolvedEntities,
    primaryPark,
    dates: constraints?.dates || null,
    timezone: 'UTC',
    tripDays: deriveTripDays(constraints),
    destinationCount: resolvedEntities.length || parks.length || undefined,
  };
}

/**
 * WP-TU Phase 1c — project one or more raw destination entries (either
 * `resolveDestinationsFromMessage` output, shape `{displayName, parkCode}`,
 * or a catalog-enriched `{name, parkCode}` pair) into the bounded
 * `{name, parkCode}` shape `lastConversationalSubject` exposes.
 */
function toBoundedDestinationRef(d) {
  return { name: d.displayName || d.name || null, parkCode: d.parkCode || null };
}

/**
 * WP-TU Phase 1c — build the full `lastConversationalSubject` shape (ALL
 * destinations, not just the first) from a resolved destination list plus
 * the language that determines how they relate to each other. Reuses
 * `destinationRelationship.js`'s `resolveDestinationRelationship` — the same
 * resolver `turnUnderstanding.js` already uses for its own
 * `destinationRelationship`/`destinationRelationshipConfidence` fields — not
 * a second implementation.
 */
function buildConversationalSubject(destinations, relationshipText) {
  if (!destinations.length) return null;
  const { resolveDestinationRelationship } = require('../utils/destinationRelationship');
  const relationshipResult = resolveDestinationRelationship(relationshipText || '', destinations);
  return {
    subjectDestinations: destinations.map(toBoundedDestinationRef),
    primaryDestination: toBoundedDestinationRef(destinations[0]),
    destinationRelationship: relationshipResult.relationship,
  };
}

/**
 * WP-TU Phase 1c (TurnTripContext) — the most recent conversational SUBJECT,
 * independent of whatever trip is ACTIVE. "Redwood active -> 'Is October
 * good in Acadia?' -> 'What about November?'" must read the second turn as a
 * continuation of Acadia, not of Redwood — Redwood never left the
 * conversation, but it was not what the immediately preceding turn was
 * about. A multi-destination subject ("Yosemite or Sequoia for October?")
 * must carry BOTH destinations forward, never collapse to the first.
 *
 * Scans `conversation` backward, one TURN at a time (not globally). When the
 * turn being examined is an assistant message, the precedence within that
 * SAME turn is, in order:
 *   1. structured multi-destination metadata on the assistant message
 *      (`parkNames`, a real persisted field — see TripPlan.js's conversation
 *      subdocument schema) — relationship read from the paired user turn's
 *      text, never the assistant's own prose;
 *   2. the PAIRED USER TURN's own resolved destinations — ALL of them, via
 *      `resolveDestinationsFromMessage` — checked BEFORE the assistant's
 *      single `parkName` fallback below. A reply that echoes only one park
 *      name must never shadow a richer multi-destination user message that
 *      prompted it (the exact bug this ordering fixes: "Yosemite or
 *      Sequoia..." followed by an assistant reply carrying only
 *      `parkName: "Yosemite"` must still surface BOTH destinations, because
 *      the user's own message named both);
 *   3. a single assistant `parkName`, ONLY when neither of the above yielded
 *      anything for this turn.
 * A lone user message (no paired assistant reply reached yet in the scan)
 * uses its own resolved destinations directly. A bare follow-up naming
 * nothing of its own contributes nothing at any step, so the scan falls
 * through to the nearest earlier turn that actually named a subject.
 */
function deriveLastConversationalSubject(conversation) {
  if (!Array.isArray(conversation) || conversation.length === 0) return null;
  const { resolveDestinationsFromMessage } = require('../utils/genericDestinationResolver');

  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    const message = conversation[i];
    if (!message) continue;

    if (message.role === 'assistant') {
      const pairedUser = conversation[i - 1]?.role === 'user' ? conversation[i - 1] : null;

      // Precedence 1 — structured multi-destination echo. Relationship is
      // read from the PAIRED USER TURN's text, never the assistant's prose.
      if (Array.isArray(message.parkNames) && message.parkNames.length > 0) {
        const destinations = message.parkNames
          .filter(Boolean)
          .map((name) => {
            const catalogMatch = resolveDestinationsFromMessage(name)[0];
            return { displayName: name, parkCode: catalogMatch?.parkCode || null };
          });
        const subject = buildConversationalSubject(destinations, pairedUser?.content);
        if (subject) return subject;
      }

      // Precedence 2 — the PAIRED USER TURN's own resolved destinations,
      // ALL of them. Must be checked before the single-`parkName` fallback:
      // an assistant reply that only echoes one park name (or none at all)
      // must never shadow a richer multi-destination user message that
      // prompted it — that was this function's exact bug ("Yosemite or
      // Sequoia..." -> assistant echoes only "Yosemite" -> the paired user
      // turn's Sequoia was never reached).
      if (pairedUser && typeof pairedUser.content === 'string') {
        const destinations = resolveDestinationsFromMessage(pairedUser.content);
        const subject = buildConversationalSubject(destinations, pairedUser.content);
        if (subject) return subject;
      }

      // Precedence 3 — single assistant parkName, ONLY when nothing richer
      // (no parkNames, no resolvable paired user turn) was available.
      if (message.parkName) {
        return buildConversationalSubject([{ displayName: message.parkName, parkCode: message.parkCode || null }], '');
      }
    }

    if (message.role === 'user' && typeof message.content === 'string') {
      // A user message with no paired assistant reply after it in this scan
      // (e.g. the most recent turn has no reply yet). ALL destinations from
      // its own text.
      const destinations = resolveDestinationsFromMessage(message.content);
      const subject = buildConversationalSubject(destinations, message.content);
      if (subject) return subject;
    }
  }
  return null;
}

/**
 * WP-TU Phase 4 Task 10 — prior-target continuity input for
 * `resolveTargetTripId` (Task 9). Sibling scanner to
 * `deriveLastConversationalSubject` immediately above: same backward scan
 * over recent messages for the most relevant prior value, reused rather than
 * inventing a different mechanism. Simpler than the conversational-subject
 * scanner because `targetTripId` is already a flat, already-resolved string
 * stored directly on the message (Task 10's own write sites) — nothing here
 * re-derives a destination or re-classifies anything.
 */
function derivePriorTargetTripId(conversation) {
  if (!Array.isArray(conversation)) return null;
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    const message = conversation[i];
    if (message?.role === 'assistant' && message.targetTripId) {
      return String(message.targetTripId);
    }
  }
  return null;
}

/**
 * Classifier prior-trip contract for WP11A.
 *
 * `activeTripContext` is destination memory and does NOT carry the
 * `hasActiveTrip` / `hasItinerary` booleans the intent classifier requires.
 * Without these flags, anaphoric refinements ("make it more relaxed", "avoid
 * shuttle…") fall through to lexical transport/etc. intents.
 */
function buildClassifierPriorTripState(preparedContext = null) {
  const active = preparedContext?.activeTripContext && typeof preparedContext.activeTripContext === 'object'
    ? preparedContext.activeTripContext
    : null;
  const saved = preparedContext?.savedTripPlan || null;
  const stored = preparedContext?.storedTripContext || null;
  const meta = preparedContext?.resolvedMetadata || {};
  const existingPlan = meta.existingCanonicalPlan || null;
  const hasItinerary = hasPriorPlanStructure(saved?.plan)
    || hasPriorPlanStructure(existingPlan);
  const hasActiveTrip = Boolean(
    saved
    || stored
    || active?.primaryDestination
    || active?.lockedPlanDestination
    || hasItinerary
    || preparedContext?.planningState?.lastTravelerJob
    || meta.planningState?.lastTravelerJob
    || preparedContext?.planningState?.destination?.parkCode
  );
  const conversation = saved?.conversation || preparedContext?.conversation || [];
  const lastAssistant = [...conversation].reverse().find((message) => message?.role === 'assistant');
  return {
    ...(active || {}),
    // WP-TU Phase 2 Task 3 fix — `primaryDestination`/`lockedPlanDestination`
    // must represent the trip active BEFORE this turn, for
    // resolveTripContext's `activeDestination` derivation
    // (`priorTripState?.primaryDestination || priorTripState?.lockedPlanDestination`,
    // trailieTravelerJobResolver.js). `active` (`preparedContext.activeTripContext`)
    // is NOT that — by the time `prepareChatContext` returns,
    // `resolveActiveTripContext` (activeTripContextService.js) has already
    // overwritten it with THIS turn's own post-resolution destination
    // (verified: naming "Badlands" while the client's prior echo said Redwood
    // returns `activeTripContext.primaryDestination.parkCode === 'badl'`,
    // `resolutionSource: 'park_switch'`). `stored`
    // (`preparedContext.storedTripContext`, `ai.js:1079`,
    // `metadata.activeTripContext || null`) is captured BEFORE that
    // resolution runs and is the genuinely pre-turn, client-echoed value —
    // exactly what a real multi-turn conversation re-sends as `metadata.
    // activeTripContext` on the next request. Every OTHER `active`-derived
    // field on this object (mentionedDestinations, lastRecommendationList,
    // lastComparedOptions, recommendedOption, resolutionSource, ...) keeps
    // its existing, unrelated meaning from `active` and is untouched — only
    // these two destination fields change source. When `stored` supplies
    // neither (a genuine first-ever turn — nothing was active before it),
    // both correctly become `null`, not a fallback to `active`'s
    // freshly-resolved value, which would silently reintroduce this bug.
    primaryDestination: stored?.primaryDestination ?? null,
    lockedPlanDestination: stored?.lockedPlanDestination ?? null,
    hasActiveTrip,
    hasItinerary,
    lastTravelerJob: preparedContext?.planningState?.lastTravelerJob
      || lastAssistant?.intent?.travelerJob
      || active?.lastTravelerJob
      || null,
    activeDecision: preparedContext?.planningState?.activeDecision
      || meta.planningState?.activeDecision
      || active?.activeDecision
      || null,
    // WP-TU Phase 1c — independent of `active`/primaryDestination above:
    // this is the conversational SUBJECT, not the active TRIP.
    lastConversationalSubject: deriveLastConversationalSubject(conversation),
    // WP-TU Phase 4 Task 10 — prior-target continuity for
    // resolveTargetTripId (Task 9), sibling to lastConversationalSubject.
    priorTargetTripId: derivePriorTargetTripId(conversation),
    ...(preparedContext?.entryContext ? { entryContext: preparedContext.entryContext } : {}),
    ...(existingPlan ? { existingCanonicalPlan: existingPlan } : {}),
  };
}

/**
 * Bind WP11A product lifecycle events onto a WP10 transport adapter.
 * Route owns admission `responseStarted` and the authoritative terminal
 * `responseFinalized` — those event types are intentionally ignored here.
 *
 * `itinerary_ready` must publish the Stage-14 revision-1 envelope
 * (`buildRevisionOneOutbound`) so the client early-revision validator can
 * reveal the itinerary card. A thin `{ itineraryHash }` payload faults closed.
 */
function createTrailieStreamEventBinder({
  transport,
  getDisplay = () => ({}),
  responseIdentity = null,
  parkName = null,
  parkCode = null,
  provider = 'openai',
  model = null,
} = {}) {
  if (!transport) throw new Error('createTrailieStreamEventBinder: transport required');
  let streamedContent = '';
  let activeAttempt = null;

  const resetProvisionalContent = () => {
    if (!streamedContent) return false;
    streamedContent = '';
    transport.contentReset();
    return true;
  };

  const emitCanonicalEvent = (event) => {
    if (!event || typeof event.type !== 'string') return;
    switch (event.type) {
      case 'response_started':
      case 'response_finalized':
      case 'error':
        // Admission + terminal stay on the route (exact-once finalize payload).
        return;
      case 'attempt_started': {
        const attempt = Number(event.payload?.attempt);
        if (!Number.isInteger(attempt) || attempt <= 0) return;
        // Rejection normally clears immediately. This start boundary is a
        // defensive ownership backstop and still runs before the new attempt's
        // first delta.
        if (activeAttempt != null && attempt > activeAttempt) resetProvisionalContent();
        if (activeAttempt == null || attempt > activeAttempt) activeAttempt = attempt;
        return;
      }
      case 'attempt_rejected': {
        const attempt = Number(event.payload?.attempt);
        if (!Number.isInteger(attempt) || attempt <= 0 || attempt !== activeAttempt) return;
        resetProvisionalContent();
        return;
      }
      case 'progress': {
        const legacyStage = event.payload?.stage;
        // Stages emitted under their PRODUCT name need no mapping — the adapter
        // accepts them for v2 and passes them verbatim for legacy, which is why
        // the lifecycle states added in this pass required no transport change.
        const mapped = mapInternalStageToProduct(legacyStage);
        const stage = mapped || (PRODUCT_STAGES.has(legacyStage) ? legacyStage : null);
        // Sanitized by the adapter; forwarded unread here.
        transport.progress({ stage, legacyStage, refinementTarget: event.payload?.refinementTarget });
        return;
      }
      case 'evidence_ready': {
        transport.evidenceReady({
          coverage: event.payload?.coverage,
          freshness: event.payload?.freshness,
          publicSources: Array.isArray(event.payload?.publicSources)
            ? event.payload.publicSources
            : [],
          display: getDisplay() || {},
        });
        return;
      }
      case 'content_delta': {
        const content = typeof event.payload?.content === 'string' ? event.payload.content : '';
        if (!content) return;
        streamedContent += content;
        transport.contentDelta({ content });
        return;
      }
      case 'itinerary_ready': {
        const display = getDisplay() || {};
        const finalizedItinerary = event.payload?.itineraryData || event.payload?.canonicalPlan || null;
        const identity = responseIdentity && responseIdentity.responseId
          ? responseIdentity
          : null;
        if (identity && finalizedItinerary) {
          const outbound = buildRevisionOneOutbound({
            responseIdentity: identity,
            finalizedItinerary,
            parkName: parkName || display.parkName || null,
            parkCode: parkCode || null,
            provider,
            model,
            travelLogistics: event.payload?.travelLogistics || null,
            responseArtifacts: event.payload?.responseArtifacts || null,
            intent: event.payload?.intent || null,
            presentation: event.payload?.presentation || null,
          });
          if (outbound) {
            transport.itineraryReady({
              response: outbound.response,
              canonicalPlan: outbound.canonicalPlan,
            });
            return;
          }
        }
        // Fail closed to thin payload only when identity is unavailable —
        // client will fault rather than mount a forged card.
        transport.itineraryReady({
          response: { itineraryHash: event.payload?.itineraryHash || null },
          canonicalPlan: finalizedItinerary,
        });
        return;
      }
      case 'prose_ready': {
        transport.proseReady({
          response: event.payload?.response || null,
          canonicalPlan: event.payload?.canonicalPlan || null,
        });
        return;
      }
      default:
        return;
    }
  };

  return {
    emitCanonicalEvent,
    getStreamedContent: () => streamedContent,
    /**
     * When the model produced no text deltas (common for tool-first itineraries),
     * emit the rendered display string once so the client still gets progressive
     * `chunk` / `content_delta` before the terminal.
     */
    ensureDisplayContent(content) {
      const text = typeof content === 'string' ? content : '';
      if (!text || streamedContent.length > 0) return streamedContent;
      streamedContent = text;
      transport.contentDelta({ content: text });
      return streamedContent;
    },
  };
}

/**
 * Run the WP11A runtime for an admitted/prepared turn.
 * @returns {Promise<{ result: object, content: string }>}
 */
async function runTrailieFromPreparedContext({
  preparedContext, messages, signal = null, emitCanonicalEvent = null,
  // WP-TU Phase 4 Task 10E — the ONE logical responseId this turn's caller
  // (ai.js) already minted via `createTurnResponseIdentity`, threaded
  // through so a cross-plan target mutation can project it onto the
  // target's own version WITHOUT this file or executeTrailieTurn ever
  // minting a second identity. Null for callers that don't supply one
  // (e.g. every guest call site — cross-plan mutation never applies there).
  responseId = null,
} = {}) {
  const broker = createEvidenceBrokerRuntime();
  const result = await executeTrailieTurn({
    userMessage: latestUserMessage(messages),
    conversationContext: { history: priorHistory(messages) },
    tripState: buildClassifierPriorTripState(preparedContext),
    planningState: preparedContext?.planningState || null,
    constraints: preparedContext?.constraints || null,
    resolvedContext: buildResolvedContext(preparedContext),
    refinement: deriveRefinementManifestInput(preparedContext, messages),
    // WP-TU Phase 4 Task 10 — threaded through the same way
    // planningState/constraints/tripState already are. Neither is
    // interpreted here; `resolveTargetTripId` (Task 9) reads both, once
    // classification exists, inside executeTrailieTurn.
    candidatePlans: preparedContext?.candidatePlans || [],
    activeTripId: preparedContext?.activeTripId || null,
    // WP-TU Phase 4 Task 10B — the owner `candidatePlans` (and this trip)
    // were scoped under; required for the ownership check a cross-plan
    // hydration fetch below must apply. Null for guests.
    userId: preparedContext?.userId || null,
    turnResponseId: responseId,
    signal,
    emitCanonicalEvent,
  }, {
    enabled: true,
    resolveEvidence: (args) => broker.resolveEvidence(args),
    resolveStopRoute: buildProductionStopRouteResolver({ dispatchEphemeral: (args) => broker.dispatchEphemeral(args) }),
    resolveStopCoordinates: buildProductionGeoCoordinateResolver({
      dispatchEphemeral: (args) => broker.dispatchEphemeral(args),
    }),
    // WP-TU Phase 4 Task 10B — single-document-by-id hydration for a
    // RESOLVED historical target that differs from the active trip. Same
    // injection seam as `resolveEvidence` immediately above: no default in
    // executeTrailieTurn, real DB implementation supplied only here.
    loadTargetPlan: ({ tripId, userId }) => loadTargetPlanById({ tripId, userId }),
    responseAdapters: getResponseAdapters(),
    semanticDispatch: require('./semanticModelDispatcher').createSemanticModelDispatcher({ getAdapters: getResponseAdapters, signal }),
  });
  return { result, content: renderTrailieContent(result) };
}

// Turn the canonical result into a single user-facing string. Itinerary turns
// use the tool `intro` as the spoken opening; the structured plan is rendered
// by the existing itinerary card, not by synthesizing "At a glance".
function renderTrailieContent(result) {
  const text = result?.response?.text;
  if (typeof text === 'string' && text.trim()) {
    return sanitizeTrailieCitations(text.trim()).content;
  }
  const intro = renderProseFromToolItinerary(result?.canonicalPlan);
  if (intro) return sanitizeTrailieCitations(intro).content;
  if (isValidToolItinerary(result?.canonicalPlan)) return '';
  if (result?.status === 'evidence_incomplete') {
    return "I can't confirm that safely right now — the current, authoritative details needed to answer weren't available. Please check the official park source before relying on it.";
  }
  if (result?.status === 'constraint_infeasible') {
    const infeasible = result?.response?.text;
    if (typeof infeasible === 'string' && infeasible.trim()) {
      return sanitizeTrailieCitations(infeasible.trim()).content;
    }
    return "I can't verify an itinerary that satisfies your hard driving limit with the requested route as written.";
  }
  return "I couldn't complete this request. Please try again.";
}

// Compact, privacy-safe telemetry for logs/harness — no prompt, no private state,
// no raw evidence bodies, no provider payloads.
function summarizeTrailieTelemetry(result) {
  const lastAttempt = (result.attempts || []).at(-1) || null;
  return {
    status: result.status,
    intent: result.intent?.primaryIntent || null,
    depth: result.intent?.depth || null,
    freshness: result.intent?.freshness || null,
    verticals: result.intent?.verticals || [],
    evidence: result.evidence || null,
    coordinateResolution: result.telemetrySummary?.coordinateResolution || null,
    // Bounded stage attribution: slugs and integers only. Exists so a slow turn
    // can be pointed at instead of split into "generation" and a residual.
    latencyBreakdown: result.latencyBreakdown || null,
    // Prefer routeDecision; fall back to last attempt tier for stream/final parity.
    selectedTier: result.routeDecision?.selectedTier || lastAttempt?.tier || null,
    deterministic: result.routeDecision?.deterministic || false,
    model: lastAttempt?.model || null,
    reasoningEffort: lastAttempt?.reasoningEffort || null,
    attemptCount: (result.attempts || []).length,
    // PER-ATTEMPT ATTRIBUTION. The projection FORWARDS what finalize/the router
    // already computed for the attempt; it never re-runs or re-derives a
    // validator. Execution saying reason=A while telemetry says reason=B is the
    // failure mode this shape exists to make impossible. Diagnostics only —
    // bounded codes, bounded stage labels and token counts, never
    // chain-of-thought, prompt text, or traveler content.
    attempts: (result.attempts || []).map((a) => ({
      tier: a.tier, model: a.model, reasoningEffort: a.reasoningEffort,
      attemptKind: a.attemptKind, validationStatus: a.validationStatus,
      validationReasonCodes: a.validationReasonCodes || [],
      validationStage: a.validationStage || null,
      // WHAT the failing target was. Forwarded verbatim, never recomputed: the
      // 2026-08-25 live run's terra miss reached the envelope with a reason
      // code and no evidence because this projection dropped the field.
      validationTargetDiagnostics: a.validationTargetDiagnostics || null,
      validationDiagnostics: a.validationDiagnostics || null,
      // MONOTONIC REPAIR ATTRIBUTION. Whether this attempt moved the turn
      // forward, stood still, or gave back a requirement an earlier candidate
      // already satisfied — the distinction an attempt COUNT cannot make.
      // Bounded obligation ids and one verdict; no plan content, no reasoning.
      repairProgress: a.repairProgress || null,
      outputPolicy: a.outputPolicy || null,
      completion: a.completion || null,
      usage: a.usage, cost: a.cost, latencyMs: a.latencyMs,
    })),
    validation: result.validation || null,
    itineraryHash: result.itineraryHash || null,
    // Did the turn actually end with a canonical plan, and if not, was one owed?
    // `hasPlan` is the observable outcome; `canonicalPlanState` reads the
    // authoritative execution contract rather than guessing from validation.
    hasPlan: Boolean(result.canonicalPlan),
    canonicalPlanState: result.canonicalPlan
      ? 'accepted'
      : (result.artifactFulfillment?.required === true
        || result.telemetrySummary?.artifactFulfillment?.required === true
        || result.telemetrySummary?.executionContract?.requiresCanonicalPlanArtifact === true
        ? 'rejected'
        : 'not_requested'),
    responseKind: result.response?.kind || null,
    terminalReason: result.terminalReason || null,
    totalCost: result.telemetrySummary?.totalCost || null,
    // Bounded diagnostics. Without these a gate has to re-derive the whole
    // understanding in-process to find out which contract governed a turn and
    // whether the promised artifact was actually delivered.
    // Never includes chain-of-thought, semantic prompts, or supporting spans.
    // Rollout segmentation for the strict create_itinerary contract. Config
    // metadata: true/false when the tool was built, null when it never was.
    createItineraryStrict: result.telemetrySummary?.createItineraryStrict ?? null,
    turnUnderstandingSource: result.telemetrySummary?.turnUnderstandingSource || null,
    // R2 — bounded attempt-1 directive summary: rule counts, exposure legal
    // pool (machine-selected public place names), and how many exposure-
    // relevant candidates were removed from the construction catalogue before
    // generation. Null on ordinary turns.
    operationalDirectives: result.telemetrySummary?.operationalDirectives ?? null,
    semanticResolver: result.telemetrySummary?.semanticResolver || null,
    executionContract: result.telemetrySummary?.executionContract || null,
    artifactFulfillment: result.telemetrySummary?.artifactFulfillment
      || (result.artifactFulfillment
        ? {
          requested: result.artifactFulfillment.requested,
          required: result.artifactFulfillment.required,
          fulfilled: result.artifactFulfillment.fulfilled,
          degraded: result.artifactFulfillment.degraded,
          reasonCode: result.artifactFulfillment.reasonCode,
        }
        : null),
    failureClasses: result.telemetrySummary?.failureClasses || [],
  };
}

module.exports = {
  // Pure projection seam, exposed so the attempt shape can be tested end to end.
  summarizeV2TelemetryForTests: summarizeTrailieTelemetry,
  buildClassifierPriorTripState,
  buildResolvedContext,
  createTrailieStreamEventBinder,
  createV2StreamEventBinder: createTrailieStreamEventBinder,
  deriveRefinementManifestInput,
  getResponseAdapters,
  latestUserMessage,
  priorHistory,
  renderTrailieContent,
  renderV2Content: renderTrailieContent,
  resetForTests,
  resolveEntitiesFromContext,
  runTrailieFromPreparedContext,
  runTrailieV2FromPreparedContext: runTrailieFromPreparedContext,
  summarizeTrailieTelemetry,
  summarizeV2Telemetry: summarizeTrailieTelemetry,
};
