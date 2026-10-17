'use strict';

/**
 * Stage 14.2 — typed early-revision events for the authenticated streaming route.
 *
 * THE CENTRAL RULE: every event carries COMPLETE, server-built canonical
 * persistence objects (`response` envelope + `canonicalPlan`), never a loose bag
 * of fields the client would have to reassemble. Stage 8 removed client-side
 * response reconstruction; emitting fragments here would quietly reintroduce it.
 *
 * This module is pure with respect to I/O: it builds payloads and enforces
 * ordering/immutability invariants. It performs NO persistence, holds no database
 * handle, and knows nothing about trips.
 *
 * Scope: only `POST /chat-stream` (authenticated streaming, tool-first, itinerary
 * path) emits these. Every other route keeps its existing terminal-only behavior.
 */

const { buildCanonicalTrailieResponse } = require('./canonicalResponse');
const { buildPlanDocument } = require('./trailiePipelineUtils');
const { LIFECYCLE_STATUS } = require('./planPersistence');
const { renderDeterministicItineraryResponse } = require('./deterministicItineraryRenderer');

/** Bounded event vocabulary. Nothing outside this set may be emitted here. */
const EARLY_EVENT = {
  RESPONSE_STARTED: 'response_started',
  ITINERARY_READY: 'itinerary_ready',
  PROSE_GENERATION_STARTED: 'prose_generation_started',
  PROSE_READY: 'prose_ready',
};

/** Bounded internal failure codes. Never a provider string, never plan data. */
const EARLY_EVENT_FAILURE = {
  ITINERARY_HASH_MISMATCH: 'revision_itinerary_hash_mismatch',
  ITINERARY_DATA_MISMATCH: 'revision_itinerary_data_mismatch',
};

/**
 * Revision 1 — the itinerary_ready checkpoint.
 *
 * Built from the FROZEN finalized itinerary, so the envelope and the plan describe
 * exactly the same object. `content` is deliberately empty: canonical content feeds
 * share and export, and a placeholder would be distributed as though the model
 * wrote it.
 */
function buildRevisionOneOutbound({
  responseIdentity,
  finalizedItinerary,
  feasibilityIssues = [],
  planScore = null,
  corrections = [],
  parkName = null,
  parkCode = null,
  provider = null,
  model = null,
  travelLogistics = null,
  responseArtifacts = null,
  intent = null,
  presentation = null,
  now = () => new Date().toISOString(),
}) {
  if (!finalizedItinerary) return null;

  const itineraryReadyAt = now();
  const response = buildCanonicalTrailieResponse({
    responseId: responseIdentity.responseId,
    responseVersion: responseIdentity.responseVersion,
    responseRevision: 1,
    previousRevision: null,
    lifecycleStatus: LIFECYCLE_STATUS.ITINERARY_READY,
    itineraryReadyAt,
    processedContent: '',
    itineraryData: finalizedItinerary,
    planScore,
    corrections,
    feasibilityIssues,
    provider,
    model,
  });

  const responseWithPresentation = {
    ...response,
    ...(travelLogistics ? { travelLogistics } : {}),
    ...(responseArtifacts ? { responseArtifacts } : {}),
    ...(intent ? { intent } : {}),
    ...(presentation ? { presentation } : {}),
  };

  const canonicalPlan = buildPlanDocument({
    itineraryData: finalizedItinerary,
    parkName,
    parkCode,
    reviewMeta: null, // shadow review is scheduled at the terminal revision only
    auditTrail: null, // the audit trail describes the COMPLETE response
    identity: {
      responseId: responseWithPresentation.responseId,
      responseVersion: responseWithPresentation.responseVersion,
      contentHash: responseWithPresentation.contentHash,
      itineraryHash: responseWithPresentation.itineraryHash,
    },
    feasibilityIssues,
  });

  // The plan carries the revision so extractPlanIdentity sees a checkpoint rather
  // than a terminal response.
  const revisionOnePlan = canonicalPlan && {
    ...canonicalPlan,
    responseRevision: 1,
    previousRevision: null,
    lifecycleStatus: LIFECYCLE_STATUS.ITINERARY_READY,
    itineraryReadyAt,
  };

  return {
    response: responseWithPresentation,
    canonicalPlan: revisionOnePlan,
    /**
     * Stage 14.2A §1 — the IMMUTABLE snapshot of exactly what `itinerary_ready`
     * published. Every later fail-safe rebuilds from THIS, never from mutable route
     * state, because a client may already have persisted revision 1 and its
     * itineraryHash is immutable from that moment on.
     */
    snapshot: Object.freeze({
      responseId: responseWithPresentation.responseId,
      responseVersion: responseWithPresentation.responseVersion,
      itineraryHash: responseWithPresentation.itineraryHash,
      revision1Response: responseWithPresentation,
      revision1CanonicalPlan: revisionOnePlan,
      frozenItineraryData: finalizedItinerary,
      feasibilityIssues,
      corrections,
      planScore,
      parkName,
      parkCode,
    }),
  };
}

