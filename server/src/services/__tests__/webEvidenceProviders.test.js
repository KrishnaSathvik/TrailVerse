'use strict';

const { createBraveEvidenceProvider } = require('../providers/braveEvidenceProvider');
const { createSerperEvidenceProvider } = require('../providers/serperEvidenceProvider');
const { createTavilyEvidenceProvider } = require('../providers/tavilyEvidenceProvider');
const { createDirectOfficialPageEvidenceProvider } = require('../providers/directOfficialPageEvidenceProvider');

const NOW = new Date('2026-08-09T12:00:00.000Z');
const ENTITY = {
  entityId: 'nps:park:yose', displayName: 'Yosemite National Park', latitude: 37.7459, longitude: -119.5332,
};

function requirement(topic, overrides = {}) {
  return {
    requirementId: `req:web:${topic}`, entity: ENTITY, topic,
    evidenceTypes: topic === 'local_business' ? ['fact', 'recommendation_signal']
      : topic === 'roads' ? ['live_state', 'rule'] : ['fact', 'description'],
    temporalScope: { mode: 'current', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' },
    preferredProviders: [], allowedFallbackProviders: [],
    ...overrides,
  };
}

describe('WP6 Brave evidence adapter', () => {
  test('builds a public hashed query identity and ignores private request fields', () => {
    const provider = createBraveEvidenceProvider({ braveClient: {}, stageRaw: jest.fn() });
    const request = provider.buildRequest(requirement('roads', { rawQuery: 'from 123 Private Street' }));
    expect(request.parameters.query).toBe('Yosemite National Park road conditions closures official 2026');
    expect(request.dedupeKey).toMatch(/^brave\|search\|[a-f0-9]{64}$/);
    expect(JSON.stringify(request.publicCanonicalRequest)).not.toMatch(/123|private street/i);
  });

  test('stages bounded results and query-cache reuse performs zero additional search', async () => {
    const results = [{ title: 'Current Conditions', description: 'Tioga Road status update', url: 'https://www.nps.gov/yose/planyourvisit/conditions.htm' }];
    const braveClient = { search: jest.fn().mockResolvedValue({ results }) };
    const stageRaw = jest.fn().mockResolvedValue({ rawPayloadHash: 'a'.repeat(64) });
    const provider = createBraveEvidenceProvider({ braveClient, stageRaw, now: () => NOW });
    const request = provider.buildRequest(requirement('roads'));
    const first = await provider.fetch(request);
    const second = await provider.fetch(request);
    const candidates = provider.normalize(first.raw, request, first.metadata);

    expect(braveClient.search).toHaveBeenCalledTimes(1);
    expect(stageRaw).toHaveBeenCalledTimes(1);
    expect(second.metadata.queryCacheStatus).toBe('hit');
    expect(candidates[0]).toMatchObject({
      topic: 'roads', evidenceType: 'live_state',
      claim: {
        status: 'search_discovery', text: null,
        qualifiers: expect.arrayContaining(['search_result_does_not_prove_absence', 'verify_source_page']),
      },
      source: { provider: 'brave', sourceClass: 'reputable_web', url: results[0].url },
      retention: { licenseClass: 'search_metadata_only', storeClaimText: false },
    });
  });

  test('empty search is unknown and never proves absence', async () => {
    const provider = createBraveEvidenceProvider({
      braveClient: { search: jest.fn().mockResolvedValue({ results: [] }) }, stageRaw: jest.fn(), now: () => NOW,
    });
    const fetched = await provider.fetch(provider.buildRequest(requirement('events')));
    expect(fetched.completeness).toMatchObject({ isComplete: false, emptyMeans: 'unknown' });
    expect(provider.normalize(fetched.raw, provider.buildRequest(requirement('events')), fetched.metadata)).toEqual([]);
  });

  test('supports transit and permits_reservations with official-only discovery', async () => {
    const provider = createBraveEvidenceProvider({
      braveClient: { search: jest.fn().mockResolvedValue({
        results: [
          { title: 'Blog parking tips', description: 'Arrive early', url: 'https://hikingblog.example/glacier-parking' },
          { title: 'Shuttle', description: 'Ticketed shuttle', url: 'https://www.nps.gov/glac/planyourvisit/shuttle.htm' },
          { title: 'Tickets', description: 'Reserve shuttle tickets', url: 'https://www.recreation.gov/ticket/facility/123' },
        ],
      }) },
      stageRaw: jest.fn().mockResolvedValue({ rawPayloadHash: 'd'.repeat(64) }),
      now: () => NOW,
    });
    expect(provider.supports(requirement('transit'))).toBe(true);
    expect(provider.supports(requirement('permits_reservations'))).toBe(true);

    const transitReq = provider.buildRequest(requirement('transit', {
      entity: { entityId: 'nps:park:glac', displayName: 'Glacier National Park' },
      reasonCodes: ['access_decision_support'],
    }));
    expect(transitReq.parameters.query).toMatch(/site:nps\.gov/i);
    expect(transitReq.parameters.query).toMatch(/site:recreation\.gov/i);
    expect(transitReq.parameters.query).not.toMatch(/hikingblog/i);

    const fetched = await provider.fetch(transitReq);
    const candidates = provider.normalize(fetched.raw, transitReq, fetched.metadata);
    const urls = candidates.map((item) => item.source.url);
    expect(urls).toEqual(expect.arrayContaining([
      'https://www.nps.gov/glac/planyourvisit/shuttle.htm',
      'https://www.recreation.gov/ticket/facility/123',
    ]));
    expect(urls.join(' ')).not.toMatch(/hikingblog/i);
  });
});

describe('WP6 Serper places-style adapter', () => {
  test('supports discovery but never live hotel or flight availability', () => {
    const provider = createSerperEvidenceProvider({ serperClient: {}, stageRaw: jest.fn() });
    expect(provider.supports(requirement('local_business'))).toBe(true);
    expect(provider.supports(requirement('lodging_strategy'))).toBe(true);
    expect(provider.supports(requirement('hotel_live'))).toBe(false);
    expect(provider.supports(requirement('flight_live'))).toBe(false);
  });

  test('place listings remain discovery signals with unknown availability', async () => {
    const result = {
      title: 'Yosemite Cafe', address: 'Public business address', rating: 4.6,
      link: 'https://example.com/yosemite-cafe', placeId: 'place-1',
    };
    const provider = createSerperEvidenceProvider({
      serperClient: { searchPlaces: jest.fn().mockResolvedValue({ places: [result], organic: [] }) },
      stageRaw: jest.fn().mockResolvedValue({ rawPayloadHash: 'b'.repeat(64) }), now: () => NOW,
    });
    const request = provider.buildRequest(requirement('local_business'));
    const fetched = await provider.fetch(request);
    const [candidate] = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(candidate).toMatchObject({
      evidenceType: 'recommendation_signal',
      claim: {
        status: 'listing_only',
        normalizedValue: { listingExists: true, currentAvailability: null, hotelAvailability: null, flightAvailability: null },
        qualifiers: expect.arrayContaining(['availability_unknown']),
      },
      source: { provider: 'serper', sourceClass: 'commercial_structured' },
    });
  });
});

describe('WP6 Tavily source-discovery adapter', () => {
  test('does not extract when search snippets are sufficient', async () => {
    const tavilyClient = {
      search: jest.fn().mockResolvedValue({ results: [{ title: 'Guide', url: 'https://example.com/guide', content: 'x'.repeat(200) }] }),
      extract: jest.fn(),
    };
    const provider = createTavilyEvidenceProvider({ tavilyClient, stageRaw: jest.fn(), now: () => NOW });
    await provider.fetch(provider.buildRequest(requirement('activities')));
    expect(tavilyClient.search).toHaveBeenCalledTimes(1);
    expect(tavilyClient.extract).not.toHaveBeenCalled();
  });

  test('uses bounded extraction only when discovered snippets are insufficient', async () => {
    const tavilyClient = {
      search: jest.fn().mockResolvedValue({ results: [{ title: 'Thin', url: 'https://www.nps.gov/yose/index.htm', content: 'thin' }] }),
      extract: jest.fn().mockResolvedValue({ results: [{ url: 'https://www.nps.gov/yose/index.htm', rawContent: 'official page content' }] }),
    };
    const provider = createTavilyEvidenceProvider({ tavilyClient, stageRaw: jest.fn(), now: () => NOW });
    const fetched = await provider.fetch(provider.buildRequest(requirement('overview')));
    expect(tavilyClient.extract).toHaveBeenCalledWith(['https://www.nps.gov/yose/index.htm'], expect.any(Object));
    expect(fetched.providerAttempts).toBe(2);
    const [candidate] = provider.normalize(fetched.raw, provider.buildRequest(requirement('overview')), fetched.metadata);
    expect(candidate.claim.text).toContain('official page content');
    expect(candidate.retention.storeClaimText).toBe(true);
  });
});

describe('WP6 direct official-page adapter', () => {
  test('accepts allowlisted official pages and rejects arbitrary or credentialed URLs', () => {
    const provider = createDirectOfficialPageEvidenceProvider({ officialPageClient: {}, stageRaw: jest.fn() });
    expect(provider.supports(requirement('roads', { webScope: { sourceUrl: 'https://www.nps.gov/yose/planyourvisit/conditions.htm' } }))).toBe(true);
    expect(provider.supports(requirement('permits_reservations', { webScope: { sourceUrl: 'https://www.recreation.gov/ticket/facility/123' } }))).toBe(true);
    expect(provider.supports(requirement('roads', { webScope: { sourceUrl: 'https://example.com/conditions' } }))).toBe(false);
    expect(provider.supports(requirement('roads', { webScope: { sourceUrl: 'https://user:pass@nps.gov/yose' } }))).toBe(false);
  });

  test('normalizes direct NPS content as owner evidence without negative absence claims', async () => {
    const provider = createDirectOfficialPageEvidenceProvider({
      officialPageClient: { fetchPage: jest.fn().mockResolvedValue({
        url: 'https://www.nps.gov/yose/planyourvisit/conditions.htm', title: 'Current Conditions',
        text: 'Tioga Road conditions are updated on this page.', status: 200,
      }) },
      stageRaw: jest.fn().mockResolvedValue({ rawPayloadHash: 'c'.repeat(64) }), now: () => NOW,
    });
    const req = requirement('roads', { webScope: { sourceUrl: 'https://www.nps.gov/yose/planyourvisit/conditions.htm' } });
    const request = provider.buildRequest(req);
    const fetched = await provider.fetch(request);
    const [candidate] = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(candidate).toMatchObject({
      topic: 'roads', source: { provider: 'direct_official_page', sourceClass: 'official_owner' },
      claim: { status: 'official_page_content', polarity: 'positive' },
      retention: { licenseClass: 'government_public', storeClaimText: true },
    });
    expect(candidate.absenceProof).toBeUndefined();
  });

  test.each([
    ['https://www.recreation.gov/ticket/facility/123', 'Arches timed entry tickets', 'This reservation is for Arches National Park.'],
    ['https://www.weather.gov/forecast', 'Weather for Arches', 'Forecast for Arches National Park.'],
  ])('rejects code-less official evidence for the wrong destination: %s', async (url, title, pageText) => {
    const provider = createDirectOfficialPageEvidenceProvider({
      officialPageClient: { fetchPage: jest.fn().mockResolvedValue({ url, title, text: pageText, status: 200 }) },
      stageRaw: jest.fn().mockResolvedValue({ rawPayloadHash: 'e'.repeat(64) }), now: () => NOW,
    });
    const req = requirement('permits_reservations', { webScope: { sourceUrl: url } });
    const request = provider.buildRequest(req);
    const fetched = await provider.fetch(request);
    expect(provider.normalize(fetched.raw, request, fetched.metadata)).toEqual([]);
  });

  test('accepts a code-less official page with a strong destination match', async () => {
    const url = 'https://www.recreation.gov/ticket/facility/123';
    const provider = createDirectOfficialPageEvidenceProvider({
      officialPageClient: { fetchPage: jest.fn().mockResolvedValue({
        url, title: 'Yosemite National Park reservations', text: 'Yosemite National Park entrance reservation information.', status: 200,
      }) }, stageRaw: jest.fn().mockResolvedValue({ rawPayloadHash: 'f'.repeat(64) }), now: () => NOW,
    });
    const request = provider.buildRequest(requirement('permits_reservations', { webScope: { sourceUrl: url } }));
    const fetched = await provider.fetch(request);
    const [candidate] = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(candidate.quality).toMatchObject({ scopeMatch: 'exact', relationshipConfidence: expect.any(Number) });
  });

  test('supports a typed verified state-park official source without trusting arbitrary domains', async () => {
    const url = 'https://parks.example.gov/valley-of-fire/access';
    const relationship = {
      verified: true,
      sourceClass: 'official_state_park',
      hostname: 'parks.example.gov',
      entityId: 'place:state_park:valley-of-fire',
    };
    const entity = { entityId: relationship.entityId, displayName: 'Valley of Fire State Park', latitude: 36.48, longitude: -114.53 };
    const provider = createDirectOfficialPageEvidenceProvider({
      officialPageClient: { fetchPage: jest.fn().mockResolvedValue({ url, title: 'Valley of Fire access', text: 'Official Valley of Fire State Park access information.', status: 200 }) },
      stageRaw: jest.fn().mockResolvedValue({ rawPayloadHash: '1'.repeat(64) }), now: () => NOW,
    });
    const req = requirement('roads', { entity, webScope: { sourceUrl: url, officialRelationship: relationship } });
    expect(provider.supports(req)).toBe(true);
    const request = provider.buildRequest(req);
    const fetched = await provider.fetch(request);
    expect(provider.normalize(fetched.raw, request, fetched.metadata)[0].source.sourceClass).toBe('official_owner');
    expect(createDirectOfficialPageEvidenceProvider({ officialPageClient: {}, stageRaw: jest.fn() })
      .supports(requirement('roads', { entity, webScope: { sourceUrl: url } }))).toBe(false);
  });
});
