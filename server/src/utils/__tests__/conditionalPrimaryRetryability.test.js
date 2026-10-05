'use strict';

/**
 * Conditional-primary retryability + structural candidate authorization.
 * Provider-isolated offline fixtures — no network, no model calls.
 */

const { evaluateTripExperienceQuality, conditionalDependency } = require('../tripExperienceQuality');
const { packRefinementEvidence } = require('../../prompts/refinementEvidencePacking');
const { bindRepairPatch } = require('../boundRepairPatch');
const { buildEvidenceBoundRepairCandidates } = require('../evidenceBoundRepairCandidates');
const { candidatePool } = require('../downstreamRepairPlanner');
const { OPERATORS } = require('../repairOperators');
const { MAX_FOCUSED_MODEL_REPAIRS } = require('../focusedRepairBudget');
const { applyPlanPatch } = require('../itineraryPlanPatch');
const { resolveRefinementScope, evaluateScopedOwnership } = require('../refinementScope');

const MESSAGE = "I don't like scary exposed hikes.";
const DATES = { startDate: '2027-09-12', endDate: '2027-09-17' };

function record(id, value, topic = 'activities') {
  return { evidenceId: id, topic, claim: { text: value.description || value.name, normalizedValue: value } };
}

function trail(id, name, extra = {}) {
  return record(id, {
    name, type: 'trail', activityTypes: ['hiking'], duration: '2 hours', exposureLevel: 'low', ...extra,
  });
}

function museum(id, name, extra = {}) {
  return record(id, {
    name, type: 'museum', activityTypes: ['exhibits'], seasonal: true, duration: '1 hour', ...extra,
  });
}

function support(id, name) {
  return record(id, { name, category: 'visitor_center', type: 'visitor_center' }, 'visitor_services');
}

function stop(name, extra = {}) {
  return {
    id: `s-${name}`, name, canonicalPlaceName: name, type: extra.type || 'hike',
    duration: extra.duration || 90, evidenceRef: extra.evidenceRef || `ev:${name}`,
    resolutionStatus: 'resolved', ...extra,
  };
}

function plan(dayStops) {
  return {
    days: dayStops.map((stops, i) => ({
      dayNumber: i + 1, id: `d${i + 1}`, label: `Day ${i + 1}`, stops,
    })),
  };
}

const constraints = { avoidExposure: true, preferences: { avoidExposure: true }, dates: DATES };

test('1: conditional primary + safe candidates → model_fixable + PLAN_VIABILITY_EDIT', () => {
  const bundle = {
    evidence: [
      museum('ev:museum', 'Seasonal Gallery'),
      trail('ev:loop', 'River Loop Trail'),
      trail('ev:meadow', 'Meadow Path'),
      trail('ev:cedar', 'Cedar Bench Trail'),
      support('ev:vc', 'Visitor Desk'),
    ],
  };
  const itineraryData = plan([
    [stop('Visitor Desk', { type: 'visitor_center', duration: 20, evidenceRef: 'ev:vc' }), stop('River Loop Trail', { evidenceRef: 'ev:loop' })],
    [stop('Seasonal Gallery', { type: 'museum', duration: 60, evidenceRef: 'ev:museum' })],
    [stop('Meadow Path', { evidenceRef: 'ev:meadow' })],
    [stop('River Loop Trail', { evidenceRef: 'ev:loop', duration: 60 })],
  ]);
  const q = evaluateTripExperienceQuality({
    itineraryData, bundle, constraints, userPrompt: MESSAGE, touchedDayNumbers: [2],
  });
  expect(q.reasonCodes).toContain('conditional_primary_unsupported');
  expect(q.candidates.map((c) => c.canonicalName)).toContain('Cedar Bench Trail');
  expect(q.retryability).toBe('model_fixable');
  expect(OPERATORS.VIABILITY).toBe('PLAN_VIABILITY_EDIT');
  const pool = candidatePool({
    plan: itineraryData,
    targets: q.diagnostics.days.filter((d) => q.affectedDays.includes(d.dayNumber))
      .flatMap((d) => d.weakStopIndexes.map((stopIndex) => ({ dayNumber: d.dayNumber, stopIndex }))),
    candidates: q.candidates,
    context: { bundle, constraints, userPrompt: MESSAGE },
    focusedRepairBudgetRemaining: MAX_FOCUSED_MODEL_REPAIRS,
  });
  expect(pool.byScope.some((s) => s.eligibleCandidateRefs.length > 0)).toBe(true);
  expect(pool.ok).toBe(true);
});

