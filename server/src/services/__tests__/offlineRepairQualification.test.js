'use strict';
const fixtures = Object.fromEntries(['unknown-exposure', 'polarity', 'constraint-coverage', 'unresolved-identity', 'closure-exhausted', 'wheelchair', 'stale-alternative', 'seattle']
  .map(name => [name, require(`./fixtures/offlineRepair/${name}.json`)]));
const { buildEvidenceBoundRepairCandidates } = require('../../utils/evidenceBoundRepairCandidates');
const { bindRepairPatch, buildBoundRepairTool } = require('../../utils/boundRepairPatch');
const { PATCH_ITINERARY_TOOL } = require('../../utils/itineraryToolSchema');
const { applyPlanPatch } = require('../../utils/itineraryPlanPatch');
const { evaluateItineraryCompleteness } = require('../../utils/itineraryCompleteness');
const { evaluateProseConstraintSafety } = require('../../utils/proseConstraintSafety');
const { invalidateRemovedStopReferences } = require('../../utils/invalidateRemovedStopReferences');
const { enrichItineraryParkIdentity } = require('../../utils/itineraryParkIdentity');
const { hashPayload, buildCanonicalTrailieResponse } = require('../../utils/canonicalResponse');
const { runTrailieModelRouting } = require('../trailieModelRoutingService');
const row = (name, data = {}) => ({ evidenceId: `fixture:${name}`, topic: 'activities', claim: { normalizedValue: { name, category: 'trail', activityTypes: ['hike'], ...data } } });
const pool = { evidence: [row('Unknown Summit'), row('Exposed Summit', { exposureLevel: 'high' }),
  row('River Walk', { exposureLevel: 'low', category: 'paved_path', activityTypes: ['walk'], wheelchairAccessible: true, routeWheelchairAccessible: true }),
  row('Local Museum', { category: 'museum', activityTypes: [], wheelchairAccessible: true })] };
const catalogue = constraints => buildEvidenceBoundRepairCandidates({ bundle: pool, constraints });
const simulate = async validation => {
  const executeAttempt = jest.fn(async () => ({ output: {} }));
  const result = await runTrailieModelRouting({ enabled: true, context: { signals: { intent: 'trip_refinement', depth: 'planning' } },
    executeAttempt, validateAttempt: async () => validation });
  return { result, executeAttempt };
};

test('A/B: exposure and wheelchair eligibility precede the model, including hikes without trail in their name', () => {
  const result = catalogue({ avoidExposure: true, mobility: { wheelchair: true } });
  expect(result.candidates.map(c => c.canonicalName).sort()).toEqual(['Local Museum', 'River Walk']);
  const schema = buildBoundRepairTool(PATCH_ITINERARY_TOOL, result.candidates);
  expect(schema.input_schema.properties.operations.items.properties.stop.properties.placeRef.enum).toEqual(result.candidates.map(c => c.ref));
  expect(catalogue({ avoidExposure: true }).candidates.map(c => c.canonicalName)).not.toContain('Unknown Summit');
});

test('captured unknown exposure additions cannot self-certify low and enter a strict repair', () => {
  const fixture = fixtures['unknown-exposure'];
  expect(fixture.attempts[0].reasonCodes).toContain('constraint_eligibility_unknown');
  const bound = bindRepairPatch({ priorPlan: fixture.priorPlan, planPatch: fixture.outputs[0], candidates: catalogue({ avoidExposure: true }).candidates });
  expect(bound).toEqual({ ok: false, reasonCodes: ['unauthorized_refinement_candidate'] });
});

test('C: captured polarity language and leave-cliff-edge exclusion pass; hazard recommendations do not', () => {
  expect(evaluateProseConstraintSafety({ text: "We'll leave cliff-edge hikes out.", constraints: { avoidExposure: true } }).ok).toBe(true);
  const prose = fixtures.polarity.capturedProse.at(-1);
  expect(prose).toContain("I’d rather revisit a comfortable place");
  expect(evaluateProseConstraintSafety({ text: prose, constraints: { avoidExposure: true } }).ok).toBe(true);
  expect(evaluateProseConstraintSafety({ text: 'Leave cliff-edge hikes out, but take the exposed ridge.', constraints: { avoidExposure: true } }).ok).toBe(false);
});

test('D: the captured thin day still requires worthwhile absolute value', () => {
  const f = fixtures['constraint-coverage'];
  expect(f.attempts[0].reasonCodes).toContain('insufficient_day_coverage');
  const applied = applyPlanPatch({ priorPlan: f.priorPlan, planPatch: f.outputs[0] });
  expect(applied.ok).toBe(true);
  const result = evaluateItineraryCompleteness({ itineraryData: applied.plan, constraints: f.constraints,
    userPrompt: f.prompt, isRefinement: true, priorItineraryData: f.priorPlan, touchedDayNumbers: applied.touchedDayNumbers });
  expect(result.reasonCodes).toContain('insufficient_day_coverage');
  expect(result.warnings.some(w => w.code === 'intentionally_light_day')).toBe(false);
});

