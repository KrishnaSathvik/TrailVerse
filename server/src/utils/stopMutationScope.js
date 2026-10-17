'use strict';

const { dayNumber: dayNumberOf } = require('./itineraryPlanPatch');
const { itineraryImpacts } = require('./itineraryImpact');

const LOGISTICS_STOP = /\b(visitor center|picnic|lodging|campground|shuttle|parking|meal|lunch|dinner)\b/i;

function stopIdOf(stop) {
  return String(stop?.id || stop?.stopId || '').trim() || null;
}

function describeStop(stop) {
  const id = stopIdOf(stop);
  if (!id) return null;
  return { id, name: String(stop?.name || '').trim() || null, timeWindow: stop?.timeWindow ?? null };
}

function indexesFor(day, dayNumber, impacts) {
  const indexes = [];
  for (const impact of impacts.filter((row) => row.dayNumber === dayNumber)) {
    if (Number.isInteger(impact.stopIndex) && day.stops?.[impact.stopIndex]) indexes.push(impact.stopIndex);
    else if (impact.stopId) {
      const found = (day.stops || []).findIndex((stop) => stopIdOf(stop) === impact.stopId);
      if (found >= 0) indexes.push(found);
    }
  }
  return [...new Set(indexes)];
}

function siblingDependsOnAffected(day, affectedIndexes) {
  const names = affectedIndexes.map((index) => String(day.stops?.[index]?.name || '').trim().toLowerCase()).filter((name) => name.length > 3);
  return (day.stops || []).some((stop, index) => {
    if (affectedIndexes.includes(index)) return false;
    const deps = [...(stop.accessDependencies || []), stop.requiresCompanion, stop.experienceSubject].filter(Boolean).join(' ').toLowerCase();
    return names.some((name) => deps.includes(name));
  });
}

function dayRewriteReason(day, affectedIndexes) {
  const meaningful = (day.stops || []).map((stop, index) => ({ stop, index }))
    .filter(({ stop }) => !LOGISTICS_STOP.test(`${stop?.name || ''} ${stop?.type || ''}`));
  if (meaningful.length > 0 && meaningful.every(({ index }) => affectedIndexes.includes(index))) return 'all_meaningful_stops_conflict';
  if (siblingDependsOnAffected(day, affectedIndexes)) return 'dependent_composition_invalid';
  return null;
}

function buildImpactStopScope(plan, impacts) {
  const dayNumbers = [...new Set(impacts.map((impact) => impact.dayNumber))];
  const affectedStopIndexes = {};
  const frozenSiblingStopIndexes = {};
  const dayRewriteReasons = {};
  const affectedStops = [];
  const frozenStops = [];
  for (const [index, day] of (plan?.days || []).entries()) {
    const dayNumber = dayNumberOf(day, index);
    if (!dayNumbers.includes(dayNumber)) continue;
    const affected = indexesFor(day, dayNumber, impacts);
    const frozen = (day.stops || []).map((_, stopIndex) => stopIndex).filter((stopIndex) => !affected.includes(stopIndex));
    affectedStopIndexes[dayNumber] = affected;
    frozenSiblingStopIndexes[dayNumber] = frozen;
    const reason = dayRewriteReason(day, affected);
    if (reason) dayRewriteReasons[dayNumber] = reason;
    affected.forEach((stopIndex) => {
      const described = describeStop(day.stops[stopIndex]);
      if (described) affectedStops.push({ ...described, dayNumber, stopIndex });
    });
    frozen.forEach((stopIndex) => {
      const described = describeStop(day.stops[stopIndex]);
      if (described) frozenStops.push({ ...described, dayNumber, stopIndex });
    });
  }
  return {
    affectedStopIndexes,
    frozenSiblingStopIndexes,
    affectedStops,
    frozenSiblingStops: frozenStops,
    frozenSiblingStopIds: frozenStops.map((stop) => stop.id),
    dayRewriteReasons,
  };
}

// Intrinsic structure of a frozen sibling. Numeric `order` is derived after
// legal remove/add/replace and is compared via relative frozen sequence instead.
const FROZEN_FIELDS = Object.freeze([
  'name', 'type', 'duration', 'timeWindow', 'startTime',
  'evidenceRef', 'canonicalPlaceName', 'placeRef', 'evidenceEntityId',
]);