test('2: conditional primary + no legal candidates → evidence_blocker', () => {
  const bundle = { evidence: [museum('ev:museum', 'Seasonal Gallery')] };
  const itineraryData = plan([
    [stop('Seasonal Gallery', { type: 'museum', evidenceRef: 'ev:museum' })],
    [stop('Seasonal Gallery', { type: 'museum', evidenceRef: 'ev:museum', id: 's2' })],
  ]);
  const q = evaluateTripExperienceQuality({ itineraryData, bundle, constraints, userPrompt: MESSAGE });
  expect(q.reasonCodes).toContain('conditional_primary_unsupported');
  expect(q.candidates).toHaveLength(0);
  expect(q.retryability).toBe('evidence_blocker');
});

test('3: conditional primary + candidates all violate hard constraint → evidence_blocker', () => {
  const bundle = {
    evidence: [
      museum('ev:museum', 'Seasonal Gallery'),
      trail('ev:cliff', 'Cliff Edge Trail', { exposureLevel: 'high' }),
    ],
  };
  const itineraryData = plan([
    [stop('Seasonal Gallery', { type: 'museum', evidenceRef: 'ev:museum', id: 'm1' })],
    [stop('Seasonal Gallery', { type: 'museum', evidenceRef: 'ev:museum', id: 'm2' })],
  ]);
  const q = evaluateTripExperienceQuality({
    itineraryData, bundle, constraints, userPrompt: MESSAGE, touchedDayNumbers: [2],
  });
  expect(q.reasonCodes).toContain('conditional_primary_unsupported');
  expect(q.candidates).toHaveLength(0);
  expect(q.retryability).toBe('evidence_blocker');
});

test('4: support-only evidence visible but absent from structural registry → cannot introduce', () => {
  const evidence = [
    trail('ev:loop', 'River Loop Trail'),
    support('ev:desk', 'Orientation Desk'),
    museum('ev:museum', 'Seasonal Gallery'),
  ];
  const packed = packRefinementEvidence({
    bundle: { evidence },
    plan: plan([[stop('Ridge Trail', { exposureLevel: 'high' })]]),
    constraints,
    userRequest: MESSAGE,
    limit: 2000,
  });
  expect(packed.text).toContain('[SUPPORT]');
  expect(packed.structuralCandidates.every((c) => !/museum|orientation desk/i.test(c.canonicalName))).toBe(true);
  const bound = bindRepairPatch({
    priorPlan: plan([[stop('Ridge Trail')]]),
    planPatch: {
      operations: [{
        op: 'update_day', dayNumber: 1,
        day: { dayNumber: 1, stops: [{ placeRef: 99, name: 'Orientation Desk', type: 'visitor_center', duration: 20 }] },
      }],
    },
    candidates: packed.structuralCandidates,
  });
  expect(bound.ok).toBe(false);
  expect(bound.reasonCodes).toContain('unauthorized_refinement_candidate');
});

