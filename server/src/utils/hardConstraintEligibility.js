'use strict';

const { runtimeMobilityField, resolveRuntimeActivityPreference, resolveRuntimeFitness } = require('./canonicalRuntimeProjection');
const {
  resolveWalkingDistance,
  inferWalkingDistanceMiles,
  mobilityDistanceMiles,
  walkingDistanceFields,
} = require('./walkingDistanceOwnership');

/**
 * Fix Pass #3G — hard-constraint eligibility (compatible / incompatible / unknown).
 *
 * Generic: absence of confirmed-danger metadata is NOT confirmed compatibility.
 * No park/trail name hardcodes.
 */

const ELIGIBILITY = Object.freeze({
  COMPATIBLE: 'compatible',
  INCOMPATIBLE: 'incompatible',
  UNKNOWN: 'unknown',
  NOT_APPLICABLE: 'not_applicable',
});

const LOGISTICS_OR_REST_TYPE = new Set([
  'restaurant',
  'lodging',
  'lodge',
  'campground',
  'visitor_center',
  'transport',
  'drive',
  'museum',
  'exhibit',
  'picnic',
  'picnic_area',
  'scenic_drive',
  'historic',
  'historic_area',
]);

const LOGISTICS_OR_REST_TEXT =
  /\b(lunch|dinner|breakfast|brunch|snack|rest|break|hotel|lodging|overnight|parking|check[- ]?in|visitor center|museum|exhibit|picnic|scenic drive|lodge|nature center|amphitheater|supplies|departure|return[- ]to[- ]vehicle)\b/i;

/**
 * Normalize structured exposure into an eligibility class for a hard no-exposure constraint.
 */
function classifyExposureEligibility(exposureLevel) {
  const level = String(exposureLevel == null ? '' : exposureLevel).trim().toLowerCase();
  if (level === 'low') return ELIGIBILITY.COMPATIBLE;
  if (level === 'moderate' || level === 'high') return ELIGIBILITY.INCOMPATIBLE;
  return ELIGIBILITY.UNKNOWN;
}

/**
 * Stops that are supposed to fulfill hiking/scenic experience under an exposure constraint.
 * Logistics/rest/meals are not judged on exposure metadata.
 */
function isExposureRelevantStop(stop) {
  const type = String(stop?.type || '').toLowerCase();
  if (LOGISTICS_OR_REST_TYPE.has(type)) return false;
  const text = `${stop?.name || ''} ${stop?.note || ''} ${stop?.why || ''}`;
  if (LOGISTICS_OR_REST_TEXT.test(text) && !/\b(trail|hike|walk|viewpoint|overlook)\b/i.test(text)) {
    return false;
  }
  if (/\b(visitor center|museum|exhibit|picnic area|scenic drive|lodge)\b/i.test(text)
    && !/\b(trail|hike)\b/i.test(text)) {
    return false;
  }
  if (['trail', 'hike', 'walk', 'landmark', 'viewpoint', 'custom'].includes(type)) return true;
  if (/\b(trail|hike|walk|stroll|viewpoint|overlook|scenic|boardwalk)\b/i.test(text)) return true;
  return false;
}

/**
 * Candidate-level projection of the SAME relevance test applied to stops —
 * the single semantic authority for "does exposure policy apply here?".
 * `stop.type` is model-authored, so the projection is conservative:
 * worst-case experiential typing ('custom') governs, and only the machine-
 * derived facility category or the validator's own name carve-outs make a
 * candidate exposure-neutral. Anything else, when built into a stop, can be
 * judged by `evaluateHardExposureEligibility` and must be treated as judged
 * here — "Trailhead"/"Falls"/"Tidepooling" names included.
 */
function isExposureJudgedCandidate(normalizedValue) {
  const category = String(normalizedValue?.category || '').toLowerCase();
  if (LOGISTICS_OR_REST_TYPE.has(category)) return false;
  return isExposureRelevantStop({
    name: String(normalizedValue?.name || ''), type: 'custom', note: '', why: '',
  });
}