/**
 * Revision 2 — the EXPLICIT successor of a revision-1 checkpoint.
 *
 * Distinct from the `done` terminal envelope, which must stay direct-terminal
 * (no `expectedPreviousRevision`) so an old client can persist it with no stored
 * revision 1. See buildTerminalOutboundCompatibility below.
 */
function buildRevisionTwoOutbound({
  responseIdentity,
  revisionOne,
  finalizedItinerary,
  selectedProse,
  usedDeterministicFallback = false,
  feasibilityIssues = [],
  planScore = null,
  corrections = [],
  parkName = null,
  parkCode = null,
  provider = null,
  model = null,
  reviewMeta = null,
  auditTrail = null,
  now = () => new Date().toISOString(),
}) {
  const proseReadyAt = now();
  const response = buildCanonicalTrailieResponse({
    responseId: responseIdentity.responseId,
    responseVersion: responseIdentity.responseVersion,
    responseRevision: 2,
    previousRevision: 1,
    lifecycleStatus: usedDeterministicFallback
      ? LIFECYCLE_STATUS.FALLBACK_COMPLETE
      : LIFECYCLE_STATUS.PROSE_READY,
    proseReadyAt,
    processedContent: selectedProse,
    itineraryData: finalizedItinerary,
    planScore,
    corrections,
    feasibilityIssues,
    provider,
    model,
    reviewMeta,
  });

  const canonicalPlan = buildPlanDocument({
    itineraryData: finalizedItinerary,
    parkName,
    parkCode,
    reviewMeta,
    auditTrail,
    identity: {
      responseId: response.responseId,
      responseVersion: response.responseVersion,
      contentHash: response.contentHash,
      itineraryHash: response.itineraryHash,
    },
    feasibilityIssues,
  });

  return {
    response,
    canonicalPlan: canonicalPlan && {
      ...canonicalPlan,
      responseRevision: 2,
      previousRevision: 1,
      lifecycleStatus: response.lifecycleStatus,
      // Carried forward so a restored plan still knows when the card became durable.
      ...(revisionOne?.canonicalPlan?.itineraryReadyAt
        ? { itineraryReadyAt: revisionOne.canonicalPlan.itineraryReadyAt } : {}),
      proseReadyAt,
    },
    // The intra-turn compare-and-swap the client must send with this write. It is
    // deliberately OUTSIDE the envelope so the terminal `done` payload can never
    // inherit it (that would make `done` unsavable by an old client).
    expectedPreviousRevision: 1,
  };
}

/**
 * §7 — the frozen itinerary must be identical across revisions.
 *
 * Checked BEFORE `prose_ready` is emitted. Returns a bounded failure code; the
 * caller fails closed into existing safe route behavior. Never surfaces plan data.
 */
function assertItineraryUnchanged({ revisionOne, revisionTwo }) {
  if (!revisionOne || !revisionTwo) return { ok: true, code: null };
  if (revisionOne.response.itineraryHash !== revisionTwo.response.itineraryHash) {
    return { ok: false, code: EARLY_EVENT_FAILURE.ITINERARY_HASH_MISMATCH };
  }
  if (revisionOne.canonicalPlan && revisionTwo.canonicalPlan
      && revisionOne.canonicalPlan.itineraryHash !== revisionTwo.canonicalPlan.itineraryHash) {
    return { ok: false, code: EARLY_EVENT_FAILURE.ITINERARY_DATA_MISMATCH };
  }
  return { ok: true, code: null };
}

/**
 * Stage 14.2A §2 — MISMATCH FAIL-SAFE terminal.
 *
 * When the candidate revision 2 disagrees with the published revision 1, the
 * candidate plan and its prose are DISCARDED entirely. Falling through to the
 * ordinary terminal `done` would be unsafe: a client that already persisted
 * revision 1 holds an immutable itineraryHash, so a `done` carrying the mismatched
 * itinerary would be rejected as `revision_itinerary_hash_changed` and the user
 * would be left with an unsavable response.
 *
 * The safe terminal is therefore rebuilt from the revision-1 SNAPSHOT:
 *   - same responseId and responseVersion
 *   - revision-1 frozen itinerary, byte-for-value, same hash
 *   - deterministic prose rendered from that same frozen itinerary
 *   - NO revision fields ⇒ direct-terminal, savable with or without a stored rev 1
 *
 * @returns {Object|null} null when safe prose cannot be produced (caller emits the
 *   existing singular route error and leaves a persisted revision 1 valid).
 */
