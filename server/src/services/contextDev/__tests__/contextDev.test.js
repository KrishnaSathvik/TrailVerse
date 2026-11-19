'use strict';

const { createHmac } = require('crypto');

const client = require('../contextDevClient');
const { routeWebSearchProvider, officialPageReaderUsesContextDev, webSearchUsesContextDev } = require('../contextDevConfig');
const { verifyContextDevSignature, urlVariants, handleContextDevEvent, invalidateEvidenceForSourceUrl } = require('../contextDevWebhook');
const { createContextDevWebhookHandler, configuredSecrets } = require('../../../routes/contextDevWebhooks');
const { createContextDevEvidenceProvider } = require('../../providers/contextDevEvidenceProvider');
const { createDirectOfficialPageEvidenceProvider, readerWithFallback } = require('../../providers/directOfficialPageEvidenceProvider');
const { planWebEvidenceFallbacks } = require('../../webEvidencePolicyService');
const { evaluateRequirementCoverage } = require('../../evidenceCoverageEvaluator');

const ON = { CONTEXT_DEV_API_KEY: 'test-key' };
const NOW = new Date('2026-11-19T12:00:00.000Z');

function fakeHttp(data) {
  const calls = [];
  return { calls, async request(config) { calls.push(config); return { data }; } };
}

describe('contextDevClient', () => {
  test('scrapePage asks for main-content markdown with a PDF page range and maps the response', async () => {
    const http = fakeHttp({
      url: 'https://www.nps.gov/glac/planyourvisit/directions.htm',
      markdown: { success: true, data: '# Directions\n\nVehicles longer than 21 feet are prohibited.' },
      metadata: { title: '  Directions -  Glacier ' },
      cache_metadata: { status: 'hit' },
      key_metadata: { credits_consumed: 1, credits_remaining: 99 },
    });
    const page = await client.scrapePage('https://www.nps.gov/glac/planyourvisit/directions.htm', { env: ON, http, timeoutMs: 1234 });
    expect(page).toMatchObject({ title: 'Directions - Glacier', status: 200, creditsUsed: 1, cacheStatus: 'hit' });
    expect(page.text).toContain('21 feet');
    const [call] = http.calls;
    expect(call.url).toBe('https://api.context.dev/v1/web/scrape');
    expect(call.headers.Authorization).toBe('Bearer test-key');
    expect(call.timeout).toBe(1234);
    expect(call.data).toMatchObject({ formats: { markdown: true }, sharedParams: { mainContentOnly: true, parsers: { pdf: { startPage: 1, endPage: 12 } } } });
  });

  test('scrapePage rejects when no markdown came back', async () => {
    const http = fakeHttp({ markdown: { success: false, error_code: 'NOT_FOUND' } });
    await expect(client.scrapePage('https://www.nps.gov/x', { env: ON, http })).rejects.toMatchObject({ code: 'context_dev_scrape_failed', upstreamCode: 'NOT_FOUND' });
  });

  test('missing key is a bounded not-configured error, before any HTTP', async () => {
    const http = fakeHttp({});
    await expect(client.scrapePage('https://www.nps.gov/x', { env: {}, http })).rejects.toMatchObject({ code: client.NOT_CONFIGURED });
    expect(http.calls).toHaveLength(0);
  });

  test('the test-mode live-provider tripwire blocks real calls', async () => {
    const http = fakeHttp({});
    await expect(client.scrapePage('https://www.nps.gov/x', { env: { ...ON, TRAILIE_TEST_PROVIDER_MODE: 'deny_live' }, http }))
      .rejects.toMatchObject({ code: 'live_provider_forbidden_in_test' });
    expect(http.calls).toHaveLength(0);
  });

  test('searchWeb forwards domains/freshness/highlights and normalizes results', async () => {
    const http = fakeHttp({
      results: [
        { url: 'https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm', title: 'Shuttle', description: 'd', relevance: 'high', highlights: { highlights: ['Shuttle runs Mar 7'] } },
        { title: 'no url' },
      ],
      key_metadata: { credits_consumed: 2 },
    });
    const out = await client.searchWeb({ query: 'zion shuttle', includeDomains: ['nps.gov'], freshness: 'last_week', highlights: true }, { env: ON, http });
    expect(out.creditsUsed).toBe(2);
    expect(out.results).toEqual([expect.objectContaining({ relevance: 'high', highlights: ['Shuttle runs Mar 7'] })]);
    expect(http.calls[0].data).toMatchObject({ includeDomains: ['nps.gov'], freshness: 'last_week', highlightsOptions: { enabled: true } });
  });
});