/**
 * Suggestion legality for machine steering under an armed no-exposure
 * constraint. Derived from the same authority the validator uses, so retry
 * hints can never offer a candidate that construction rules would reject:
 *   confirmed_low     — judged and evidence-certified low; safe to suggest.
 *   exposure_neutral  — facility carve-outs; exposure policy never judges it.
 *   ineligible        — judged with unknown/moderate/high exposure; never
 *                       suggest it, even though it may legally render in the
 *                       catalogue for other purposes.
 */
function classifyCandidateExposureSuggestibility(normalizedValue) {
  if (!isExposureJudgedCandidate(normalizedValue)) return 'exposure_neutral';
  return classifyExposureEligibility(normalizedValue?.exposureLevel) === ELIGIBILITY.COMPATIBLE
    ? 'confirmed_low'
    : 'ineligible';
}

/**
 * @returns {{ status: string, reasonCodes: string[] }}
 */
function evaluateHardExposureEligibility(stop, { hardConstraintActive = false } = {}) {
  if (!hardConstraintActive) {
    return { status: ELIGIBILITY.NOT_APPLICABLE, reasonCodes: [] };
  }
  if (!isExposureRelevantStop(stop)) {
    return { status: ELIGIBILITY.NOT_APPLICABLE, reasonCodes: [] };
  }
  const status = classifyExposureEligibility(stop?.exposureLevel ?? stop?.exposure);
  if (status === ELIGIBILITY.INCOMPATIBLE) {
    return { status, reasonCodes: ['exposure_constraint_violation'] };
  }
  if (status === ELIGIBILITY.UNKNOWN) {
    return { status, reasonCodes: ['constraint_eligibility_unknown'] };
  }
  return { status, reasonCodes: [] };
}

function normName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isMobilityRelevantTrail(stop) {
  const type = String(stop?.type || '').toLowerCase();
  if (['trail', 'walk', 'hike'].includes(type)) return true;
  const identity = `${stop?.name || ''} ${stop?.type || ''}`;
  return /\b(trail|hike|walk|boardwalk|path|loop)\b/i.test(identity);
}

function evaluateHardMobilityEligibility(stop, { maxWalkMilesPerSegment = null } = {}) {
  const limit = Number(maxWalkMilesPerSegment);
  if (!Number.isFinite(limit) || limit <= 0) {
    return { status: ELIGIBILITY.NOT_APPLICABLE, reasonCodes: [] };
  }
  if (!isMobilityRelevantTrail(stop)) {
    return { status: ELIGIBILITY.NOT_APPLICABLE, reasonCodes: [] };
  }
  const miles = mobilityDistanceMiles(stop);
  if (!Number.isFinite(miles) || miles <= 0) {
    return { status: ELIGIBILITY.UNKNOWN, reasonCodes: ['mobility_eligibility_unknown'] };
  }
  if (miles > limit) {
    return { status: ELIGIBILITY.INCOMPATIBLE, reasonCodes: ['mobility_distance_exceeds_limit'] };
  }
  return { status: ELIGIBILITY.COMPATIBLE, reasonCodes: [] };
}

function enrichItineraryMobilityFromEvidenceBundle(itinerary, bundle) {
  const result = cloneItinerary(itinerary);
  const byName = new Map();
  for (const candidate of bundle?.evidence || []) {
    const value = candidate?.claim?.normalizedValue;
    const name = value?.name;
    if (!name) continue;
    const explicit = Number(value?.walkingDistanceMiles);
    const resolved = resolveWalkingDistance({
      text: candidate?.claim?.text || '',
      name,
      activityTypes: value?.activityTypes,
      category: value?.category,
      structuredMiles: Number.isFinite(explicit) && explicit > 0 ? explicit : null,
    });
    const miles = resolved.miles;
    if (!Number.isFinite(miles) || miles <= 0) continue;
    byName.set(normName(name), {
      miles,
      qualifier: resolved.qualifier,
      evidenceId: candidate?.evidenceId || null,
    });
  }
  for (const day of result.days || []) {
    for (const stop of day.stops || []) {
      if (!isMobilityRelevantTrail(stop)) continue;
      // Model-supplied distance is not authoritative. Only a matching frozen
      // evidence candidate may certify compatibility.
      delete stop.walkingDistanceMiles;
      delete stop.walkingDistanceQualifier;
      delete stop.walkingDistanceEvidenceId;
      const match = byName.get(normName(stop.name));
      if (!match) continue;
      stop.walkingDistanceMiles = match.miles;
      if (match.qualifier) stop.walkingDistanceQualifier = match.qualifier;
      stop.walkingDistanceEvidenceId = match.evidenceId;
    }
  }
  return result;
}

