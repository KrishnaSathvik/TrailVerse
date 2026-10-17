'use strict';

/**
 * Requested-experience coverage (Phase 12H2-A).
 *
 * Projects traveler-stated experience intent onto a small generic taxonomy,
 * then uses that taxonomy for evidence packing and itinerary completeness.
 *
 * This is not a second interest system. Detection reuses canonical interests,
 * activityPreferences, and the traveler's own words. Dimensions are only
 * those the traveler actually asked for.
 *
 * Classification prefers entity type / tags / canonical title. It does not
 * treat incidental "why"/body/visitor-center prose as proof of an experience.
 */

const { extractPositiveInterestsFromText, scrubNegatedInterestSpans } = require('./planningInputContract');
const { extractActivityPreferences } = require('./travelerStateExtraction');
const { travelerValueClass, VALUE_CLASS } = require('./travelerValueClass');
const { isSameCanonicalExperience } = require('./canonicalExperience');
const { isTaxonomyCandidate } = require('./scenicDriveSubject');

const DIMENSION = Object.freeze({
  WILDLIFE: 'wildlife',
  GEOTHERMAL: 'geothermal',
  SCENIC_DRIVE: 'scenic_drive',
  PHOTOGRAPHY: 'photography',
  HIKING: 'hiking',
  BEACH: 'beach',
  WATERFALL: 'waterfall',
  VIEWPOINT: 'viewpoint',
  HISTORIC: 'historic',
});

const DIMENSIONS = Object.freeze(Object.values(DIMENSION));

const REASON_CODE = Object.freeze({
  COVERAGE: 'missing_requested_experience_coverage',
  WILDLIFE: 'missing_requested_wildlife',
  GEOTHERMAL: 'missing_requested_geothermal',
  SCENIC_DRIVE: 'missing_requested_scenic_drive',
  PHOTOGRAPHY: 'missing_requested_photography',
  HIKING: 'missing_requested_hike',
  BEACH: 'missing_requested_beach',
  WATERFALL: 'missing_requested_waterfall',
  VIEWPOINT: 'missing_requested_scenic',
  HISTORIC: 'missing_requested_historic',
  NO_CANDIDATE: 'requested_experience_no_authoritative_candidate',
});

const REASON_CODE_FOR_DIMENSION = Object.freeze({
  [DIMENSION.WILDLIFE]: REASON_CODE.WILDLIFE,
  [DIMENSION.GEOTHERMAL]: REASON_CODE.GEOTHERMAL,
  [DIMENSION.SCENIC_DRIVE]: REASON_CODE.SCENIC_DRIVE,
  [DIMENSION.PHOTOGRAPHY]: REASON_CODE.PHOTOGRAPHY,
  [DIMENSION.HIKING]: REASON_CODE.HIKING,
  [DIMENSION.BEACH]: REASON_CODE.BEACH,
  [DIMENSION.WATERFALL]: REASON_CODE.WATERFALL,
  [DIMENSION.VIEWPOINT]: REASON_CODE.VIEWPOINT,
  [DIMENSION.HISTORIC]: REASON_CODE.HISTORIC,
});

/**
 * Traveler-ask patterns. Closely related wording collapses to one dimension.
 * Scenic-drive language is intentionally distinct from viewpoint/scenery.
 * Waterfall matching is the word "waterfall(s)", not place-name "Fall".
 */
const ASK_PATTERNS = Object.freeze({
  wildlife: /\b(wildlife|wildlife viewing|birding|bird[- ]?watching)\b/i,
  geothermal: /\b(geysers?|geothermal|hot springs?|hydrothermal|thermal features?|fumaroles?|mud pots?)\b/i,
  scenic_drive: /\b(scenic[- ]?drives?|scenic[- ]?driving|scenic roads?|scenic routes?|loop roads?|driving tours?|auto tours?|parkways?|scenic highway)\b/i,
  photography: /\b(photography|photographs?|taking pictures?|photographer)\b/i,
  hiking: /\b(easy hikes?|easy walks?|easy(?:[- ]to[- ]moderate)? (?:hikes?|walks?|trails?)|hikes?|hiking|walking|day[- ]?hikes?)\b/i,
  beach: /\b(beaches?|coastal|tide ?pools?|seashore|ocean(?:front)?)\b/i,
  waterfall: /\bwaterfalls?\b/i,
  viewpoint: /\b(viewpoints?|overlooks?|vistas?|lookouts?|scenic views?|scenery)\b/i,
  historic: /\b(history|historic(?:al)?(?:\s+sites?)?|cultural?(?:\s+sites?)?|heritage|museums?)\b/i,
  goldenHour: /\b(sunset|sunrise|golden hour|golden light|evening glow)\b/i,
  backup: /\b(backup|fall[- ]?back|if .{0,60}(?:doesn'?t|does not|won'?t|cannot|can'?t|fails?|doesn'?t work)|alternative plan|plan b|what if)\b/i,
});

