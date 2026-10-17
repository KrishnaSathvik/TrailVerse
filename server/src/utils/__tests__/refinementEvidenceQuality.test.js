'use strict';

const { assessCandidateActionability } = require('../experienceActionability');
const { buildEvidenceBoundRepairCandidates } = require('../evidenceBoundRepairCandidates');
const { areaActionability } = require('../visitExperienceSemantics');
const { resolveRefinementScope, scopeAllowsOperation, evaluateScopedOwnership } = require('../refinementScope');
const { packRefinementEvidence } = require('../../prompts/refinementEvidencePacking');
const { buildPlanViabilitySnapshot } = require('../planViabilityRepair');
const { reconcileRepairDayCopy } = require('../repairCopyDependencies');
const { groundedExperienceCredit } = require('../groundedExperienceCredit');
const { mergePlanningStateWithConstraints } = require('../planningState');
const { resolveActiveTripContext } = require('../../services/activeTripContextService');
const { activePlanConstraintRefinement } = require('../stopMutationScope');
const { packPrimaryEvidence, planningJob } = require('../../prompts/primaryEvidencePacking');
const { applyPlanPatch } = require('../itineraryPlanPatch');
const { createQualificationDispatchPolicy } = require('../qualificationDispatchPolicy');
const { MAX_FOCUSED_REPAIRS } = require('../focusedRepairBudget');

const MESSAGE = "I don't like scary exposed hikes.";

function record(id, value, topic = 'activities') {
  return { evidenceId: id, topic, claim: { text: value.description || value.name, normalizedValue: value } };
}

function trail(id, name, extra = {}) {
  return record(id, { name, type: 'trail', activityTypes: ['hiking'], duration: '2 hours', exposureLevel: 'low', ...extra });
}

function support(id, name) {
  return record(id, { name, category: 'visitor_center', type: 'visitor_center' }, 'visitor_services');
}

function heritage(extra = {}) {
  return record('heritage', {
    name: 'Example National Heritage Area',
    type: 'place',
    category: 'place',
    description: 'A broad heritage area. Turn around whenever you like.',
    ...extra,
  }, 'activities');
}

function plan(stops) {
  return { days: [{ dayNumber: 1, stops }] };
}

test('strong replacements are packed ahead of support filler', () => {
  const evidence = [
    ...Array.from({ length: 6 }, (_, i) => support(`s${i}`, `Service Desk ${i}`)),
    trail('loop', 'River Loop Trail'),
    trail('bench', 'Cedar Bench Trail', { duration: '3 hours' }),
  ];
  const bundle = { evidence };
  const prior = plan([
    { id: 'ridge', name: 'Ridge Trail', type: 'trail', duration: 120, exposureLevel: 'high' },
    { id: 'overlook', name: 'Quiet Overlook', type: 'viewpoint', duration: 30, exposureLevel: 'low' },
  ]);
  const packed = packRefinementEvidence({
    bundle, plan: prior, constraints: { avoidExposure: true }, userRequest: MESSAGE, limit: 120,
  });
  const scope = packed.refinementPacking.scopes[0];
  expect(scope.eligibleSelfSufficientCount).toBeGreaterThan(0);
  expect(scope.packedSelfSufficientCount).toBeGreaterThan(0);
  expect(scope.packedSubstantialCount).toBeGreaterThan(0);
  expect(packed.refinementPacking.repackOccurred).toBe(true);
  expect(packed.text).toContain('River Loop Trail');
  expect(packed.refinementPacking.packingWarnings).toEqual([]);
});

test('a generic place labeled walk is not a standalone outing', () => {
  const bundle = { evidence: [heritage()] };
  const stop = { name: 'Example National Heritage Area', type: 'walk', duration: 90, note: 'Turn around whenever you like.' };
  const action = assessCandidateActionability({ records: bundle.evidence, name: stop.name, modelType: 'walk', modelDuration: 90 });
  expect(action.standalonePrimaryEligible).toBe(false);
  expect(areaActionability(stop, bundle).reasonCode).toBe('experience_not_actionable');
  expect(action.modelDuration).toBe(90);
  expect(action.sourceDuration).toBeNull();
});

