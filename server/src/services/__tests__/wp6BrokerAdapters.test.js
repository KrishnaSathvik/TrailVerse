'use strict';

const { buildEvidenceKeys } = require('../../utils/evidenceKey');
const { createEvidenceBroker } = require('../evidenceBrokerService');
const { createBraveEvidenceProvider } = require('../providers/braveEvidenceProvider');

const NOW = new Date('2026-08-09T12:00:00.000Z');
function requirement(ordinal = 0) {
  return {
    requirementId: `req:wp6:roads:${ordinal}`,
    entity: { entityId: 'nps:park:yose', displayName: 'Yosemite National Park' },
    topic: 'roads', evidenceTypes: ['live_state'],
    temporalScope: { mode: 'current', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' },
    freshnessClass: 'live', maxAgeSeconds: 900, maxStaleSeconds: 0, criticality: 'hard',
    absenceSemantics: 'unknown', minimumAuthorityClass: 'reputable_web', acceptedSourceClasses: ['reputable_web'],
    preferredProviders: ['brave'], allowedFallbackProviders: [], privacyScope: 'public',
  };
}

function harness({ provider, reserveRefreshBudget, events = [] }) {
  const docs = []; const refreshEvents = [];
  const broker = createEvidenceBroker({
    providers: [provider], queryEvidence: async (req) => docs.filter((item) => item.entityId === req.entity.entityId && item.topic === req.topic),
    persistCandidate: async ({ candidate }) => {
      events.push('canonical_persist'); const keys = buildEvidenceKeys(candidate);
      const evidence = { ...candidate, ...keys, provenance: { ...candidate.provenance, contentHash: keys.contentHash } };
      docs.push(evidence); return { outcome: 'created', evidence };
    },
    acquireLease: async ({ leaseKey, ownerId }) => ({ outcome: 'acquired', lease: { leaseKey, ownerId, fencingToken: 1 } }),
    releaseLease: async () => ({ released: true }), waitForRefresh: async () => ({ outcome: 'coalesced_store_update' }),
    recordRefreshEvent: async (event) => { refreshEvents.push(event); },
    refreshHashSecret: 'wp6-refresh-secret', now: () => NOW,
    ...(reserveRefreshBudget ? { reserveRefreshBudget } : {}),
  });
  return { broker, docs, refreshEvents };
}

const RESULT = {
  title: 'Current Conditions', description: 'Tioga Road conditions update',
  url: 'https://www.nps.gov/yose/planyourvisit/conditions.htm',
};

describe('WP6 web adapters through the frozen broker', () => {
  test('paid budget refusal happens before search, raw staging, lease, or canonical persistence', async () => {
    const braveClient = { search: jest.fn() }; const stageRaw = jest.fn();
    const provider = createBraveEvidenceProvider({ braveClient, stageRaw, now: () => NOW });
    const reserveRefreshBudget = jest.fn().mockResolvedValue({ allowed: false });
    const h = harness({ provider, reserveRefreshBudget });
    const bundle = await h.broker.resolveEvidence({ requirements: [requirement()], requestId: 'wp6-budget' });
    expect(bundle.resolutions[0]).toMatchObject({ status: 'missing', refresh: { outcome: 'failed', reasonCode: 'provider_budget_exhausted' } });
    expect(braveClient.search).not.toHaveBeenCalled();
    expect(stageRaw).not.toHaveBeenCalled();
    expect(h.docs).toHaveLength(0);
  });

  test('licensed raw staging completes before canonical evidence persistence', async () => {
    const events = [];
    const provider = createBraveEvidenceProvider({
      braveClient: { search: jest.fn().mockResolvedValue({ results: [RESULT] }) },
      stageRaw: jest.fn().mockImplementation(async () => { events.push('raw_stage'); return { rawPayloadHash: 'a'.repeat(64) }; }),
      now: () => NOW,
    });
    const h = harness({ provider, events });
    const bundle = await h.broker.resolveEvidence({ requirements: [requirement()], requestId: 'wp6-order' });
    expect(bundle.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', cacheStatus: 'refreshed' });
    expect(events).toEqual(['raw_stage', 'canonical_persist']);
    expect(h.docs[0]).toMatchObject({ retention: { licenseClass: 'search_metadata_only', storeClaimText: false } });
  });

  test('ten concurrent identical searches produce one physical dispatch and nine coalesced waiters', async () => {
    let release;
    const braveClient = { search: jest.fn().mockImplementation(() => new Promise((resolve) => { release = resolve; })) };
    const provider = createBraveEvidenceProvider({ braveClient, stageRaw: jest.fn().mockResolvedValue({ rawPayloadHash: 'b'.repeat(64) }), now: () => NOW });
    const h = harness({ provider });
    const pending = Array.from({ length: 10 }, (_, index) => h.broker.resolveEvidence({
      requirements: [requirement(index)], requestId: `wp6-coalesce-${index}`,
    }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(braveClient.search).toHaveBeenCalledTimes(1);
    release({ results: [RESULT] });
    const bundles = await Promise.all(pending);
    expect(bundles.every((bundle) => bundle.resolutions[0].status === 'satisfied_fresh')).toBe(true);
    expect(bundles.filter((bundle) => bundle.resolutions[0].cacheStatus === 'coalesced')).toHaveLength(9);
    expect(h.refreshEvents[0]).toMatchObject({ provider: 'brave', operation: 'search', requirementCount: 10, coalescedWaiters: 9 });
  });

  test('empty search remains missing and carries absence_not_proven', async () => {
    const provider = createBraveEvidenceProvider({
      braveClient: { search: jest.fn().mockResolvedValue({ results: [] }) }, stageRaw: jest.fn(), now: () => NOW,
    });
    const h = harness({ provider });
    const bundle = await h.broker.resolveEvidence({ requirements: [requirement()], requestId: 'wp6-empty' });
    expect(bundle.resolutions[0]).toMatchObject({ status: 'missing' });
    expect(bundle.resolutions[0].reasonCodes).toContain('absence_not_proven');
    expect(h.docs).toHaveLength(0);
  });
});
