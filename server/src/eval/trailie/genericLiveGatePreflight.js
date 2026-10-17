'use strict';

const { isTrailieV2RuntimeEnabled } = require('../../config/trailieV2Runtime');

const PREFLIGHT_VERSION = 'generic-live-gate-preflight.v1';
const EXPECTED_ROUTE_ID = 'trailie-v2-wp11a-only';

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Pure, zero-provider-call readiness contract for the paid generic gate. */
function buildGenericLiveGatePreflight({ env = process.env, authenticated = false } = {}) {
  const checks = {
    backendResponding: true,
    authValid: authenticated === true,
    runtimeEnabled: isTrailieV2RuntimeEnabled(env),
    evidenceRefreshSecretPresent: present(env.TRAILIE_EVIDENCE_REFRESH_HASH_SECRET),
    modelProviderConfigured: present(env.OPENAI_API_KEY),
    npsEvidenceConfigured: present(env.NPS_API_KEY),
    mapsEvidenceConfigured: present(env.GMAPS_SERVER_KEY),
    correctV2Route: true,
    nonProductionRuntime: String(env.NODE_ENV || '').toLowerCase() !== 'production',
    planStageCaptureEnabled:
      String(env.TRAILIE_EVAL_CAPTURE_PLAN_STAGES || '').toLowerCase() === 'true',
  };
  const blockers = Object.entries(checks)
    .filter(([, ok]) => ok !== true)
    .map(([name]) => name);
  return {
    preflightVersion: PREFLIGHT_VERSION,
    routeId: EXPECTED_ROUTE_ID,
    ready: blockers.length === 0,
    checks,
    blockers,
  };
}

module.exports = {
  PREFLIGHT_VERSION,
  EXPECTED_ROUTE_ID,
  buildGenericLiveGatePreflight,
};
