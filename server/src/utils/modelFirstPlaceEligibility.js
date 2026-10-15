'use strict';

const { evaluateCandidateConstraints } = require('./candidateViability');
const { exposureRelevanceFromRecord } = require('./hardConstraintEligibility');

// Research and acceptance use identical record binding and hard eligibility.
// Callers supply usable, authoritative evidence; annotations never grant authority.
function assessPlaceEligibility(row, evidence, constraints, activity = null) {
  const value = row.claim?.normalizedValue || {};
  const records = evidence.filter(r => r.evidenceId === row.evidenceId
    || r.entityId && r.entityId === row.entityId && r.claim?.normalizedValue?.name === value.name
    || r.claim?.subjectId === row.claim?.identity && row.claim?.identity);
  const { hasRecommendedHazard } = require('./hazardRejectionSemantics');
  const outdoorActivity = /^(trail|hike|walk)$/.test(activity?.type || '')
    || [activity?.note, activity?.why, activity?.description].some(text => hasRecommendedHazard(text, /\b(?:trail|hike|hiking|outdoor walk|walk outside|walk along|stroll|climb|overlook)\b/i));
  const exposureRelevance = !outdoorActivity && records.length > 0 && records.every(r => exposureRelevanceFromRecord(r.claim?.normalizedValue) === 'exempt')
    ? 'exempt' : 'judged';
  const result = evaluateCandidateConstraints({ records, name: value.name, type: 'custom',
    exposureRelevance, constraints, bundle: { evidence } });
  const minutes = constraints?.planningState?.mobility?.maxWalkMinutesPerSegment;
  if (minutes > 0 && !(Number.isFinite(value.walkingDurationMinutes) && value.walkingDurationMinutes <= minutes)) {
    result.reasonCodes.push('walking_minutes_not_grounded');
  }
  if (!records.length) result.reasonCodes.push('constraint_eligibility_unknown');
  result.ok = result.reasonCodes.length === 0;
  result.status = result.ok ? 'eligible'
    : result.reasonCodes.some(code => !code.includes('unknown') && code !== 'walking_minutes_not_grounded') ? 'incompatible' : 'unknown';
  return { ...result, records };
}
module.exports = { assessPlaceEligibility };
