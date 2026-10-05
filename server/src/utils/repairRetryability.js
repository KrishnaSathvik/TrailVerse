'use strict';

// Retryability describes missing inputs separately from model mistakes. The
// caller supplies the same eligible catalogue that was offered to generation.
const EVIDENCE_BLOCKERS = new Set([
  'no_eligible_repair_candidate', 'repair_evidence_catalog_unavailable', 'required_evidence_missing',
  'provider_data_unavailable', 'google_authorization_unavailable',
  'google_maps_authorization_unavailable', 'stop_identity_ambiguous',
]);
const CANDIDATE_FAILURE = /^(?:stop_identity_|constraint_eligibility_unknown|exposure_constraint_violation|wheelchair_|stairs_|pets_|mobility_eligibility_unknown|difficulty_eligibility_unknown|repair_candidate_|unauthorized_refinement_candidate)/;
const GROUNDED_EXPERIENCE_FAILURE = /^(?:stop_identity_unresolved|stop_identity_destination_only|missing_experience_anchor)$/;

function classifyRepairRetryability(validation, { candidateCount = null } = {}) {
  if (validation?.status === 'pass') return null;
  if (['deterministic_blocker', 'provider_blocker'].includes(validation?.retryability)
    || validation?.retryability === 'evidence_blocker' && !validation.repairUniverse) return validation.retryability;
  const codes = validation?.reasonCodes || [];
  if (codes.some(code => /^(?:provider_|google_.*unavailable)/.test(code))) return 'provider_blocker';
  if (codes.some(code => /(?:no_canonical_plan|invalid_target|state_invariant|ambiguous_action)/.test(code))) return 'deterministic_blocker';
  if (codes.some(code => EVIDENCE_BLOCKERS.has(code))) return 'evidence_blocker';
  if (codes.includes('validation_error')) return 'deterministic_blocker';
  const universe = validation?.repairUniverse;
  if (universe) {
    if (!(universe.remainingBudget > 0) || !universe.operatorAvailable || !universe.scopeLegal) return 'deterministic_blocker';
    return universe.viable ? 'model_fixable' : 'evidence_blocker';
  }
  // Identity / anchor failures share one blocker when the eligible catalogue
  // did not offer a grounded replacement — escalation cannot invent evidence.
  if (codes.some(code => GROUNDED_EXPERIENCE_FAILURE.test(code))) {
    if (candidateCount === 0 || candidateCount == null) return 'evidence_blocker';
  }
  if (codes.some(code => CANDIDATE_FAILURE.test(code))) {
    if (candidateCount === 0) return 'evidence_blocker';
    // Unresolved identity is only fixable when an alternative was actually
    // supplied. Malformed supplied references remain model-fixable.
    if (candidateCount == null && codes.includes('stop_identity_unresolved')) return 'evidence_blocker';
  }
  // Cross-day duplicate is fixable when another legal Day-N replacement exists.
  if (codes.includes('duplicate_base_experience')) {
    if (candidateCount === 0) return 'evidence_blocker';
    return 'model_fixable';
  }
  // Unknown diagnostics are not permission to spend. Formatting/prose stages
  // may explicitly authorize local correction without inventing source facts.
  return validation?.locallyRepairable === true ? 'model_fixable' : 'deterministic_blocker';
}
function blockerSignature(validation, context = {}) {
  const normalize = require('./canonicalExperience').canonicalExperienceKey;
  // Day/order/wording changes are not progress on an unresolved identity.
  const identities = (validation.offendingStops || [validation.targetDiagnostics || {}])
    .map(stop => normalize(stop.subjectName || stop.stopName || stop.requestedStopName)).filter(Boolean).sort();
  return require('crypto').createHash('sha256').update(JSON.stringify({
    stage: validation.stage, reasons: [...(validation.reasonCodes || [])].sort(), identities,
    evidence: validation.candidateFingerprint || context.evidenceFingerprint || null,
    constraints: context.constraints || null,
  })).digest('hex');
}
module.exports = { classifyRepairRetryability, blockerSignature };
