'use strict';

/**
 * Stop-level frozen sibling ownership: intrinsic structure + relative sequence.
 * Derived ordinal compaction after an authorized neighboring remove/insert PASSes.
 */

const { applyPlanPatch } = require('../itineraryPlanPatch');
const { resolveRefinementScope, evaluateScopedOwnership } = require('../refinementScope');
const {
  evaluateFrozenSiblings,
  buildImpactStopScope,
  FROZEN_FIELDS,
} = require('../stopMutationScope');
const { itineraryImpacts } = require('../itineraryImpact');

const MESSAGE = "I don't like scary exposed hikes.";

const stop = (id, name, over = {}) => ({
  id, name, type: 'trail', duration: 90, order: over.order || 1, timeWindow: 'Morning', ...over,
});

const dayPlan = (stops, dayNumber = 1) => ({
  days: [{ id: `d${dayNumber}`, dayNumber, label: `Day ${dayNumber}`, stops }],
});

const zionFourDay = () => ({
  days: [
    {
      dayNumber: 1,
      stops: [
        stop('d1-vc', 'Zion Canyon Visitor Center', { type: 'visitor_center', duration: 25, order: 1, exposureLevel: 'low' }),
        stop('d1-parus', "Pa'rus Trail", { type: 'hike', duration: 90, order: 2, exposureLevel: 'low' }),
      ],
    },
    {
      dayNumber: 2,
      stops: [
        stop('d2-river', 'Riverside Walk', { type: 'hike', duration: 105, order: 1, exposureLevel: 'moderate' }),
        stop('d2-emerald', 'Lower Emerald Pool Trail', { type: 'hike', duration: 90, order: 2, exposureLevel: 'moderate' }),
      ],
    },
    {
      dayNumber: 3,
      stops: [
        stop('d3-sand', 'Sand Bench', { type: 'hike', duration: 150, order: 1 }),
        stop('d3-mid', 'Middle Emerald Pools Trail', { type: 'hike', duration: 105, order: 2, exposureLevel: 'moderate' }),
      ],
    },
    {
      dayNumber: 4,
      stops: [
        stop('d4-taylor', 'Taylor Creek Trail', { type: 'hike', duration: 210, order: 1 }),
        stop('d4-lava', 'Lava Point Overlook', {
          type: 'viewpoint', duration: 30, order: 2, exposureLevel: 'low',
          timeWindow: 'Late afternoon, only if access and travel time work',
          evidenceRef: 'ev:lava',
        }),
      ],
    },
  ],
});

function scopeFor(plan, text = MESSAGE) {
  return resolveRefinementScope({ text, priorPlan: plan });
}

function renumber(day) {
  (day.stops || []).forEach((row, index) => { row.order = index + 1; });
}

test('FROZEN_FIELDS omit derived ordinal', () => {
  expect(FROZEN_FIELDS).not.toContain('order');
  expect(FROZEN_FIELDS).toEqual(expect.arrayContaining([
    'name', 'type', 'duration', 'timeWindow', 'startTime', 'evidenceRef',
  ]));
});

test('1 remove affected predecessor → frozen sibling ordinal compacts → PASS', () => {
  const prior = dayPlan([
    stop('a', 'Affected Trail', { order: 1, exposureLevel: 'high' }),
    stop('b', 'Safe Overlook', { order: 2, type: 'viewpoint', duration: 30, exposureLevel: 'low', timeWindow: 'Afternoon' }),
  ]);
  const scope = scopeFor(prior);
  expect(scope.affectedStopIndexes[1]).toEqual([0]);
  expect(scope.frozenSiblingStopIndexes[1]).toEqual([1]);
  const applied = applyPlanPatch({
    priorPlan: prior,
    planPatch: { operations: [{ op: 'remove_stop', dayNumber: 1, stopId: 'a' }] },
  });
  expect(applied.ok).toBe(true);
  expect(applied.plan.days[0].stops[0]).toMatchObject({ id: 'b', order: 1, duration: 30, type: 'viewpoint' });
  const verdict = evaluateFrozenSiblings({
    priorPlan: prior, nextPlan: applied.plan, scope, operations: [{ op: 'remove_stop', dayNumber: 1, stopId: 'a' }],
  });
  expect(verdict.ok).toBe(true);
  expect(verdict.telemetry).toMatchObject({
    frozenSiblingIntrinsicChanged: false,
    frozenSiblingRelativeOrderChanged: false,
    derivedOrdinalChanged: true,
    explicitReorderDetected: false,
  });
  expect(verdict.telemetry.derivedOrdinalChangedIds).toEqual(['b']);
});