describe('feature flags', () => {
  test('everything is off by default and needs the key as well as the flag', () => {
    expect(officialPageReaderUsesContextDev({})).toBe(false);
    expect(officialPageReaderUsesContextDev({ TRAILIE_OFFICIAL_PAGE_READER: 'contextdev' })).toBe(false);
    expect(officialPageReaderUsesContextDev({ ...ON, TRAILIE_OFFICIAL_PAGE_READER: 'contextdev' })).toBe(true);
    expect(webSearchUsesContextDev({ ...ON })).toBe(false);
  });

  test('search routing replaces only Brave/Tavily, only for topics Context.dev serves', () => {
    const env = { ...ON, TRAILIE_WEB_SEARCH_PROVIDER: 'contextdev' };
    expect(routeWebSearchProvider('brave', 'roads', env)).toBe('context_dev');
    expect(routeWebSearchProvider('tavily', 'overview', env)).toBe('context_dev');
    expect(routeWebSearchProvider('serper', 'local_business', env)).toBe('serper');
    expect(routeWebSearchProvider('brave', 'local_business', env)).toBe('brave');
    expect(routeWebSearchProvider('brave', 'roads', ON)).toBe('brave');
    expect(routeWebSearchProvider(undefined, 'roads', env)).toBeUndefined();
  });

  test('planWebEvidenceFallbacks follows the flag', () => {
    const requirement = {
      requirementId: 'r1', topic: 'roads', criticality: 'hard',
      entity: { entityId: 'nps:park:yose', displayName: 'Yosemite National Park' },
      temporalScope: { mode: 'current' }, reasonCodes: [],
    };
    const bundle = { resolutions: [{ requirementId: 'r1', status: 'missing' }], evidence: [] };
    const saved = { ...process.env };
    try {
      delete process.env.TRAILIE_WEB_SEARCH_PROVIDER;
      expect(planWebEvidenceFallbacks({ requirements: [requirement], structuredBundle: bundle })[0].preferredProviders).toEqual(['brave']);
      Object.assign(process.env, ON, { TRAILIE_WEB_SEARCH_PROVIDER: 'contextdev' });
      expect(planWebEvidenceFallbacks({ requirements: [requirement], structuredBundle: bundle })[0].preferredProviders).toEqual(['context_dev']);
    } finally {
      process.env = saved;
    }
  });
});

describe('official page reader', () => {
  const GLACIER = 'https://www.nps.gov/glac/planyourvisit/directions.htm';
  const requirement = {
    requirementId: 'v1', topic: 'vehicle_restrictions', evidenceTypes: ['rule'],
    entity: { entityId: 'nps:park:glac', displayName: 'Glacier National Park' },
    webScope: { sourceUrl: GLACIER },
  };

  test('falls back to the axios reader on any Context.dev failure', async () => {
    const reader = readerWithFallback(
      { fetchPage: async () => { throw Object.assign(new Error('down'), { code: 'context_dev_scrape_failed' }); } },
      { fetchPage: async (url) => ({ url, title: 't', text: 'axios text', status: 200, reader: 'axios' }) },
    );
    await expect(reader.fetchPage(GLACIER)).resolves.toMatchObject({ reader: 'axios', text: 'axios text' });
  });

  test('never falls back past the test tripwire', async () => {
    const fallback = { fetchPage: jest.fn() };
    const reader = readerWithFallback({ fetchPage: async () => { throw Object.assign(new Error('x'), { code: 'live_provider_forbidden_in_test' }); } }, fallback);
    await expect(reader.fetchPage(GLACIER)).rejects.toMatchObject({ code: 'live_provider_forbidden_in_test' });
    expect(fallback.fetchPage).not.toHaveBeenCalled();
  });

  test('a rule past the old 8000-char cut still reaches the deterministic parser', async () => {
    // Shape of the real Nov 2026 page: the limit sits deep in the page.
    const text = `# Directions, Transportation, & Road Conditions\n\n${'Travel information about the park. '.repeat(300)}\n\n`
      + '#### Are there vehicle size restrictions on Going-to-the-Sun Road?\n\n**Specific Vehicle Size Limits**\n\n'
      + 'Vehicles and vehicle combinations longer than 21 feet (including bumpers) or wider than 8 feet (including mirrors) are prohibited between Avalanche Creek and Rising Sun.';
    expect(text.indexOf('21 feet')).toBeGreaterThan(8000);
    const provider = createDirectOfficialPageEvidenceProvider({
      officialPageClient: { fetchPage: async (url) => ({ url, title: 'Directions - Glacier National Park', text, status: 200, reader: 'context_dev' }) },
      stageRaw: async () => ({ rawPayloadHash: 'h' }),
      now: () => NOW,
    });
    const request = provider.buildRequest(requirement);
    const fetched = await provider.fetch(request);
    const [row] = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(row.provenance.extractionMethod).toBe('direct_official_page_context_dev');
    expect(row.claim.normalizedValue.operationalFacts).toEqual([
      expect.objectContaining({ type: 'vehicle_dimension', dimension: { kind: 'length', maxLengthFeet: 21 } }),
    ]);
  });
});

