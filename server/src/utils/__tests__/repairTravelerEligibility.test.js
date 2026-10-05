'use strict';
const { buildEvidenceBoundRepairCandidates } = require('../evidenceBoundRepairCandidates');
const { evaluateHardAccessEligibility } = require('../hardConstraintEligibility');
const row = (name, value = {}) => ({ evidenceId: name, topic: 'activities', claim: { normalizedValue: { name, activityTypes: ['hiking'], category: 'trail', ...value } } });
const bundle = { evidence: [
  row('Accessible path', { category: 'paved_path', activityTypes: ['walk'], wheelchairAccessible: true, accessibility: 'Wheelchair accessible', difficulty: 'easy', exposureLevel: 'low', walkingDistanceMiles: 0.5 }),
  row('Creek crossing', { accessibility: 'Not wheelchair accessible', difficulty: 'moderate', exposureLevel: 'moderate', walkingDistanceMiles: 3 }),
  row('Unknown trail'),
] };
const constraints = { planningState: { mobility: { wheelchair: true } } };

test('repair inherits durable wheelchair constraints and excludes unknown access', () => {
  const result = buildEvidenceBoundRepairCandidates({ bundle, constraints });
  expect(result.candidates.map(c => c.canonicalName)).toEqual(['Accessible path']);
  expect(result.audit.excludedHardConstraint).toBe(2);
});
test('model-authored wheelchair claims cannot certify unknown evidence', () => {
  expect(evaluateHardAccessEligibility({ name: 'Unknown trail', wheelchairAccessible: true, note: 'Wheelchair accessible' }, { constraints, bundle }).reasonCodes).toEqual(['wheelchair_route_eligibility_unknown', 'wheelchair_eligibility_unknown']);
});
test('negative evidence vetoes a positive same-name record', () => {
  const conflict = { evidence: [...bundle.evidence, row('Accessible path', { wheelchairAccessible: false })] };
  expect(evaluateHardAccessEligibility({ name: 'Accessible path' }, { constraints, bundle: conflict }).status).toBe('incompatible');
});
test('accumulated exposure, distance and difficulty constraints restrict repair candidates', () => {
  const result = buildEvidenceBoundRepairCandidates({ bundle, constraints: { avoidExposure: true, fitnessLevel: 'beginner', planningState: { mobility: { maxWalkMilesPerSegment: 1 } } } });
  expect(result.candidates.map(c => c.canonicalName)).toEqual(['Accessible path']);
});
test('absence of hard constraints preserves the candidate pool', () => {
  expect(buildEvidenceBoundRepairCandidates({ bundle }).count).toBe(3);
});

test('hard exposure validation does not trust model-authored low exposure', () => {
  const { enrichItineraryExposureFromEvidenceBundle } = require('../hardConstraintEligibility');
  const result = enrichItineraryExposureFromEvidenceBundle({ days: [{ stops: [{ name: 'Unknown trail', exposureLevel: 'low' }] }] }, bundle, { authoritativeOnly: true });
  expect(result.days[0].stops[0].exposureLevel).toBeUndefined();
});

test('photographic exposure is distinct from dangerous terrain', () => {
  const { evaluateProseConstraintSafety } = require('../proseConstraintSafety');
  expect(evaluateProseConstraintSafety({ text: 'Use long exposures and exposure bracketing for sunrise photography.', constraints: { avoidExposure: true } }).ok).toBe(true);
  expect(evaluateProseConstraintSafety({ text: 'Take long exposures from the exposed ledge.', constraints: { avoidExposure: true } }).ok).toBe(false);
});

test('no-hiking and difficulty constraints use evidence at the final stop gate', () => {
  expect(evaluateHardAccessEligibility({ name: 'Creek crossing', type: 'hike' }, { constraints: { planningState: { activityPreferences: { hiking: 'none' } } }, bundle }).reasonCodes).toContain('hiking_constraint_violation');
  expect(evaluateHardAccessEligibility({ name: 'Creek crossing', type: 'hike', difficulty: 'easy' }, { constraints: { fitnessLevel: 'beginner' }, bundle }).reasonCodes).toContain('difficulty_constraint_violation');
});