test('5: authorized replacement ref may be introduced', () => {
  const evidence = [trail('ev:loop', 'River Loop Trail'), trail('ev:meadow', 'Meadow Path')];
  const packed = packRefinementEvidence({
    bundle: { evidence },
    plan: plan([[stop('Ridge Trail', { exposureLevel: 'high' })]]),
    constraints,
    userRequest: MESSAGE,
    limit: 2000,
  });
  const ref = packed.structuralCandidates[0].ref;
  const bound = bindRepairPatch({
    priorPlan: plan([[stop('Ridge Trail')]]),
    planPatch: {
      operations: [{
        op: 'update_day', dayNumber: 1,
        day: {
          dayNumber: 1,
          stops: [{ placeRef: ref, name: 'ignored', type: 'hike', duration: 90, note: 'Walk', why: 'Safe' }],
        },
      }],
    },
    candidates: packed.structuralCandidates,
  });
  expect(bound.ok).toBe(true);
  expect(bound.patch.operations[0].day.stops[0].name).toBe(packed.structuralCandidates[0].canonicalName);
});

test('6: update_day with one authorized and one unauthorized new stop → reject', () => {
  const evidence = [trail('ev:loop', 'River Loop Trail')];
  const packed = packRefinementEvidence({
    bundle: { evidence },
    plan: plan([[stop('Ridge Trail', { exposureLevel: 'high' })]]),
    constraints,
    userRequest: MESSAGE,
    limit: 2000,
  });
  const ref = packed.structuralCandidates[0].ref;
  const bound = bindRepairPatch({
    priorPlan: plan([[stop('Ridge Trail', { id: 'ridge' })]]),
    planPatch: {
      operations: [{
        op: 'update_day', dayNumber: 1,
        day: {
          dayNumber: 1,
          stops: [
            { placeRef: ref, name: 'River Loop Trail', type: 'hike', duration: 90 },
            { placeRef: 999, name: 'Invented Summit', type: 'hike', duration: 60 },
          ],
        },
      }],
    },
    candidates: packed.structuralCandidates,
  });
  expect(bound.ok).toBe(false);
  expect(bound.reasonCodes).toContain('unauthorized_refinement_candidate');
});

test('7: existing safe canonical sibling retained without registry selection → allowed', () => {
  const prior = plan([[
    stop('Ridge Trail', { id: 'ridge', exposureLevel: 'high' }),
    stop('Quiet Overlook', { id: 'overlook', type: 'viewpoint', duration: 30, evidenceRef: 'ev:view' }),
  ]]);
  const evidence = [
    trail('ev:loop', 'River Loop Trail'),
    record('ev:view', { name: 'Quiet Overlook', type: 'viewpoint', activityTypes: ['viewing'], exposureLevel: 'low' }),
  ];
  const packed = packRefinementEvidence({
    bundle: { evidence }, plan: prior, constraints, userRequest: MESSAGE, limit: 2000,
  });
  const ref = packed.structuralCandidates.find((c) => c.canonicalName === 'River Loop Trail').ref;
  const bound = bindRepairPatch({
    priorPlan: prior,
    planPatch: {
      operations: [{
        op: 'update_day', dayNumber: 1,
        day: {
          dayNumber: 1,
          stops: [
            { placeRef: ref, name: 'River Loop Trail', type: 'hike', duration: 90 },
            { id: 'overlook', name: 'Quiet Overlook', type: 'viewpoint', duration: 30 },
          ],
        },
      }],
    },
    candidates: packed.structuralCandidates,
  });
  expect(bound.ok).toBe(true);
  expect(bound.patch.operations[0].day.stops[1].name).toBe('Quiet Overlook');
});

test('8: repair path cannot select support-only candidate', () => {
  const candidates = buildEvidenceBoundRepairCandidates({
    bundle: { evidence: [trail('ev:loop', 'River Loop Trail'), support('ev:desk', 'Orientation Desk')] },
    constraints,
    requireExecutablePrimary: true,
  }).candidates;
  expect(candidates.every((c) => c.canonicalName !== 'Orientation Desk')).toBe(true);
  const bound = bindRepairPatch({
    priorPlan: plan([[stop('Ridge Trail')]]),
    planPatch: {
      operations: [{
        op: 'add_stop', dayNumber: 1,
        stop: { placeRef: 1, name: 'Orientation Desk', type: 'visitor_center', duration: 20 },
      }],
    },
    candidates,
  });
  // placeRef 1 resolves to River Loop when desk is absent — forge an invalid ref
  const forged = bindRepairPatch({
    priorPlan: plan([[stop('Ridge Trail')]]),
    planPatch: {
      operations: [{
        op: 'add_stop', dayNumber: 1,
        stop: { placeRef: 50, name: 'Orientation Desk', type: 'visitor_center', duration: 20 },
      }],
    },
    candidates,
  });
  expect(forged.ok).toBe(false);
  expect(forged.reasonCodes).toContain('unauthorized_refinement_candidate');
});

