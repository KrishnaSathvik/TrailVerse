'use strict';
const { evaluateItineraryCompleteness, classifyStop } = require('../itineraryCompleteness');
const { experienceRole, evaluateDayValue } = require('../semanticDayValue');
const { normalizeEvidencePlaceCandidates } = require('../evidencePlaceCandidate');
const { reconcileCanonicalNarrative } = require('../canonicalPlanNarrative');
const { priceProviderCall } = require('../../services/trailieTurnLedger');
const { resolveCoverageRepairScope, applyDayContainedCoverageRepair } = require('../dayContainedCoverageRepair');
const stop = (name, type, duration, extra = {}) => ({ name, type, duration, ...extra });
const ev = (name, category, activityTypes = [], extra = {}) => ({ evidenceId: `ev:${name}`, topic: 'visitor_services',
  claim: { text: name, normalizedValue: { name, category, activityTypes, ...extra } } });
const evaluate = (stops, extra = {}) => evaluateDayValue({ day: { stops }, classifyStop, minimumMinutes: 90, ...extra });

test('A: a single substantial grounded experience needs no second attraction', () => {
  expect(evaluate([stop('Ridge Loop', 'hike', 180)]).reason).toBe('valid_substantial_single_experience');
});
test('B: explicit cultural semantics outrank a facility container and model type', () => {
  const bundle = { evidence: [ev('Heritage Hall', 'visitor_center', ['museum', 'exhibits'])] };
  expect(normalizeEvidencePlaceCandidates(bundle)[0].canonicalType).toBe('museum');
  expect(experienceRole(stop('Heritage Hall', 'visitor_center', 75, { note: 'Explore exhibits and film.' }), { bundle, classifyStop }).role).toBe('primary_experience');
});
test('C: verified transfer consumes capacity, not attraction minutes', () => {
  const stops = [stop('Ridge Path', 'walk', 60), stop('Orientation Center', 'visitor_center', 15, { note: 'Brief orientation' })];
  const v = evaluate(stops, { availableMinutes: 300, transferMinutes: 225 });
  expect(v.capacity).toBe(75);
  expect(v.ok).toBe(true);
  expect(evaluate(stops).ok).toBe(false);
  expect(v.primaryMinutes).toBeLessThanOrEqual(75);
});
test('D/E: logistics and a long transfer do not create a day', () => {
  expect(evaluate([stop('Information Desk', 'logistics', 90), stop('Hotel', 'lodging', 120)]).ok).toBe(false);
  expect(evaluate([stop('Transfer', 'drive', 300), stop('Brief View', 'viewpoint', 20)], { availableMinutes: 480, transferMinutes: 300 }).ok).toBe(false);
});
test('F: grounded scenic route is primary but transfer prose cannot relabel transportation', () => {
  expect(evaluate([stop('Coastal Route', 'scenic_drive', 180)]).ok).toBe(true);
  expect(experienceRole(stop('Hotel Transfer', 'drive', 180, { note: 'Scenic scenery along the way' }), { classifyStop }).role).toBe('logistics');
});
test('G/H: relative relaxation and model labels do not waive absolute day value', () => {
  const itineraryData = { days: [{ dayNumber: 1, label: 'Relaxed half-day', stops: [stop('Garden Path', 'walk', 30)] }] };
  expect(evaluateItineraryCompleteness({ itineraryData, userPrompt: 'Plan a day here' }).ok).toBe(false);
  expect(evaluateItineraryCompleteness({ itineraryData, userPrompt: 'I am tired; make today relaxed' }).ok).toBe(false);
});
test('I: same canonical anchor and purpose adds no day value despite an alias', () => {
  const v = evaluate([stop('New Label', 'museum', 120)], { priorStops: [stop('Old Label', 'museum', 120)], compareIdentity: () => 'same' });
  expect(v.reason).toBe('repetitive_experience');
});
test('J: distinct timed purpose at a repeated anchor remains valid', () => {
  const v = evaluate([stop('Heritage Hall', 'photography', 90, { timeWindow: 'Sunrise' })], {
    priorStops: [stop('Heritage Hall', 'museum', 90, { timeWindow: 'Afternoon' })], compareIdentity: () => 'same',
  });
  expect(v.ok).toBe(true);
});
test('M: accepted repair clears stale intro, footer and flagged day label', () => {
  const original = { intro: 'No trail is available.', narrativeSections: [{ markdown: 'No trail to promise.' }], days: [
    { dayNumber: 1, label: 'Frozen', stops: [stop('Gallery', 'museum', 120)] },
    { dayNumber: 2, label: 'No trail', notes: 'No walks', stops: [stop('Ridge Trail', 'hike', 90)] },
  ] };
  const result = reconcileCanonicalNarrative({ itineraryData: original, afterRepair: true, changedDays: [2] });
  expect(JSON.stringify(result)).not.toMatch(/No trail|No walks/);
  expect(result.itineraryData.days[0]).toBe(original.days[0]);
});
test('O: operation cap and evidence-backed duration are enforced', () => {
  const itineraryData = { days: [{ dayNumber: 1, stops: [stop('Garden Trail', 'walk', 30)] }, { dayNumber: 2, stops: [stop('Gallery', 'museum', 120)] }] };
  const scope = resolveCoverageRepairScope({ itineraryData, reasonCodes: ['insufficient_day_coverage'], dayDiagnostics: [{ dayNumber: 1, codes: ['insufficient_day_coverage'] }] });
  const candidate = { ref: 1, canonicalName: 'Garden Trail', canonicalType: 'walk', maxDurationMinutes: 120 };
  const op = { op: 'deepen_stop', stopRef: 1, stop: { placeRef: 1, durationMinutes: 120, note: 'Explore the complete loop', why: 'Time for the gardens' } };
  const merge = operations => applyDayContainedCoverageRepair({ itineraryData, scope, candidates: [candidate], dayRepairs: [{ dayRef: 1, operations }] });
  expect(merge([op]).ok).toBe(true);
  expect(merge([op]).plan.days[1]).toBe(itineraryData.days[1]);
  expect(merge([op, op, op]).reasonCodes).toContain('coverage_repair_operation_budget');
  expect(merge([{ ...op, stop: { ...op.stop, durationMinutes: 180 } }]).ok).toBe(false);
});
test('P: captured token counts reconcile without charging cache writes twice', () => {
  const price = usage => priceProviderCall({ provider: 'openai', model: 'gpt-6-sol', at: new Date('2026-09-24'), usage });
  const generation = price({ input_tokens: 6021, input_tokens_details: { cache_write_tokens: 5390, cached_tokens: 0 }, output_tokens: 1897, output_tokens_details: { reasoning_tokens: 903 } });
  const repair = price({ input_tokens: 1065, output_tokens: 627 });
  expect(generation.costUsd).toBeCloseTo(0.033707, 9);
  expect(generation.costUsd + repair.costUsd).toBeCloseTo(0.042107, 9);
  expect(Object.values(generation.components).reduce((a, b) => a + b, 0)).toBe(generation.costUsd);
  expect(generation.components.reasoning).toBeCloseTo(0.00903, 9);
});
test('neutral replay: exhibit visit plus short outing passes without repeated support', () => {
  const bundle = { evidence: [ev('Geology Center', 'visitor_center', ['exhibits']), ev('Habitat Center', 'visitor_center', ['exhibits'])] };
  expect(evaluate([stop('Geology Center', 'visitor_center', 75, { note: 'Explore exhibits' }), stop('Ridge Trail', 'hike', 60)], { bundle }).ok).toBe(true);
  expect(evaluate([stop('Habitat Center', 'visitor_center', 75, { note: 'Interactive exhibits' }), stop('Canyon Path', 'walk', 45)], { bundle }).ok).toBe(true);
});
test('captured service-plus-trail day retains coverage without promoting the facility', () => {
  const fixture = require('./fixtures/dayValue/captured-cultural-days.json');
  const result = evaluateItineraryCompleteness({ itineraryData: fixture.plan, evidenceBundle: fixture.bundle,
    userPrompt: 'Give me four days in Zion.', constraints: { dates: { numDays: 4 } } });
  expect(result.ok).toBe(true);
  expect(result.dayValueDiagnostics.find(d=>d.dayNumber===2).dayValue.primaryMinutes).toBe(60);
  const day = fixture.plan.days[1];
  const service=day.stops.find(s=>/Visitor Center/.test(s.name));
  expect(experienceRole(service,{bundle:fixture.bundle,classifyStop}).role).toBe('supporting_experience');
});
test('evidence-backed road typing does not promote a transfer into a scenic activity', () => {
  const { resolveStopIdentities } = require('../stopIdentityResolution');
  const evidenceBundle = { evidence: [{ evidenceId: 'road', topic: 'activities', claim: { normalizedValue: {
    name: 'Coastal Road', primaryActivityType: 'scenic_drive', activityTypes: ['scenic driving'],
  } } }] };
  const result = resolveStopIdentities({ evidenceBundle, itineraryData: { days: [{ dayNumber: 1,
    stops: [stop('Coastal Road', 'drive', 120, { note: 'Transfer to the hotel.' })],
  }] } });
  expect(result.itineraryData.days[0].stops[0].type).toBe('drive');
});
test('verified route artifact informs capacity in completeness, unverified model minutes do not', () => {
  const itineraryData = { days: [{ dayNumber: 1, stops: [stop('Ridge Trail', 'walk', 60),
    stop('Orientation Center', 'visitor_center', 15, { note: 'Brief orientation' })] }] };
  const args = { itineraryData, constraints: { planningState: { time: { availableHours: 5 } } } };
  expect(evaluateItineraryCompleteness(args).ok).toBe(false);
  expect(evaluateItineraryCompleteness({ ...args, routeArtifact: { entries: [{ status: 'verified', binding: { dayIndex: 0 }, durationSeconds: 225 * 60 }] } }).ok).toBe(true);
});
test('an earlier information-only visit does not consume a later cultural experience', () => {
  const bundle = { evidence: [ev('Heritage Hall', 'visitor_center', ['museum', 'exhibits'])] };
  expect(evaluate([stop('Heritage Hall', 'museum', 120, { note: 'Explore exhibits and the film' })], {
    bundle, priorStops: [stop('Heritage Hall', 'logistics', 10, { note: 'Pick up a map at the information desk' })],
  }).ok).toBe(true);
});
test('missing evidence references cannot accidentally bind unrelated cultural metadata', () => {
  const bundle = { evidence: [{ topic: 'visitor_services', claim: { normalizedValue: { name: 'Unrelated Gallery', category: 'museum' } } }] };
  expect(experienceRole(stop('Information Center', 'visitor_center', 90), { bundle, classifyStop }).role).toBe('logistics');
});


