'use strict';
const { evaluateProseConstraintSafety } = require('../proseConstraintSafety');
const { evaluateHardAccessEligibility } = require('../hardConstraintEligibility');
const { buildEvidenceBoundRepairCandidates } = require('../evidenceBoundRepairCandidates');
const { invalidateRemovedStopReferences } = require('../invalidateRemovedStopReferences');
const { enrichItineraryParkIdentity } = require('../itineraryParkIdentity');
const { resolveStopIdentities } = require('../stopIdentityResolution');

test.each([
  "We'll leave cliff-edge hikes out.", 'Avoid exposed trails.',
  'I excluded Canyon Overlook because of your exposure preference.',
  'This option was removed because its exposure could not be verified.',
  "We'll stick to routes without exposed sections.",
  'Keep the plan centered on sunrise photography and non-exposed outings.',
  'I replaced the exposed and uncertain-exposure hikes with low-exposure walks and viewpoints.',
  'We removed the exposed ridge from the itinerary.',
  'We excluded exposed trails and skipped the cliff edge.',
  'We are replacing the exposed overlook with the museum.',
  'I’ve taken the longer or more exposed-feeling hikes out of Days 2–4.',
  'Take the exposed hike out of the itinerary.',
  'We took the exposed trails out.',
  'Taking the exposed routes out of our plan.',
  'I’ve taken the exposed or uncertain-exposure hikes out of the four days.',
  'I reshaped the trip, replacing the exposed hillside and longer final-day hikes.',
  'I kept all four days, replacing the exposed hikes and routes with uncertain exposure with low-exposure walks.',
  "I'd rather revisit a comfortable place than add a hike whose exposure I can't verify.",
])('exclusion passes: %s', text => {
  expect(evaluateProseConstraintSafety({ text, constraints: { avoidExposure: true } }).ok).toBe(true);
});
test.each([
  'Take the exposed ridge.', 'Continue along the cliff edge.',
  'This trail has exposed scrambling but should be fine.', 'Try the exposed overlook anyway.',
  "Leave cliff-edge hikes out, but take the exposed ridge.",
  'This option was removed because it was closed, but try the exposed overlook.',
  'Start with non-exposed outings, then take the exposed ridge.',
  'I replaced the museum with an exposed ridge hike.',
  'I replaced an exposed trail with another exposed trail.',
  'We removed the exposed ridge, but continue along the cliff edge.',
  'Take the exposed route out of town.',
  'Take the exposed route out for a walk.',
  'We took the exposed trails out, but try the exposed overlook.',
  'I replaced the museum, then take the exposed ridge.',
  'I replaced the museum with a route with exposed scrambling.',
  'I replaced the hike, but try the exposed route with a guide.',
])('hazard offer fails: %s', text => {
  expect(evaluateProseConstraintSafety({ text, constraints: { avoidExposure: true } }).ok).toBe(false);
});

const constraints = { mobility: { wheelchair: true } };
const bundle = { evidence: [{ evidenceId: 'museum', topic: 'activities', entityId: 'nps:park:zion',
  claim: { normalizedValue: { name: 'History Museum', category: 'museum', activityTypes: ['hiking', 'exhibits'], wheelchairAccessible: true } } }] };
test('facility identity wins over broad hiking tags in repair', () => {
  const result = buildEvidenceBoundRepairCandidates({ bundle, constraints });
  expect(result.candidates[0].canonicalType).toBe('museum');
  expect(evaluateHardAccessEligibility({ name: 'History Museum', type: 'museum', note: 'Explore exhibits.' }, { bundle, constraints }).status).toBe('compatible');
});
test('repair cannot reintroduce a place removed by the current mutation', () => {
  const result = buildEvidenceBoundRepairCandidates({ bundle, constraints: { ...constraints, excludedStopNames: ['History Museum'] } });
  expect(result.candidates).toEqual([]);
  expect(result.audit.excludedHardConstraint).toBe(1);
});
test('excluding a trail from a facility visit does not invent a route', () => {
  expect(evaluateHardAccessEligibility({ name: 'History Museum', type: 'museum', note: 'Explore exhibits without taking a trail.', why: 'A relaxed visit without a hike.' }, { bundle, constraints }).status).toBe('compatible');
});
test('a separately documented museum patio is distinct, but a duplicate patio is not', () => {
  const { createStopIdentityComparator } = require('../stopExperienceIdentity');
  const evidenceBundle = { evidence: [...bundle.evidence, { evidenceId: 'patio', topic: 'activities', claim: { normalizedValue: { name: 'History Museum Patio', category: 'viewpoint' } } }] };
  const compare = createStopIdentityComparator({ evidenceBundle });
  expect(compare({ name: 'History Museum' }, { name: 'History Museum Patio' })).toBe('distinct');
  expect(compare({ name: 'History Museum Patio' }, { name: 'History Museum Patio' })).not.toBe('distinct');
});
test.each([{ type: 'hike' }, { type: 'museum', note: 'Take an outdoor walk.' }, { type: 'museum', note: 'Walk along the connector trail.' }])('facility access never licenses a route: %j', fields => {
  expect(evaluateHardAccessEligibility({ name: 'History Museum', ...fields }, { bundle, constraints }).status).not.toBe('compatible');
});
test('coverage repair rejects an invented outdoor approach before inserting it', () => {
  const { resolveCoverageRepairScope, applyDayContainedCoverageRepair } = require('../dayContainedCoverageRepair');
  const itineraryData = { days: [{ dayNumber: 1, stops: [{ name: 'Patio', type: 'viewpoint', duration: 30 }] }, { dayNumber: 2, stops: [{ name: 'Art Museum', type: 'museum', duration: 120 }] }] };
  const scope = resolveCoverageRepairScope({ itineraryData, reasonCodes: ['insufficient_day_coverage'], dayDiagnostics: [{ dayNumber: 1, codes: ['insufficient_day_coverage'] }] });
  const catalog = buildEvidenceBoundRepairCandidates({ bundle, constraints, candidatePlan: itineraryData });
  const result = applyDayContainedCoverageRepair({ itineraryData, scope, candidates: catalog.candidates,
    dayRepairs: [{ dayRef: 1, operations: [{ op: 'add_stop', stop: { placeRef: catalog.candidates[0].ref, durationMinutes: 60, note: 'Take an outdoor walk.', why: 'Explore the surroundings.' } }] }] });
  expect(result.ok).toBe(false);
  expect(result.reasonCodes).toContain('wheelchair_route_eligibility_unknown');
  expect(itineraryData.days[0].stops).toHaveLength(1);
});

