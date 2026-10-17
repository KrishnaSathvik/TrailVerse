'use strict';
// Validator taxonomy does not allocate model calls. Legacy purpose names are
// transport/telemetry aliases for operators, never separate scheduling slots.
const OPERATORS = Object.freeze({ IDENTITY: 'IDENTITY_SUBSTITUTION', VIABILITY: 'PLAN_VIABILITY_EDIT', DURATION: 'DURATION_EDIT' });
const PURPOSE_OPERATORS = Object.freeze({
  legal_stop_substitution_repair: OPERATORS.IDENTITY,
  plan_viability_repair: OPERATORS.VIABILITY,
  insufficient_day_coverage_repair: OPERATORS.VIABILITY,
  trip_quality_repair: OPERATORS.VIABILITY,
  missing_experience_anchor_repair: OPERATORS.VIABILITY,
  zero_duration_micro_repair: OPERATORS.DURATION,
});
const STRUCTURAL_REASONS = Object.freeze(new Set([
  'insufficient_day_coverage', 'missing_experience_anchor', 'experience_scope_unbound',
  'experience_not_actionable', 'conditional_primary_unsupported', 'excessive_trip_repetition',
  // Cross-day duplicate against a frozen day is a structural Day-N blocker —
  // repair must pick another experience for the touched day, not rewrite frozen days.
  'duplicate_base_experience', 'relative_burden_not_reduced',
]));
module.exports = { OPERATORS, PURPOSE_OPERATORS, STRUCTURAL_REASONS,
  operatorForPurpose: purpose => PURPOSE_OPERATORS[purpose] || null };