test('a source-bounded heritage walk can qualify', () => {
  const bundle = { evidence: [heritage({
    experienceExecution: { action: 'Walk', scope: 'Signed loop between the river and the old town walls' },
  })] };
  const stop = {
    name: 'Example National Heritage Area', type: 'walk', duration: 90,
    note: 'Walk the signed loop between the river and the old town walls.',
  };
  expect(assessCandidateActionability({ records: bundle.evidence, name: stop.name }).standalonePrimaryEligible).toBe(true);
  expect(areaActionability(stop, bundle).actionable).toBe(true);
});

test('model-authored duration cannot create a walk', () => {
  const bundle = { evidence: [heritage()] };
  const action = assessCandidateActionability({ records: bundle.evidence, modelType: 'walk', modelDuration: 90 });
  expect(action.standalonePrimaryEligible).toBe(false);
  expect(action.substantial).toBe(false);
});

test('known moderate exposure is not a satisfying replacement', () => {
  const records = [trail('high', 'Cliff Edge Trail', { exposureLevel: 'moderate', duration: '2 hours' })];
  const action = assessCandidateActionability({ records, constraints: { avoidExposure: true } });
  expect(action.constraintStatus).toBe('incompatible');
  expect(action.satisfyingReplacement).toBe(false);
});

test('unresolved exposure does not outrank a confirmed-compatible choice', () => {
  const evidence = [
    trail('safe', 'Meadow Loop Trail', { exposureLevel: 'low' }),
    trail('unknown', 'Unmarked Canyon Trail', { exposureLevel: null, duration: '2 hours' }),
  ];
  const packed = packRefinementEvidence({
    bundle: { evidence },
    plan: plan([{ id: 'ridge', name: 'Ridge Trail', type: 'trail', duration: 90, exposureLevel: 'high' }]),
    constraints: { avoidExposure: true },
    userRequest: MESSAGE,
    limit: 2000,
  });
  expect(packed.text).toContain('Meadow Loop Trail');
  expect(packed.text).not.toContain('Unmarked Canyon Trail');
});

test('only unresolved alternatives are not labeled compatible', () => {
  const records = [trail('unknown', 'Unmarked Canyon Trail', { exposureLevel: null })];
  const action = assessCandidateActionability({ records, constraints: { avoidExposure: true } });
  expect(action.constraintStatus).toBe('unknown');
  expect(action.satisfyingReplacement).toBe(false);
  const packed = packRefinementEvidence({
    bundle: { evidence: records },
    plan: plan([{ id: 'ridge', name: 'Ridge Trail', type: 'trail', duration: 90, exposureLevel: 'high' }]),
    constraints: { avoidExposure: true },
    userRequest: MESSAGE,
    limit: 2000,
  });
  expect(packed.text).not.toContain('Constraint eligibility: compatible');
  expect(packed.refinementPacking.scopes[0].packedSelfSufficientCount).toBe(0);
});

test('a safe sibling stays structurally frozen', () => {
  const prior = plan([
    { id: 'creek', name: 'Taylor Creek Trail', type: 'trail', duration: 210, exposureLevel: null },
    { id: 'lava', name: 'Lava Point Overlook', type: 'viewpoint', duration: 30, exposureLevel: 'low', timeWindow: 'Afternoon' },
  ]);
  const scope = resolveRefinementScope({ text: MESSAGE, priorPlan: prior });
  expect(scope.affectedStopIndexes[1]).toEqual([0]);
  expect(scope.frozenSiblingStopIndexes[1]).toEqual([1]);
  expect(scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 1 } }).ok).toBe(false);
  const next = JSON.parse(JSON.stringify(prior));
  next.days[0].stops[0] = { ...next.days[0].stops[0], name: 'Meadow Loop Trail', duration: 90, type: 'trail' };
  expect(evaluateScopedOwnership({ priorPlan: prior, nextPlan: next, scope }).ok).toBe(true);
  next.days[0].stops[1].duration = 45;
  expect(evaluateScopedOwnership({ priorPlan: prior, nextPlan: next, scope }).ok).toBe(false);
});