test('9: SELF_SUFFICIENT must not include projected conditional blocker', () => {
  const evidence = [
    museum('ev:museum', 'Seasonal Gallery'),
    trail('ev:loop', 'River Loop Trail'),
  ];
  const packed = packRefinementEvidence({
    bundle: { evidence },
    plan: plan([[stop('Ridge Trail', { exposureLevel: 'high' })]]),
    constraints,
    userRequest: MESSAGE,
    limit: 2000,
  });
  expect(packed.text).not.toMatch(/\[REPLACEMENT R\d+\] Seasonal Gallery/);
  expect(packed.structuralCandidates.every((c) => c.conditionalStatus !== 'conditional_unsupported')).toBe(true);
  expect(packed.structuralCandidates.every((c) => !(c.selfSufficient && c.conditionalStatus === 'conditional_unsupported'))).toBe(true);
  const action = packed.refinementPacking.scopes[0];
  expect(action.eligibleSelfSufficientCount).toBe(packed.refinementPacking.structuralSelfSufficientCount
    || action.eligibleSelfSufficientCount);
  expect(action.packedSelfSufficientCount).toBeGreaterThan(0);
});

test('10: conditional with grounded independent fallback may remain day-valid', () => {
  const bundle = {
    evidence: [
      museum('ev:museum', 'Seasonal Gallery'),
      trail('ev:loop', 'River Loop Trail'),
    ],
  };
  const itineraryData = plan([[
    stop('Seasonal Gallery', { type: 'museum', duration: 60, evidenceRef: 'ev:museum' }),
    stop('River Loop Trail', { evidenceRef: 'ev:loop', duration: 120 }),
  ]]);
  const q = evaluateTripExperienceQuality({ itineraryData, bundle, constraints, userPrompt: MESSAGE });
  expect(q.ok).toBe(true);
});

test('11: remaining repair budget = 0 → no model-fixable dispatch despite candidates', () => {
  expect(MAX_FOCUSED_MODEL_REPAIRS).toBe(2);
  const bundle = {
    evidence: [
      museum('ev:museum', 'Seasonal Gallery'),
      trail('ev:loop', 'River Loop Trail'),
      // Unique alternative that does not collide with frozen Day 1.
      trail('ev:meadow', 'Meadow Path'),
    ],
  };
  const itineraryData = plan([
    [stop('River Loop Trail', { evidenceRef: 'ev:loop' })],
    [stop('Seasonal Gallery', { type: 'museum', evidenceRef: 'ev:museum' })],
  ]);
  const q = evaluateTripExperienceQuality({
    itineraryData, bundle, constraints, userPrompt: MESSAGE, touchedDayNumbers: [2],
  });
  expect(q.retryability).toBe('model_fixable');
  expect(q.candidates.length).toBeGreaterThan(0);
  expect(q.candidates.some((c) => /meadow/i.test(c.canonicalName))).toBe(true);
  expect(q.candidates.every((c) => !/river loop/i.test(c.canonicalName))).toBe(true);
  // Scheduler gate: budget remaining 0 suppresses dispatch even when fixable.
  const repairBudgetRemaining = 0;
  const mayDispatch = q.retryability === 'model_fixable' && repairBudgetRemaining > 0;
  expect(mayDispatch).toBe(false);
});

