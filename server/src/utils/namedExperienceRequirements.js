'use strict';

/**
 * PHASE 9C.1D.5B — EXPLICIT NAMED-EXPERIENCE REQUIREMENTS.
 *
 * THE DEFECT (9C.1D.4 Yosemite, 2026-09-14)
 * -----------------------------------------
 * "Hike the Mist Trail … including Vernal Fall Footbridge and Vernal Fall"
 * never became a requirement. Only the category survived (`requested_hike`),
 * the identity retry steered the model to other catalogue trails, and
 * Bridalveil Fall Trailhead — `type: trail` — satisfied the generic check. The
 * plan was accepted without the one experience the traveler named.
 *
 * THE CONTRACT
 * ------------
 *   "include a hike"      → generic obligation only; any grounded hike may satisfy it.
 *   "hike the Mist Trail" → generic obligation AND a named obligation bound to the
 *                           evidence identity resolved for "Mist Trail".
 *
 * A named obligation is satisfied ONLY by a stop whose own name resolves —
 * through the same matcher `stopIdentityResolution` uses — to that identity.
 * Never by stop type, category, token overlap, proximity, activity-group
 * membership, or a model-authored `evidenceRef`.
 *
 * Resolution runs against the FROZEN bundle, which is the full authoritative
 * candidate universe of this turn: the store query is uncapped and the coverage
 * evaluator filters by validity/authority, never by count. The only cap is the
 * prompt render window — which is why resolved identities are PINNED into it.
 *
 * A named experience with no authoritative identity fails closed before any
 * generation is dispatched. Aliases/containment ("Mist Trail" ↔ "Mist and John
 * Muir Trailhead", Vernal Fall ⊂ Mist Trail) are Phase 9C.1D.5C — until then
 * they are simply not equivalent.
 */

const { canonicalExperienceKey } = require('./canonicalExperience');
const { matchEvidencePlace, hasPlaceCatalogue } = require('./stopIdentityResolution');
const { buildRelationshipIndexFromEvidence } = require('./experienceRelationships');
const { entityIdForEvidence, sameAsNeighbours } = require('./stableEvidenceEntity');
const { PARK_NAME_TO_CODE } = require('./parkExtractor');
const { CITIES } = require('./cityCoordinates');
const { STATE_NAMES } = require('./discoverUtils');
const { officialPlacesMentionedIn } = require('./officialPlaceIndex');

const MAX_NAMED_REQUESTS = 6;
/**
 * Phase 9C.1D.5C-D — at most this many DIRECT authoritative `same_as`
 * neighbours widen one obligation (sorted, so the choice is deterministic).
 */
const MAX_SAME_AS_EQUIVALENTS = 4;
const MAX_NAME_CHARS = 80;

/**
 * Explicit request frames. Longest alternatives first so "hiking" is never read
 * as "hike" + "ing". Matched case-insensitively; the NAME that follows must be
 * a capitalized proper name, so "include a hike" can never produce a name.
 */
const FRAMES = [
  "don't skip", 'don’t skip', 'do not skip', "don't miss", 'don’t miss', 'do not miss',
  'stopping at', 'stops at', 'stop at',
  'including', 'include',
  'visiting', 'visit',
  'hiking', 'hike',
  'walking', 'walk',
  'climbing', 'climb',
  'seeing', 'see',
  'doing', 'do',
];
/** Frames that by themselves say "this is a trail/route experience". */
const STRONG_FRAMES = new Set(['hiking', 'hike', 'walking', 'walk', 'climbing', 'climb']);

const FRAME_RE = new RegExp(
  `\\b(${FRAMES.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s+(?:the\\s+)?`,
  'gi'
);