const MAX_PINS_PER_DIMENSION = 2;
const MAX_TOTAL_EXPERIENCE_PINS = 6;

const SCENIC_DRIVE_IDENTITY =
  /\b(scenic[- ]?drives?|scenic[- ]?driving|scenic[- ]?roads?|scenic[- ]?routes?|loop roads?|driving tours?|auto tours?|parkways?|scenic highway|auto roads?)\b/i;
const GEOTHERMAL_IDENTITY =
  /\b(geysers?|geothermal|hot springs?|hydrothermal|thermal (?:feature|pool|basin|area)|fumaroles?|mud pots?|geyser basin)\b/i;
const WILDLIFE_IDENTITY =
  /\b(wildlife|birding|bird[- ]?watching|wildlife viewing)\b/i;
const WILDLIFE_VIEWING_NAME =
  /\b(elk|bison|moose|whales?) (?:in|at|viewing)\b/i;
const HIKING_IDENTITY = /\b(hikes?|hiking|trails?|walks?|walking|boardwalk|stroll)\b/i;
const BEACH_IDENTITY = /\b(beaches?|coast|tide ?pools?|seashore|shoreline|oceanfront)\b/i;
const WATERFALL_IDENTITY = /\b(waterfalls?|(?:^|[\s])falls\b)\b/i;
const VIEWPOINT_IDENTITY = /\b(viewpoints?|overlooks?|vistas?|lookouts?|scenic views?)\b/i;
const PHOTOGRAPHY_IDENTITY = /\b(photography|photographs?|sunrise|sunset|golden hour)\b/i;
const HISTORIC_IDENTITY = /\b(historic(?:al)?|heritage|cultural|museum|ruins?)\b/i;

const VISITOR_SERVICE_NAME =
  /\bvisitor centers?\b|\bcontact stations?\b|\binformation centers?\b|\bnature centers?\b|\branger stations?\b/i;
const VISITOR_SERVICE_TYPE = /visitor_center|orientation/;
const ACCESS_POINT_NAME = /\btrailheads?\b|\bparking\b/i;