test('2 insert before frozen sibling → ordinal shifts → PASS', () => {
  const prior = dayPlan([
    stop('a', 'Affected Trail', { order: 1, exposureLevel: 'high' }),
    stop('b', 'Safe Overlook', { order: 2, type: 'viewpoint', duration: 30, exposureLevel: 'low' }),
  ]);
  const scope = scopeFor(prior);
  const next = JSON.parse(JSON.stringify(prior));
  next.days[0].stops = [
    { ...next.days[0].stops[0], name: 'Meadow Loop', duration: 90, exposureLevel: 'low' },
    { id: 'x', name: 'Patio View', type: 'viewpoint', duration: 40, order: 2, exposureLevel: 'low' },
    { ...next.days[0].stops[1], order: 3 },
  ];
  const verdict = evaluateFrozenSiblings({ priorPlan: prior, nextPlan: next, scope });
  expect(verdict.ok).toBe(true);
  expect(verdict.telemetry.derivedOrdinalChanged).toBe(true);
  expect(verdict.telemetry.frozenSiblingRelativeOrderChanged).toBe(false);
});

test('3 two frozen siblings retain relative order after predecessor removal → PASS', () => {
  const prior = dayPlan([
    stop('a', 'Exposed Ridge', { order: 1, exposureLevel: 'high' }),
    stop('b', 'Quiet Patio', { order: 2, type: 'viewpoint', duration: 30, exposureLevel: 'low' }),
    stop('c', 'Museum Wing', { order: 3, type: 'museum', duration: 45, exposureLevel: 'low' }),
  ]);
  // Force stop-level freeze for B and C by making only A affected via synthetic scope.
  const impacts = [{ dayNumber: 1, stopIndex: 0, reasonCode: 'exposure_conflict' }];
  const stopScope = buildImpactStopScope(prior, impacts);
  const scope = {
    resolved: true,
    level: 'affected_days',
    mutationGranularity: 'stop',
    dayNumbers: [1],
    ...stopScope,
  };
  expect(scope.frozenSiblingStopIndexes[1]).toEqual([1, 2]);
  const applied = applyPlanPatch({
    priorPlan: prior,
    planPatch: { operations: [{ op: 'remove_stop', dayNumber: 1, stopId: 'a' }] },
  });
  const verdict = evaluateFrozenSiblings({ priorPlan: prior, nextPlan: applied.plan, scope });
  expect(verdict.ok).toBe(true);
  expect(applied.plan.days[0].stops.map((s) => s.id)).toEqual(['b', 'c']);
  expect(verdict.telemetry.derivedOrdinalChanged).toBe(true);
  expect(verdict.telemetry.frozenSiblingRelativeOrderChanged).toBe(false);
});

test('4 two frozen siblings swap order → FAIL', () => {
  const prior = dayPlan([
    stop('a', 'Exposed Ridge', { order: 1, exposureLevel: 'high' }),
    stop('b', 'Quiet Patio', { order: 2, type: 'viewpoint', duration: 30, exposureLevel: 'low' }),
    stop('c', 'Museum Wing', { order: 3, type: 'museum', duration: 45, exposureLevel: 'low' }),
  ]);
  const impacts = [{ dayNumber: 1, stopIndex: 0, reasonCode: 'exposure_conflict' }];
  const scope = {
    resolved: true, level: 'affected_days', mutationGranularity: 'stop', dayNumbers: [1],
    ...buildImpactStopScope(prior, impacts),
  };
  const next = JSON.parse(JSON.stringify(prior));
  next.days[0].stops = [next.days[0].stops[0], next.days[0].stops[2], next.days[0].stops[1]];
  renumber(next.days[0]);
  const verdict = evaluateFrozenSiblings({
    priorPlan: prior, nextPlan: next, scope,
    operations: [{ op: 'reorder_stops', dayNumber: 1, stopOrder: ['a', 'c', 'b'] }],
  });
  expect(verdict.ok).toBe(false);
  expect(verdict.telemetry.frozenSiblingRelativeOrderChanged).toBe(true);
  expect(verdict.telemetry.explicitReorderDetected).toBe(true);
  expect(verdict.outsideScope.changed).toEqual(expect.arrayContaining(['b', 'c']));
});

