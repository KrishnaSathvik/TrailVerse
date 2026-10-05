'use strict';
const { renderStructuredGuidance } = require('../structuredTravelerGuidance');
const { classifyRepairRetryability } = require('../repairRetryability');
const { buildEvidenceBoundRepairCandidates } = require('../evidenceBoundRepairCandidates');
const { assessCandidateActionability } = require('../experienceActionability');
const ev = (name, extra = {}) => ({ evidenceId: name, topic: 'activities', claim: { normalizedValue: {
  name, type: 'trail', category: 'trail', activityTypes: ['hiking'], duration: '30 Minutes', exposureLevel: 'low', difficulty: 'easy', ...extra,
} } });

test('candidate constraints agree across catalogue and actionability', () => {
  const records = [ev('Short Trail', { walkingDistanceMiles: 3 })];
  const bundle = { evidence: records };
  const constraints = { mobility: { maxWalkMilesPerSegment: 1 } };
  expect(buildEvidenceBoundRepairCandidates({ bundle, constraints, includeExisting: true }).count).toBe(0);
  expect(assessCandidateActionability({ records, name: 'Short Trail', constraints }).satisfyingReplacement).toBe(false);
});
test('structured rejection does not become a recommendation, even when a source name contains hazard words', () => {
  const bundle = { evidence: [ev('Exposed Ridge', { exposureLevel: 'high' })] };
  const constraints = { avoidExposure: true };
  const segment = { stance: 'avoid', evidenceRef: 'Exposed Ridge', constraintRef: null, text: 'Choose a different outing.' };
  expect(renderStructuredGuidance({ segments: [segment] }, { bundle, constraints })).toMatchObject({ ok: true, text: 'Avoid Exposed Ridge. Choose a different outing.' });
  expect(renderStructuredGuidance({ segments: [{ ...segment, stance: 'recommend' }] }, { bundle, constraints }).ok).toBe(false);
  expect(renderStructuredGuidance({ segments: [{ ...segment, evidenceRef: 'invented' }] }, { bundle, constraints }).ok).toBe(false);
});
test('free explanation cannot contradict structured stance', () => {
  const result = renderStructuredGuidance({ segments: [{ stance: 'avoid', evidenceRef: null, constraintRef: 'avoidExposure',
    text: 'You should hike the exposed cliff route.' }] }, { bundle: { evidence: [] }, constraints: { avoidExposure: true } });
  expect(result.ok).toBe(false);
});
test('repair authority requires actual scope, legal operator, viable universe and budget', () => {
  const base = { remainingBudget: 1, operatorAvailable: true, scopeLegal: true, viable: true };
  expect(classifyRepairRetryability({ status: 'fail', reasonCodes: ['unknown_code'] })).toBe('deterministic_blocker');
  for (const patch of [{ remainingBudget: 0 }, { operatorAvailable: false }, { scopeLegal: false }]) {
    expect(classifyRepairRetryability({ status: 'fail', repairUniverse: { ...base, ...patch } })).toBe('deterministic_blocker');
  }
  expect(classifyRepairRetryability({ status: 'fail', repairUniverse: { ...base, viable: false } })).toBe('evidence_blocker');
  expect(classifyRepairRetryability({ status: 'fail', repairUniverse: base })).toBe('model_fixable');
});
test('saved relaxed Day3 no longer passes on 40 minutes of primary value', () => {
  const fs = require('fs'); const path = require('path');
  const dir = path.resolve(__dirname, '../../../../artifacts/trailie-zion-day3-relaxed-live-2026-09-28');
  const read = file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const input = read('turn-1-execution-input.json'); const execution = read('turn-1-execution.json');
  const bundle = read('turn-1-evidence.json');
  const result = require('../itineraryCompleteness').evaluateItineraryCompleteness({ itineraryData: execution.canonicalPlan,
    evidenceBundle: bundle, constraints: input.constraints, userPrompt: input.userMessage,
    isRefinement: true, priorItineraryData: input.tripState.existingCanonicalPlan, touchedDayNumbers: [3] });
  expect(result.ok).toBe(false);
  expect(result.dayValueDiagnostics.find(day => day.dayNumber === 3).dayValue.absoluteValueOk).toBe(false);
});
