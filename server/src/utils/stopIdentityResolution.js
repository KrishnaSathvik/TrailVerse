'use strict';

/**
 * STRUCTURED-STOP IDENTITY BOUNDARY (2026-09-02).
 *
 * The frozen EvidenceBundle is the machine-owned truth boundary, but the
 * architect could still author structured stop identities that escaped it:
 * real-world names the catalogue never offered (Badlands back-fill), invented
 * place identities ("Flexible {Park}…"), and exposure-relevant stops that
 * directive filtering had explicitly removed. This module makes place
 * identity machine-resolved:
 *
 *   model authors:  time, duration, note, why, ordering
 *   server owns:    place identity, evidence binding, coordinates
 *
 * Enforcement is scoped by the SAME classifier completeness anchors days
 * with (`classifyStop`): whatever could count as an experience must resolve
 * to a catalogue candidate; rest/meal, logistics and vague supporting blocks
 * stay allowed, unbound, and — as before — cannot anchor a day. Unresolvable
 * experiential identity REJECTS the attempt with a bounded reason; nothing is
 * silently rewritten and nothing silently enters the canonical plan.
 *
 * Matching tolerates the model's naming flourish ("Early-light pause at
 * Cirque Rim Overlook", "… — late-day views") via canonical-experience keys
 * and word-boundary containment; a single short generic token ("Beach") can
 * never claim a stop.
 */

const { canonicalExperienceKey, isSameCanonicalExperience } = require('./canonicalExperience');
const { classifyStop } = require('./itineraryCompleteness');
const { isTaxonomyCandidate } = require('./scenicDriveSubject');
const { COORDINATE_SOURCE, isAuthoritativeCoordinateSource } = require('./coordinateValidation');
const {
  buildOfficialPlaceIndex,
  lookupOfficialPlace,
  extractOfficialCoordinates,
} = require('./officialPlaceIndex');
const {
  EXPERIENCE_KINDS,
  inferExperienceKind,
} = require('./groundedExperienceIdentity');

const REASON = Object.freeze({
  UNRESOLVED: 'stop_identity_unresolved',
  EXCLUDED: 'stop_identity_excluded',
});

/** Minimum single-token length for containment ("kalaloch" yes, "beach" no). */
const SINGLE_TOKEN_MIN = 6;

const { entityEvidenceProvenance } = require('./entityEvidenceProvenance');

function candidateIndex(evidenceBundle) {
  const entries = [];
  const types = new Map(require('./evidencePlaceCandidate').normalizeEvidencePlaceCandidates(evidenceBundle)
    .map(place => [place.placeKey, place.canonicalType]));
  for (const candidate of evidenceBundle?.evidence || []) {
    if (isTaxonomyCandidate(candidate)) continue;
    const value = candidate?.claim?.normalizedValue || {};
    const provenance = entityEvidenceProvenance(candidate);
    const name = provenance.canonicalEntityName;
    if (!name) continue;
    const key = canonicalExperienceKey(name);
    if (!key) continue;
    const coords = extractOfficialCoordinates(value);
    const canonicalType = types.get(name.toLowerCase().trim())
      || types.get(String(value.name || '').toLowerCase().trim())
      || (value.scenicDriveSubject || value.primaryActivityType === 'scenic_drive'
        ? 'scenic_drive'
        : null)
      || (candidate.topic === 'roads' ? 'scenic_drive' : null);
    const experienceKind = inferExperienceKind({
      type: canonicalType,
      name,
      primaryActivityType: value.primaryActivityType,
      topic: candidate.topic,
    });
    entries.push({
      ...provenance,
      evidenceId: candidate.evidenceId,
      destinationOnly: candidate.topic === 'destination_identity',
      name,
      key,
      primaryActivityType: value.primaryActivityType,
      canonicalType,
      experienceKind,
      topic: candidate.topic || null,
      normalizedValue: value,
      claimText: typeof candidate?.claim?.text === 'string' ? candidate.claim.text : '',
      parkCode: String(value.entityId || value.destinationId || candidate.entityId || '').match(/^nps:park:([a-z0-9]+)(?::|$)/)?.[1] || null,
      tokens: key.split(' ').filter(Boolean),
      latitude: coords ? coords.latitude : Number(value.latitude),
      longitude: coords ? coords.longitude : Number(value.longitude),
    });
  }
  return entries;
}

function entryForEvidenceId(entries, evidenceId) {
  return entries.find((entry) => entry.evidenceId === evidenceId) || null;
}