test('5 frozen sibling directly targeted by reorder → FAIL', () => {
  const prior = dayPlan([
    stop('a', 'Exposed Ridge', { order: 1, exposureLevel: 'high' }),
    stop('b', 'Quiet Patio', { order: 2, type: 'viewpoint', duration: 30, exposureLevel: 'low' }),
    stop('c', 'Museum Wing', { order: 3, type: 'museum', duration: 45, exposureLevel: 'low' }),
  ]);
  const impacts = [{ dayNumber: 1, stopIndex: 0, reasonCode: 'exposure_conflict' }];
  const scope = {
    resolved: true, level: 'affected_days', mutationGranularity: 'stop', dayNumbers: [1],
    ...buildImpactStopScope(prior, impacts),
  };
  const next = JSON.parse(JSON.stringify(prior));
  next.days[0].stops = [next.days[0].stops[0], next.days[0].stops[2], next.days[0].stops[1]];
  renumber(next.days[0]);
  expect(evaluateFrozenSiblings({ priorPlan: prior, nextPlan: next, scope }).ok).toBe(false);
});

test('6 frozen sibling duration changed while order also compacts → FAIL', () => {
  const prior = dayPlan([
    stop('a', 'Exposed Ridge', { order: 1, exposureLevel: 'high' }),
    stop('b', 'Quiet Patio', { order: 2, type: 'viewpoint', duration: 30, exposureLevel: 'low' }),
  ]);
  const scope = scopeFor(prior);
  const next = JSON.parse(JSON.stringify(prior));
  next.days[0].stops = [{ ...next.days[0].stops[1], duration: 45, order: 1 }];
  const verdict = evaluateFrozenSiblings({ priorPlan: prior, nextPlan: next, scope });
  expect(verdict.ok).toBe(false);
  expect(verdict.telemetry.frozenSiblingIntrinsicChanged).toBe(true);
  expect(verdict.telemetry.derivedOrdinalChanged).toBe(true);
  expect(verdict.outsideScope.changed).toContain('b');
});

test('7 frozen sibling time window changed → FAIL', () => {
  const prior = dayPlan([
    stop('a', 'Exposed Ridge', { order: 1, exposureLevel: 'high' }),
    stop('b', 'Quiet Patio', { order: 2, type: 'viewpoint', duration: 30, timeWindow: 'Afternoon', exposureLevel: 'low' }),
  ]);
  const scope = scopeFor(prior);
  const next = JSON.parse(JSON.stringify(prior));
  next.days[0].stops[1].timeWindow = 'Morning';
  expect(evaluateFrozenSiblings({ priorPlan: prior, nextPlan: next, scope }).ok).toBe(false);
});

test('8 frozen sibling evidenceRef changed → FAIL', () => {
  const prior = dayPlan([
    stop('a', 'Exposed Ridge', { order: 1, exposureLevel: 'high' }),
    stop('b', 'Quiet Patio', { order: 2, type: 'viewpoint', duration: 30, evidenceRef: 'ev:1', exposureLevel: 'low' }),
  ]);
  const scope = scopeFor(prior);
  const next = JSON.parse(JSON.stringify(prior));
  next.days[0].stops[1].evidenceRef = 'ev:2';
  expect(evaluateFrozenSiblings({ priorPlan: prior, nextPlan: next, scope }).ok).toBe(false);
});

test('9 frozen sibling removed → FAIL', () => {
  const prior = dayPlan([
    stop('a', 'Exposed Ridge', { order: 1, exposureLevel: 'high' }),
    stop('b', 'Quiet Patio', { order: 2, type: 'viewpoint', duration: 30, exposureLevel: 'low' }),
  ]);
  const scope = scopeFor(prior);
  const applied = applyPlanPatch({
    priorPlan: prior,
    planPatch: { operations: [{ op: 'remove_stop', dayNumber: 1, stopId: 'b' }] },
  });
  const verdict = evaluateFrozenSiblings({
    priorPlan: prior, nextPlan: applied.plan, scope,
    operations: [{ op: 'remove_stop', dayNumber: 1, stopId: 'b' }],
  });
  expect(verdict.ok).toBe(false);
  expect(verdict.outsideScope.removed).toContain('b');
});