function buildMismatchSafeTerminal({
  snapshot,
  resolvedMetadata = {},
  provider = null,
  model = null,
  auditTrail = null,
  reviewMeta = null,
}) {
  if (!snapshot || !snapshot.frozenItineraryData) return null;
  // A terminal built from an itinerary with no renderable day would be a
  // title-only "plan" — worse than the route error, because it would persist as a
  // valid terminal response. Refuse and let the caller emit the bounded error.
  const days = snapshot.frozenItineraryData.days;
  if (!Array.isArray(days) || days.length === 0) return null;

  let prose;
  try {
    prose = renderDeterministicItineraryResponse({
      itinerary: snapshot.frozenItineraryData,
      feasibilityIssues: snapshot.feasibilityIssues || [],
      corrections: snapshot.corrections || [],
      resolvedMetadata: { parkName: snapshot.parkName || resolvedMetadata.parkName || null },
    });
  } catch {
    return null; // deterministic construction itself failed → caller errors out
  }
  if (!prose || !prose.trim()) return null;

  // Direct-terminal: NO responseRevision, NO previousRevision, NO lifecycleStatus,
  // and never an expectedPreviousRevision. Missing revision normalizes to terminal 2.
  const envelope = buildCanonicalTrailieResponse({
    responseId: snapshot.responseId,
    responseVersion: snapshot.responseVersion,
    processedContent: prose,
    itineraryData: snapshot.frozenItineraryData, // revision-1 plan, unchanged
    planScore: snapshot.planScore || null,
    corrections: snapshot.corrections || [],
    feasibilityIssues: snapshot.feasibilityIssues || [],
    provider,
    model,
    reviewMeta,
  });

  const canonicalPlan = buildPlanDocument({
    itineraryData: snapshot.frozenItineraryData,
    parkName: snapshot.parkName,
    parkCode: snapshot.parkCode,
    reviewMeta,
    auditTrail,
    identity: {
      responseId: envelope.responseId,
      responseVersion: envelope.responseVersion,
      contentHash: envelope.contentHash,
      itineraryHash: envelope.itineraryHash,
    },
    feasibilityIssues: snapshot.feasibilityIssues || [],
  });

  return {
    envelope,
    canonicalPlan,
    prose,
    itineraryData: snapshot.frozenItineraryData,
    usedDeterministicFallback: true,
  };
}

/**
 * Single-emission coordinator. Repeated internal callbacks (thinking-stage hooks
 * fire more than once) must never duplicate an event, and nothing may be emitted
 * after the terminal `done`.
 *
 * @param {Object} params
 * @param {Function} params.emit    (payload) => void — the SSE writer
 * @param {boolean}  params.enabled feature flag; false ⇒ every method is a no-op
 */
function createEarlyEventEmitter({ emit, enabled = false, now = () => Date.now() } = {}) {
  const sent = new Set();
  const startedAt = now();
  const timings = {
    timeToItineraryReadyMs: null,
    timeToProseReadyMs: null,
    timeToResponseCompleteMs: null,
  };
  let terminal = false;

  const once = (type, payload) => {
    if (!enabled || terminal || sent.has(type)) return false;
    sent.add(type);
    emit({ type, ...payload });
    return true;
  };

  return {
    enabled,
    timings,
    sentEvents: () => [...sent],

    responseStarted({ responseId, requiresStructuredItinerary }) {
      return once(EARLY_EVENT.RESPONSE_STARTED, { responseId, requiresStructuredItinerary });
    },

    /** @param {Object} outbound  { response, canonicalPlan } from buildRevisionOneOutbound */
    itineraryReady(outbound) {
      if (!outbound) return false;
      const ok = once(EARLY_EVENT.ITINERARY_READY, {
        response: outbound.response,
        canonicalPlan: outbound.canonicalPlan,
      });
      if (ok) timings.timeToItineraryReadyMs = now() - startedAt;
      return ok;
    },

    proseGenerationStarted({ responseId }) {
      return once(EARLY_EVENT.PROSE_GENERATION_STARTED, { responseId });
    },

    /** @param {Object} outbound  { response, canonicalPlan, expectedPreviousRevision } */
    proseReady(outbound) {
      if (!outbound) return false;
      const ok = once(EARLY_EVENT.PROSE_READY, {
        response: outbound.response,
        canonicalPlan: outbound.canonicalPlan,
        expectedPreviousRevision: outbound.expectedPreviousRevision,
      });
      if (ok) timings.timeToProseReadyMs = now() - startedAt;
      return ok;
    },

    /** Marks the terminal `done`; no early event may follow it. */
    sealTerminal() {
      terminal = true;
      timings.timeToResponseCompleteMs = now() - startedAt;
      return timings;
    },
  };
}

module.exports = {
  EARLY_EVENT,
  EARLY_EVENT_FAILURE,
  buildRevisionOneOutbound,
  buildRevisionTwoOutbound,
  buildMismatchSafeTerminal,
  assertItineraryUnchanged,
  createEarlyEventEmitter,
};
