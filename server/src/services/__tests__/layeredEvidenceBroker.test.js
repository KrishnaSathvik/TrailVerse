'use strict';

const { createLayeredEvidenceResolver, officialSourceUrl } = require('../layeredEvidenceBroker');

const NOW = new Date('2026-08-09T12:00:00.000Z');
function requirement(authority = 'official_owner') {
  return {
    requirementId: 'req:layered:roads', entity: { entityId: 'nps:park:yose', displayName: 'Yosemite National Park' },
    topic: 'roads', evidenceTypes: ['live_state'],
    temporalScope: { mode: 'current', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' },
    freshnessClass: 'live', maxAgeSeconds: 900, maxStaleSeconds: 0, criticality: 'hard', absenceSemantics: 'unknown',
    minimumAuthorityClass: authority, acceptedSourceClasses: [authority],
    preferredProviders: ['nps'], allowedFallbackProviders: ['brave'], privacyScope: 'public',
  };
}

function resolution(req, status, selectedEvidence = []) {
  return {
    requirementId: req.requirementId, status,
    evidenceIds: selectedEvidence.map((item) => item.evidenceId), reasonCodes: [],
    candidateSummary: { examined: selectedEvidence.length, usable: selectedEvidence.length, expired: 0, wrongScope: 0, wrongTopic: 0, wrongType: 0, insufficientAuthority: 0, conflicted: 0, privacyRejected: 0 },
    refresh: { needed: status === 'missing', refreshKeyHash: null, outcome: 'not_needed', reasonCode: null },
    cacheStatus: status === 'satisfied_fresh' ? 'fresh_hit' : 'miss', maxEvidenceAgeMs: 0,
    authorityClasses: [], providersUsed: [], conflictStatus: 'none', latencyMs: null,
    selectedEvidence,
  };
}

function evidence(sourceClass, provider, url = 'https://www.nps.gov/yose/planyourvisit/conditions.htm') {
  return {
    evidenceId: `ev:${provider}`, entityId: 'nps:park:yose', topic: 'roads', evidenceType: 'live_state',
    claim: { identity: `${provider}:roads`, text: null, normalizedValue: { url }, subjectId: 'nps:park:yose', objectId: url, qualifiers: [] },
    scope: { geographicEntityIds: ['nps:park:yose'], validFrom: null, validThrough: null, audience: 'public' },
    source: { provider, sourceClass, sourceId: `${provider}:roads`, url },
    observation: { observedAt: NOW.toISOString(), fetchedAt: NOW.toISOString() },
    quality: { authorityClass: sourceClass, scopeMatch: 'exact', conflictStatus: 'none' },
  };
}

function bundle(req, status, items = []) {
  const { selectedEvidence: _selectedEvidence, ...publicResolution } = resolution(req, status, items);
  return { schemaVersion: 1, brokerVersion: 'wp5a-v1', requestId: 'pass', createdAt: NOW.toISOString(), resolutions: [publicResolution], evidence: items };
}

describe('WP6 layered structured-first resolver', () => {
  test('official follow URLs include Recreation.gov reservation pages and reject blogs', () => {
    expect(officialSourceUrl({ source: { url: 'https://www.nps.gov/glac/planyourvisit/shuttle.htm' } }))
      .toBe('https://www.nps.gov/glac/planyourvisit/shuttle.htm');
    expect(officialSourceUrl({ source: { url: 'https://www.recreation.gov/ticket/facility/250014' } }))
      .toBe('https://www.recreation.gov/ticket/facility/250014');
    expect(officialSourceUrl({ source: { url: 'https://hikingblog.example/glacier-parking-tips' } })).toBeNull();
  });
  test('fresh structured coverage suppresses every web pass', async () => {
    const req = requirement();
    const structured = bundle(req, 'satisfied_fresh', [evidence('official_owner', 'nps')]);
    const broker = { resolveEvidence: jest.fn().mockResolvedValue(structured) };
    const resolver = createLayeredEvidenceResolver({ broker, now: () => NOW });
    const result = await resolver.resolveEvidence({ requirements: [req], requestId: 'layered-fresh' });
    expect(broker.resolveEvidence).toHaveBeenCalledTimes(1);
    expect(result.resolutions[0].status).toBe('satisfied_fresh');
    expect(result.requestId).toBe('layered-fresh');
    expect(result.evidence).toHaveLength(1);
  });

  test('missing structured coverage runs discovery and then prefers the discovered direct official page', async () => {
    const req = requirement();
    const discovery = evidence('reputable_web', 'brave');
    const official = evidence('official_owner', 'direct_official_page');
    const broker = { resolveEvidence: jest.fn()
      .mockResolvedValueOnce(bundle(req, 'missing'))
      .mockImplementationOnce(async ({ requirements }) => bundle(requirements[0], 'satisfied_fresh', [discovery]))
      .mockImplementationOnce(async ({ requirements }) => bundle(requirements[0], 'satisfied_fresh', [official])) };
    const resolver = createLayeredEvidenceResolver({ broker, now: () => NOW });
    const result = await resolver.resolveEvidence({ requirements: [req], requestId: 'layered-official' });

    expect(broker.resolveEvidence).toHaveBeenCalledTimes(3);
    expect(broker.resolveEvidence.mock.calls[0][0].requirements[0]).toMatchObject({ preferredProviders: ['nps'], allowedFallbackProviders: [] });
    expect(broker.resolveEvidence.mock.calls[1][0].requirements[0]).toMatchObject({ preferredProviders: ['brave'], minimumAuthorityClass: 'reputable_web' });
    expect(broker.resolveEvidence.mock.calls[2][0].requirements[0]).toMatchObject({
      preferredProviders: ['direct_official_page'], minimumAuthorityClass: 'official_owner',
      webScope: { sourceUrl: 'https://www.nps.gov/yose/planyourvisit/conditions.htm' },
    });
    expect(result.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', evidenceIds: ['ev:direct_official_page'] });
  });

  test('unsupported transit invokes Brave and can follow a Recreation.gov official page', async () => {
    const transit = {
      ...requirement('official_operator'),
      requirementId: 'req:layered:transit',
      topic: 'transit',
      reasonCodes: ['access_decision_support'],
    };
    const publicResolution = (req, status, items = []) => {
      const { selectedEvidence, ...rest } = resolution(req, status, items);
      return rest;
    };
    const discovery = {
      ...evidence('reputable_web', 'brave', 'https://www.recreation.gov/ticket/facility/250014'),
      evidenceId: 'ev:brave-recgov',
      entityId: 'nps:park:yose',
      topic: 'transit',
    };
    const official = {
      ...evidence('official_operator', 'direct_official_page', 'https://www.recreation.gov/ticket/facility/250014'),
      evidenceId: 'ev:recgov-page',
      entityId: 'nps:park:yose',
      topic: 'transit',
    };
    const broker = { resolveEvidence: jest.fn()
      .mockResolvedValueOnce({
        schemaVersion: 1, brokerVersion: 'wp5a-v1', requestId: 'structured', createdAt: NOW.toISOString(),
        resolutions: [publicResolution(transit, 'unsupported')],
        evidence: [],
      })
      .mockImplementationOnce(async ({ requirements }) => {
        expect(requirements).toHaveLength(1);
        expect(requirements[0]).toMatchObject({
          topic: 'transit',
          preferredProviders: ['brave'],
        });
        return {
          schemaVersion: 1, brokerVersion: 'wp5a-v1', requestId: 'discovery', createdAt: NOW.toISOString(),
          resolutions: [publicResolution(requirements[0], 'satisfied_fresh', [discovery])],
          evidence: [discovery],
        };
      })
      .mockImplementationOnce(async ({ requirements }) => {
        expect(requirements[0]).toMatchObject({
          preferredProviders: ['direct_official_page'],
          webScope: { sourceUrl: 'https://www.recreation.gov/ticket/facility/250014' },
        });
        return {
          schemaVersion: 1, brokerVersion: 'wp5a-v1', requestId: 'official', createdAt: NOW.toISOString(),
          resolutions: [publicResolution(requirements[0], 'satisfied_fresh', [official])],
          evidence: [official],
        };
      }) };
    const resolver = createLayeredEvidenceResolver({ broker, now: () => NOW });
    const result = await resolver.resolveEvidence({
      requirements: [transit],
      requestId: 'layered-transit-recgov',
    });
    expect(broker.resolveEvidence).toHaveBeenCalledTimes(3);
    expect(result.resolutions[0].status).toBe('satisfied_fresh');
    expect(result.evidence.map((item) => item.source.url)).toContain(
      'https://www.recreation.gov/ticket/facility/250014'
    );
  });

  test('verified non-NPS official relationship survives discovery into the direct follow request', async () => {
    const req = {
      ...requirement('official_owner'),
      entity: { entityId: 'state:park:custer', displayName: 'Custer State Park' },
    };
    const relationship = {
      verified: true,
      sourceClass: 'official_state_park',
      hostname: 'gfp.sd.gov',
      entityId: 'state:park:custer',
    };
    const discovery = {
      ...evidence('reputable_web', 'brave', 'https://gfp.sd.gov/parks/detail/custer-state-park/'),
      entityId: req.entity.entityId,
      source: {
        provider: 'brave',
        sourceClass: 'reputable_web',
        sourceId: 'brave:custer',
        url: 'https://gfp.sd.gov/parks/detail/custer-state-park/',
        officialRelationship: relationship,
      },
    };
    const broker = { resolveEvidence: jest.fn()
      .mockResolvedValueOnce(bundle(req, 'missing'))
      .mockImplementationOnce(async ({ requirements }) => bundle(requirements[0], 'satisfied_fresh', [discovery]))
      .mockImplementationOnce(async ({ requirements }) => {
        expect(requirements[0]).toMatchObject({
          preferredProviders: ['direct_official_page'],
          webScope: {
            sourceUrl: 'https://gfp.sd.gov/parks/detail/custer-state-park/',
            officialRelationship: relationship,
          },
        });
        return bundle(requirements[0], 'missing');
      }) };

    const resolver = createLayeredEvidenceResolver({ broker, now: () => NOW });
    await resolver.resolveEvidence({ requirements: [req], requestId: 'layered-state-park' });
    expect(broker.resolveEvidence).toHaveBeenCalledTimes(3);
  });

  test('search discovery cannot replace a stronger original authority requirement', async () => {
    const req = requirement();
    const discovery = evidence('reputable_web', 'brave', 'https://example.com/roads');
    const broker = { resolveEvidence: jest.fn()
      .mockResolvedValueOnce(bundle(req, 'missing'))
      .mockImplementationOnce(async ({ requirements }) => bundle(requirements[0], 'satisfied_fresh', [discovery])) };
    const resolver = createLayeredEvidenceResolver({ broker, now: () => NOW });
    const result = await resolver.resolveEvidence({ requirements: [req], requestId: 'layered-low-authority' });
    expect(broker.resolveEvidence).toHaveBeenCalledTimes(2);
    expect(result.resolutions[0].status).toBe('missing');
    expect(result.evidence).toHaveLength(0);
  });
});
