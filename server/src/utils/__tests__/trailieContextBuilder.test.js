const {
  createFactSlotMeta,
  buildTrailieContext,
  formatStructuredContextInjection,
  assignSlotConfidence,
  deriveRiskFlags,
  summarizeTrailieContext,
  maybeAttachDebugTrailieContext,
  SCHEMA_VERSION,
} = require('../trailieContextBuilder');

describe('createFactSlotMeta', () => {
  test('not_requested when fetch was not needed', () => {
    const meta = createFactSlotMeta(false, null);
    expect(meta.status).toBe('not_requested');
    expect(meta.data).toBeNull();
    expect(meta.source).toBeNull();
    expect(meta.confidence).toBe('unknown');
  });

  test('missing when requested but value is null', () => {
    const meta = createFactSlotMeta(true, null, { source: 'NPS', reason: 'api_down' });
    expect(meta.status).toBe('missing');
    expect(meta.data).toBeNull();
    expect(meta.reason).toBe('api_down');
    expect(meta.source).toBe('NPS');
    expect(meta.confidence).toBe('unknown');
  });

  test('available with empty array when requested and value is empty string', () => {
    const meta = createFactSlotMeta(true, '   ', { source: 'NPS' });
    expect(meta.status).toBe('available');
    expect(meta.data).toEqual([]);
    expect(meta.fetchedAt).toBeTruthy();
    expect(meta.confidence).toBe('high');
  });

  test('available with present marker when value exists', () => {
    const meta = createFactSlotMeta(true, 'forecast data', { source: 'OpenWeather' });
    expect(meta.status).toBe('available');
    expect(meta.data).toEqual({ present: true });
    expect(meta.fetchedAt).toBeTruthy();
    expect(meta.confidence).toBe('high');
  });
});

describe('assignSlotConfidence', () => {
  test('web search source is medium confidence', () => {
    const slot = assignSlotConfidence({
      status: 'available',
      source: 'Brave',
      fetchedAt: new Date().toISOString(),
      data: { present: true },
    });
    expect(slot.confidence).toBe('medium');
  });

  test('stale official data downgrades to medium', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const slot = assignSlotConfidence({
      status: 'available',
      source: 'NPS',
      fetchedAt: twoHoursAgo,
      data: { present: true },
    });
    expect(slot.confidence).toBe('medium');
  });
});

