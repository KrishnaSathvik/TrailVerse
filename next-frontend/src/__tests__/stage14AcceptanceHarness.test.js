import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_LIFECYCLE_CONTRACT,
  GUEST_QUOTA_CONTRACT,
  STAGE14_ACCEPTANCE_BACKEND_ORIGIN,
  STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
  buildPreSendAcceptanceGate,
  classifyAcceptanceNetworkRequest,
  resolveGuestContract,
  rewriteAcceptanceRequestUrl,
} from '@/test-utils/stage14AcceptanceHarness';

describe('Stage 14.8A.1 acceptance harness', () => {
  it('reproduces request #56 in the Playwright Node realm and targets port 5101', () => {
    expect(
      rewriteAcceptanceRequestUrl(
        'http://127.0.0.1:5001/api/ai/chat-anonymous-stream'
      )
    ).toBe('http://127.0.0.1:5101/api/ai/chat-anonymous-stream');
  });

  it('allows only the two loopback HTTP origins and blocks Maps explicitly', () => {
    expect(
      classifyAcceptanceNetworkRequest('http://127.0.0.1:3000/plan-ai')
    ).toEqual({ action: 'allow', classification: 'loopback_frontend' });
    expect(
      classifyAcceptanceNetworkRequest('http://127.0.0.1:5101/api/ai/providers-anonymous')
    ).toEqual({ action: 'allow', classification: 'loopback_acceptance_backend' });
    expect(
      classifyAcceptanceNetworkRequest('http://127.0.0.1:5001/api/ai/chat-anonymous-stream')
    ).toEqual({ action: 'fail', classification: 'unexpected_local_backend' });
    expect(
      classifyAcceptanceNetworkRequest('https://maps.googleapis.com/maps/api/mapsjs/gen_204')
    ).toEqual({ action: 'block', classification: 'expected_blocked_google_maps' });
    expect(
      classifyAcceptanceNetworkRequest('https://www.googletagmanager.com/gtag/js?id=test')
    ).toEqual({ action: 'block', classification: 'expected_blocked_analytics' });
    expect(
      classifyAcceptanceNetworkRequest('https://va.vercel-scripts.com/v1/script.debug.js')
    ).toEqual({ action: 'block', classification: 'expected_blocked_analytics' });
    expect(
      classifyAcceptanceNetworkRequest('https://api.dicebear.com/9.x/adventurer/svg')
    ).toEqual({ action: 'block', classification: 'expected_blocked_image_service' });
    expect(
      classifyAcceptanceNetworkRequest('https://example.com/unreviewed')
    ).toEqual({ action: 'fail', classification: 'unknown_external' });
  });

  it('pins guest terminal-only Contract A', () => {
    expect(ANONYMOUS_LIFECYCLE_CONTRACT).toEqual({
      contract: 'A',
      guestReceivesTypedEarlyEvents: false,
      guestUsesTripPlanRevisionPersistence: false,
      guestPersistenceOwner: 'AnonymousSession',
      guestItineraryRevealPoint: 'terminal successful response',
      guestQuotaIncrementPoint: 'one completed logical assistant response',
    });
  });

  it('refuses pre-send when any gate is false and passes only the complete gate', () => {
    const complete = {
      frontendOrigin: STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
      acceptanceBackendOrigin: STAGE14_ACCEPTANCE_BACKEND_ORIGIN,
      requestsToPort5001: 0,
      requestsToAtlas: 0,
      isolatedMongoConfirmed: true,
      networkPolicyInstalled: true,
      guestContractResolved: true,
      guestCounter: 0,
      providerRequests: 0,
      paidRetestAuthorized: true,
    };

    expect(buildPreSendAcceptanceGate(complete).passed).toBe(true);
    expect(
      buildPreSendAcceptanceGate({ ...complete, requestsToPort5001: 1 }).passed
    ).toBe(false);
    expect(
      buildPreSendAcceptanceGate({ ...complete, paidRetestAuthorized: false }).passed
    ).toBe(false);
  });
});

describe('Stage 14.8A.2 — completion-coupled guest quota resolves the contract', () => {
  const REPAIRED = {
    quotaIncrementPoint: 'completed_logical_turn',
    pendingTurnConsumesQuota: false,
    failedTurnConsumesQuota: false,
    duplicateCompletionIncrementsQuota: false,
    userMessagePersistedAtAdmission: false,
    stalePendingRecoveryBounded: true,
    localStorageIsQuotaSource: false,
  };

  it('pins the repaired guest quota contract', () => {
    expect(GUEST_QUOTA_CONTRACT).toEqual(REPAIRED);
  });

  it('resolves the contract only when every completion-coupled property holds', () => {
    expect(resolveGuestContract(REPAIRED)).toEqual({ resolved: true, unmet: [] });
  });

  it('refuses to resolve while quota is still coupled to route admission', () => {
    // The Stage 14.8A.1 blocker: the user message was saved at admission.
    const defect = {
      ...REPAIRED,
      quotaIncrementPoint: 'route_admission',
      userMessagePersistedAtAdmission: true,
    };
    expect(resolveGuestContract(defect)).toEqual({
      resolved: false,
      unmet: ['quotaIncrementPoint', 'userMessagePersistedAtAdmission'],
    });
  });

  it.each([
    'pendingTurnConsumesQuota',
    'failedTurnConsumesQuota',
    'duplicateCompletionIncrementsQuota',
    'localStorageIsQuotaSource',
  ])('refuses to resolve when %s is true', (key) => {
    const broken = resolveGuestContract({ ...REPAIRED, [key]: true });
    expect(broken.resolved).toBe(false);
    expect(broken.unmet).toEqual([key]);
  });

  it('refuses to resolve without bounded stale-pending recovery', () => {
    expect(resolveGuestContract({ ...REPAIRED, stalePendingRecoveryBounded: false })).toEqual({
      resolved: false,
      unmet: ['stalePendingRecoveryBounded'],
    });
  });

  it('feeds the pre-send gate: an unresolved contract blocks the send', () => {
    const base = {
      frontendOrigin: STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
      acceptanceBackendOrigin: STAGE14_ACCEPTANCE_BACKEND_ORIGIN,
      requestsToPort5001: 0,
      requestsToAtlas: 0,
      isolatedMongoConfirmed: true,
      networkPolicyInstalled: true,
      guestCounter: 0,
      providerRequests: 0,
      paidRetestAuthorized: true,
    };

    const resolved = buildPreSendAcceptanceGate({
      ...base,
      guestContractResolved: resolveGuestContract(REPAIRED).resolved,
    });
    expect(resolved.guestContractResolved).toBe(true);
    expect(resolved.passed).toBe(true);

    const unresolved = buildPreSendAcceptanceGate({
      ...base,
      guestContractResolved: resolveGuestContract({ ...REPAIRED, quotaIncrementPoint: 'route_admission' }).resolved,
    });
    expect(unresolved.guestContractResolved).toBe(false);
    expect(unresolved.passed).toBe(false);
  });
});