test('a dependent sibling authorizes a bounded day rewrite', () => {
  const prior = plan([
    { id: 'creek', name: 'Taylor Creek Trail', type: 'trail', duration: 120, exposureLevel: 'high' },
    { id: 'spur', name: 'Creek Spur', type: 'trail', duration: 30, exposureLevel: 'low', accessDependencies: ['Taylor Creek Trail'] },
  ]);
  const scope = resolveRefinementScope({ text: MESSAGE, priorPlan: prior });
  expect(scope.dayRewriteReasons[1]).toBe('dependent_composition_invalid');
  expect(scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 1 } }).ok).toBe(true);
  const next = JSON.parse(JSON.stringify(prior));
  next.days[0].stops[1].duration = 45;
  expect(evaluateScopedOwnership({ priorPlan: prior, nextPlan: next, scope }).ok).toBe(true);
});

test('confirmed dates survive a preference merge', () => {
  const persisted = {
    dates: { startDate: '2027-09-12', endDate: '2027-09-17', durationDays: 4, tripWindowDays: 6 },
    pendingTemporalResolution: null,
    preferences: { avoidExposure: null },
    destination: { parkCode: 'zion' },
  };
  const next = mergePlanningStateWithConstraints(persisted, { avoidExposure: true }, { lastUserMessage: MESSAGE });
  expect(next.preferences.avoidExposure).toBe(true);
  expect(next.dates).toMatchObject({ startDate: '2027-09-12', endDate: '2027-09-17', durationDays: 4, tripWindowDays: 6 });
  expect(next.pendingTemporalResolution).toBeNull();
});

test('preference refinement keeps the active plan destination authoritative', () => {
  const prior = plan([{ id: 'ridge', name: 'Ridge Trail', type: 'trail', duration: 90, exposureLevel: 'high' }]);
  expect(activePlanConstraintRefinement(MESSAGE, prior)).toBe(true);
  const cleared = resolveActiveTripContext({
    lastUserMessage: MESSAGE,
    openEndedDiscovery: true,
    storedContext: null,
  });
  expect(cleared.activeTripContext.resolutionSource).toBe('open_ended_discovery');
  const kept = resolveActiveTripContext({
    lastUserMessage: MESSAGE,
    openEndedDiscovery: false,
    storedContext: null,
    authoritativeDestination: { name: 'Sample Park', parkCode: 'samp' },
  });
  expect(kept.activeTripContext.primaryDestination.parkCode).toBe('samp');
  expect(kept.activeTripContext.resolutionSource).toBe('active_plan_constraint_refinement');
});

test('repair eligibility uses the same execution grounding filter', () => {
  const bundle = { evidence: [heritage(), trail('loop', 'River Loop Trail')] };
  const loose = buildEvidenceBoundRepairCandidates({ bundle, requireExperiential: false, candidatePlan: { days: [] } });
  expect(loose.candidates.map((c) => c.canonicalName)).toContain('Example National Heritage Area');
  const strict = buildEvidenceBoundRepairCandidates({
    bundle, requireExperiential: false, requireExecutablePrimary: true, candidatePlan: { days: [] },
  });
  expect(strict.candidates.map((c) => c.canonicalName)).not.toContain('Example National Heritage Area');
  expect(strict.candidates.map((c) => c.canonicalName)).toContain('River Loop Trail');
  const snapshot = buildPlanViabilitySnapshot({
    plan: { days: [{ dayNumber: 1, stops: [{ name: 'Thin Overlook', type: 'viewpoint', duration: 20 }] }] },
    context: { bundle, constraints: {} },
  });
  expect((snapshot.candidates || []).map((c) => c.canonicalName)).not.toContain('Example National Heritage Area');
});