describe('buildTrailieContext', () => {
  const baseArgs = {
    provider: 'claude',
    lastUserMessage: 'Plan a 3-day Zion trip',
    constraints: {
      parkCode: 'zion',
      dates: { start: '2026-08-01', end: '2026-08-03', numDays: 3 },
      fitnessLevel: 'moderate',
      interests: ['hiking'],
      hasChildren: false,
      hasConstraints: true,
    },
    intent: { primaryIntent: 'adventurer', intents: [{ type: 'adventurer', confidence: 0.8 }] },
    preflightResult: { warnings: ['Peak season'], blockers: [] },
    conflicts: [],
    hypothetical: { isHypothetical: false },
    factsMeta: {
      weather: createFactSlotMeta(true, 'sunny', { source: 'OpenWeather' }),
      nps: createFactSlotMeta(true, 'alerts', { source: 'NPS' }),
      webSearch: createFactSlotMeta(false, null),
      feeFree: createFactSlotMeta(true, null, { source: 'feeFreeDaysService' }),
    },
    resolvedMetadata: { parkCode: 'zion', parkName: 'Zion National Park', lat: 37.2, lon: -113.0 },
    allExtractedParks: [{ parkCode: 'zion', parkName: 'Zion National Park' }],
    npsFacts: 'ACTIVE CLOSURES: none',
    weatherFacts: 'High 85F',
    webSearchFacts: null,
    feeFreeFacts: null,
    webSearchUnavailable: false,
    skipWebSearchForGuest: true,
  };

  test('includes schema version and provider mode', () => {
    const ctx = buildTrailieContext(baseArgs);
    expect(ctx.contextMeta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(ctx.contextMeta.schemaVersion).toBe('trailie-context-v2');
    expect(ctx.providerMode).toBe('buddy');
    expect(ctx.contextMeta.generatedAt).toBeTruthy();
    expect(ctx.contextMeta.tripStateCompleteness).toBeGreaterThan(0);
    expect(ctx.tripState).toBeTruthy();
    expect(ctx.tripState.destination.parkCode).toBe('zion');
  });

  test('openai provider maps to architect mode', () => {
    const ctx = buildTrailieContext({ ...baseArgs, provider: 'openai' });
    expect(ctx.providerMode).toBe('architect');
  });

  test('preflightPassed false when blockers present', () => {
    const ctx = buildTrailieContext({
      ...baseArgs,
      preflightResult: { warnings: [], blockers: ['Park closed'] },
    });
    expect(ctx.validation.preflightPassed).toBe(false);
    expect(ctx.validation.preflightBlockers).toEqual(['Park closed']);
  });

  test('does not treat missing NPS as confirmed empty', () => {
    const ctx = buildTrailieContext({
      ...baseArgs,
      npsFacts: null,
      factsMeta: {
        ...baseArgs.factsMeta,
        nps: createFactSlotMeta(true, null, { source: 'NPS', reason: 'api_down' }),
      },
    });
    expect(ctx.liveData.nps.status).toBe('missing');
    expect(ctx.liveData.nps.data).toBeNull();
  });

  test('guest web search stays not_requested with reason', () => {
    const ctx = buildTrailieContext(baseArgs);
    expect(ctx.liveData.webSearch.status).toBe('not_requested');
    expect(ctx.liveData.webSearch.reason).toBe('guest_account_web_search_disabled');
    expect(ctx.liveData.webSearch.data).toBeNull();
  });

  test('multi-park NPS available when prose present', () => {
    const ctx = buildTrailieContext({
      ...baseArgs,
      allExtractedParks: [
        { parkCode: 'zion', parkName: 'Zion' },
        { parkCode: 'brca', parkName: 'Bryce Canyon' },
      ],
      npsFacts: '[Zion]\nalerts\n\n[Bryce]\nalerts',
    });
    expect(ctx.liveData.nps.status).toBe('available');
    expect(ctx.liveData.nps.data.parks).toEqual(['zion', 'brca']);
    expect(ctx.liveData.nps.confidence).toBe('high');
  });

  test('live data slots include confidence', () => {
    const ctx = buildTrailieContext(baseArgs);
    expect(ctx.liveData.weather.confidence).toBe('high');
    expect(ctx.liveData.nps.confidence).toBe('high');
    expect(ctx.liveData.webSearch.confidence).toBe('unknown');
  });

  test('riskFlags include structured closure and weather_missing hints', () => {
    const ctx = buildTrailieContext({
      ...baseArgs,
      npsFacts: 'ACTIVE CLOSURE: Angels Landing trail closed',
      weatherFacts: null,
      factsMeta: {
        ...baseArgs.factsMeta,
        weather: createFactSlotMeta(true, null, { source: 'OpenWeather', reason: 'api_down' }),
      },
    });

    const types = ctx.validation.riskFlags.map((f) => f.type);
    expect(types).toContain('closure');
    expect(types).toContain('weather_missing');
    expect(ctx.validation.riskFlags[0]).toMatchObject({
      severity: expect.any(String),
      message: expect.any(String),
    });
  });
});

describe('extreme_heat risk flags', () => {
  const {
    deriveRiskFlags,
    parseWeatherHighF,
    deriveSeasonalHeatRiskFlags,
  } = require('../trailieContextBuilder');

  test('Death Valley July weather at 101F creates extreme_heat riskFlag', () => {
    const flags = deriveRiskFlags({
      preflightResult: { warnings: [], blockers: [] },
      conflicts: [],
      liveData: {
        weather: { status: 'available', confidence: 'high' },
        park: { parkCode: 'deva' },
      },
      npsFacts: null,
      weatherFacts: 'High: 101°F. Dangerously hot conditions expected.',
      resolvedMetadata: { parkCode: 'deva' },
      lastUserMessage: 'Is it safe to hike Death Valley in late July at sunrise?',
    });

    expect(flags.some((f) => f.type === 'extreme_heat')).toBe(true);
    expect(parseWeatherHighF('High: 101°F')).toBe(101);
  });

  test('Death Valley summer gets seasonal extreme_heat even without weather parse', () => {
    const seasonal = deriveSeasonalHeatRiskFlags({
      parkCode: 'deva',
      lastUserMessage: 'Death Valley hike in August',
      constraints: {},
      metadata: {},
      tripState: { dates: { season: null } },
    });

    expect(seasonal).toEqual([
      expect.objectContaining({
        type: 'extreme_heat',
        severity: 'high',
        source: 'seasonal_rules',
      }),
    ]);
  });

  test('desert parks use lower heat threshold', () => {
    const flags = deriveRiskFlags({
      preflightResult: { warnings: [], blockers: [] },
      conflicts: [],
      liveData: {
        weather: { status: 'available', confidence: 'high' },
        park: { parkCode: 'zion' },
      },
      weatherFacts: 'Forecast high 92F',
      resolvedMetadata: { parkCode: 'zion' },
      lastUserMessage: 'Zion in July',
    });

    expect(flags.some((f) => f.type === 'extreme_heat')).toBe(true);
  });
});

describe('feeFree semantics', () => {
  const { buildTrailieContext, isFeeFreeRelevant, normalizeFeeFreeMeta } = require('../trailieContextBuilder');

  test('non-fee query with no dates marks feeFree as not_requested', () => {
    const ctx = buildTrailieContext({
      provider: 'claude',
      lastUserMessage: 'Compare Arches and Canyonlands for photography',
      constraints: { hasConstraints: false },
      intent: { intents: [] },
      preflightResult: { warnings: [], blockers: [] },
      conflicts: [],
      hypothetical: { isHypothetical: false },
      factsMeta: {
        feeFree: createFactSlotMeta(true, null, { source: 'feeFreeDaysService' }),
      },
      resolvedMetadata: {},
      allExtractedParks: [],
      skipWebSearchForGuest: true,
    });

    expect(ctx.liveData.feeFree.status).toBe('not_requested');
    expect(ctx.liveData.feeFree.reason).toBe('fee_free_data_not_relevant_to_this_turn');
  });

  test('fee/pass query marks feeFree available when overlap data exists', () => {
    const ctx = buildTrailieContext({
      provider: 'claude',
      lastUserMessage: 'Are there any fee-free entrance days this year?',
      constraints: { hasConstraints: false },
      intent: { intents: [] },
      preflightResult: { warnings: [], blockers: [] },
      conflicts: [],
      hypothetical: { isHypothetical: false },
      factsMeta: {
        feeFree: createFactSlotMeta(true, { hasOverlap: true, days: [] }, { source: 'feeFreeDaysService' }),
      },
      feeFreeFacts: { hasOverlap: true, days: [{ date: '2026-11-11', label: 'Veterans Day' }] },
      resolvedMetadata: {},
      allExtractedParks: [],
      skipWebSearchForGuest: true,
    });

    expect(ctx.liveData.feeFree.status).toBe('available');
    expect(ctx.liveData.feeFree.confidence).toBe('high');
  });

  test('trip dates with no overlap marks feeFree available with empty data', () => {
    const slot = normalizeFeeFreeMeta({
      factsMeta: {
        feeFree: createFactSlotMeta(true, null, { source: 'feeFreeDaysService' }),
      },
      feeFreeFacts: null,
      lastUserMessage: 'Plan my Yellowstone trip in October',
      constraints: { dates: { start: '2026-10-10', end: '2026-10-14' }, hasConstraints: true },
      metadata: {},
      tripState: { dates: { startDate: '2026-10-10', season: 'october' } },
    });

    expect(isFeeFreeRelevant({
      lastUserMessage: 'Plan my Yellowstone trip in October',
      constraints: { dates: { start: '2026-10-10' } },
      metadata: {},
      tripState: { dates: { startDate: '2026-10-10', season: 'october' } },
    })).toBe(true);
    expect(slot.status).toBe('available');
    expect(slot.data).toEqual([]);
  });

  test('fee/pass query with fetch failure stays missing', () => {
    const slot = normalizeFeeFreeMeta({
      factsMeta: {
        feeFree: createFactSlotMeta(true, null, { source: 'feeFreeDaysService', reason: 'api_down' }),
      },
      feeFreeFacts: null,
      lastUserMessage: 'What are the fee-free days this year?',
      constraints: { hasConstraints: false },
      metadata: {},
      tripState: {},
    });

    expect(slot.status).toBe('missing');
    expect(slot.reason).toBe('api_down');
  });
});

describe('summarizeTrailieContext', () => {
  test('returns compact debug summary', () => {
    const ctx = buildTrailieContext({
      provider: 'claude',
      lastUserMessage: 'Zion trip',
      constraints: { parkCode: 'zion', hasConstraints: true },
      intent: { primaryIntent: 'adventurer', intents: [] },
      preflightResult: { warnings: [], blockers: [] },
      conflicts: [],
      hypothetical: { isHypothetical: false },
      factsMeta: {},
      resolvedMetadata: { parkCode: 'zion', parkName: 'Zion' },
      allExtractedParks: [{ parkCode: 'zion', parkName: 'Zion' }],
      npsFacts: 'alerts',
      weatherFacts: null,
      webSearchFacts: null,
      feeFreeFacts: null,
      skipWebSearchForGuest: true,
    });

    const summary = summarizeTrailieContext(ctx);
    expect(summary.schemaVersion).toBe('trailie-context-v2');
    expect(summary.liveDataStatuses).toBeTruthy();
    expect(summary.riskFlagCount).toBeGreaterThanOrEqual(0);
    expect(summary.tripStateCompleteness).toBeGreaterThanOrEqual(0);
  });
});

describe('maybeAttachDebugTrailieContext', () => {
  const originalEnv = process.env.TRAILIE_DEBUG_CONTEXT;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.TRAILIE_DEBUG_CONTEXT;
    else process.env.TRAILIE_DEBUG_CONTEXT = originalEnv;
  });

  test('does not attach debug summary unless env flag is true', () => {
    delete process.env.TRAILIE_DEBUG_CONTEXT;
    const payload = maybeAttachDebugTrailieContext({ content: 'hi' }, { providerMode: 'buddy' });
    expect(payload.debugTrailieContext).toBeUndefined();
  });

  test('attaches debug summary when TRAILIE_DEBUG_CONTEXT=true', () => {
    process.env.TRAILIE_DEBUG_CONTEXT = 'true';
    const ctx = buildTrailieContext({
      provider: 'openai',
      lastUserMessage: 'test',
      constraints: { hasConstraints: false },
      intent: { intents: [] },
      preflightResult: { warnings: [], blockers: [] },
      conflicts: [],
      hypothetical: { isHypothetical: false },
      factsMeta: {},
      resolvedMetadata: {},
      allExtractedParks: [],
      skipWebSearchForGuest: false,
    });
    const payload = maybeAttachDebugTrailieContext({ content: 'hi' }, ctx);
    expect(payload.debugTrailieContext).toBeTruthy();
    expect(payload.debugTrailieContext.providerMode).toBe('architect');
  });
});

describe('formatStructuredContextInjection', () => {
  test('wraps JSON in markers', () => {
    const block = formatStructuredContextInjection({ foo: 'bar' });
    expect(block).toContain('--- STRUCTURED_CONTEXT_JSON ---');
    expect(block).toContain('--- END STRUCTURED_CONTEXT_JSON ---');
    expect(block).toContain('"foo": "bar"');
  });
});