// A period belongs to a name only as an abbreviation ("St. Mary Lake"); anywhere
// else it ends the sentence, and the name with it.
const WORD = String.raw`(?:(?:St|Mt|Ft|Pt)\.|[A-Z][A-Za-z0-9'’\-]*)`;
const CONNECTOR = String.raw`(?:of|the|de|del|la|le|du|des|y)`;
const NAME = String.raw`${WORD}(?:\s+(?:${CONNECTOR}\s+){0,2}${WORD})*`;
const NAME_LIST_RE = new RegExp(
  String.raw`(${NAME})((?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)(?:the\s+)?${NAME})*)`,
  'y'
);
const SPLIT_LIST_RE = /\s*,\s*(?:and\s+)?|\s+and\s+/;

/** A first token that makes a capitalized phrase a time, not a place. */
const TEMPORAL_FIRST_TOKENS = new Set([
  'day', 'days', 'morning', 'afternoon', 'evening', 'night', 'tonight', 'today', 'tomorrow',
  'weekend', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', 'spring', 'summer', 'fall', 'autumn', 'winter',
  'i', 'we', 'you', 'it', 'my', 'our',
]);

/** Area nouns: a name ENDING in one describes a region, not an experience. */
const REGION_ENDING = /\b(?:valley|village|region|district|country|area|county|national (?:park|monument|forest|preserve|seashore|lakeshore|recreation area|historic(?:al)? (?:site|park))|state park)$/;

/** Stripped before comparing against destination keys ("Zion Canyon" → "zion"). */
const DESTINATION_SUFFIX = /\s+(?:canyon|park|np)$/;

/**
 * Head nouns that make an unresolved name a park FEATURE the traveler expects to
 * experience. Used only to decide whether an UNRESOLVED name is enforced; a
 * resolved name is always an obligation regardless.
 */
const FEATURE_HEAD = /\b(?:trail|trails|trailhead|fall|falls|footbridge|bridge|point|arch|arches|spring|springs|geyser|geysers|basin|lake|lakes|dome|peak|mount|mountain|overlook|view|vista|loop|pass|meadow|meadows|grove|cave|caverns?|landing|rim|river|creek|beach|tunnel|rock|rocks|butte|mesa|pool|pools|cascade|cascades|narrows|summit|ridge|glacier)$/;

const lower = (s) => String(s || '').toLowerCase().trim();

const DESTINATION_KEYS = new Set([
  ...[...PARK_NAME_TO_CODE.entries()]
    .filter(([, value]) => value?.kind !== 'landmark')
    .map(([key]) => lower(key)),
  ...Object.keys(CITIES || {}).map(lower),
  ...Object.values(STATE_NAMES || {}).map(lower),
]);
const LANDMARK_KEYS = new Set(
  [...PARK_NAME_TO_CODE.entries()].filter(([, value]) => value?.kind === 'landmark').map(([key]) => lower(key))
);

