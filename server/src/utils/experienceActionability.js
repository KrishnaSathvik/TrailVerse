'use strict';

// Source semantics decide whether a place can stand alone as an outing.
// Model-authored type and duration are recorded and never create grounding.

const { inferExperienceKind, EXPERIENCE_KINDS } = require('./groundedExperienceIdentity');
const { ACTIVITY_TYPES } = require('./evidencePlaceCandidate');
const { activityDurationRange, supportedDurationMaximum } = require('./evidenceActivityDuration');
const { evaluateHardExposureEligibility, isExposureRelevantStop } = require('./hardConstraintEligibility');
const { isAvoidExposureActive } = require('./planningInputContract');
const { SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES } = require('./itineraryCompleteness');

// Geographic breadth only — a default PLACE kind is not a district/area claim.
// Model outing labels still cannot launder AREA/REGION entities into walks.
const BROAD_KINDS = new Set([EXPERIENCE_KINDS.AREA, EXPERIENCE_KINDS.REGION]);
const WALKABLE_KINDS = new Set([
  EXPERIENCE_KINDS.TRAIL,
  EXPERIENCE_KINDS.ROUTE,
  EXPERIENCE_KINDS.SCENIC_DRIVE,
  EXPERIENCE_KINDS.VIEWPOINT,
  EXPERIENCE_KINDS.FERRY,
  EXPERIENCE_KINDS.EXPERIENCE,
]);
const OUTING_TYPES = new Set(['walk', 'hike', 'trail', 'outing']);
const CULTURAL = /\b(museum|exhibit|gallery|historic interior|cultural)\b/i;

function valuesOf(records) {
  return (records || []).map((row) => row?.claim?.normalizedValue || {}).filter((value) => value && typeof value === 'object');
}

function executionBinding(values) {
  for (const value of values) {
    const specification = value.experienceExecution || value.execution;
    if (specification?.action && specification?.scope) {
      return { action: String(specification.action), scope: String(specification.scope), source: 'structured_execution' };
    }
    const bounded = value.routeName || value.walkingArea || value.walkingCorridor || value.viewingZone
      || value.shoreSection || value.boundaries || value.trailName;
    if (bounded) {
      return { action: String(value.primaryActivity || value.type || 'visit'), scope: String(bounded), source: 'bounded_scope' };
    }
  }
  return null;
}

function sourceKindOf({ name, values }) {
  const fromName = inferExperienceKind({ name });
  if ([EXPERIENCE_KINDS.AREA, EXPERIENCE_KINDS.REGION].includes(fromName)) return fromName;
  const activity = values.flatMap((value) => value.activityTypes || [])
    .map((value) => ACTIVITY_TYPES[String(value || '').toLowerCase()])
    .find(Boolean);
  if (activity?.canonicalType) return inferExperienceKind({ type: activity.canonicalType, name });
  const declared = values.map((value) => value.category || value.semanticCategory || value.experienceKind || value.type)
    .find((value) => value && !OUTING_TYPES.has(String(value).toLowerCase()));
  return inferExperienceKind({ type: declared || null, name });
}

/**
 * @returns execution grounding from source identity. `modelType` and `modelDuration` cannot flip it.
 */
function assessExecutionGrounding({ records = [], name = '', modelType = null, modelDuration = null } = {}) {
  const values = valuesOf(records);
  const sourceName = values.map((value) => value.name).find(Boolean) || name || '';
  const binding = executionBinding(values);
  const kind = sourceKindOf({ name: sourceName, values });
  const cultural = values.some((value) => CULTURAL.test(`${value.type || ''} ${value.category || ''} ${(value.activityTypes || []).join(' ')} ${value.name || ''}`))
    || kind === EXPERIENCE_KINDS.FACILITY && CULTURAL.test(sourceName);
  const facilityDeclared = values.some((value) => /^(visitor_center|lodging|campground|picnic|orientation|ranger_station)$/i.test(String(value.category || value.type || '').trim()));
  // A facility category stays a facility when activity tags also say hike or walk.
  // Those tags do not create a route.
  const facilitySupport = ((kind === EXPERIENCE_KINDS.FACILITY && !cultural) || (facilityDeclared && !binding)) && !cultural;
  const broadEntity = BROAD_KINDS.has(kind) && !binding;
  const namedExecutable = WALKABLE_KINDS.has(kind) || cultural;
  const walkable = Boolean(binding) || (namedExecutable && !broadEntity);
  const ranges = values.map((value) => activityDurationRange(value.duration)).filter(Boolean);
  const numeric = values.map((value) => supportedDurationMaximum(value)).filter((minutes) => minutes > 0);
  const sourceDuration = numeric.length ? Math.min(...numeric) : null;
  const standalonePrimaryEligible = walkable && !facilitySupport && !broadEntity;
  return {
    canonicalEntity: sourceName,
    sourceSemanticCategory: values.map((value) => value.category || value.type || value.semanticCategory).find(Boolean) || kind,
    experienceKind: kind,
    executionScope: binding?.scope || (walkable ? sourceName : null),
    routeActivityBinding: binding,
    sourceDuration,
    sourceDurationBacked: Boolean(ranges.length || numeric.length),
    substantial: Number(sourceDuration) >= SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES,
    broadEntity,
    walkable,
    cultural,
    facilitySupport,
    standalonePrimaryEligible,
    modelType: modelType || null,
    modelDuration: modelDuration ?? null,
  };
}

function hardestExposure(values) {
  const order = ['low', 'moderate', 'high', 'extreme'];
  return values.map((value) => String(value.exposureLevel || '').toLowerCase()).filter((level) => order.includes(level))
    .sort((a, b) => order.indexOf(b) - order.indexOf(a))[0] || null;
}

function replacementConstraintStatus({ records = [], constraints = null, grounding = null } = {}) {
  const assessment = grounding || assessExecutionGrounding({ records });
  const source = require('./evidencePlaceCandidate').normalizeEvidencePlaceCandidates({ evidence: records })[0];
  const verdict = require('./candidateViability').evaluateCandidateConstraints({
    records, name: assessment.canonicalEntity, type: source?.canonicalType || 'custom', constraints,
    bundle: { evidence: records },
  });
  return { status: verdict.status, reasonCodes: verdict.reasonCodes,
    satisfyingReplacement: verdict.ok && assessment.standalonePrimaryEligible };

}

function assessCandidateActionability({ records = [], name = '', constraints = null, modelType = null, modelDuration = null } = {}) {
  const grounding = assessExecutionGrounding({ records, name, modelType, modelDuration });
  const constraint = replacementConstraintStatus({ records, constraints, grounding });
  return { ...grounding, constraintStatus: constraint.status, satisfyingReplacement: constraint.satisfyingReplacement && grounding.standalonePrimaryEligible };
}

module.exports = {
  assessExecutionGrounding,
  assessCandidateActionability,
  replacementConstraintStatus,
  OUTING_TYPES,
};
