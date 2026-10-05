'use strict';

/**
 * Brave discovery freshness policy.
 *
 * Every Brave request used to carry `freshness: 'pw'`. That restricts results to
 * pages EDITED in the past week, so a park's canonical parking/shuttle/road page
 * was filtered out while unrelated recently-edited NPS pages were returned.
 * Destination ownership then rejected all of them and the requirement resolved
 * `missing` — a decision-critical topic reaching the model with no web evidence.
 *
 * Fully mocked: no client, no staging, no network.
 */

const {
  createBraveEvidenceProvider, getBraveDiscoveryFreshness,
  DISCOVERY_FRESHNESS_BY_TOPIC, BRAVE_TOPICS,
} = require('../providers/braveEvidenceProvider');

const YOSEMITE = { entityId: 'nps:park:yose', parkCode: 'yose', displayName: 'Yosemite National Park' };

const requirementFor = (topic) => ({
  topic, entity: YOSEMITE, evidenceTypes: ['fact'], reasonCodes: [],
  requirementId: `req-${topic}`, criticality: 'required',
});

/** A provider whose every external edge is a spy. */
function spyProvider(results = []) {
  const searchCalls = [];
  const stageCalls = [];
  const provider = createBraveEvidenceProvider({
    braveClient: {
      async search(parameters) { searchCalls.push(parameters); return { results }; },
    },
    stageRaw: async (args) => { stageCalls.push(args); return { rawPayloadHash: 'staged-hash' }; },
    now: () => new Date('2026-08-17T00:00:00.000Z'),
  });
  return { provider, searchCalls, stageCalls };
}

describe('topic policy completeness', () => {
  test('every supported Brave topic has an explicit freshness decision', () => {
    for (const topic of BRAVE_TOPICS) {
      expect(Object.prototype.hasOwnProperty.call(DISCOVERY_FRESHNESS_BY_TOPIC, topic)).toBe(true);
    }
  });

  test('the policy declares no topic Brave does not support', () => {
    for (const topic of Object.keys(DISCOVERY_FRESHNESS_BY_TOPIC)) {
      expect(BRAVE_TOPICS.has(topic)).toBe(true);
    }
  });
});

describe('stable-canonical topics carry no recency filter', () => {
  test.each(['parking', 'transit', 'roads', 'permits_reservations', 'trail_conditions'])(
    '%s omits freshness entirely (not undefined, absent)',
    (topic) => {
      expect(getBraveDiscoveryFreshness(topic)).toBeNull();
      const { provider } = spyProvider();
      const request = provider.buildRequest(requirementFor(topic));
      expect('freshness' in request.parameters).toBe(false);
      expect('freshness' in request.publicCanonicalRequest).toBe(false);
    }
  );

  test.each(['parking', 'transit', 'roads', 'permits_reservations'])(
    '%s never sends the weekly filter that caused the defect',
    (topic) => {
      const { provider } = spyProvider();
      expect(provider.buildRequest(requirementFor(topic)).parameters.freshness).toBeUndefined();
    }
  );
});

describe('recency-sensitive topics keep a bounded discovery window', () => {
  test.each([
    ['alerts_closures', 'pw'],
    ['wildfire_smoke', 'pw'],
    ['events', 'pm'],
  ])('%s discovers with freshness=%s', (topic, expected) => {
    expect(getBraveDiscoveryFreshness(topic)).toBe(expected);
    const { provider } = spyProvider();
    const request = provider.buildRequest(requirementFor(topic));
    expect(request.parameters.freshness).toBe(expected);
    expect(request.publicCanonicalRequest.freshness).toBe(expected);
  });

  test('the freshness value actually reaches the client', async () => {
    const { provider, searchCalls } = spyProvider([]);
    const request = provider.buildRequest(requirementFor('alerts_closures'));
    await provider.fetch(request, {});
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0].freshness).toBe('pw');
  });
});

describe('request identity distinguishes freshness policies', () => {
  test('a filtered and an unfiltered request cannot share a cache entry', () => {
    const { provider } = spyProvider();
    const alerts = provider.buildRequest(requirementFor('alerts_closures'));
    const parking = provider.buildRequest(requirementFor('parking'));
    expect(alerts.parameters.queryHash).not.toBe(parking.parameters.queryHash);
    expect(alerts.dedupeKey).not.toBe(parking.dedupeKey);
  });

  test('the hash changes when the topic policy changes, not just the query text', () => {
    // roads and trail_conditions build different queries AND share a null policy;
    // identity must still separate them.
    const { provider } = spyProvider();
    const roads = provider.buildRequest(requirementFor('roads'));
    const trails = provider.buildRequest(requirementFor('trail_conditions'));
    expect(roads.parameters.queryHash).not.toBe(trails.parameters.queryHash);
  });

  test('a cached result is only reused for the identical request identity', async () => {
    const { provider, searchCalls } = spyProvider([
      { url: 'https://www.nps.gov/yose/planyourvisit/conditions.htm', title: 'Conditions', description: 'Yosemite road conditions.' },
    ]);
    const roads = provider.buildRequest(requirementFor('roads'));
    const first = await provider.fetch(roads, {});
    const second = await provider.fetch(roads, {});
    expect(first.metadata.queryCacheStatus).toBe('miss');
    expect(second.metadata.queryCacheStatus).toBe('hit');
    expect(searchCalls).toHaveLength(1);

    // A different policy/topic must not be served from that entry.
    await provider.fetch(provider.buildRequest(requirementFor('alerts_closures')), {});
    expect(searchCalls).toHaveLength(2);
  });
});