describe('context_dev search provider', () => {
  const requirement = (topic) => ({
    requirementId: 'q', topic, evidenceTypes: ['fact'],
    entity: { entityId: 'nps:park:zion', displayName: 'Zion National Park' },
    temporalScope: { mode: 'current', requestedAt: NOW.toISOString() },
  });

  test('official-only topics are restricted to official hosts; passages only on Tavily-role topics', () => {
    const provider = createContextDevEvidenceProvider();
    const transit = provider.buildRequest(requirement('transit'));
    expect(transit.parameters).toMatchObject({ includeDomains: ['nps.gov', 'recreation.gov'], highlights: false });
    const overview = provider.buildRequest(requirement('overview'));
    expect(overview.parameters.includeDomains).toBeUndefined();
    expect(overview.parameters.highlights).toBe(true);
    expect(provider.buildRequest(requirement('alerts_closures')).parameters.freshness).toBe('last_week');
    expect(provider.supports(requirement('local_business'))).toBe(false);
  });

  test('drops off-host and low-relevance results; passage becomes bounded claim text', async () => {
    const search = jest.fn(async () => ({ results: [
      { url: 'https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm', title: 'Zion Canyon Shuttle System - Zion National Park', description: 'Shuttle', relevance: 'high', highlights: ['Zion Canyon shuttle runs Mar 7 to Nov 28.'] },
      { url: 'https://example.com/zion-shuttle', title: 'blog', relevance: 'high', highlights: [] },
      { url: 'https://www.nps.gov/zion/planyourvisit/parking.htm', title: 'Parking', relevance: 'low', highlights: [] },
    ], creditsUsed: 1 }));
    const provider = createContextDevEvidenceProvider({ contextDevClient: { search }, stageRaw: async () => ({ rawPayloadHash: 'h' }), now: () => NOW });
    const request = provider.buildRequest(requirement('transit'));
    const fetched = await provider.fetch(request);
    expect(fetched.raw.results.map((r) => r.url)).toEqual(['https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm']);
    const rows = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toMatchObject({ provider: 'context_dev', sourceClass: 'reputable_web' });
    expect(rows[0].claim.qualifiers).toContain('verify_source_page');
    // Second fetch is served from the query cache.
    await provider.fetch(request);
    expect(search).toHaveBeenCalledTimes(1);
  });
});