test('removed stop references are invalidated selectively without touching other days', () => {
  const preserved = { dayNumber: 1, stops: [{ id: 'museum', name: 'Museum', type: 'museum' }] };
  const priorPlan = { days: [preserved, { dayNumber: 2, stops: [{ id: 'overlook', name: 'Canyon Overlook' }] }] };
  const itineraryData = { days: [preserved, { dayNumber: 2, stops: [{ id: 'patio', name: 'Patio', type: 'viewpoint' }] }],
    alternatives: [{ name: 'Library', parent: 'Museum' }, { name: 'Patio', parent: 'Canyon Overlook' }],
    narrativeSections: [{ markdown: 'Visit Canyon Overlook tomorrow.' }], warnings: ['Canyon Overlook closes early.'],
    logistics: { targetStopId: 'overlook', note: 'Transfer to Canyon Overlook.' } };
  const result = invalidateRemovedStopReferences({ priorPlan, itineraryData, text: 'Visit Canyon Overlook.' });
  expect(JSON.stringify(result)).not.toContain('Canyon Overlook');
  expect(result.itineraryData.alternatives).toEqual([{ name: 'Library', parent: 'Museum' }]);
  expect(result.itineraryData.days[0]).toBe(preserved);
  expect(result.itineraryData.days[1].stops).toEqual(itineraryData.days[1].stops);
});
test('a retained child place is not invalidated by its removed parent name', () => {
  const priorPlan = { days: [{ stops: [{ name: 'History Museum' }, { name: 'History Museum Patio' }] }] };
  const itineraryData = { days: [{ stops: [{ name: 'History Museum Patio' }] }], alternatives: [{ parent: 'History Museum Patio', name: 'Garden' }] };
  const result = invalidateRemovedStopReferences({ priorPlan, itineraryData, text: 'Visit History Museum Patio.' });
  expect(result.itineraryData.alternatives).toEqual(itineraryData.alternatives);
  expect(result.text).toBe('Visit History Museum Patio.');
});
test('contained substitution invalidates the discarded candidate label and response', () => {
  const priorPlan = { days: [{ dayNumber: 2, label: 'Museum and Big Bend', stops: [{ name: 'Museum' }, { name: 'Big Bend' }] }] };
  const itineraryData = { days: [{ dayNumber: 2, label: 'Museum and Big Bend', stops: [{ name: 'Museum' }, { name: 'Patio' }] }] };
  const result = invalidateRemovedStopReferences({ priorPlan, itineraryData, text: 'Photograph Big Bend after the museum.' });
  expect(JSON.stringify(result)).not.toContain('Big Bend');
  expect(result.itineraryData.days[0].stops).toEqual(itineraryData.days[0].stops);
});

test.each(['Olympic Sculpture Park', 'Yellowstone Art Museum', 'Grand Canyon University', 'Rocky Mountain Chocolate Factory'])('city identity does not borrow NPS identity: %s', name => {
  const itineraryData = { days: [{ label: 'Olympic National Park', stops: [{ name, parkCode: 'olym', parkName: 'Olympic National Park' }] }] };
  const result = enrichItineraryParkIdentity({ itineraryData, resolvedMetadata: { parkCode: 'olym' } }).itineraryData;
  expect(result.days[0].stops[0].parkCode).toBeNull();
  expect(result.days[0].stops[0].parkName).toBeNull();
  expect(result.days[0].parkCodes).toEqual([]);
});
test('frozen NPS place identity survives enrichment', () => {
  const plan = { days: [{ stops: [{ name: 'History Museum', type: 'museum' }] }] };
  const bound = resolveStopIdentities({ itineraryData: plan, evidenceBundle: bundle }).itineraryData;
  expect(enrichItineraryParkIdentity({ itineraryData: bound }).itineraryData.days[0].stops[0].parkCode).toBe('zion');
});
test('accepted facility activity types come from matched evidence, not generic model labels', () => {
  const evidenceBundle = { evidence: [...bundle.evidence, { evidenceId: 'center', topic: 'visitor_services', entityId: 'nps:park:zion', claim: { normalizedValue: { name: 'Visitor Center', category: 'visitor_center' } } }] };
  const itineraryData = { days: [{ stops: [{ name: 'History Museum', type: 'hike' }, { name: 'Visitor Center', type: 'accessible' }] }] };
  const result = resolveStopIdentities({ itineraryData, evidenceBundle });
  expect(result.itineraryData.days[0].stops.map(s => s.type)).toEqual(['museum', 'visitor_center']);
});