function cleanName(raw) {
  return String(raw || '')
    .replace(/[\r\n\t"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.’']+$/g, '')
    .trim()
    .slice(0, MAX_NAME_CHARS);
}

function isDestinationOrRegion(name) {
  const key = lower(name);
  if (REGION_ENDING.test(key)) return true;
  if (DESTINATION_KEYS.has(key)) return true;
  const stripped = key.replace(DESTINATION_SUFFIX, '');
  return stripped !== key && DESTINATION_KEYS.has(stripped);
}

function isTemporal(name) {
  return TEMPORAL_FIRST_TOKENS.has(lower(name).split(' ')[0]);
}

/**
 * Conservative extraction from the traveler's OWN words. Never reads
 * destination-resolver output.
 *
 * @returns {Array<{requestedName:string, key:string, frame:string, featureSignal:boolean}>}
 */
function extractNamedExperienceRequests(userPrompt, { officialIndex = null, parkCodes = [] } = {}) {
  const text = String(userPrompt || '');
  const out = [];
  const seen = new Set();
  for (const frameMatch of text.matchAll(FRAME_RE)) {
    const frame = lower(frameMatch[1]).replace('’', "'");
    NAME_LIST_RE.lastIndex = frameMatch.index + frameMatch[0].length;
    const nameMatch = text.match(NAME_LIST_RE);
    if (!nameMatch) continue;
    const pieces = nameMatch[0].split(SPLIT_LIST_RE).map((piece) => cleanName(piece.replace(/^the\s+/i, '')));
    for (const requestedName of pieces) {
      if (!requestedName || requestedName.length < 3) continue;
      if (isTemporal(requestedName) || isDestinationOrRegion(requestedName)) continue;
      const key = canonicalExperienceKey(requestedName);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        requestedName,
        key,
        frame,
        featureSignal: STRONG_FRAMES.has(frame) || FEATURE_HEAD.test(key) || LANDMARK_KEYS.has(key),
      });
      if (out.length >= MAX_NAMED_REQUESTS) return out;
    }
  }

  const scoped = (parkCodes || []).map((code) => String(code || '').toLowerCase()).filter(Boolean);
  if (officialIndex?.places?.length && scoped.length === 1) {
    const hits = officialPlacesMentionedIn(text, officialIndex, { parkCode: scoped[0] })
      .filter((place) => place.parkCode === scoped[0]);
    for (const place of hits) {
      const key = place.nameKey || canonicalExperienceKey(place.canonicalName);
      if (!key || seen.has(key)) continue;
      if (isTemporal(place.canonicalName) || isDestinationOrRegion(place.canonicalName)) continue;
      seen.add(key);
      out.push({
        requestedName: place.canonicalName,
        key,
        frame: 'mention',
        featureSignal: true,
      });
      if (out.length >= MAX_NAMED_REQUESTS) break;
    }
  }
  return out;
}

/**
 * Resolve each request against the frozen candidate universe.
 *
 *   resolved     → a named obligation bound to evidence identity
 *   ineligible   → the only identity is one the traveler's constraints removed
 *   unavailable  → no identity, and the name is clearly a park feature
 *   (dropped)    → no identity and no feature signal (a town, a business): not
 *                  enforceable, so it creates no obligation — today's behavior
 *
 * An empty place catalogue creates no obligations, mirroring the identity
 * boundary: with nothing offered, nothing can be resolved or enforced.
 */
