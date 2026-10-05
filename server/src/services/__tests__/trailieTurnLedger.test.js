'use strict';

const TrailieAiTurn = require('../../models/TrailieAiTurn');
const TrailieTurnPersistence = require('../../models/TrailieTurnPersistence');
const {
  claimPromptV2CanaryTurn,
  LEDGER_SCHEMA_VERSION,
  buildTurnLedgerEntry,
  normalizeUsage,
  priceProviderCall,
  markTurnPersistence,
  recordEvidenceBrokerShadowOutcome,
  recordIntentShadowOutcome,
  recordAuxiliaryCall,
  recordTurnFromAiLog,
  runWithTurnTelemetry,
} = require('../trailieTurnLedger');

const ROUTES = ['chat', 'chat-stream', 'chat-anonymous', 'chat-anonymous-stream'];

function baseEvent(route) {
  return {
    endpoint: route,
    userId: route.includes('anonymous') ? null : '64f000000000000000000001',
    responseId: `response-${route}`,
    responseVersion: 1,
    provider: 'claude',
    model: 'claude-sonnet-5',
    durationMs: 2400,
    earlyDelivery: route.endsWith('stream')
      ? { timeToItineraryReadyMs: 800, timeToProseReadyMs: 2100, timeToResponseCompleteMs: 2300 }
      : null,
    blocks: {
      intent: 'itinerary',
      npsFacts: true,
      weatherFacts: true,
      webSearch: false,
      conflicts: 0,
    },
    park: { code: 'yose', name: 'Yosemite National Park' },
    tokens: {
      inputTokens: 1000,
      outputTokens: 200,
      cacheCreationInputTokens: 100,
      cacheReadInputTokens: 400,
    },
    response: { length: 1200, hasItinerary: true },
    evidencePlannerShadow: {
      requirementCount: 6,
      topics: ['destination_identity', 'activities', 'weather_forecast'],
      hardCount: 1,
      requiredCount: 4,
      optionalCount: 1,
      freshnessClasses: ['stable', 'hourly'],
      plannerVersion: 'evidence-planner-v1.0.0',
      legacyProjection: { shouldFetch: { nps: true, weather: true } },
      actualLegacyFetchPlan: { shouldFetch: { nps: true, weather: true } },
      differences: [],
    },
    itineraryGenerationMeta: {
      structuredProvider: 'claude',
      structuredModel: 'claude-sonnet-5',
      structuredStatus: 'complete',
      structuredRecoveryUsed: true,
      structuredAttempts: [
        {
          attempt: 1,
          status: 'truncated',
          failureCode: 'truncated_tool_arguments',
          inputTokens: 600,
          outputTokens: 500,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 200,
          durationMs: 700,
          usageKnown: true,
        },
        {
          attempt: 2,
          status: 'complete',
          failureCode: null,
          inputTokens: 650,
          outputTokens: 550,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 250,
          durationMs: 800,
          usageKnown: true,
        },
      ],
      proseDurationMs: 900,
    },
    proseConsistencyMeta: {
      proseConsistencyStatus: 'retry_passed',
      deterministicFallbackUsed: false,
    },
    prompt: 'RAW PRIVATE PROMPT MUST NEVER PERSIST',
    fullResponse: 'RAW PRIVATE RESPONSE MUST NEVER PERSIST',
    ipAddress: '203.0.113.10',
    email: 'private@example.com',
  };
}

