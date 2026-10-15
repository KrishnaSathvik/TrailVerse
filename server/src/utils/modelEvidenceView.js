'use strict';

// Full source passages remain on the server-side evidence row for validation
// and diagnosis. The planning model receives the normalized claims derived
// from them, including operational facts and closure status, but not the raw
// source body that would consume the read and synthesis budgets a second time.
function modelEvidenceValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'sourceDetails')) return value;
  const { sourceDetails: _sourceDetails, ...modelValue } = value;
  return modelValue;
}

function modelEvidenceRow(row) {
  if (!row?.claim || modelEvidenceValue(row.claim.normalizedValue) === row.claim.normalizedValue) return row;
  return { ...row, claim: { ...row.claim, normalizedValue: modelEvidenceValue(row.claim.normalizedValue) } };
}

module.exports = { modelEvidenceValue, modelEvidenceRow };