function oneLine(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function unique(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function interestListFrom(constraints) {
  const buckets = [
    constraints?.interests,
    constraints?.preferences?.interests,
    constraints?.planningState?.preferences?.interests,
  ];
  const out = [];
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    for (const item of bucket) {
      const id = String(item || '').trim().toLowerCase().replace(/_/g, '-');
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

function activityPreferencesFrom(constraints, userPrompt) {
  const nested = constraints?.activityPreferences
    || constraints?.planningState?.activityPreferences
    || {};
  const extracted = extractActivityPreferences(userPrompt);
  return {
    hiking: nested.hiking || extracted.hiking || null,
    photography: nested.photography === true || extracted.photography === true,
    photographyTiming: nested.photographyTiming || extracted.photographyTiming || null,
    wildlife: nested.wildlife === true || extracted.wildlife === true,
  };
}

function scrubNegatedDimensionSpans(text) {
  let scrubbed = scrubNegatedInterestSpans(text);
  for (const pattern of Object.values(ASK_PATTERNS)) {
    const source = pattern.source.replace(/^\^/, '').replace(/\$$/, '');
    const neg = new RegExp(
      `\\b(?:no|not|don'?t|do not|doesn'?t|avoid|without|skip|never|not interested in)\\b[^.]{0,40}${source}`,
      'gi'
    );
    scrubbed = scrubbed.replace(neg, ' ');
  }
  return scrubbed;
}

/**
 * Smallest canonical representation of explicitly requested experience
 * dimensions. Order is stable (taxonomy order), never inferred for richness.
 */
function detectRequestedExperienceDimensions({
  userPrompt = '',
  constraints = null,
} = {}) {
  const prompt = String(userPrompt || '');
  const scrubbed = scrubNegatedDimensionSpans(prompt);
  const interests = unique([
    ...interestListFrom(constraints),
    ...extractPositiveInterestsFromText(scrubbed),
  ]);
  const activity = activityPreferencesFrom(constraints, prompt);
  const found = [];
  const add = (dimension) => {
    if (!found.includes(dimension)) found.push(dimension);
  };

  if (ASK_PATTERNS.wildlife.test(scrubbed) || activity.wildlife || interests.includes('wildlife')) {
    add(DIMENSION.WILDLIFE);
  }
  if (ASK_PATTERNS.geothermal.test(scrubbed)) add(DIMENSION.GEOTHERMAL);
  if (ASK_PATTERNS.scenic_drive.test(scrubbed)) {
    add(DIMENSION.SCENIC_DRIVE);
  } else if (
    interestListFrom(constraints).includes('scenic-drives')
    && !ASK_PATTERNS.viewpoint.test(scrubbed)
    && !/\bscenic\b/i.test(scrubbed)
  ) {
    // Structured Quick Fill "scenic-drives" means drives. Free-text "scenic"
    // still maps to the canonical interest for fetching, but coverage does not
    // treat an adjective as a scenic-road obligation.
    add(DIMENSION.SCENIC_DRIVE);
  }
  if (ASK_PATTERNS.photography.test(scrubbed) || activity.photography || interests.includes('photography')) {
    add(DIMENSION.PHOTOGRAPHY);
  }
  if (ASK_PATTERNS.hiking.test(scrubbed) || activity.hiking || interests.includes('hiking')) {
    add(DIMENSION.HIKING);
  }
  if (ASK_PATTERNS.beach.test(scrubbed) || interests.includes('water-activities')) {
    if (ASK_PATTERNS.beach.test(scrubbed)) add(DIMENSION.BEACH);
  }
  if (ASK_PATTERNS.waterfall.test(scrubbed)) add(DIMENSION.WATERFALL);
  if (ASK_PATTERNS.viewpoint.test(scrubbed)) add(DIMENSION.VIEWPOINT);
  if (ASK_PATTERNS.historic.test(scrubbed) || interests.includes('history')) {
    add(DIMENSION.HISTORIC);
  }

  return Object.freeze(found.filter((id) => DIMENSIONS.includes(id)));
}

function typesOf(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').toLowerCase()).filter(Boolean);
  if (value) return [String(value).toLowerCase()];
  return [];
}

function isVisitorOrLogisticsEntity({ name = '', types = [], category = '', topic = '' } = {}) {
  const joined = types.join(' ');
  const hayName = String(name || '');
  if (topic === 'visitor_services') return true;
  if (VISITOR_SERVICE_NAME.test(hayName)) return true;
  if (VISITOR_SERVICE_TYPE.test(joined) && !/\bmuseum\b|\bhistoric\b/.test(joined)) return true;
  const valueClass = travelerValueClass({ name: hayName, activityTypes: types });
  if (valueClass === VALUE_CLASS.LOGISTICS || valueClass === VALUE_CLASS.MICRO_POI) return true;
  if (String(category || '').toLowerCase() === 'visitor_center') return true;
  return false;
}

function typeMatches(types, pattern) {
  return types.some((type) => pattern.test(String(type || '')));
}

function fieldsMatchDimension(fields, dimension) {
  if (!fields || fields.visitorOrLogistics) return false;
  const name = String(fields.name || '');
  const types = fields.types || [];
  const accessPoint = ACCESS_POINT_NAME.test(name);
  if (accessPoint && dimension !== DIMENSION.HIKING) return false;

  switch (dimension) {
    case DIMENSION.WILDLIFE:
      if (/\baware\b/i.test(name)) return false;
      return typeMatches(types, /wildlife|bird/)
        || WILDLIFE_IDENTITY.test(name)
        || WILDLIFE_VIEWING_NAME.test(name);
    case DIMENSION.GEOTHERMAL:
      return typeMatches(types, /geothermal|geyser|hot[_\s-]?spring|hydrothermal/)
        || GEOTHERMAL_IDENTITY.test(name);
    case DIMENSION.SCENIC_DRIVE:
      if (typeof fields.scenicDriveSubject === 'boolean') return fields.scenicDriveSubject;
      return typeMatches(types, /scenic_drive|scenic-drive|scenic driving|auto[_ ]?tour/)
        || SCENIC_DRIVE_IDENTITY.test(name);
    case DIMENSION.PHOTOGRAPHY:
      return typeMatches(types, /photograph|viewpoint|overlook/)
        || PHOTOGRAPHY_IDENTITY.test(name)
        || ASK_PATTERNS.goldenHour.test(String(fields.timeWindow || ''));
    case DIMENSION.HIKING:
      return typeMatches(types, /hike|trail|walk|boardwalk/)
        || HIKING_IDENTITY.test(name);
    case DIMENSION.BEACH:
      return typeMatches(types, /beach|coast|tide/)
        || BEACH_IDENTITY.test(name);
    case DIMENSION.WATERFALL:
      return typeMatches(types, /waterfall/)
        || WATERFALL_IDENTITY.test(name);
    case DIMENSION.VIEWPOINT:
      if (SCENIC_DRIVE_IDENTITY.test(name) && !VIEWPOINT_IDENTITY.test(name)) return false;
      return typeMatches(types, /viewpoint|overlook|vista/)
        || VIEWPOINT_IDENTITY.test(name);
    case DIMENSION.HISTORIC:
      return typeMatches(types, /historic|museum|cultural|heritage/)
        || HISTORIC_IDENTITY.test(name);
    default:
      return false;
  }
}

function fieldsFromCandidate(candidate) {
  const nv = candidate?.claim?.normalizedValue || {};
  const types = typesOf(nv.activityTypes);
  const name = nv.name || candidate?.source?.title || '';
  const topic = candidate?.topic || '';
  const visitorOrLogistics = isVisitorOrLogisticsEntity({
    name, types, category: nv.category, topic,
  });
  return {
    name,
    types,
    category: nv.category || '',
    topic,
    timeWindow: '',
    visitorOrLogistics,
    scenicDriveSubject: nv.scenicDriveSubject,
  };
}

function fieldsFromStop(stop) {
  const type = String(stop?.type || '').toLowerCase();
  const name = String(stop?.name || '');
  const types = type ? [type] : [];
  const visitorOrLogistics = isVisitorOrLogisticsEntity({ name, types, category: type });
  return {
    name,
    types,
    category: type,
    topic: '',
    timeWindow: stop?.timeWindow || '',
    visitorOrLogistics,
  };
}

function classifyCandidateDimensions(candidate) {
  if (isTaxonomyCandidate(candidate)) return Object.freeze([]);
  const fields = fieldsFromCandidate(candidate);
  return Object.freeze(DIMENSIONS.filter((dimension) => fieldsMatchDimension(fields, dimension)));
}

function classifyStopDimensions(stop) {
  const fields = fieldsFromStop(stop);
  return Object.freeze(DIMENSIONS.filter((dimension) => fieldsMatchDimension(fields, dimension)));
}

function candidateMatchesDimension(candidate, dimension) {
  return classifyCandidateDimensions(candidate).includes(dimension);
}

function authoritativeExperienceCandidate(candidate) {
  const authority = String(
    candidate?.quality?.authorityClass || candidate?.source?.sourceClass || ''
  ).toLowerCase();
  if (authority && /unofficial|user|derived/.test(authority)) return false;
  if (candidate?.claim?.polarity === 'negative') return false;
  if (candidate?.source?.provider === 'curated_relationship') return false;
  return true;
}

function bundleCandidates(bundle) {
  return Array.isArray(bundle?.evidence) ? bundle.evidence : [];
}

function dimensionHasAuthoritativeCandidate(bundle, dimension) {
  return bundleCandidates(bundle).some((candidate) => (
    authoritativeExperienceCandidate(candidate)
    && candidateMatchesDimension(candidate, dimension)
  ));
}

function stopMatchesEvidenceDimension(stop, dimension, bundle) {
  const name = String(stop?.name || '').trim();
  if (!name) return false;
  return bundleCandidates(bundle).some((candidate) => {
    if (!authoritativeExperienceCandidate(candidate)) return false;
    const candidateName = candidate?.claim?.normalizedValue?.name;
    if (!candidateName) return false;
    if (!isSameCanonicalExperience(candidateName, name)) return false;
    return candidateMatchesDimension(candidate, dimension);
  });
}

function stopRepresentsDimension(stop, dimension, bundle = null) {
  // With evidence present a drive must bind to a drive subject. A model-authored
  // scenic_drive type on a viewpoint cannot supply the missing authority.
  if (dimension === DIMENSION.SCENIC_DRIVE && bundle) {
    return stopMatchesEvidenceDimension(stop, dimension, bundle);
  }
  if (classifyStopDimensions(stop).includes(dimension)) return true;
  if (bundle) return stopMatchesEvidenceDimension(stop, dimension, bundle);
  return false;
}

function itineraryRepresentsDimension(itineraryData, dimension, bundle = null) {
  for (const day of itineraryData?.days || []) {
    for (const stop of day?.stops || []) {
      if (!String(stop?.name || '').trim()) continue;
      if (stopRepresentsDimension(stop, dimension, bundle)) return true;
    }
  }
  return false;
}

/**
 * Completeness for explicitly requested dimensions.
 *
 * If the frozen bundle is present and has no authoritative candidate, the
 * dimension is a truthful limitation (not a planner omission). If the bundle
 * is absent, fail closed on missing representation — same as the previous
 * hike/wildlife checks.
 */
function evaluateRequestedExperienceCoverage({
  itineraryData = null,
  userPrompt = '',
  constraints = null,
  evidenceBundle = null,
} = {}) {
  const requested = detectRequestedExperienceDimensions({ userPrompt, constraints });
  const missing = [];
  const unavailable = [];
  const represented = [];
  for (const dimension of requested) {
    const hasCandidate = evidenceBundle
      ? dimensionHasAuthoritativeCandidate(evidenceBundle, dimension)
      : true;
    if (evidenceBundle && !hasCandidate) {
      unavailable.push(dimension);
      continue;
    }
    if (itineraryRepresentsDimension(itineraryData, dimension, evidenceBundle)) {
      represented.push(dimension);
    } else {
      missing.push(dimension);
    }
  }
  const reasonCodes = missing.map((dimension) => REASON_CODE_FOR_DIMENSION[dimension]).filter(Boolean);
  if (missing.length > 0 && !reasonCodes.includes(REASON_CODE.COVERAGE)) {
    reasonCodes.unshift(REASON_CODE.COVERAGE);
  }
  return Object.freeze({
    requested: Object.freeze([...requested]),
    represented: Object.freeze(represented),
    missing: Object.freeze(missing),
    unavailable: Object.freeze(unavailable),
    reasonCodes: Object.freeze(reasonCodes),
    ok: missing.length === 0,
  });
}

function selectRequestedExperiencePins({
  items = [],
  dimensions = [],
  scoreFn = () => 50,
  maxPerDimension = MAX_PINS_PER_DIMENSION,
  maxTotal = MAX_TOTAL_EXPERIENCE_PINS,
} = {}) {
  if (!dimensions.length || !items.length) return Object.freeze([]);
  const perDimension = new Map(dimensions.map((dimension) => [dimension, []]));
  for (const item of items) {
    const matched = classifyCandidateDimensions(item.candidate);
    for (const dimension of matched) {
      if (!perDimension.has(dimension)) continue;
      perDimension.get(dimension).push(item);
    }
  }
  for (const [dimension, list] of perDimension) {
    list.sort((left, right) => {
      const delta = scoreFn(left) - scoreFn(right);
      if (delta !== 0) return delta;
      return oneLine(left.candidate?.claim?.normalizedValue?.name)
        .localeCompare(oneLine(right.candidate?.claim?.normalizedValue?.name));
    });
    perDimension.set(dimension, list.slice(0, Math.max(0, maxPerDimension)));
  }
  const pinned = [];
  const seen = new Set();
  let progressed = true;
  while (progressed && pinned.length < maxTotal) {
    progressed = false;
    for (const dimension of dimensions) {
      if (pinned.length >= maxTotal) break;
      const next = (perDimension.get(dimension) || []).shift();
      if (!next) continue;
      if (seen.has(next.evidenceId)) continue;
      seen.add(next.evidenceId);
      pinned.push(next.evidenceId);
      progressed = true;
    }
  }
  return Object.freeze(pinned);
}

function packedExperienceDiagnostics(includedItems = [], dimensions = []) {
  const experiential = includedItems.filter((item) => {
    const topic = item?.candidate?.topic;
    return topic === 'activities' || topic === 'visitor_services';
  });
  const visitorRows = experiential.filter((item) => {
    const fields = fieldsFromCandidate(item.candidate);
    return fields.visitorOrLogistics || item.candidate?.topic === 'visitor_services';
  });
  const byDimension = {};
  for (const dimension of dimensions) {
    byDimension[dimension] = experiential
      .filter((item) => candidateMatchesDimension(item.candidate, dimension))
      .map((item) => item.evidenceId);
  }
  return Object.freeze({
    experientialCount: experiential.length,
    visitorServiceCount: visitorRows.length,
    visitorServiceShare: experiential.length ? visitorRows.length / experiential.length : 0,
    packedByDimension: Object.freeze(byDimension),
  });
}

module.exports = {
  DIMENSION,
  DIMENSIONS,
  REASON_CODE,
  REASON_CODE_FOR_DIMENSION,
  ASK_PATTERNS,
  MAX_PINS_PER_DIMENSION,
  MAX_TOTAL_EXPERIENCE_PINS,
  detectRequestedExperienceDimensions,
  classifyCandidateDimensions,
  classifyStopDimensions,
  candidateMatchesDimension,
  stopRepresentsDimension,
  dimensionHasAuthoritativeCandidate,
  evaluateRequestedExperienceCoverage,
  selectRequestedExperiencePins,
  packedExperienceDiagnostics,
  isVisitorOrLogisticsEntity,
};