describe('provider-call pricing', () => {
  test('prices Claude input, cache read/write, and output independently using the active dated rate', () => {
    const priced = priceProviderCall({
      provider: 'claude',
      model: 'claude-sonnet-5',
      usage: {
        inputTokens: 1000,
        outputTokens: 100,
        cacheReadInputTokens: 500,
        cacheCreationInputTokens: 200,
      },
      at: new Date('2026-08-09T12:00:00.000Z'),
    });
    expect(priced.costStatus).toBe('priced');
    expect(priced.costUsd).toBeCloseTo(0.0036, 8);
  });

  test('does not double-charge OpenAI cached tokens included in prompt_tokens', () => {
    const priced = priceProviderCall({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      usage: { inputTokens: 2000, outputTokens: 100, cacheReadInputTokens: 500 },
      at: new Date('2026-08-09T12:00:00.000Z'),
    });
    expect(priced.costStatus).toBe('priced');
    expect(priced.costUsd).toBeCloseTo(0.0016125, 8);
  });

  test('prices the Luna shadow classifier with the dated API rate', () => {
    const priced = priceProviderCall({
      provider: 'openai',
      model: 'gpt-5.6-luna',
      usage: { inputTokens: 1000, outputTokens: 100, cacheReadInputTokens: 200 },
      at: new Date('2026-08-09T12:00:00.000Z'),
    });
    expect(priced.costStatus).toBe('priced');
    expect(priced.costUsd).toBeCloseTo(0.00142, 8);
  });

  test.each([
    ['gpt-5.6-terra', 0.0036125],
    ['gpt-5.6-sol', 0.007225],
  ])('prices %s Responses usage including cache reads and writes', (model, expected) => {
    const priced = priceProviderCall({
      provider: 'openai', model,
      usage: {
        inputTokens: 1000, outputTokens: 100,
        cachedInputTokens: 200, cacheCreationInputTokens: 100,
      },
      at: new Date('2026-08-09T12:00:00.000Z'),
    });
    expect(priced.costStatus).toBe('priced');
    expect(priced.costUsd).toBeCloseTo(expected, 8);
  });

  test('missing Responses usage remains unknown and never becomes zero', () => {
    const normalized = normalizeUsage({
      inputTokens: null, outputTokens: null, cachedInputTokens: null,
      cacheCreationInputTokens: null,
    });
    expect(normalized).toEqual({
      inputTokens: null, outputTokens: null, reasoningTokens: null,
      cachedTokens: null, cacheWriteTokens: null,
    });
    expect(priceProviderCall({
      provider: 'openai', model: 'gpt-5.6-terra', usage: normalized,
      at: new Date('2026-08-09T12:00:00.000Z'),
    })).toMatchObject({ costStatus: 'cost_unknown', costUsd: null });
  });

  test('unknown model pricing is explicit and never represented as zero cost', () => {
    const priced = priceProviderCall({
      provider: 'openai',
      model: 'unpriced-future-model',
      usage: { inputTokens: 1, outputTokens: 1 },
      at: new Date('2026-08-09T12:00:00.000Z'),
    });
    expect(priced).toMatchObject({ costStatus: 'cost_unknown', costUsd: null });
  });
});

