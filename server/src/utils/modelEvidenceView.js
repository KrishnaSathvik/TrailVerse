'use strict';
const { supportedDurationMaximum } = require('./evidenceActivityDuration');

// Full source passages remain on the server-side evidence row for validation
// and diagnosis. The planning model receives the normalized claims derived
// from them, including operational facts and closure status, but not the raw
// source body that would consume the read and synthesis budgets a second time.
function modelEvidenceValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const maximum = supportedDurationMaximum(value);
  if (!Object.hasOwn(value, 'sourceDetails') && maximum == null) return value;
  const { sourceDetails: _sourceDetails, ...modelValue } = value;
  // Use the guard's exact unit conversion; do not make synthesis reinterpret it.
  return maximum == null ? modelValue : { ...modelValue, supportedDurationMaximumMinutes: maximum };
}

function modelEvidenceRow(row) {
  if (!row?.claim || modelEvidenceValue(row.claim.normalizedValue) === row.claim.normalizedValue) return row;
  return { ...row, claim: { ...row.claim, normalizedValue: modelEvidenceValue(row.claim.normalizedValue) } };
}

module.exports = { modelEvidenceValue, modelEvidenceRow };