test('source duration shapes share one upper bound for candidate packing and credited value', () => {
  const { supportedDurationMaximum } = require('../evidenceActivityDuration');
  for (const duration of [{ duration: '30 Minutes' }, { durationMinutes: 30 }, { duration: '0.5 Hours' },
    { duration: '15–30 Minutes' }, { groundedDurationMinutes: 60, maxVisitDurationMinutes: 30 }]) {
    const bundle = { evidence: [ev('Ridge Trail', 'trail', ['hiking'], duration)] };
    const role = experienceRole(stop('Ridge Trail', 'hike', 300), { bundle, classifyStop });
    expect(role.duration).toBe(supportedDurationMaximum(duration));
    expect(role.duration).toBe(30);
  }
});
test('rest and limited time are explicit intents, while relative relaxation must keep a worthwhile day', () => {
  const priorDay = { stops: [stop('Ridge Trail', 'hike', 180), stop('Garden Trail', 'walk', 60)] };
  const reduced = evaluate([stop('Ridge Trail', 'hike', 90)], { priorDay, dayIntent: { relativeBurden: 'reduce' } });
  expect(reduced.ok).toBe(true);
  expect(evaluate([stop('Patio', 'viewpoint', 40)], { priorDay, lightByIntent: true }).ok).toBe(false);
  expect(evaluate([stop('Ridge Trail', 'hike', 300)], { priorDay, dayIntent: { relativeBurden: 'reduce' } }).reason).toBe('relative_burden_not_reduced');
  expect(evaluate([], { dayIntent: { kind: 'rest', travelerAsserted: true } }).reason).toBe('valid_rest_day');
  expect(evaluate([stop('Patio', 'viewpoint', 30)], { availableMinutes: 30 }).ok).toBe(true);
});