function resolveNamedExperienceRequirements({
  requests = [], evidenceBundle = null, excludedEvidenceIds = [],
  // Phase 9C.1D.5C-D — relationship authority is rebuilt from THIS bundle and
  // re-validated against the CURRENT trusted reviewers and clock, every turn.
  trustedReviewerIds = [], now = new Date(),
} = {}) {
  if (!Array.isArray(requests) || requests.length === 0) return [];
  if (!hasPlaceCatalogue(evidenceBundle)) return [];
  const evidence = Array.isArray(evidenceBundle?.evidence) ? evidenceBundle.evidence : [];
  const excluded = new Set(excludedEvidenceIds || []);
  let relationships = null; // built lazily: most turns never need it
  const out = [];
  for (const request of requests) {
    const match = matchEvidencePlace({ name: request.requestedName, evidenceBundle, excludedEvidenceIds });
    let status;
    if (match && !match.excluded) status = 'resolved';
    else if (match && match.excluded) status = 'ineligible';
    else if (request.featureSignal) status = 'unavailable';
    else continue;
    const index = out.length + 1;
    const requirement = {
      obligationId: `requested_named_experience_${index}`,
      reasonCode: `missing_requested_named_experience_${index}`,
      requestedName: request.requestedName,
      status,
      evidenceIds: Object.freeze(status === 'resolved' ? [...match.evidenceIds] : []),
      canonicalPlaceName: status === 'resolved' ? match.name : null,
    };
    if (status === 'resolved') {
      const exactEvidence = evidence.find((item) => item?.evidenceId === match.evidenceId);
      const exactEntityId = entityIdForEvidence(exactEvidence);
      if (exactEntityId) {
        if (!relationships) {
          relationships = buildRelationshipIndexFromEvidence({ evidence, trustedReviewerIds, now }).index;
        }
        // `same_as` only, DIRECT only: access_point_for / part_of never widen it.
        const neighbours = sameAsNeighbours(relationships, exactEntityId).slice(0, MAX_SAME_AS_EQUIVALENTS);
        const equivalents = neighbours.flatMap((entityId) => {
          const records = evidence.filter((item) => entityIdForEvidence(item) === entityId && !excluded.has(item.evidenceId));
          if (records.length === 0) return []; // an equivalent absent from this bundle cannot be planned
          const named = records.find((item) => typeof item?.claim?.normalizedValue?.name === 'string') || records[0];
          return [{
            entityId,
            placeName: named.claim?.normalizedValue?.name || null,
            evidenceIds: records.map((item) => item.evidenceId).sort(),
          }];
        });
        requirement.exactEntityId = exactEntityId;
        if (equivalents.length > 0) {
          const exactIds = evidence
            .filter((item) => entityIdForEvidence(item) === exactEntityId && !excluded.has(item.evidenceId))
            .map((item) => item.evidenceId);
          requirement.allowedEntityIds = Object.freeze([exactEntityId, ...equivalents.map((e) => e.entityId)]);
          requirement.allowedEvidenceIds = Object.freeze([...new Set([
            ...match.evidenceIds, ...exactIds, ...equivalents.flatMap((e) => e.evidenceIds),
          ])].sort());
          requirement.equivalents = Object.freeze(equivalents.map((e) => Object.freeze({ entityId: e.entityId, placeName: e.placeName })));
        }
      }
    }
    out.push(Object.freeze(requirement));
  }
  return out;
}

const resolvedOnly = (requirements) => (requirements || []).filter((r) => r?.status === 'resolved');

/** Evidence ids a stop may bind to for this obligation: exact (5B) plus direct authoritative equivalents. */
const allowedEvidenceIdsOf = (requirement) => requirement.allowedEvidenceIds || requirement.evidenceIds;

/**
 * Satisfaction by EVIDENCE IDENTITY. Each stop's identity is re-derived from its
 * own name with the identity matcher; a stored `evidenceRef` is never trusted,
 * so a spoofed field cannot satisfy an obligation. The matched record is then
 * mapped to its stable entity: the obligation is met by the exact entity or a
 * direct authoritative `same_as` equivalent — and the result records which.
 */
function evaluateNamedExperienceSatisfaction({ itineraryData = null, requirements = [], evidenceBundle = null } = {}) {
  const required = resolvedOnly(requirements);
  if (required.length === 0) {
    return { ok: true, reasonCodes: [], unsatisfied: [], evaluatedObligationIds: [], satisfiedBy: [] };
  }
  const evidenceById = new Map((evidenceBundle?.evidence || []).map((item) => [item?.evidenceId, item]));
  const bound = []; // { evidenceId, stopName }
  for (const day of itineraryData?.days || []) {
    for (const stop of day?.stops || []) {
      const match = matchEvidencePlace({ name: stop?.name, evidenceBundle });
      if (match && !match.excluded) match.evidenceIds.forEach((evidenceId) => bound.push({ evidenceId, stopName: stop?.name }));
    }
  }
  const satisfiedBy = [];
  const unsatisfied = [];
  for (const requirement of required) {
    const allowedIds = new Set(allowedEvidenceIdsOf(requirement));
    const allowedEntities = new Set(requirement.allowedEntityIds || []);
    const hit = bound.find((b) => allowedIds.has(b.evidenceId));
    if (!hit) { unsatisfied.push(requirement); continue; }
    const entityId = entityIdForEvidence(evidenceById.get(hit.evidenceId));
    const viaEquivalent = Boolean(entityId && requirement.exactEntityId
      && entityId !== requirement.exactEntityId && allowedEntities.has(entityId));
    satisfiedBy.push({
      obligationId: requirement.obligationId,
      requestedName: requirement.requestedName,
      evidenceId: hit.evidenceId,
      entityId: entityId || null,
      relationship: viaEquivalent ? 'same_as' : 'exact',
    });
  }
  return {
    ok: unsatisfied.length === 0,
    reasonCodes: unsatisfied.map((r) => r.reasonCode),
    unsatisfied,
    evaluatedObligationIds: required.map((r) => r.obligationId),
    satisfiedBy,
  };
}

