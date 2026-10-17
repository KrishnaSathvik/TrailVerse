import { URL as NodeURL } from 'node:url';

// Stage 14.8A live retest — the acceptance frontend origin was moved from
// 3100 to 3000 by explicit operator decision for this run. Changing it rewrites
// what `frontendOriginCorrect` asserts, so it is recorded here rather than
// passed in at the call site.
/**
 * Stage 14.8I — overridable, because port 3000 is not guaranteed to be ours.
 * During this stage an unrelated project of the operator's was serving on 3000,
 * and taking that port (or freeing it) would have interfered with their work.
 * The default is unchanged, so every earlier stage keeps asserting exactly what
 * it asserted before.
 */
export const STAGE14_ACCEPTANCE_FRONTEND_ORIGIN =
  process.env.STAGE14_ACCEPTANCE_FRONTEND_ORIGIN || 'http://127.0.0.1:3000';
export const STAGE14_ACCEPTANCE_BACKEND_ORIGIN = 'http://127.0.0.1:5101';
export const STAGE14_FORBIDDEN_BACKEND_ORIGIN = 'http://127.0.0.1:5001';

export const ANONYMOUS_LIFECYCLE_CONTRACT = Object.freeze({
  contract: 'A',
  guestReceivesTypedEarlyEvents: false,
  guestUsesTripPlanRevisionPersistence: false,
  guestPersistenceOwner: 'AnonymousSession',
  guestItineraryRevealPoint: 'terminal successful response',
  guestQuotaIncrementPoint: 'one completed logical assistant response',
});

/**
 * Diagnostic-only reconstruction of the failed request #56 rewrite.
 *
 * Browser acceptance does not depend on this rewrite: its frontend is built
 * with the acceptance backend origin directly. This helper exists to pin the
 * Node realm and prevent another accidental dependency on a VM/browser global.
 */
export function rewriteAcceptanceRequestUrl(
  rawUrl,
  backendOrigin = STAGE14_ACCEPTANCE_BACKEND_ORIGIN
) {
  const source = new NodeURL(rawUrl);
  const target = new NodeURL(backendOrigin);
  target.pathname = source.pathname;
  target.search = source.search;
  return target.toString();
}

export function classifyAcceptanceNetworkRequest(rawUrl) {
  const url = new NodeURL(rawUrl);
  const origin = url.origin;

  if (origin === STAGE14_ACCEPTANCE_FRONTEND_ORIGIN) {
    return { action: 'allow', classification: 'loopback_frontend' };
  }
  if (origin === STAGE14_ACCEPTANCE_BACKEND_ORIGIN) {
    return { action: 'allow', classification: 'loopback_acceptance_backend' };
  }
  if (origin === STAGE14_FORBIDDEN_BACKEND_ORIGIN) {
    return { action: 'fail', classification: 'unexpected_local_backend' };
  }
  if (url.hostname === 'maps.googleapis.com' || url.hostname === 'maps.gstatic.com') {
    return { action: 'block', classification: 'expected_blocked_google_maps' };
  }
  if (
    url.hostname === 'www.googletagmanager.com' ||
    url.hostname === 'www.google-analytics.com' ||
    url.hostname === 'va.vercel-scripts.com'
  ) {
    return { action: 'block', classification: 'expected_blocked_analytics' };
  }
  if (
    url.hostname === 'api.dicebear.com' ||
    url.hostname === 'images.unsplash.com' ||
    url.hostname.endsWith('.nps.gov')
  ) {
    return { action: 'block', classification: 'expected_blocked_image_service' };
  }
  return { action: 'fail', classification: 'unknown_external' };
}

/**
 * Stage 14.8A.2 — the repaired guest quota contract.
 *
 * Stage 14.8A.1 left `guestContractResolved` false for one reason: the
 * anonymous routes appended the user message to `AnonymousSession` at route
 * admission, so a provider or backend failure after admission could leave a
 * counted user message with no assistant response. Quota is now coupled to
 * COMPLETION, and these are the properties that must hold for it to stay so.
 */
export const GUEST_QUOTA_CONTRACT = Object.freeze({
  quotaIncrementPoint: 'completed_logical_turn',
  pendingTurnConsumesQuota: false,
  failedTurnConsumesQuota: false,
  duplicateCompletionIncrementsQuota: false,
  userMessagePersistedAtAdmission: false,
  stalePendingRecoveryBounded: true,
  localStorageIsQuotaSource: false,
});

/**
 * Derives `guestContractResolved` from observed behavior instead of asserting
 * it. Any property that drifts back toward admission-time quota consumption
 * names itself in `unmet` and keeps the pre-send gate closed.
 */
export function resolveGuestContract(evidence = {}) {
  const unmet = Object.entries(GUEST_QUOTA_CONTRACT)
    .filter(([key, required]) => evidence[key] !== required)
    .map(([key]) => key);

  return { resolved: unmet.length === 0, unmet };
}

export function buildPreSendAcceptanceGate(input) {
  const result = {
    frontendOriginCorrect: input.frontendOrigin === STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
    acceptanceBackendOriginCorrect:
      input.acceptanceBackendOrigin === STAGE14_ACCEPTANCE_BACKEND_ORIGIN,
    port5001TrafficAbsent: input.requestsToPort5001 === 0,
    atlasAbsent: input.requestsToAtlas === 0,
    isolatedMongoConfirmed: input.isolatedMongoConfirmed === true,
    networkPolicyInstalled: input.networkPolicyInstalled === true,
    guestContractResolved: input.guestContractResolved === true,
    guestCounterIsZero: input.guestCounter === 0,
    providerLedgerIsZero: input.providerRequests === 0,
    paidRetestAuthorized: input.paidRetestAuthorized === true,
  };

  return { ...result, passed: Object.values(result).every(Boolean) };
}
