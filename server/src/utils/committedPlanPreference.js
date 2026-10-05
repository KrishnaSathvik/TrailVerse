'use strict';

/** Explicit priorities/party additions apply to an existing plan; questions do not. */
function committedPlanPreference(text) {
  const value = String(text || '').trim();
  if (/\?|\b(?:if|might|maybe|considering)\b/i.test(value)
    || /^(?:would|could|should|can|is|are|what|how)\b/i.test(value)) return null;
  if (/\b(?:sunrise|sunset|photography|wildlife)\b.{0,45}\b(?:is|are)\s+(?:(?:really|very|especially)\s+)?important\b/i.test(value)) {
    return { kind: 'priority', target: 'whole_plan' };
  }
  if (/\b(?:parents|family|children|kids|grandparents)\b.{0,24}\b(?:are|will be)\s+joining\b/i.test(value)) {
    return { kind: 'party_addition', target: 'whole_plan' };
  }
  return null;
}

module.exports = { committedPlanPreference };