test.each(['relaxed', 'fatigue', 'wheelchair', 'exposure'])('D: %s alone cannot exempt a thin sightseeing day', kind => {
  const constraints = kind === 'relaxed' ? { pace: 'relaxed' } : kind === 'wheelchair' ? { mobility: { wheelchair: true } } : kind === 'exposure' ? { avoidExposure: true } : {};
  const userPrompt = kind === 'fatigue' ? "We're exhausted. Simplify tomorrow." : '';
  const itineraryData = { days: [{ dayNumber: 1, stops: [{ name: 'Local Museum', type: 'museum', duration: 45 }] }] };
  const args = { itineraryData, constraints, userPrompt, evidenceBundle: pool };
  expect(evaluateItineraryCompleteness(args).ok).toBe(false);
  expect(evaluateItineraryCompleteness({ ...args, itineraryData: { days: [{ dayNumber: 1, stops: [] }] } }).reasonCodes).toContain('empty_day');
});

test('E: strict repair binds the canonical identity and discards authored suitability', () => {
  const candidates = catalogue({ avoidExposure: true }).candidates;
  const candidate = candidates.find(c => c.canonicalName === 'Local Museum');
  const planPatch = { response: 'An indoor visit.', operations: [{ op: 'add_stop', dayNumber: 1,
    stop: { placeRef: candidate.ref, name: 'Invented summit', type: 'hike', duration: 45, exposureLevel: 'low', parkCode: 'olym' } }] };
  const bound = bindRepairPatch({ planPatch, priorPlan: { days: [] }, candidates });
  expect(bound.ok).toBe(true);
  expect(bound.patch.operations[0].stop).toMatchObject({ name: 'Local Museum', type: 'museum', exposureLevel: null, parkCode: null, evidenceRef: 'fixture:Local Museum' });
  expect(bindRepairPatch({ planPatch: { ...planPatch, operations: [{ ...planPatch.operations[0], stop: { name: 'Invented summit' } }] }, candidates }).ok).toBe(false);
});

test.each(['constraint_eligibility_unknown', 'stop_identity_unresolved', 'repair_evidence_catalog_unavailable', 'google_authorization_unavailable'])('F: %s with unavailable inputs buys exactly one mocked attempt, no retry or escalation', async code => {
  const { result, executeAttempt } = await simulate({ status: 'fail', locallyRepairable: true, eligibleCandidateCount: 0, reasonCodes: [code] });
  expect(executeAttempt).toHaveBeenCalledTimes(1);
  expect(result.attempts.map(a => a.tier)).toEqual(['sol_medium']);
  expect(result.reasonCode).toBe(code === 'google_authorization_unavailable' ? 'provider_blocker' : 'evidence_blocker');
});

test('F: captured unresolved identity cannot trigger invent/retry/escalate with an empty catalogue', async () => {
  const f = fixtures['unresolved-identity'];
  expect(f.outputs[0].days.length).toBeGreaterThan(0);
  const { result, executeAttempt } = await simulate({ status: 'fail', locallyRepairable: true, reasonCodes: f.attempts[0].reasonCodes, eligibleCandidateCount: 0 });
  expect(executeAttempt).toHaveBeenCalledTimes(1);
  expect(result.reasonCode).toBe('evidence_blocker');
});

test('F: repeated unresolved eligibility against unchanged candidates stops before Astra', async () => {
  const { result, executeAttempt } = await simulate({ status: 'fail', locallyRepairable: true,
    reasonCodes: ['constraint_eligibility_unknown'], eligibleCandidateCount: 2, candidateFingerprint: 'frozen' });
  expect(executeAttempt).toHaveBeenCalledTimes(2);
  expect(result.reasonCode).toBe('repeated_input_blocker');
  expect(result.attempts.every(a => a.tier === 'sol_medium')).toBe(true);
});

test('model mistakes with supplied IDs remain retryable', async () => {
  let calls = 0;
  const result = await runTrailieModelRouting({ enabled: true, context: { signals: { intent: 'trip_refinement' } },
    executeAttempt: async () => { calls += 1; return { output: {} }; },
    validateAttempt: async () => calls === 1 ? { status: 'fail', locallyRepairable: true, eligibleCandidateCount: 2, reasonCodes: ['unauthorized_refinement_candidate'] } : { status: 'pass' } });
  expect(result.status).toBe('complete');
  expect(calls).toBe(2);
});