test('10 affected stop replaced in place, frozen sibling ordinal unchanged → PASS', () => {
  const prior = dayPlan([
    stop('a', 'Exposed Ridge', { order: 1, exposureLevel: 'high' }),
    stop('b', 'Quiet Patio', { order: 2, type: 'viewpoint', duration: 30, exposureLevel: 'low' }),
  ]);
  const scope = scopeFor(prior);
  const next = JSON.parse(JSON.stringify(prior));
  Object.assign(next.days[0].stops[0], { name: 'Meadow Loop', duration: 90, exposureLevel: 'low' });
  expect(evaluateFrozenSiblings({ priorPlan: prior, nextPlan: next, scope }).ok).toBe(true);
});

test('11 captured Day-4 Taylor removal: ownership PASS; thin day is not ownership FAIL', () => {
  const prior = zionFourDay();
  const scope = scopeFor(prior);
  expect(scope.dayNumbers).toEqual([2, 3, 4]);
  expect(scope.affectedStopIndexes[4]).toEqual([0]);
  expect(scope.frozenSiblingStopIndexes[4]).toEqual([1]);
  const ops = [{ op: 'remove_stop', dayNumber: 4, stopId: 'd4-taylor' }];
  const applied = applyPlanPatch({ priorPlan: prior, planPatch: { operations: ops } });
  expect(applied.ok).toBe(true);
  const lava = applied.plan.days[3].stops[0];
  expect(lava).toMatchObject({
    id: 'd4-lava', name: 'Lava Point Overlook', type: 'viewpoint', duration: 30, order: 1, evidenceRef: 'ev:lava',
  });
  const verdict = evaluateScopedOwnership({
    priorPlan: prior, nextPlan: applied.plan, scope, operations: ops,
  });
  expect(verdict.ok).toBe(true);
  expect(verdict.telemetry).toMatchObject({
    frozenSiblingIntrinsicChanged: false,
    frozenSiblingRelativeOrderChanged: false,
    derivedOrdinalChanged: true,
    explicitReorderDetected: false,
  });
  expect(verdict.telemetry.derivedOrdinalChangedIds).toEqual(['d4-lava']);
  // Ownership must not invent a coverage failure. Thin-day coverage is downstream.
  expect(verdict.reasonCodes).toEqual([]);
});

test('12 legal insert after Taylor removal renumbers Lava again without ownership FAIL', () => {
  const prior = zionFourDay();
  const scope = scopeFor(prior);
  const afterRemove = applyPlanPatch({
    priorPlan: prior,
    planPatch: { operations: [{ op: 'remove_stop', dayNumber: 4, stopId: 'd4-taylor' }] },
  }).plan;
  const withInsert = JSON.parse(JSON.stringify(afterRemove));
  withInsert.days[3].stops = [
    {
      id: 'd4-meadow', name: 'Meadow Loop Trail', type: 'trail', duration: 90, order: 1, exposureLevel: 'low',
    },
    { ...withInsert.days[3].stops[0], order: 2 },
  ];
  const verdict = evaluateFrozenSiblings({ priorPlan: prior, nextPlan: withInsert, scope });
  expect(verdict.ok).toBe(true);
  expect(verdict.telemetry.frozenSiblingIntrinsicChanged).toBe(false);
  expect(verdict.telemetry.frozenSiblingRelativeOrderChanged).toBe(false);
  expect(withInsert.days[3].stops.find((s) => s.id === 'd4-lava')).toMatchObject({
    duration: 30, type: 'viewpoint', evidenceRef: 'ev:lava',
  });
});

test('offline replay of paid failure shape now PASSes ownership', () => {
  const prior = zionFourDay();
  const impacts = itineraryImpacts({ text: MESSAGE, plan: prior });
  const stopScope = buildImpactStopScope(prior, impacts);
  expect(stopScope.frozenSiblingStopIds).toContain('d4-lava');
  const ops = [{ op: 'remove_stop', dayNumber: 4, stopId: 'd4-taylor' }];
  const applied = applyPlanPatch({ priorPlan: prior, planPatch: { operations: ops } });
  const scope = scopeFor(prior);
  const before = evaluateFrozenSiblings({
    // Simulate the pre-fix behavior would have failed; after-fix must pass.
    priorPlan: prior, nextPlan: applied.plan, scope, operations: ops,
  });
  expect(before.ok).toBe(true);
  expect(before.outsideScope.changed).toEqual([]);
});