function cloneItinerary(itinerary) {
  return JSON.parse(JSON.stringify(itinerary || { days: [] }));
}

/** Hard access requirements are certified by frozen evidence, never stop prose. */
function evaluateHardAccessEligibility(stop, { constraints = null, bundle = null } = {}) {
  const wheelchair = runtimeMobilityField(constraints, 'wheelchair') === true;
  const avoidStairs = runtimeMobilityField(constraints, 'avoidStairs') === true;
  const pets = constraints?.planningState?.travelers?.pets === true;
  const noHiking = resolveRuntimeActivityPreference(constraints, 'hiking') === 'none';
  const fitness = resolveRuntimeFitness(constraints);
  if (!wheelchair && !avoidStairs && !pets && !noHiking && !fitness) return { status: ELIGIBILITY.NOT_APPLICABLE, reasonCodes: [] };
  const key = normName(stop?.canonicalPlaceName || stop?.name);
  const values = (bundle?.evidence || [])
    .filter((row) => normName(row?.claim?.normalizedValue?.name) === key)
    .map((row) => row.claim.normalizedValue);
  const codes = [];
  if (noHiking && /^(?:hike|trail)$/.test(String(stop?.type || ''))) codes.push('hiking_constraint_violation');
  const difficulties = ['easy', 'moderate', 'hard', 'strenuous'];
  const maxDifficulty = { beginner: 'easy', intermediate: 'moderate', advanced: 'hard', experienced: 'strenuous', expert: 'strenuous' }[fitness] || fitness;
  if (difficulties.includes(maxDifficulty) && isMobilityRelevantTrail(stop)) {
    const known = values.map(v => v.difficulty).filter(v => difficulties.includes(v));
    if (!known.length) codes.push('difficulty_eligibility_unknown');
    else if (known.some(v => difficulties.indexOf(v) > difficulties.indexOf(maxDifficulty))) codes.push('difficulty_constraint_violation');
  }
  const access = values.map((v) => typeof v.accessibility === 'string' ? v.accessibility : '').join(' ');
  if (wheelchair) {
    if (/^(?:hike|trail)$/.test(String(stop?.type || ''))) codes.push('wheelchair_activity_violation');
    // Access to a building does not certify an outdoor excursion from it.
    const { hasRecommendedHazard } = require('./hazardRejectionSemantics');
    const outdoorRoute = isMobilityRelevantTrail(stop)
      || hasRecommendedHazard(stop?.note, /\b(?:outdoor walk|walk outside|walk around|walk along|stroll|trail|hiking|hike|path|connector)\b/i)
      || hasRecommendedHazard(stop?.why, /\b(?:outdoor walk|walk outside|walk around|walk along|stroll|hiking|hike)\b/i);
    const routeConfirmed = values.some(v => v.wheelchairAccessible === true
      && (['walk', 'paved_path', 'path', 'trail'].includes(v.category) || v.routeWheelchairAccessible === true));
    if (outdoorRoute && !routeConfirmed) codes.push('wheelchair_route_eligibility_unknown');
    const denied = values.some((v) => v.wheelchairAccessible === false)
      || /\b(?:not|isn't|non)[ -]?(?:wheelchair[ -]?)?accessible\b|\bnot suitable for wheelchairs\b/i.test(access);
    const confirmed = values.some((v) => v.wheelchairAccessible === true)
      || /\b(?:wheelchair[ -]accessible|accessible (?:to|for) (?:wheelchairs|wheelchair users))\b/i.test(access);
    if (denied) codes.push('wheelchair_constraint_violation');
    else if (!confirmed) codes.push('wheelchair_eligibility_unknown');
  }
  if (avoidStairs) {
    if (values.some((v) => v.requiresStairs === true)) codes.push('stairs_constraint_violation');
    else if (!values.some((v) => v.requiresStairs === false)
      && !/\b(?:step[- ]free|no stairs|wheelchair[ -]accessible)\b/i.test(access)) codes.push('stairs_eligibility_unknown');
  }
  if (pets) {
    if (values.some((v) => v.petsAllowed === false)) codes.push('pets_constraint_violation');
    else if (!values.some((v) => v.petsAllowed === true)) codes.push('pets_eligibility_unknown');
  }
  return {
    status: codes.some((code) => code.endsWith('_violation')) ? ELIGIBILITY.INCOMPATIBLE
      : codes.length ? ELIGIBILITY.UNKNOWN : ELIGIBILITY.COMPATIBLE,
    reasonCodes: codes,
  };
}

const UNIVERSAL_MOBILITY_CLAIM =
  /\b(?:everything|all|each|every|these (?:outings|walks|stops)|the (?:outings|walks|plan))\b.{0,50}\b(?:stay|stays|remain|remains|keep|keeps|is|are|will be|would be)\b.{0,30}\b(?:under|below|less than|no more than|within)\b.{0,18}\b(?:\d+(?:\.\d+)?|one|a)[- ]?miles?\b/i;
const KEEP_EACH_MOBILITY_CLAIM =
  /\bkeep(?:ing|s)?\b.{0,12}\b(?:all|each|every|these)\b.{0,35}\b(?:under|below|within)\b.{0,18}\b(?:\d+(?:\.\d+)?|one|a)[- ]?miles?\b/i;
const LOCAL_MOBILITY_CLAIM =
  /\b(?:under|below|less than|no more than|within)\b.{0,18}\b(?:\d+(?:\.\d+)?|one|a)[- ]?miles?\b/i;

function mentionedEvidenceTrailStops(text, evidenceBundle) {
  const source = normName(text);
  const stops = [];
  for (const candidate of evidenceBundle?.evidence || []) {
    const value = candidate?.claim?.normalizedValue;
    const name = value?.name;
    const normalizedName = normName(name);
    if (!name || normalizedName.length < 4 || !source.includes(normalizedName)) continue;
    const activityTypes = Array.isArray(value?.activityTypes) ? value.activityTypes : [];
    const stop = {
      name,
      type: activityTypes.some((type) => /trail|hike/.test(String(type)))
        ? 'trail'
        : activityTypes.some((type) => /walk|boardwalk/.test(String(type))) ? 'walk' : value?.category,
      walkingDistanceMiles: resolveWalkingDistance({
        text: candidate?.claim?.text || '',
        name,
        activityTypes: value?.activityTypes,
        category: value?.category,
        structuredMiles: Number.isFinite(Number(value?.walkingDistanceMiles))
          ? Number(value.walkingDistanceMiles)
          : null,
      }).miles,
    };
    if (isMobilityRelevantTrail(stop)) stops.push(stop);
  }
  return stops;
}

function candidateMentionIsExplicitlyRejected(text, name) {
  const source = String(text || '');
  const index = source.toLowerCase().indexOf(String(name || '').toLowerCase());
  if (index < 0) return false;
  const context = source.slice(Math.max(0, index - 70), index + String(name || '').length + 50);
  return /\b(?:avoid|skip|do not recommend|don'?t recommend|not suitable|ineligible|over the limit|too long)\b/i.test(context);
}

function evaluateMobilityClaimConsistency({
  text = '', itineraryData = null, constraints = null, evidenceBundle = null,
} = {}) {
  const limit = Number(runtimeMobilityField(constraints, 'maxWalkMilesPerSegment'));
  if (!Number.isFinite(limit) || limit <= 0) return { ok: true, reasonCodes: [] };
  const structuredRelevant = (itineraryData?.days || [])
    .flatMap((day) => day?.stops || [])
    .filter(isMobilityRelevantTrail);
  const relevant = structuredRelevant.length > 0
    ? structuredRelevant
    : mentionedEvidenceTrailStops(text, evidenceBundle);
  const incompatible = relevant.filter((stop) => (
    evaluateHardMobilityEligibility(stop, { maxWalkMilesPerSegment: limit }).status
      !== ELIGIBILITY.COMPATIBLE
  ));
  const codes = [];
  for (const stop of relevant) {
    const eligibility = evaluateHardMobilityEligibility(stop, { maxWalkMilesPerSegment: limit });
    if (eligibility.status === ELIGIBILITY.INCOMPATIBLE
      && !candidateMentionIsExplicitlyRejected(text, stop.name)) {
      codes.push(...eligibility.reasonCodes);
    }
  }
  if ((UNIVERSAL_MOBILITY_CLAIM.test(String(text || '')) || KEEP_EACH_MOBILITY_CLAIM.test(String(text || '')))
    && incompatible.length > 0) {
    codes.push('mobility_prose_claim_unsupported');
  }
  for (const stop of relevant) {
    const stopClaim = `${stop?.note || ''} ${stop?.why || ''}`;
    if (!LOCAL_MOBILITY_CLAIM.test(stopClaim)) continue;
    if (evaluateHardMobilityEligibility(stop, { maxWalkMilesPerSegment: limit }).status !== ELIGIBILITY.COMPATIBLE) {
      codes.push('mobility_prose_claim_unsupported');
    }
  }
  const reasonCodes = [...new Set(codes)];
  return { ok: reasonCodes.length === 0, reasonCodes };
}

/**
 * Copy authoritative exposureLevel from EvidenceBundle onto matching stops when
 * the model omitted structured suitability. Never invents low from prose alone.
 */
function enrichItineraryExposureFromEvidenceBundle(itinerary, bundle, { authoritativeOnly = false, touchedDayNumbers = null } = {}) {
  const result = cloneItinerary(itinerary);
  const byName = new Map();
  const byId = new Map();
  for (const candidate of bundle?.evidence || []) {
    const value = candidate?.claim?.normalizedValue;
    const exposure = String(value?.exposureLevel || '').toLowerCase();
    if (!['low', 'moderate', 'high'].includes(exposure)) continue;
    if (candidate.evidenceId) byId.set(candidate.evidenceId, exposure);
    const key = normName(value?.name);
    if (!key) continue;
    // Conflicting same-name evidence cannot establish compatibility.
    if (byName.has(key) && byName.get(key) !== exposure) byName.set(key, null);
    else if (!byName.has(key)) byName.set(key, exposure);
  }
  for (const day of result.days || []) {
    if (Array.isArray(touchedDayNumbers) && !touchedDayNumbers.includes(Number(day.dayNumber))) continue;
    for (const stop of day.stops || []) {
      const current = stop.exposureLevel ?? stop.exposure;
      if (!authoritativeOnly && current != null && String(current).trim() !== '' && String(current).toLowerCase() !== 'unknown') continue;
      if (authoritativeOnly) {
        delete stop.exposureLevel;
        delete stop.exposure;
      }
      // After identity binding, the exact evidence reference also resolves
      // aliases whose generated name did not match the official title.
      const key = normName(stop.canonicalPlaceName || stop.name);
      const exposure = byName.has(key) ? byName.get(key) : byId.get(stop.evidenceRef);
      if (exposure) stop.exposureLevel = exposure;
    }
  }
  return result;
}

module.exports = {
  evaluateHardAccessEligibility,
  ELIGIBILITY,
  classifyExposureEligibility,
  isExposureRelevantStop,
  isExposureJudgedCandidate,
  classifyCandidateExposureSuggestibility,
  evaluateHardExposureEligibility,
  enrichItineraryExposureFromEvidenceBundle,
  inferWalkingDistanceMiles,
  walkingDistanceFields,
  isMobilityRelevantTrail,
  evaluateHardMobilityEligibility,
  enrichItineraryMobilityFromEvidenceBundle,
  evaluateMobilityClaimConsistency,
};