function pinnedEvidenceIdsFor(requirements) {
  return [...new Set(resolvedOnly(requirements).flatMap((r) => allowedEvidenceIdsOf(r)))];
}

/** Private prompt block; null when there is nothing to require (prompt unchanged). */
function requiredNamedPlacesPromptBlock(requirements) {
  const required = resolvedOnly(requirements);
  if (required.length === 0) return null;
  return {
    instructions: 'The traveler explicitly asked for these specific places. Each must appear as its own stop, '
      + 'named exactly as placeName. No other place — not a similar hike, walk, or viewpoint — can stand in for one of them.',
    places: required.map((r) => ({
      travelerAskedFor: r.requestedName,
      placeName: r.canonicalPlaceName,
      // Present only with an authoritative direct `same_as`: the same place under
      // another official name. One stop under ANY of these names meets the ONE request.
      ...(r.equivalents?.length ? { alsoAcceptedAs: r.equivalents.map((e) => e.placeName).filter(Boolean) } : {}),
    })),
    ...(required.some((r) => r.equivalents?.length)
      ? { equivalentsNote: 'alsoAcceptedAs lists the SAME place under another official name. One stop under placeName or any alsoAcceptedAs name satisfies that one request — do not add a stop for each.' }
      : {}),
  };
}

/** Repair sentence preserving the named requirements; '' when there are none. */
function namedRequirementsRepairLine(requirements) {
  const required = resolvedOnly(requirements);
  if (required.length === 0) return '';
  const list = required.map((r) => {
    const also = (r.equivalents || []).map((e) => e.placeName).filter(Boolean);
    return `"${r.requestedName}" (use the place named "${r.canonicalPlaceName}"${also.length ? `, which is the same place as ${also.map((n) => `"${n}"`).join(' or ')}` : ''})`;
  }).join('; ');
  return `The traveler explicitly asked for: ${list}. Keep each as its own stop under that exact place name; no other place replaces it.`;
}

function joinNames(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Traveler-facing terminal copy. No substitution, no system vocabulary. */
function buildRequestedExperienceUnavailableMessage(requirements) {
  const unavailable = (requirements || []).filter((r) => r?.status === 'unavailable').map((r) => r.requestedName);
  const ineligible = (requirements || []).filter((r) => r?.status === 'ineligible').map((r) => r.requestedName);
  const parts = [];
  if (unavailable.length > 0) {
    parts.push(`I can't reliably build this plan around ${joinNames(unavailable)} — I couldn't match `
      + `${unavailable.length > 1 ? 'those' : 'it'} to a place in the official park information I can confirm, `
      + 'and I would rather tell you that than guess or quietly swap in something different.');
  }
  if (ineligible.length > 0) {
    parts.push(`${joinNames(ineligible)} doesn't fit the limits you gave me for this trip, so I can't plan it as asked.`);
  }
  parts.push('If you would like a plan without it, just say so.');
  return parts.join(' ');
}

module.exports = {
  MAX_SAME_AS_EQUIVALENTS,
  extractNamedExperienceRequests,
  resolveNamedExperienceRequirements,
  evaluateNamedExperienceSatisfaction,
  pinnedEvidenceIdsFor,
  requiredNamedPlacesPromptBlock,
  namedRequirementsRepairLine,
  buildRequestedExperienceUnavailableMessage,
};