test('replacing one stop reconciles relational copy and leaves the sibling structure', () => {
  const prior = plan([
    { id: 'creek', name: 'Taylor Creek Trail', type: 'trail', duration: 210, order: 1, timeWindow: 'Morning' },
    { id: 'lava', name: 'Lava Point Overlook', type: 'viewpoint', duration: 30, order: 2, timeWindow: 'Afternoon', note: 'After Taylor Creek Trail, stay for the view.', why: 'Pairs with Taylor Creek Trail.' },
  ]);
  const next = JSON.parse(JSON.stringify(prior));
  next.days[0].stops[0].name = 'Meadow Loop Trail';
  const reconciled = reconcileRepairDayCopy({ priorPlan: prior, plan: next, affectedDays: [1], bundle: { evidence: [] } });
  const sibling = reconciled.plan.days[0].stops[1];
  expect(sibling.name).toBe('Lava Point Overlook');
  expect(sibling.duration).toBe(30);
  expect(sibling.type).toBe('viewpoint');
  expect(sibling.order).toBe(2);
  expect(sibling.timeWindow).toBe('Afternoon');
  expect(sibling.note).not.toMatch(/Taylor Creek Trail/i);
});

test('a visitor center does not become a museum because the model says so', () => {
  const bundle = { evidence: [record('vc', { name: 'Canyon Visitor Center', category: 'visitor_center', type: 'visitor_center' }, 'visitor_services')] };
  const credit = groundedExperienceCredit({
    name: 'Canyon Visitor Center', type: 'museum', duration: 40, evidenceRef: 'vc',
  }, { bundle, classifyStop: () => 'experiential' });
  expect(credit.canonicalType).not.toBe('museum');
  expect(credit.role).not.toBe('primary_experience');
});

test('full-plan primary packing stays on its own path', () => {
  const job = planningJob({ mode: 'architect', constraints: { tripDays: 4 }, userRequest: 'Plan four days.' });
  expect(job.itinerary).toBe(true);
  const bundle = { evidence: [trail('loop', 'River Loop Trail'), support('desk', 'Service Desk')] };
  const primary = packPrimaryEvidence({
    items: bundle.evidence.map((candidate) => ({ evidenceId: candidate.evidenceId, candidate, resolution: { status: 'satisfied' } })),
    bundle, constraints: {}, userRequest: 'Plan four days.', job, limit: 2000, scoreFn: () => 1,
  });
  expect(primary.primaryPacking.packedExperienceCount).toBeGreaterThan(0);
  expect(primary.primaryPacking.scopes).toBeUndefined();
});

test('captured post-confirmation exposure edit exposes grounded replacements', () => {
  const session = require('../../../../artifacts/trailie-zion-exposure-live-2026-09-25/turn-1-before-session.json');
  const bundle = require('../../../../artifacts/trailie-zion-exposure-live-2026-09-25/turn-1-evidence.json');
  const prior = session.messages.find((message) => message.canonicalPlan)?.canonicalPlan;
  const scope = resolveRefinementScope({ text: MESSAGE, priorPlan: prior });
  expect(scope.dayNumbers).toEqual([2, 3, 4]);
  expect(scope.affectedStopIndexes[4]).toEqual([0]);
  expect(scope.frozenSiblingStopIndexes[4]).toEqual([1]);
  expect(scope.dayNumbers).not.toContain(1);
  const packed = packRefinementEvidence({
    bundle, plan: prior, constraints: { avoidExposure: true }, userRequest: MESSAGE, limit: 1600,
  });
  expect(packed.text.indexOf('[REPLACEMENT')).toBeLessThan(packed.text.indexOf('[SUPPORT'));
  const facility = (bundle.evidence || []).find((row) => row.claim?.normalizedValue?.category === 'visitor_center'
    && (row.claim.normalizedValue.activityTypes || []).some((type) => /hike|walk/i.test(type)));
  if (facility) {
    expect(assessCandidateActionability({
      records: [facility], constraints: { avoidExposure: true },
    }).standalonePrimaryEligible).toBe(false);
  }
  const byDay = Object.fromEntries(packed.refinementPacking.scopes.map((row) => [row.affectedDay, row]));
  expect(byDay[2].packedSelfSufficientCount + byDay[3].packedSelfSufficientCount + byDay[4].packedSelfSufficientCount).toBeGreaterThan(0);
  for (const row of packed.refinementPacking.scopes) {
    if (row.eligibleSelfSufficientCount > 0) expect(row.packedSelfSufficientCount).toBeGreaterThan(0);
  }
  const heritageCandidate = (bundle.evidence || []).find((row) => /heritage area/i.test(row.claim?.normalizedValue?.name || ''));
  if (heritageCandidate) {
    expect(assessCandidateActionability({
      records: [heritageCandidate], modelType: 'walk', modelDuration: 90,
    }).standalonePrimaryEligible).toBe(false);
  }
  const next = mergePlanningStateWithConstraints(session.planningState, { avoidExposure: true }, { lastUserMessage: MESSAGE });
  expect(next.dates.startDate).toBe('2027-09-12');
  expect(next.dates.endDate).toBe('2027-09-17');
  expect(next.dates.tripWindowDays).toBe(6);
  expect(next.dates.durationDays).toBe(4);
  expect(next.pendingTemporalResolution).toBeNull();
  expect(next.preferences.avoidExposure).toBe(true);
  const lava = JSON.parse(JSON.stringify(prior));
  const day4 = lava.days.find((day) => Number(day.dayNumber || day.day) === 4);
  day4.stops[1].duration = 45;
  expect(evaluateScopedOwnership({ priorPlan: prior, nextPlan: lava, scope }).ok).toBe(false);
  const replaced = applyPlanPatch({
    priorPlan: prior,
    planPatch: { operations: [{ op: 'update_stop', dayNumber: 4, stopId: day4.stops[0].id, stopName: day4.stops[0].name, stop: { name: 'Meadow Loop', type: 'trail', duration: 90, exposureLevel: 'low' } }] },
  });
  expect(replaced.ok).toBe(true);
  expect(evaluateScopedOwnership({ priorPlan: prior, nextPlan: replaced.plan, scope }).ok).toBe(true);
  expect(replaced.plan.days.find((day) => Number(day.dayNumber || day.day) === 4).stops[1].duration).toBe(30);
});