describe('monitor webhook', () => {
  const secret = 'whsec_test_secret';
  const sign = (body, t = Math.floor(NOW.getTime() / 1000), key = secret) =>
    `t=${t},v1=${createHmac('sha256', key).update(`${t}.`).update(body).digest('hex')}`;
  const nowSeconds = NOW.getTime() / 1000;

  test('verifies HMAC-SHA256 over "t.rawBody" and rejects tampering, wrong secret and stale timestamps', () => {
    const body = Buffer.from('{"id":"evt_1"}');
    expect(verifyContextDevSignature(body, sign(body), secret, { nowSeconds })).toBe(true);
    expect(verifyContextDevSignature(Buffer.from('{"id":"evt_2"}'), sign(body), secret, { nowSeconds })).toBe(false);
    expect(verifyContextDevSignature(body, sign(body, undefined, 'other'), secret, { nowSeconds })).toBe(false);
    expect(verifyContextDevSignature(body, sign(body, Math.floor(nowSeconds) - 301), secret, { nowSeconds })).toBe(false);
    expect(verifyContextDevSignature(body, 'garbage', secret, { nowSeconds })).toBe(false);
    expect(verifyContextDevSignature(body, sign(body), '', { nowSeconds })).toBe(false);
  });

  test('url variants cover slash, scheme, www and fragment differences', () => {
    const variants = urlVariants('https://www.nps.gov/glac/planyourvisit/directions.htm#top');
    expect(variants).toEqual(expect.arrayContaining([
      'https://www.nps.gov/glac/planyourvisit/directions.htm',
      'https://nps.gov/glac/planyourvisit/directions.htm',
      'https://www.nps.gov/glac/planyourvisit/directions.htm/',
    ]));
    expect(urlVariants('not a url')).toEqual([]);
  });

  test('only page-target change events invalidate', async () => {
    const invalidate = jest.fn(async () => ({ matched: 2, modified: 2 }));
    const page = { event: 'change.detected', data: { change: { target_type: 'page', url: 'https://www.nps.gov/glac/planyourvisit/directions.htm' } } };
    await expect(handleContextDevEvent(page, { invalidate, now: NOW })).resolves.toMatchObject({ action: 'invalidated', modified: 2 });
    await expect(handleContextDevEvent({ event: 'run.completed', data: {} }, { invalidate })).resolves.toMatchObject({ action: 'ignored' });
    await expect(handleContextDevEvent({ event: 'change.detected', data: { change: { target_type: 'sitemap' } } }, { invalidate })).resolves.toMatchObject({ action: 'ignored' });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  test('invalidation marks current rows read from the URL and pulls expiry forward', async () => {
    const updateMany = jest.fn(async () => ({ matchedCount: 3, modifiedCount: 3 }));
    const out = await invalidateEvidenceForSourceUrl({ url: 'https://www.nps.gov/glac/planyourvisit/directions.htm', now: NOW, EvidenceModel: { updateMany } });
    expect(out).toEqual({ matched: 3, modified: 3 });
    const [filter, update] = updateMany.mock.calls[0];
    expect(filter.isCurrent).toBe(true);
    expect(filter.$or[0]['source.url'].$in).toContain('https://www.nps.gov/glac/planyourvisit/directions.htm');
    expect(update).toEqual({ $set: { 'observation.invalidatedAt': NOW }, $min: { 'observation.expiresAt': NOW, 'observation.staleUntil': NOW } });
  });

  function fakeRes() {
    const res = { statusCode: null, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
  }
  function fakeReq(body, headers) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return { body, get: (name) => lower[name.toLowerCase()] };
  }

  test('route: verifies against any configured secret, checks the envelope, then handles', async () => {
    const event = { id: 'evt_9', event: 'change.detected', created_at: NOW.toISOString(), data: { change: { target_type: 'page', url: 'https://www.nps.gov/zion/x.htm' } } };
    const raw = Buffer.from(JSON.stringify(event));
    const t = Math.floor(Date.now() / 1000);
    const handle = jest.fn(async () => ({ action: 'invalidated' }));
    const handler = createContextDevWebhookHandler({ secrets: () => ['whsec_other', secret], handle, log: {} });

    const ok = fakeRes();
    await handler(fakeReq(raw, { 'X-Context-Signature': sign(raw, t), 'X-Context-Id': 'evt_9', 'X-Context-Event': 'change.detected' }), ok);
    expect(ok.statusCode).toBe(200);
    expect(handle).toHaveBeenCalledWith(event);

    const badSig = fakeRes();
    await handler(fakeReq(raw, { 'X-Context-Signature': sign(raw, t, 'nope'), 'X-Context-Id': 'evt_9', 'X-Context-Event': 'change.detected' }), badSig);
    expect(badSig.statusCode).toBe(401);

    const badEnvelope = fakeRes();
    await handler(fakeReq(raw, { 'X-Context-Signature': sign(raw, t), 'X-Context-Id': 'evt_other', 'X-Context-Event': 'change.detected' }), badEnvelope);
    expect(badEnvelope.statusCode).toBe(400);

    const unconfigured = fakeRes();
    await createContextDevWebhookHandler({ secrets: () => [], handle, log: {} })(fakeReq(raw, {}), unconfigured);
    expect(unconfigured.statusCode).toBe(503);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  test('secrets come from a comma-separated env list', () => {
    expect(configuredSecrets({ CONTEXT_DEV_WEBHOOK_SECRETS: 'whsec_a, whsec_b,', CONTEXT_DEV_WEBHOOK_SECRET: 'whsec_c' })).toEqual(['whsec_a', 'whsec_b', 'whsec_c']);
    expect(configuredSecrets({})).toEqual([]);
  });
});

describe('coverage: monitor-invalidated evidence', () => {
  const requirement = {
    requirementId: 'r', topic: 'roads', evidenceTypes: ['live_state'], criticality: 'soft',
    entity: { entityId: 'nps:park:glac' }, maxAgeSeconds: 900, maxStaleSeconds: 1800,
    minimumAuthorityClass: 'official_owner', acceptedSourceClasses: ['official_owner'],
    temporalScope: { mode: 'current', requestedAt: NOW.toISOString() },
  };
  const candidate = (observation) => ({
    evidenceId: 'e', entityId: 'nps:park:glac', topic: 'roads', evidenceType: 'live_state',
    claim: { text: 'Going-to-the-Sun Road is open.' },
    source: { provider: 'direct_official_page', sourceClass: 'official_owner' },
    quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
    scope: { geographicEntityIds: ['nps:park:glac'] },
    observation,
  });

  test('an observation invalidated after it was made is not usable, however young', () => {
    const observedAt = new Date(NOW.getTime() - 60000).toISOString();
    const fresh = evaluateRequirementCoverage(requirement, [candidate({ observedAt })], { now: NOW });
    const invalidated = evaluateRequirementCoverage(requirement, [candidate({ observedAt, invalidatedAt: NOW.toISOString() })], { now: NOW });
    expect(fresh.status).toBe('satisfied_fresh');
    expect(invalidated.status).not.toMatch(/^satisfied_/);
  });
});