describe('discovery reach vs destination integrity', () => {
  // 1) recently edited WRONG-park page  2) stable CORRECT-park official page
  // 3) stable correct Recreation.gov permit page
  const MIXED_RESULTS = [
    {
      url: 'https://www.nps.gov/grca/planyourvisit/shuttle-buses.htm',
      title: 'Shuttle Buses - Grand Canyon National Park',
      description: 'Grand Canyon shuttle routes and hours.',
    },
    {
      url: 'https://www.nps.gov/yose/planyourvisit/publictransportation.htm',
      title: 'Public Transportation - Yosemite National Park',
      description: 'Shuttle and bus service in Yosemite Valley.',
    },
    {
      url: 'https://www.recreation.gov/vehiclepermits/274348',
      title: 'Yosemite Vehicle Reservation',
      description: 'Peak hours vehicle reservation for Yosemite National Park.',
    },
  ];

  test('stable correct-destination pages are no longer filtered out of discovery', async () => {
    const { provider } = spyProvider(MIXED_RESULTS);
    const request = provider.buildRequest(requirementFor('transit'));
    const fetched = await provider.fetch(request, {});
    const urls = fetched.raw.results.map((r) => r.url);
    expect(urls).toContain('https://www.nps.gov/yose/planyourvisit/publictransportation.htm');
    expect(urls).toContain('https://www.recreation.gov/vehiclepermits/274348');
  });

  test('correct-destination candidates pass ownership; the wrong park still does not', async () => {
    const { provider } = spyProvider(MIXED_RESULTS);
    const request = provider.buildRequest(requirementFor('transit'));
    const fetched = await provider.fetch(request, {});
    const byUrl = new Map(provider.normalize(fetched.raw, request, fetched.metadata)
      .map((c) => [c.source.url, c]));

    expect(byUrl.get('https://www.nps.gov/yose/planyourvisit/publictransportation.htm').quality.scopeMatch).toBe('exact');
    expect(byUrl.get('https://www.recreation.gov/vehiclepermits/274348').quality.scopeMatch).toBe('exact');
    // The integrity guarantee: removing the recency filter must not admit the
    // wrong destination.
    expect(byUrl.get('https://www.nps.gov/grca/planyourvisit/shuttle-buses.htm').quality.scopeMatch).not.toBe('exact');
  });

  test('official-only topics still reject non-official domains', async () => {
    const { provider } = spyProvider([
      ...MIXED_RESULTS,
      { url: 'https://www.example-travel-blog.com/yosemite-parking-tips', title: 'Yosemite parking tips', description: 'Blog.' },
    ]);
    const request = provider.buildRequest(requirementFor('parking'));
    const fetched = await provider.fetch(request, {});
    expect(fetched.raw.results.map((r) => r.url))
      .not.toContain('https://www.example-travel-blog.com/yosemite-parking-tips');
  });
});

describe('authority is unchanged by the freshness fix', () => {
  test('a search hit stays discovery-level, never owner-authoritative', async () => {
    const { provider } = spyProvider([{
      url: 'https://www.nps.gov/yose/planyourvisit/publictransportation.htm',
      title: 'Public Transportation - Yosemite National Park',
      description: 'Shuttle and bus service in Yosemite Valley.',
    }]);
    const request = provider.buildRequest(requirementFor('transit'));
    const fetched = await provider.fetch(request, {});
    const [candidate] = provider.normalize(fetched.raw, request, fetched.metadata);

    expect(candidate.quality.authorityClass).toBe('reputable_web');
    expect(candidate.quality.authorityClass).not.toBe('owner');
    expect(candidate.claim.status).toBe('search_discovery');
    // Discovery carries no claim text — the official follow is what reads the page.
    expect(candidate.claim.text).toBeNull();
    expect(candidate.claim.qualifiers).toEqual(
      expect.arrayContaining(['search_result_does_not_prove_absence', 'verify_source_page'])
    );
  });
});

describe('provider isolation', () => {
  test('no real client and no staging escape the mocks', async () => {
    const { provider, searchCalls, stageCalls } = spyProvider([{
      url: 'https://www.nps.gov/yose/planyourvisit/conditions.htm', title: 'Conditions', description: 'Roads.',
    }]);
    await provider.fetch(provider.buildRequest(requirementFor('roads')), {});
    expect(searchCalls).toHaveLength(1);
    expect(stageCalls).toHaveLength(1);
    expect(stageCalls[0].provider).toBe('brave');
  });
});