test('G: closure-exhaustion cannot silently promote a thin sightseeing day', () => {
  const f = fixtures['closure-exhausted'];
  expect(f.attempts.at(-1).reasonCodes).toContain('insufficient_day_coverage');
  const applied = applyPlanPatch({ priorPlan: f.priorPlan, planPatch: f.outputs.at(-1) });
  expect(applied.ok).toBe(true);
  const result = evaluateItineraryCompleteness({ itineraryData: applied.plan, constraints: f.constraints, userPrompt: f.prompt,
    isRefinement: true, priorItineraryData: f.priorPlan, touchedDayNumbers: applied.touchedDayNumbers });
  expect(result.reasonCodes).toContain('insufficient_day_coverage');
  expect(applied.plan.days.at(-1).stops).toHaveLength(1);
});

test('A: captured wheelchair plan cannot license an inappropriate new hike', () => {
  const f = fixtures.wheelchair;
  expect(f.constraints.planningState.mobility.wheelchair).toBe(true);
  const result = catalogue(f.constraints);
  expect(result.candidates.map(c => c.canonicalType)).not.toContain('hike');
  const patch = { response: 'A trail.', operations: [{ op: 'add_stop', dayNumber: 1, stop: { name: 'Unknown Summit', type: 'hike', wheelchairAccessible: true } }] };
  expect(bindRepairPatch({ planPatch: patch, priorPlan: f.acceptedPlan, candidates: result.candidates }).ok).toBe(false);
});

test('H/J/K: removed Canyon Overlook alternatives are cleared, other days and canonical hashes hold', () => {
  const f = fixtures['stale-alternative'];
  const priorPlan = f.acceptedPlan;
  const day = priorPlan.days[0];
  const removed = { id: 'closed-overlook', name: 'Canyon Overlook', type: 'viewpoint', duration: 30 };
  const prior = { ...priorPlan, days: [{ ...day, stops: [...day.stops, removed] }, ...priorPlan.days.slice(1)] };
  const patch = { response: 'Removed the closed overlook.', operations: [{ op: 'remove_stop', dayNumber: day.dayNumber ?? day.day, stopId: removed.id }] };
  const bound = bindRepairPatch({ planPatch: patch, priorPlan: prior, candidates: [] });
  const applied = applyPlanPatch({ priorPlan: prior, planPatch: bound.patch });
  expect(applied.ok).toBe(true);
  const result = invalidateRemovedStopReferences({ priorPlan: prior, itineraryData: { ...applied.plan,
    alternatives: [{ parent: 'Canyon Overlook', name: 'Another overlook' }] } });
  expect(JSON.stringify(result.itineraryData.alternatives)).not.toContain('Canyon Overlook');
  expect(hashPayload(result.itineraryData.days.slice(1))).toBe(hashPayload(prior.days.slice(1)));
  const envelope = buildCanonicalTrailieResponse({ responseId: 'offline', processedContent: patch.response, itineraryData: result.itineraryData });
  expect(envelope.itineraryHash).toBe(hashPayload(result.itineraryData));
});

test('I: exact captured Seattle city POI does not inherit Olympic park identity', () => {
  const f = fixtures.seattle;
  const plan = JSON.parse(JSON.stringify(f.acceptedPlan));
  const stop = plan.days.flatMap(d => d.stops).find(s => s.name === 'Olympic Sculpture Park');
  expect(stop).toBeDefined();
  stop.parkCode = 'olym'; stop.parkName = 'Olympic National Park';
  const result = enrichItineraryParkIdentity({ itineraryData: plan, resolvedMetadata: { parkCode: 'olym' } }).itineraryData;
  expect(result.days.flatMap(d => d.stops).find(s => s.name === stop.name).parkCode).toBeNull();
});

test('H: exact captured stale Canyon Overlook alternatives are invalidated', () => {
  const f = fixtures['stale-alternative'];
  expect(JSON.stringify(f.acceptedPlan.alternatives)).toContain('Canyon Overlook');
  expect(JSON.stringify(f.acceptedPlan.days)).not.toContain('Canyon Overlook');
  const repaired = invalidateRemovedStopReferences({ priorPlan: f.priorPlan, itineraryData: f.acceptedPlan });
  expect(JSON.stringify(repaired.itineraryData.alternatives)).not.toContain('Canyon Overlook');
  expect(repaired.itineraryData.days).toEqual(f.acceptedPlan.days);
});

test('conflicting canonical identities and explicitly unavailable places never enter repair selection', () => {
  const bundle = { evidence: [row('Same Name', { category: 'museum', destinationId: 'city:1' }),
    row('Same Name', { category: 'museum', destinationId: 'city:2' }),
    row('Closed Museum', { category: 'museum', closureStatus: 'closed' })] };
  const catalog = buildEvidenceBoundRepairCandidates({ bundle });
  expect(catalog.count).toBe(0);
  expect(catalog.audit.excludedIdentity).toBe(1);
  expect(catalog.audit.excludedHardUnavailable).toBe(1);
});
