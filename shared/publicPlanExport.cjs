'use strict';

/**
 * One public export boundary for Trailie TripPlan (Architecture Lock Step 7).
 *
 * Consumers: Demo capture, Sample Itineraries, shared-trip API, PDF export,
 * public itinerary pages. This is a privacy/allowlist contract — not a second
 * planner and not permission to deploy private trips.
 *
 * Nested objects are allowlisted. Unknown / internal fields are omitted.
 */

const PUBLIC_PLAN_FIELDS = Object.freeze([
  'type',
  'version',
  'tripSchemaVersion',
  'generatedAt',
  'createdFrom',
  'parkName',
  'parkCode',
  'intro',
  'destinations',
  'tripGuidance',
  'narrativeSections',
  'alternatives',
  'requirements',
  'days',
  'totalDays',
  'highlights',
  'packingList',
  'permits',
  'estimatedCost',
  'feasibilityIssues',
]);

const scalar = (value) => typeof value === 'string' || typeof value === 'boolean'
  || (typeof value === 'number' && Number.isFinite(value));
const pick = (value, keys) => Object.fromEntries(
  keys.filter((key) => scalar(value?.[key])).map((key) => [key, value[key]]),
);
const strings = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);
const list = (value, project) => (Array.isArray(value) ? value.map(project) : []);
const source = (value) => pick(value, ['evidenceId', 'url', 'observedAt']);
const requirement = (value) => pick(value, ['id', 'title', 'requirement', 'category', 'severity', 'evidenceStatus']);
const alternative = (value) => pick(value, ['name', 'when', 'note']);
const image = (value) => pick(value, ['url', 'alt', 'title', 'credit']);

function isPublicUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.search
      && !/localhost|127\.0\.0\.1/.test(url.hostname);
  } catch {
    return false;
  }
}

function stop(value) {
  return {
    ...pick(value, [
      'id', 'order', 'name', 'type', 'startTime', 'timeWindow', 'timingReason', 'duration',
      'note', 'why', 'revisitReason', 'difficulty', 'physicalDifficulty', 'canonicalPlaceId',
      'canonicalPlaceName', 'placeKind', 'groundedType',
    ]),
    ...(value.experience ? { experience: pick(value.experience, ['id', 'name']) } : {}),
    ...(value.mapAnchor
      ? { mapAnchor: pick(value.mapAnchor, ['canonicalPlaceId', 'name', 'relationship', 'sourceUrl']) }
      : {}),
    ...(hasOwn(value, 'placeTypes') ? { placeTypes: strings(value.placeTypes) } : {}),
    ...(hasOwn(value, 'location')
      ? { location: pick(value.location, ['lat', 'lon', 'source', 'authority', 'status', 'sourceRef', 'sourceEntity']) }
      : {}),
    ...(hasOwn(value, 'sourceReferences') ? { sourceReferences: list(value.sourceReferences, source) } : {}),
    ...(hasOwn(value, 'requirements') ? { requirements: list(value.requirements, requirement) } : {}),
    ...(hasOwn(value, 'alternatives') ? { alternatives: list(value.alternatives, alternative) } : {}),
  };
}

function edge(value) {
  return {
    ...pick(value, [
      'sourceStopId', 'targetStopId', 'relationship', 'modeIntent', 'travelMode',
      'modeAuthority', 'status', 'durationSeconds', 'distanceMeters',
    ]),
    source: {
      ...source(value.source),
      ...(value.source?.provider === 'google_maps' ? { provider: 'google_maps' } : {}),
    },
    operationalAccess: {
      ...pick(value.operationalAccess, ['status', 'requiredMode']),
      sources: strings(value.operationalAccess?.sources).filter(isPublicUrl),
    },
  };
}

function permit(value) {
  if (typeof value === 'string') return value;
  return pick(value, ['name', 'title', 'url', 'note', 'required']);
}

function feasibilityIssue(value) {
  return pick(value, ['message', 'severity', 'dayNumber', 'code']);
}

function publicEvidenceReferences(value) {
  const references = new Map();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (['evidenceId', 'sourceRef'].includes(key) && typeof child === 'string' && child && !isPublicUrl(child)) {
        if (!references.has(child)) references.set(child, `public-evidence-${references.size + 1}`);
        node[key] = references.get(child);
      } else walk(child);
    }
  };
  walk(value);
  return value;
}

function hasOwn(plan, key) {
  return Object.prototype.hasOwnProperty.call(plan, key);
}