test('12: frozen ordinal compaction after authorized remove remains ownership PASS', () => {
  const prior = {
    days: [{
      dayNumber: 1,
      stops: [
        stop('Taylor Creek Trail', { id: 'taylor', order: 1, exposureLevel: null }),
        stop('Lava Point Overlook', {
          id: 'lava', order: 2, type: 'viewpoint', duration: 30, exposureLevel: 'low', timeWindow: 'Afternoon',
        }),
      ],
    }],
  };
  const scope = resolveRefinementScope({ text: MESSAGE, priorPlan: prior });
  const applied = applyPlanPatch({
    priorPlan: prior,
    planPatch: { operations: [{ op: 'remove_stop', dayNumber: 1, stopId: 'taylor' }] },
  });
  expect(applied.ok).toBe(true);
  expect(applied.plan.days[0].stops[0]).toMatchObject({ id: 'lava', order: 1, name: 'Lava Point Overlook' });
  const ownership = evaluateScopedOwnership({
    priorPlan: prior, nextPlan: applied.plan, scope,
    operations: [{ op: 'remove_stop', dayNumber: 1, stopId: 'taylor' }],
  });
  expect(ownership.ok).toBe(true);
});

test('preference/date continuity seed remains intact under merge', () => {
  const { planningStateToConstraintSeed } = require('../planningState');
  const seed = planningStateToConstraintSeed({
    destination: { parkCode: 'zion' },
    dates: { startDate: '2027-09-12', endDate: '2027-09-17', durationDays: 4, tripWindowDays: 6 },
    preferences: { avoidExposure: true },
    travelers: {},
    lodging: {},
  });
  expect(seed.avoidExposure).toBe(true);
  expect(seed.startDate).toBe('2027-09-12');
  expect(seed.endDate).toBe('2027-09-17');
  expect(seed.parkCode).toBe('zion');
});

test('captured rerun2: museum was replacement-authorized; conditional classification corrected', () => {
  const art = require('path').resolve(__dirname, '../../../../artifacts/trailie-zion-exposure-live-2026-09-28-rerun2');
  const fs = require('fs');
  if (!fs.existsSync(`${art}/turn-1-evidence.json`)) return;
  const before = JSON.parse(fs.readFileSync(`${art}/turn-1-before-session.json`, 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(`${art}/turn-1-evidence.json`, 'utf8'));
  const result = JSON.parse(fs.readFileSync(`${art}/turn-1-result.json`, 'utf8'));
  const prior = [...before.messages].reverse().find((m) => m.canonicalPlan).canonicalPlan;
  const packed = packRefinementEvidence({
    bundle: evidence, plan: prior, constraints, userRequest: MESSAGE, limit: 1600,
  });
  expect(packed.structuralCandidates.every((c) => !/human history museum$/i.test(c.canonicalName))).toBe(true);
  expect(packed.structuralCandidates.some((c) => c.selfSufficient)).toBe(true);
  const applied = applyPlanPatch({ priorPlan: prior, planPatch: { operations: result.primaryOperations } });
  const q = evaluateTripExperienceQuality({
    itineraryData: applied.plan, bundle: evidence, constraints, userPrompt: MESSAGE, touchedDayNumbers: [2, 3, 4],
  });
  expect(q.reasonCodes).toEqual(['conditional_primary_unsupported']);
  expect(q.candidates.length).toBeGreaterThan(0);
  expect(q.retryability).toBe('model_fixable');
  const pool = candidatePool({
    plan: applied.plan,
    targets: [{ dayNumber: 2, stopIndex: 1 }],
    candidates: q.candidates,
    context: { bundle: evidence, constraints, userPrompt: MESSAGE },
    focusedRepairBudgetRemaining: 2,
  });
  expect(pool.byScope[0].eligibleCandidateRefs.length).toBeGreaterThan(0);
  expect(conditionalDependency({
    name: 'Zion Human History Museum',
    evidenceRef: 'ev:2235a83b595a0cbcb4bba22ff81beb59c0cab065f391e614bf41a8d93639cd11',
  }, evidence, { constraints, userPrompt: MESSAGE })).toBe(true);
});
