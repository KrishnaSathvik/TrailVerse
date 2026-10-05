'use strict';

const { createDefaultEvidenceProviders, waitForSharedEvidence } = require('../evidenceBrokerRuntime');

const NOW = new Date('2026-08-09T12:00:00.000Z');
const requirement = {
  requirementId: 'req:runtime:overview',
  entity: { entityId: 'nps:park:yose' },
  topic: 'overview', evidenceTypes: ['description'],
  temporalScope: { mode: 'current', requestedAt: NOW.toISOString() },
  maxAgeSeconds: 86400, maxStaleSeconds: 0, criticality: 'hard',
  absenceSemantics: 'unknown', minimumAuthorityClass: 'official_owner',
  acceptedSourceClasses: ['official_owner'],
};
const evidence = {
  evidenceId: 'ev:overview', entityId: 'nps:park:yose', topic: 'overview', evidenceType: 'description',
  scope: { geographicEntityIds: ['nps:park:yose'] },
  source: { provider: 'nps', sourceClass: 'official_owner' },
  quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
  observation: { observedAt: NOW.toISOString(), fetchedAt: NOW.toISOString() },
};

describe('WP5A distributed refresh polling', () => {
  test('a contended worker observes the shared fenced write without dispatching', async () => {
    const queryEvidence = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([evidence]);
    await expect(waitForSharedEvidence({
      requirements: [requirement], queryEvidence, now: () => NOW, pollMs: 1, timeoutMs: 100,
    })).resolves.toEqual({ outcome: 'coalesced_store_update' });
    expect(queryEvidence).toHaveBeenCalledTimes(2);
  });

  test('bounded polling reports refresh_wait_timeout when no shared write appears', async () => {
    await expect(waitForSharedEvidence({
      requirements: [requirement], queryEvidence: async () => [], now: () => NOW,
      pollMs: 1, timeoutMs: 2,
    })).rejects.toMatchObject({ code: 'refresh_wait_timeout' });
  });
});

describe('WP6 runtime provider registration', () => {
  test('adds web adapters after every frozen structured adapter', () => {
    const providers = createDefaultEvidenceProviders();
    expect(providers.map((provider) => provider.id)).toEqual([
      'nps', 'ridb', 'weather', 'google_maps', 'astronomy_compute', 'fee_free_calendar', 'known_place',
      'brave', 'serper', 'tavily', 'direct_official_page', 'geocode_coordinate',
    ]);
  });
});