function buildPublicPlanObject(plan) {
  const out = {
    ...pick(plan, [
      'type', 'version', 'tripSchemaVersion', 'generatedAt', 'createdFrom',
      'parkName', 'parkCode', 'intro', 'totalDays',
    ]),
  };

  if (hasOwn(plan, 'requirements')) out.requirements = list(plan.requirements, requirement);
  if (hasOwn(plan, 'destinations')) {
    out.destinations = list(plan.destinations, (value) => pick(value, ['name', 'type', 'parkCode']));
  }
  if (hasOwn(plan, 'tripGuidance')) {
    out.tripGuidance = list(plan.tripGuidance, (value) => pick(value, ['text', 'source', 'applicability']));
  }
  if (hasOwn(plan, 'narrativeSections')) {
    out.narrativeSections = list(plan.narrativeSections, (value) => pick(value, ['heading', 'markdown', 'placement']));
  }
  if (hasOwn(plan, 'alternatives')) out.alternatives = list(plan.alternatives, alternative);
  if (hasOwn(plan, 'highlights')) out.highlights = strings(plan.highlights);
  if (hasOwn(plan, 'packingList')) out.packingList = strings(plan.packingList);
  if (hasOwn(plan, 'permits')) {
    out.permits = list(plan.permits, permit)
      .filter((item) => item && (typeof item === 'string' || Object.keys(item).length));
  }
  if (hasOwn(plan, 'estimatedCost') && plan.estimatedCost && typeof plan.estimatedCost === 'object'
    && !Array.isArray(plan.estimatedCost)) {
    const estimated = pick(plan.estimatedCost, ['total', 'currency', 'lodging', 'food', 'fees', 'transport', 'notes']);
    if (Object.keys(estimated).length) out.estimatedCost = estimated;
  }
  if (hasOwn(plan, 'feasibilityIssues')) {
    out.feasibilityIssues = list(plan.feasibilityIssues, feasibilityIssue)
      .filter((item) => Object.keys(item).length);
  }

  out.days = list(plan.days, (day) => ({
    ...pick(day, ['id', 'day', 'title', 'dayNumber', 'label', 'date', 'overnightLocation']),
    ...(day.dayStructure
      ? {
        dayStructure: {
          ...pick(day.dayStructure, ['type', 'summary', 'startPeriod', 'endPeriod']),
          blocks: list(day.dayStructure.blocks, (block) => ({
            ...pick(block, ['kind', 'label', 'note', 'startTime', 'timingReason', 'duration']),
            periods: strings(block.periods),
            stopIds: strings(block.stopIds),
          })),
        },
      }
      : {}),
    ...(hasOwn(day, 'stops') ? { stops: list(day.stops, stop) } : {}),
    ...(hasOwn(day, 'travelEdges') ? { travelEdges: list(day.travelEdges, edge) } : {}),
    ...(hasOwn(day, 'requirements') ? { requirements: list(day.requirements, requirement) } : {}),
    ...(hasOwn(day, 'activityGroups')
      ? {
        activityGroups: list(day.activityGroups, (value) => ({
          ...pick(value, ['id', 'label']),
          ...(hasOwn(value, 'stopIds') ? { stopIds: strings(value.stopIds) } : {}),
        })),
      }
      : {}),
  }));

  return publicEvidenceReferences(out);
}

/**
 * Authoritative public TripPlan export.
 * @param {object} plan
 * @param {{ requireDays?: boolean }} [options]
 * @returns {object|null}
 */
function exportPublicPlan(plan, options = {}) {
  const requireDays = options.requireDays !== false;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    if (requireDays) throw new Error('No canonical itinerary');
    return null;
  }
  if (!plan.days?.length) {
    if (requireDays) throw new Error('No canonical itinerary');
    return null;
  }
  return buildPublicPlanObject(plan);
}

/**
 * Share/API-compatible wrapper: never throws; nullish / non-object passthrough
 * matches the historical projectPublicPlan contract.
 */
function projectPublicPlan(plan) {
  if (plan == null) return null;
  if (typeof plan !== 'object' || Array.isArray(plan)) return plan;
  return exportPublicPlan(plan, { requireDays: false });
}

module.exports = {
  PUBLIC_PLAN_FIELDS,
  exportPublicPlan,
  projectPublicPlan,
  isPublicUrl,
  image,
  pick,
  strings,
  list,
};
