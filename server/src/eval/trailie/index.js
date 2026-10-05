'use strict';

/**
 * WP12 Phase 4 — legacy Stage 13 Trailie pipeline eval RETIRED.
 *
 * Product chat now runs exclusively through WP11A (`executeTrailieV2Turn` /
 * `runTrailieV2FromPreparedContext`). The deleted generation stack this
 * harness exercised:
 *   runTrailieItineraryTurn → toolFirstItineraryOrchestrator → aiProviderStream
 * no longer exists.
 *
 * Pricing, scenarios, usageAccounting, and related helpers under this folder
 * remain for Stage 14.7 / historical tooling. Do not resurrect the old
 * orchestration seam here.
 */

const RETIRED_REASON =
  'WP12 Phase 4: legacy Trailie pipeline eval (runTrailieItineraryTurn / aiProviderStream) was deleted. Use WP11A route proofs instead.';

const ROUTE_VARIANTS = Object.freeze([
  'authenticated_streaming',
  'authenticated_non_streaming',
  'anonymous_streaming',
  'anonymous_non_streaming',
]);

function retired() {
  throw new Error(RETIRED_REASON);
}

async function runTrailiePipelineEvaluation() {
  return retired();
}

async function runOneVariant() {
  return retired();
}

module.exports = {
  RETIRED: true,
  RETIRED_REASON,
  ROUTE_VARIANTS,
  runTrailiePipelineEvaluation,
  runOneVariant,
};