test('a successful bounded patch does not spend a repair call', () => {
  const prior = plan([
    { id: 'ridge', name: 'Ridge Trail', type: 'trail', duration: 120, order: 1, exposureLevel: 'high' },
    { id: 'overlook', name: 'Quiet Overlook', type: 'viewpoint', duration: 30, order: 2, exposureLevel: 'low' },
  ]);
  const scope = resolveRefinementScope({ text: MESSAGE, priorPlan: prior });
  const patched = applyPlanPatch({
    priorPlan: prior,
    planPatch: { operations: [{ op: 'update_stop', dayNumber: 1, stopId: 'ridge', stop: { name: 'River Loop Trail', type: 'trail', duration: 120, exposureLevel: 'low' } }] },
  });
  expect(patched.ok).toBe(true);
  expect(evaluateScopedOwnership({ priorPlan: prior, nextPlan: patched.plan, scope }).ok).toBe(true);
  expect(patched.plan.days[0].stops[1].duration).toBe(30);
  const policy = createQualificationDispatchPolicy();
  policy.authorize({ model: 'gpt-6-sol', purpose: 'primary_generation' });
  expect(policy.snapshot().focusedModelRepairDispatches).toBe(0);
  expect(policy.snapshot().remainingFocusedRepairs).toBe(MAX_FOCUSED_REPAIRS);
});

test('one viability repair stays inside the existing cap without Astra or regeneration', () => {
  expect(MAX_FOCUSED_REPAIRS).toBe(2);
  const policy = createQualificationDispatchPolicy();
  policy.authorize({ model: 'gpt-6-sol', purpose: 'primary_generation' });
  const repair = policy.authorize({ model: 'gpt-6-sol', purpose: 'plan_viability_repair' });
  expect(repair.remainingFocusedRepairs).toBe(1);
  expect(policy.snapshot().repairOperators).toEqual(['PLAN_VIABILITY_EDIT']);
  expect(() => policy.authorize({ model: 'gpt-6-astra', purpose: 'plan_viability_repair' })).toThrow(/model_not_authorized/);
  expect(() => policy.authorize({ model: 'gpt-6-sol', purpose: 'primary_generation' })).toThrow(/whole_plan_regeneration/);
});