function sameValue(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function planStopIndex(plan) {
  const map = new Map();
  for (const [i, day] of (plan?.days || []).entries()) {
    const dayNumber = dayNumberOf(day, i);
    for (const stop of day.stops || []) {
      map.set(stopIdOf(stop) || `${dayNumber}::${stop?.name}`, { dayNumber, stop });
    }
  }
  return map;
}

function dayByNumber(plan, dayNumber) {
  for (const [i, day] of (plan?.days || []).entries()) {
    if (dayNumberOf(day, i) === dayNumber) return day;
  }
  return null;
}

function frozenRelativeSequence(plan, frozenIds, dayNumber) {
  const day = dayByNumber(plan, dayNumber);
  return (day?.stops || [])
    .map((stop) => stopIdOf(stop))
    .filter((id) => id && frozenIds.has(id));
}

function operationsTargetFrozen({ operations = [], frozenIds = new Set() } = {}) {
  const explicitReorder = [];
  const explicitMutations = [];
  for (const operation of operations || []) {
    const op = String(operation?.op || '');
    if (op === 'reorder_stops') {
      const order = (operation.stopOrder || []).map(String);
      if (order.some((id) => frozenIds.has(id))) explicitReorder.push(operation);
      continue;
    }
    const targetId = String(operation?.stopId || operation?.stop?.id || '').trim();
    if (!targetId || !frozenIds.has(targetId)) continue;
    if (op === 'remove_stop' || op === 'update_stop' || op === 'replace_stop' || op === 'move_stop') {
      explicitMutations.push(operation);
    }
  }
  return { explicitReorder, explicitMutations };
}

/**
 * Stop-granularity ownership: frozen siblings keep intrinsic structure and
 * relative sequence. Literal ordinal compaction after an authorized neighboring
 * remove/insert is derived normalization, not an ownership violation.
 */
function evaluateFrozenSiblings({
  priorPlan = null, nextPlan = null, scope = null, operations = null,
} = {}) {
  if (scope?.mutationGranularity !== 'stop') return null;
  const frozen = new Set(scope.frozenSiblingStopIds || []);
  const affectedDays = new Set(scope.dayNumbers || []);
  const rewriteDays = new Set(Object.keys(scope.dayRewriteReasons || {}).map(Number));
  const before = planStopIndex(priorPlan);
  const after = planStopIndex(nextPlan);
  const outsideScope = { removed: [], added: [], changed: [] };
  const intrinsicChanged = [];
  const relativeOrderChangedDays = [];
  const derivedOrdinalChangedIds = [];

  for (const [id, prior] of before) {
    const next = after.get(id);
    const sibling = frozen.has(id) && !rewriteDays.has(prior.dayNumber);
    const outsideDay = !affectedDays.has(prior.dayNumber);
    if (!sibling && !outsideDay) continue;
    if (!next) { outsideScope.removed.push(id); continue; }
    if (sibling) {
      const intrinsicHit = FROZEN_FIELDS.some((field) => !sameValue(prior.stop?.[field], next.stop?.[field]));
      if (intrinsicHit) {
        outsideScope.changed.push(id);
        intrinsicChanged.push(id);
      }
      if (!sameValue(prior.stop?.order, next.stop?.order)) derivedOrdinalChangedIds.push(id);
      continue;
    }
    const fields = ['name', 'type', 'duration', 'difficulty', 'physicalDifficulty', 'exposureLevel', 'walkingDistanceMiles', 'note', 'why'];
    if (fields.some((field) => !sameValue(prior.stop?.[field], next.stop?.[field]))) outsideScope.changed.push(id);
  }

  for (const [id, next] of after) {
    if (before.has(id)) continue;
    if (!affectedDays.has(next.dayNumber)) outsideScope.added.push(id);
  }

  const frozenDays = new Set(
    [...frozen].map((id) => before.get(id)?.dayNumber).filter((dayNumber) => Number.isFinite(dayNumber)),
  );
  for (const dayNumber of frozenDays) {
    if (rewriteDays.has(dayNumber)) continue;
    const priorSeq = frozenRelativeSequence(priorPlan, frozen, dayNumber);
    const nextSeq = frozenRelativeSequence(nextPlan, frozen, dayNumber);
    if (!sameValue(priorSeq, nextSeq)) {
      relativeOrderChangedDays.push(dayNumber);
      for (const id of new Set([...priorSeq, ...nextSeq])) {
        if (!outsideScope.changed.includes(id) && frozen.has(id) && before.has(id) && after.has(id)) {
          outsideScope.changed.push(id);
        }
      }
    }
  }

  const opProbe = operationsTargetFrozen({ operations: operations || [], frozenIds: frozen });
  const relativeOrderChanged = relativeOrderChangedDays.length > 0;
  const explicitReorderDetected = relativeOrderChanged || opProbe.explicitReorder.length > 0;
  const derivedOrdinalChanged = derivedOrdinalChangedIds.length > 0;
  const frozenSiblingIntrinsicChanged = intrinsicChanged.length > 0;

  const violated = outsideScope.removed.length + outsideScope.added.length + outsideScope.changed.length > 0;
  return {
    ok: !violated,
    reasonCodes: violated ? ['refinement_mutation_outside_requested_scope'] : [],
    outsideScope,
    scheduleRipples: [],
    dayLevelScopeReasons: scope.dayRewriteReasons || {},
    telemetry: {
      frozenSiblingIntrinsicChanged,
      frozenSiblingRelativeOrderChanged: relativeOrderChanged,
      relativeOrderChangedDays,
      derivedOrdinalChanged,
      derivedOrdinalChangedIds,
      explicitReorderDetected,
      explicitFrozenTargetOperations: opProbe.explicitMutations.length,
    },
  };
}

function activePlanConstraintRefinement(message, plan) {
  if (!Array.isArray(plan?.days) || plan.days.length === 0) return false;
  if (require('./planningInputContract').userAvoidsTrailExposure(message)) return true;
  return itineraryImpacts({ text: message, plan }).length > 0;
}

module.exports = {
  buildImpactStopScope,
  evaluateFrozenSiblings,
  activePlanConstraintRefinement,
  FROZEN_FIELDS,
  frozenRelativeSequence,
};