function matchScore(stopName, stopKey, entry) {
  if (!stopKey || !entry.key) return 0;
  if (stopKey === entry.key) return 3;
  if (isSameCanonicalExperience(stopName, entry.name) && stopKey.startsWith(`${entry.key} `)) return 2;
  const padded = ` ${stopKey} `;
  if (entry.tokens.length >= 2 && padded.includes(` ${entry.key} `)) return 1;
  if (entry.tokens.length === 1 && entry.key.length >= SINGLE_TOKEN_MIN
    && padded.includes(` ${entry.key} `)) return 1;
  // Typed route/road evidence: stop name appears inside official road/alert text.
  if (
    (entry.experienceKind === EXPERIENCE_KINDS.SCENIC_DRIVE || entry.topic === 'roads')
    && entry.claimText
    && stopKey.length >= 8
  ) {
    const claimKey = canonicalExperienceKey(entry.claimText);
    if (claimKey && ` ${claimKey} `.includes(` ${stopKey} `)) return 1;
  }
  return 0;
}

function bestMatch(stopName, entries, excluded) {
  const stopKey = canonicalExperienceKey(stopName);
  let best = null;
  let bestScore = 0;
  const better = (entry, score) => {
    if (score !== bestScore) return score > bestScore;
    if (score === 0) return false;
    // At equal match strength a legitimate identity always beats an excluded
    // one: the traveler must not lose a valid binding to a name collision
    // with something directive filtering removed. An excluded identity still
    // wins when it is the strictly strongest match — that IS the escape.
    const bestExcluded = excluded.has(best?.evidenceId);
    const entryExcluded = excluded.has(entry.evidenceId);
    if (bestExcluded !== entryExcluded) return bestExcluded;
    return entry.key.length > (best?.key.length || 0);
  };
  for (const entry of entries) {
    const score = matchScore(stopName, stopKey, entry);
    if (better(entry, score)) {
      best = entry;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

/** An anchor record must describe the viewing activity, not merely mention a subject. */
function anchoredMatch(stop, entries, excluded) {
  const subject = String(stop?.experienceSubject || stop?.name || '').trim();
  if (!subject || subject.length < 4) return null;
  if (!stop.experienceSubject && !['viewpoint', 'landmark', 'photography', 'wildlife'].includes(stop.type)) return null;
  const key = canonicalExperienceKey(subject);
  const supported = entries.filter(anchor => {
    if (anchor.destinationOnly || excluded.has(anchor.evidenceId)
      || (stop.evidenceRef && anchor.evidenceId !== stop.evidenceRef)) return false;
    const subjects = anchor.normalizedValue?.experienceSubjects || [];
    if (subjects.some(item => canonicalExperienceKey(item.name) === key
      && ['viewing', 'photography', 'wildlife_viewing'].includes(item.activityType))) return true;
    // Restrict prose binding to an affirmative viewing clause in the anchor's
    // authoritative record. Mere co-mention and model-authored notes never bind.
    const text = [anchor.claimText, anchor.normalizedValue?.description].filter(Boolean).join('. ');
    return text.split(/[.!?]/).some(sentence => {
      if (/\b(no|not|cannot|closed|unavailable|obstructed|blocked)\b/i.test(sentence)) return false;
      const clause = sentence.match(/\b(?:views? of|viewing|photograph(?:ing)?|watch(?:ing)?)\s+(.+)/i)?.[1];
      if (!clause) return false;
      return clause.split(/\s+and\s+|,|;/).some(part => {
        const candidate = canonicalExperienceKey(part.replace(/^the\s+/i, '').replace(/\s+(?:outside|from|at|during|in the|on the)\b.*$/i, ''));
        return candidate === key;
      });
    });
  });
  const anchors = new Map(supported.map(anchor => [`${anchor.parkCode || ''}:${anchor.key}`, anchor]));
  if (anchors.size === 1) return [...anchors.values()][0];
  // Legacy artifacts may name the anchor in the note. This selects only among
  // independently supported relationships; the note cannot establish one.
  const narrative = ` ${canonicalExperienceKey([stop.note, stop.why].filter(Boolean).join(' '))} `;
  const selected = [...anchors.values()].filter(anchor => anchor.tokens.length >= 2
    && narrative.includes(` ${anchor.key} `));
  return selected.length === 1 ? selected[0] : null;
}

/**
 * @returns {{ itineraryData, violations: Array<{dayNumber, stopName, reasonCode}> }}
 *   `itineraryData` is a structural copy with machine-owned bindings
 *   (`evidenceRef`, `canonicalPlaceName`, null-coordinate fill); the input is
 *   never mutated. `violations` non-empty ⇒ the attempt must fail.
 */
function resolveStopIdentities({
  itineraryData,
  evidenceBundle,
  excludedEvidenceIds = [],
  touchedDayNumbers = null,
} = {}) {
  const entries = candidateIndex(evidenceBundle);
  const officialIndex = buildOfficialPlaceIndex(evidenceBundle?.evidence || []);
  // Unresolved experiences fail closed even when no catalogue is available.
  const excluded = new Set(excludedEvidenceIds || []);
  const enforcedDays = Array.isArray(touchedDayNumbers)
    ? new Set(touchedDayNumbers.map(Number))
    : null;
  const violations = [];

  const days = (itineraryData?.days || []).map((day) => {
    const enforced = !enforcedDays || enforcedDays.has(Number(day?.dayNumber));
    const stops = (day?.stops || []).map((stop) => {
      const name = String(stop?.name || '').trim();
      if (!name) return { ...stop, resolutionStatus: 'not_applicable' };
      const official = lookupOfficialPlace({
        name,
        parkCode: stop?.parkCode || null,
        index: officialIndex,
      });
      let match = null;
      if (official.status === 'exact' && official.place?.evidenceId) {
        match = entryForEvidenceId(entries, official.place.evidenceId);
      } else if (official.status !== 'ambiguous') {
        match = bestMatch(name, entries, excluded);
      }
      const anchored = (!match || stop.experienceSubject) ? anchoredMatch(stop, entries, excluded) : null;
      if (anchored || stop.experienceSubject) match = anchored;
      const experiential = classifyStop(stop) === 'experiential' || Boolean(stop.experienceSubject);
      const stopKind = inferExperienceKind({ type: stop?.type, name });

      // Park-level destination_identity cannot anchor a day as a fake POI —
      // typed areas and routes must have their own experience evidence.
      if (experiential && match?.destinationOnly) {
        if (enforced) violations.push({ dayNumber: day?.dayNumber ?? null, stopName: name, reasonCode: 'stop_identity_destination_only' });
        return { ...stop, resolutionStatus: 'unresolved' };
      }

      if (match && !excluded.has(match.evidenceId)) {
        const boundType = match.canonicalType
          || (match.experienceKind === EXPERIENCE_KINDS.SCENIC_DRIVE ? 'scenic_drive' : null)
          || (match.experienceKind === EXPERIENCE_KINDS.AREA ? 'area' : null)
          || (match.experienceKind === EXPERIENCE_KINDS.ROUTE ? 'route' : null);
        const bound = {
          ...stop,
          ...(anchored ? {
            name: match.name,
            displayName: stop.displayName || name,
            experienceSubject: String(stop.experienceSubject || name).trim(),
            subjectEvidenceRef: match.evidenceId,
            latitude: null, longitude: null, coordinateSource: null,
          } : {}),
          evidenceRef: match.evidenceId,
          canonicalPlaceName: match.name,
          evidenceDocumentTitle: match.evidenceDocumentTitle,
          entityNameSource: match.entityNameSource,
          ...(!anchored ? { displayName: match.name } : {}),
          resolutionStatus: 'resolved',
          experienceKind: anchored ? EXPERIENCE_KINDS.EXPERIENCE : match.experienceKind || stopKind,
          parkCode: match.parkCode,
          parkName: null,
          parkIdentityEvidenceId: match.evidenceId,
          ...(anchored ? { type: stop.type === 'wildlife' ? 'wildlife' : 'photography' } : boundType ? { type: boundType } : {}),
          ...(match.primaryActivityType === 'scenic_drive' || match.experienceKind === EXPERIENCE_KINDS.SCENIC_DRIVE
            ? { type: 'scenic_drive', walkingDistanceMiles: null }
            : {}),
        };
        // A road anchor does not turn an ordinary transfer into sightseeing.
        if (['drive', 'transport', 'shuttle'].includes(stop.type) && bound.type === 'scenic_drive'
          && !/scenic|scenery|sightseeing/i.test(`${stop.note || ''} ${stop.why || ''}`)) bound.type = stop.type;
        const semantic = require('./semanticDayValue').experienceRole(bound, { bundle: evidenceBundle, classifyStop });
        if (semantic.canonicalType === 'museum' && bound.type === 'visitor_center') bound.type = 'museum';
        const sourceName = match.name.toLowerCase();
        bound.semanticCategory = /nature|interpretive/.test(sourceName) && /cent(?:er|re)/.test(sourceName)
          ? 'nature_interpretive' : /museum|gallery/.test(sourceName) ? 'museum_cultural'
            : /visitor cent(?:er|re)/.test(sourceName) ? 'visitor_service' : bound.type;
        if (['visitor_service', 'nature_interpretive'].includes(bound.semanticCategory) && !anchored) bound.type = 'visitor_center';
        const areaRequested = ['area', 'region', 'district'].includes(stop.type)
          || (['landmark', 'activity'].includes(stop.type) && inferExperienceKind({ name }) === EXPERIENCE_KINDS.AREA);
        if (areaRequested) bound.areaExperienceName = name;
        const facet = require('./visitExperienceSemantics').groundedVisitFacet({ ...bound, name, type: stop.type },
          evidenceBundle.evidence.filter(row => row.evidenceId === match.evidenceId));
        bound.experienceFacet = facet;
        if (facet?.kind === 'exterior_viewing' && !bound.compoundVisit) bound.type = 'photography';
        const usableCoord = (v) => v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) !== 0;
        // Phase 9B.1 — evidence-bound coordinates are verified geographic
        // authority (the top of the precedence order), so they override an
        // existing coordinate unless that coordinate is ALREADY authoritative
        // (e.g. previously stored/geocoded). A bare tool-authored number is
        // not authoritative and must not block this binding.
        const existingIsAuthoritative = !anchored && isAuthoritativeCoordinateSource(stop?.coordinateSource);
        const hasMatchCoord = usableCoord(match.latitude) && usableCoord(match.longitude);
        if (hasMatchCoord && !existingIsAuthoritative) {
          bound.latitude = match.latitude;
          bound.longitude = match.longitude;
          bound.coordinateSource = COORDINATE_SOURCE.RESOLVED_METADATA;
        } else if (!usableCoord(stop?.latitude) && usableCoord(match.latitude)) {
          // No coordinate at all — still fine to fill even without a full pair.
          bound.latitude = match.latitude;
          bound.coordinateSource = COORDINATE_SOURCE.RESOLVED_METADATA;
        } else if (!usableCoord(stop?.longitude) && usableCoord(match.longitude)) {
          bound.longitude = match.longitude;
          bound.coordinateSource = COORDINATE_SOURCE.RESOLVED_METADATA;
        }
        return bound;
      }

      if (enforced && experiential) {
        violations.push({
          dayNumber: day?.dayNumber ?? null,
          stopName: name,
          ...(stop.experienceSubject ? { subjectName: stop.experienceSubject } : {}),
          reasonCode: match ? REASON.EXCLUDED : REASON.UNRESOLVED,
        });
      }
      return { ...stop, resolutionStatus: official.status === 'ambiguous' ? 'ambiguous'
        : experiential ? 'unresolved' : 'not_applicable' };
    });
    return { ...day, stops };
  });

  return {
    itineraryData: itineraryData ? { ...itineraryData, days } : itineraryData,
    violations,
  };
}

/**
 * Phase 9C.1D.5B — the SAME identity decision `resolveStopIdentities` makes for
 * one stop, exposed for a name that is not (yet) a stop: an explicitly named
 * traveler request. One matcher, never a second, looser copy.
 *
 * @returns {null | { evidenceId, name, excluded:boolean, evidenceIds:string[] }}
 *   `evidenceIds` is every non-excluded candidate sharing the winning canonical
 *   key (the same place carried by more than one record); empty when excluded.
 */
function matchEvidencePlace({ name, evidenceBundle, excludedEvidenceIds = [] } = {}) {
  const entries = candidateIndex(evidenceBundle);
  const trimmed = String(name || '').trim();
  if (entries.length === 0 || !trimmed) return null;
  const excluded = new Set(excludedEvidenceIds || []);
  const official = lookupOfficialPlace({
    name: trimmed,
    index: buildOfficialPlaceIndex(evidenceBundle?.evidence || []),
  });
  if (official.status === 'ambiguous') return null;
  const match = official.status === 'exact' && official.place?.evidenceId
    ? entryForEvidenceId(entries, official.place.evidenceId)
    : bestMatch(trimmed, entries, excluded);
  if (!match) return null;
  const isExcluded = excluded.has(match.evidenceId);
  const evidenceIds = isExcluded
    ? []
    : [...new Set([match.evidenceId, ...entries
      .filter((entry) => entry.key === match.key && !excluded.has(entry.evidenceId))
      .map((entry) => entry.evidenceId)])];
  return { evidenceId: match.evidenceId, name: match.name, excluded: isExcluded, evidenceIds };
}

/** True when the frozen bundle offers at least one named place to resolve against. */
function hasPlaceCatalogue(evidenceBundle) {
  return candidateIndex(evidenceBundle).length > 0;
}

module.exports = {
  resolveStopIdentities,
  matchEvidencePlace,
  hasPlaceCatalogue,
  STOP_IDENTITY_REASON: REASON,
};