describe('route-neutral sanitized turn contract', () => {
  test('persists the v2 deterministic intent contract instead of overloading legacy archetype intent', async () => {
    const event = baseEvent('chat');
    event.intentV2 = {
      version: 'trailie-intent-v2.0.0',
      source: 'deterministic',
      primaryIntent: 'simple_itinerary',
      verticals: ['itinerary'],
      depth: 'planning',
      freshness: 'current',
      actionability: 'planning',
      scope: 'single_destination',
      entities: [{ type: 'destination', role: 'target', canonicalId: 'park:nps:yose', confidence: 1 }],
      confidence: 0.97,
      reasonCodes: ['explicit_itinerary_request'],
      compound: false,
      requiresLunaShadow: false,
    };

    const saved = await recordTurnFromAiLog(event, {
      enabled: true,
      now: () => new Date('2026-08-09T12:00:00.000Z'),
    });

    expect(saved.intent.toObject()).toMatchObject({
      primary: 'simple_itinerary',
      verticals: ['itinerary'],
      depth: 'planning',
      freshness: 'current',
      actionability: 'planning',
      scope: 'single_destination',
      confidence: 0.97,
      reasonCodes: ['explicit_itinerary_request'],
      compound: false,
      shadowEligible: false,
      version: 'trailie-intent-v2.0.0',
    });
    expect(JSON.stringify(saved)).not.toContain(event.prompt);
  });

  test('appends Luna shadow cost and disagreement after the finalized row exists', async () => {
    const event = baseEvent('chat');
    event.responseId = 'response-luna-shadow';
    event.intentV2 = {
      version: 'trailie-intent-v2.0.0', source: 'deterministic', primaryIntent: 'general_qa',
      verticals: [], depth: 'quick', freshness: 'stable', actionability: 'informational',
      scope: 'general', entities: [], confidence: 0.62, reasonCodes: ['ambiguous_travel_request'],
      compound: false, requiresLunaShadow: true,
    };
    await recordTurnFromAiLog(event, { enabled: true, now: () => new Date('2026-08-09T12:00:00.000Z') });

    await recordIntentShadowOutcome({
      responseId: event.responseId,
      outcome: {
        eligible: true,
        attempted: true,
        status: 'complete',
        provider: 'openai',
        model: 'gpt-5.6-luna',
        durationMs: 90,
        usage: { inputTokens: 1000, outputTokens: 100, cacheReadInputTokens: 200 },
        classification: {
          version: 'trailie-intent-v2.0.0', source: 'luna_shadow', primaryIntent: 'destination_discovery',
          verticals: [], depth: 'standard', freshness: 'stable', actionability: 'recommendation',
          scope: 'general', entities: [], confidence: 0.84, reasonCodes: ['open_ended_destination_choice'],
          compound: false, requiresLunaShadow: false,
        },
        agreement: {
          primaryIntent: false, verticals: true, depth: false,
          freshness: true, actionability: false, scope: true,
        },
      },
      at: new Date('2026-08-09T12:00:01.000Z'),
    });

    const saved = await TrailieAiTurn.findOne({ responseId: event.responseId }).lean();
    expect(saved.intent.shadow).toMatchObject({
      attempted: true,
      status: 'complete',
      model: 'gpt-5.6-luna',
      primaryIntent: 'destination_discovery',
      agreement: { primaryIntent: false, verticals: true },
    });
    expect(saved.calls.at(-1)).toMatchObject({
      phase: 'intent_classification_shadow',
      provider: 'openai',
      model: 'gpt-5.6-luna',
      costStatus: 'priced',
    });
    expect(saved.costStatus).toBe('priced');
    expect(saved.costUsd).toBeGreaterThan(event.tokens.outputTokens / 1_000_000);
  });

  test.each(ROUTES)('%s produces the identical ledger schema', (route) => {
    const entry = buildTurnLedgerEntry(baseEvent(route), {
      now: () => new Date('2026-08-09T12:00:00.000Z'),
    });

    expect(Object.keys(entry).sort()).toEqual([
      'calls', 'costStatus', 'costUsd', 'createdAt', 'delivery', 'destinations',
      'evidence', 'feedback', 'intent', 'persistence', 'principalHash', 'responseId',
      'responseVersion', 'route', 'schemaVersion', 'userTier', 'validation',
    ].sort());
    expect(entry.schemaVersion).toBe(LEDGER_SCHEMA_VERSION);
    expect(entry.route).toBe(route);
    expect(entry.responseId).toBe(`response-${route}`);
    expect(entry.principalHash).toEqual(route.includes('anonymous') ? null : expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(entry.calls).toHaveLength(3);
    expect(entry.calls.map((call) => call.phase)).toEqual([
      'structured_generation', 'structured_generation', 'prose_generation',
    ]);
    expect(entry.calls[1].retry).toBe(true);
    expect(entry.costStatus).toBe('priced');
    expect(entry.costUsd).toBeGreaterThan(0);
    expect(entry.evidence).toMatchObject({
      requirementCount: 6,
      plannerShadow: {
        hardCount: 1,
        plannerVersion: 'evidence-planner-v1.0.0',
        differences: [],
      },
    });

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('RAW PRIVATE PROMPT');
    expect(serialized).not.toContain('RAW PRIVATE RESPONSE');
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('203.0.113.10');
    expect(serialized).not.toContain('64f000000000000000000001');
  });

  test('the WP4 planner summary is route-neutral and does not persist transient inputs', () => {
    const evidenceByRoute = ROUTES.map((route) => buildTurnLedgerEntry(baseEvent(route)).evidence);
    for (const evidence of evidenceByRoute.slice(1)) expect(evidence).toEqual(evidenceByRoute[0]);
    expect(JSON.stringify(evidenceByRoute)).not.toContain('userPrompt');
    expect(JSON.stringify(evidenceByRoute)).not.toContain('priorTripState');
  });

  test('missing usage makes the whole turn cost_unknown instead of understating spend', () => {
    const event = baseEvent('chat');
    event.itineraryGenerationMeta.structuredAttempts[0].usageKnown = false;
    event.itineraryGenerationMeta.structuredAttempts[0].inputTokens = null;
    event.itineraryGenerationMeta.structuredAttempts[0].outputTokens = null;
    const entry = buildTurnLedgerEntry(event);
    expect(entry.costStatus).toBe('cost_unknown');
    expect(entry.costUsd).toBeNull();
  });

  test('uses measured stream TTFT when no earlier itinerary checkpoint exists', () => {
    const event = baseEvent('chat-anonymous-stream');
    event.earlyDelivery = null;
    event.ttftMs = 350;
    const entry = buildTurnLedgerEntry(event, {
      now: () => new Date('2026-08-09T12:00:00.000Z'),
    });
    const proseCall = entry.calls.at(-1);
    expect(proseCall.ttftMs).toBe(350);
    expect(entry.delivery.firstUsefulAt.toISOString()).toBe('2026-08-09T11:59:57.950Z');
  });

  test('prices every discarded prose retry rather than only the selected draft', () => {
    const event = baseEvent('chat');
    event.proseConsistencyMeta.proseAttempts = [
      { attempt: 1, provider: 'claude', model: 'claude-sonnet-5', inputTokens: 800, outputTokens: 100, durationMs: 300, status: 'complete' },
      { attempt: 2, provider: 'claude', model: 'claude-sonnet-5', inputTokens: 850, outputTokens: 120, durationMs: 350, status: 'complete' },
    ];
    const entry = buildTurnLedgerEntry(event, {
      now: () => new Date('2026-08-09T12:00:00.000Z'),
    });
    const proseCalls = entry.calls.filter((call) => call.phase === 'prose_generation');
    expect(proseCalls).toHaveLength(2);
    expect(proseCalls[1].retry).toBe(true);
    expect(proseCalls.every((call) => call.costUsd > 0)).toBe(true);
  });

  test('persists one bounded ledger row without raw prompt or response fields', async () => {
    const saved = await recordTurnFromAiLog(baseEvent('chat'), {
      enabled: true,
      now: () => new Date('2026-08-09T12:00:00.000Z'),
    });
    expect(saved.responseId).toBe('response-chat');
    expect(await TrailieAiTurn.countDocuments({ responseId: 'response-chat' })).toBe(1);
    const raw = await TrailieAiTurn.findOne({ responseId: 'response-chat' }).lean();
    expect(JSON.stringify(raw)).not.toMatch(/RAW PRIVATE|private@example|203\.0\.113\.10/);
  });

  test('atomically grants only one Prompt-v2 canary claim per logical turn', async () => {
    const responseId = 'response-canary-claim';
    await recordTurnFromAiLog({ ...baseEvent('chat'), responseId }, { enabled: true });

    const claims = await Promise.all([
      claimPromptV2CanaryTurn({ responseId }),
      claimPromptV2CanaryTurn({ responseId }),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  test('appends bounded broker shadow metadata without claim/provider payload content', async () => {
    await recordTurnFromAiLog({ ...baseEvent('chat'), responseId: 'response-broker-shadow' }, { enabled: true });
    await recordEvidenceBrokerShadowOutcome({
      responseId: 'response-broker-shadow',
      outcome: {
        status: 'succeeded', attempted: true, durationMs: 25,
        requirementCount: 2, coverageStatuses: { satisfied_fresh: 2 },
        cacheStatuses: { fresh_hit: 2 }, providersUsed: ['nps'],
        reasonCodes: [], refreshKeyHashes: ['a'.repeat(64)],
        legacyFetchedNps: true, brokerTopicsCovered: ['overview', 'fees'],
        missingLegacyTopics: [], semanticCoverageMatch: true,
        promptV2Shadow: {
          status: 'succeeded', attempted: true,
          policyId: 'trailie-core-policy-v2', contractId: 'trailie-task-buddy-v2',
          legacyTokens: 8000, v2Tokens: 4200, staticTokenSavings: 3800, savingsPercent: 47.5,
          accounting: {
            tokenizerId: 'trailie_prompt_token_v1', coreTokens: 900, contractTokens: 150,
            evidenceTokens: 700, tripStateTokens: 600, historyTokens: 1000,
            userTokens: 850, totalTokens: 4200,
          },
          instructionCoverage: { authority: true, safety: true },
          outputComparisonStatus: 'not_run_shadow_prompt_only',
          prompt: 'PRIVATE COMBINED PROMPT',
          canary: {
            status: 'succeeded', attempted: true,
            authoritativeProvider: 'claude', authoritativeModel: 'claude-sonnet-5',
            canaryProvider: 'claude', canaryModel: 'claude-sonnet-5', exactModelMatch: true,
            promptTokens: 527, legacyPromptTokens: 8385,
            coreSourceTokens: 401, coreSectionTokens: 409, estimatedCostUsd: 0.012,
            usage: { inputTokens: 540, outputTokens: 120 },
            acceptance: { criticalRegressionCount: 0, passed: true },
            factuality: { issueCodes: [], regressionCodes: [] },
            constraintAdherence: { legacyScore: 1, canaryScore: 1, parity: true },
            outputContract: { parity: true, semanticWordingEqualityRequired: false },
            evidenceUtilization: {
              requiredEvidenceTopics: ['fees'], renderedEvidenceTopics: ['fees'],
              usedEvidenceTopics: ['fees'], missingRequiredTopics: [],
            },
            privacy: { violationCount: 0 },
            content: 'PRIVATE CANARY OUTPUT',
            rawPrompt: 'SENTINEL-RAW-PROMPT',
            renderedPrompt: 'SENTINEL-RENDERED-PROMPT',
            legacyPrompt: 'SENTINEL-LEGACY-PROMPT',
            userMessage: 'SENTINEL-USER-MESSAGE',
            history: 'SENTINEL-HISTORY',
            tripState: 'SENTINEL-TRIP-STATE',
            coordinates: 'SENTINEL-COORDINATES',
            address: 'SENTINEL-ADDRESS',
            providerRequest: 'SENTINEL-PROVIDER-PARAMS',
            rawResponse: 'SENTINEL-RAW-RESPONSE',
            rawException: 'SENTINEL-RAW-EXCEPTION',
            credential: 'SENTINEL-CREDENTIAL',
          },
        },
        rawProviderBody: 'PRIVATE PROVIDER BODY', claimText: 'PRIVATE CLAIM',
      },
    });
    const evidence = (await TrailieAiTurn.findOne({ responseId: 'response-broker-shadow' }).lean()).evidence;
    expect(evidence.brokerShadow).toMatchObject({
      status: 'succeeded', requirementCount: 2, providersUsed: ['nps'],
      refreshKeyHashes: ['a'.repeat(64)],
      promptV2Shadow: {
        status: 'succeeded', legacyTokens: 8000, v2Tokens: 4200,
        accounting: { totalTokens: 4200, tokenizerId: 'trailie_prompt_token_v1' },
        canary: {
          status: 'succeeded',
          authoritativeProvider: 'claude', authoritativeModel: 'claude-sonnet-5',
          canaryProvider: 'claude', canaryModel: 'claude-sonnet-5', exactModelMatch: true,
          promptTokens: 527, legacyPromptTokens: 8385,
          coreSourceTokens: 401, coreSectionTokens: 409,
          acceptance: { criticalRegressionCount: 0, passed: true },
          evidenceUtilization: { requiredEvidenceTopics: ['fees'], missingRequiredTopics: [] },
        },
      },
    });
    expect(JSON.stringify(evidence)).not.toMatch(/PRIVATE PROVIDER BODY|PRIVATE CLAIM|PRIVATE COMBINED PROMPT|PRIVATE CANARY OUTPUT|SENTINEL-/);
    const savedTurn = await TrailieAiTurn.findOne({ responseId: 'response-broker-shadow' }).lean();
    expect(savedTurn.calls.map((call) => call.phase)).toContain('prompt_v2_canary');
    expect(savedTurn.calls.find((call) => call.phase === 'prompt_v2_canary')).toMatchObject({
      provider: 'claude', model: 'claude-sonnet-5', inputTokens: 540, outputTokens: 120,
    });
    expect(savedTurn.calls.filter((call) => call.phase === 'prompt_v2_canary')).toHaveLength(1);
    expect(savedTurn.costUsd).toBeCloseTo(
      savedTurn.calls.reduce((sum, call) => sum + call.costUsd, 0),
      12
    );

    await recordEvidenceBrokerShadowOutcome({
      responseId: 'response-broker-shadow',
      outcome: { promptV2Shadow: { canary: { attempted: true } } },
    });
    const afterDuplicate = await TrailieAiTurn.findOne({ responseId: 'response-broker-shadow' }).lean();
    expect(afterDuplicate.calls.filter((call) => call.phase === 'prompt_v2_canary')).toHaveLength(1);
  });

  test('a failed canary attempt with missing usage is separately observable and makes total cost unknown', async () => {
    const responseId = 'response-canary-cost-unknown';
    await recordTurnFromAiLog({ ...baseEvent('chat'), responseId }, { enabled: true });
    await recordEvidenceBrokerShadowOutcome({
      responseId,
      outcome: {
        status: 'succeeded', attempted: true,
        promptV2Shadow: {
          status: 'failed', attempted: true,
          canary: {
            status: 'failed', attempted: true, reasonCode: 'provider_error',
            authoritativeProvider: 'openai', authoritativeModel: 'gpt-5.4-mini',
            canaryProvider: 'openai', canaryModel: 'gpt-5.4-mini', exactModelMatch: true,
            usage: null,
          },
        },
      },
    });
    const saved = await TrailieAiTurn.findOne({ responseId }).lean();
    const attempts = saved.calls.filter((call) => call.phase === 'prompt_v2_canary');
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ status: 'failed', costStatus: 'cost_unknown', costUsd: null });
    expect(saved).toMatchObject({ costStatus: 'cost_unknown', costUsd: null });
  });

  test('accumulates sanitized nested classifier/search calls in the active turn scope', async () => {
    const entry = await runWithTurnTelemetry(async () => {
      recordAuxiliaryCall({
        phase: 'web_search',
        provider: 'serper',
        model: null,
        durationMs: 85,
        status: 'complete',
        query: 'RAW PRIVATE SEARCH QUERY',
        resultSnippets: ['RAW PRIVATE RESULT'],
      });
      recordAuxiliaryCall({
        phase: 'intent_classifier',
        provider: 'claude',
        model: 'claude-sonnet-5',
        durationMs: 40,
        usage: { inputTokens: 100, outputTokens: 10 },
        status: 'complete',
      });
      return buildTurnLedgerEntry(baseEvent('chat'));
    });

    expect(entry.calls.slice(0, 2).map((call) => call.phase)).toEqual([
      'web_search', 'intent_classifier',
    ]);
    expect(entry.calls[0].costStatus).toBe('cost_unknown');
    expect(entry.calls[1].costStatus).toBe('priced');
    expect(entry.costStatus).toBe('cost_unknown');
    expect(JSON.stringify(entry)).not.toMatch(/RAW PRIVATE/);
  });

  test('reconciles persistence whether the browser save arrives before or after the turn row', async () => {
    await markTurnPersistence({
      responseId: 'response-before-ledger',
      attempted: true,
      status: 'created',
      responseRevision: 2,
      hashMatch: true,
      enabled: true,
    });
    await recordTurnFromAiLog({ ...baseEvent('chat'), responseId: 'response-before-ledger' }, { enabled: true });
    expect((await TrailieAiTurn.findOne({ responseId: 'response-before-ledger' }).lean()).persistence)
      .toMatchObject({ attempted: true, status: 'created', responseRevision: 2, hashMatch: true });

    await recordTurnFromAiLog({ ...baseEvent('chat'), responseId: 'response-after-ledger' }, { enabled: true });
    await markTurnPersistence({
      responseId: 'response-after-ledger',
      attempted: true,
      status: 'accepted',
      responseRevision: 1,
      hashMatch: true,
      enabled: true,
    });
    expect((await TrailieAiTurn.findOne({ responseId: 'response-after-ledger' }).lean()).persistence)
      .toMatchObject({ attempted: true, status: 'accepted', responseRevision: 1, hashMatch: true });
    expect(await TrailieTurnPersistence.countDocuments({})).toBe(2);
  });
});
