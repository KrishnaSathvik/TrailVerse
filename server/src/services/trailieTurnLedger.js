'use strict';

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const TrailieAiTurn = require('../models/TrailieAiTurn');
const TrailieTurnPersistence = require('../models/TrailieTurnPersistence');
const {
  PRICING_REGISTRY_VERSION,
  resolveModelPrice,
} = require('../config/trailiePricingRegistry');

const LEDGER_SCHEMA_VERSION = 1;
const CHAT_ROUTES = new Set(['chat', 'chat-stream', 'chat-anonymous', 'chat-anonymous-stream']);
const turnStorage = new AsyncLocalStorage();

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function hashPrincipal(userId) {
  if (!userId) return null;
  const secret = process.env.TRAILIE_TELEMETRY_HASH_SALT || process.env.JWT_SECRET;
  if (!secret) throw new Error('trailie_telemetry_hash_salt_missing');
  return crypto.createHmac('sha256', secret).update(`trailie-turn:${userId}`).digest('hex');
}

function normalizeUsage(usage) {
  if (!usage) return null;
  return {
    inputTokens: finiteOrNull(usage.inputTokens ?? usage.actualInputTokens ?? usage.input_tokens ?? usage.prompt_tokens),
    outputTokens: finiteOrNull(usage.outputTokens ?? usage.actualOutputTokens ?? usage.output_tokens ?? usage.completion_tokens),
    reasoningTokens: finiteOrNull(usage.reasoningTokens ?? usage.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens),
    cachedTokens: finiteOrNull(
      usage.cacheReadInputTokens ?? usage.cachedTokens ?? usage.cache_read_input_tokens ??
      usage.cachedInputTokens ?? usage.input_tokens_details?.cached_tokens ??
      usage.prompt_tokens_details?.cached_tokens
    ),
    cacheWriteTokens: finiteOrNull(
      usage.cacheCreationInputTokens ?? usage.cacheWriteTokens ?? usage.cache_creation_input_tokens ??
      usage.input_tokens_details?.cache_write_tokens
    ),
  };
}

function priceProviderCall({ provider, model, usage, at = new Date() }) {
  const normalized = normalizeUsage(usage);
  const price = resolveModelPrice({ provider, model, at });
  if (!normalized || !price || normalized.inputTokens == null || normalized.outputTokens == null) {
    return { costStatus: 'cost_unknown', costUsd: null, pricingVersion: price ? PRICING_REGISTRY_VERSION : null };
  }

  const cached = normalized.cachedTokens || 0;
  const cacheWrite = normalized.cacheWriteTokens || 0;
  if (cacheWrite > 0 && price.cacheWritePerMillion == null) {
    return { costStatus: 'cost_unknown', costUsd: null, pricingVersion: PRICING_REGISTRY_VERSION };
  }
  const billableInput = price.inputIncludesCachedTokens
    ? Math.max(0, normalized.inputTokens - cached - cacheWrite)
    : normalized.inputTokens;
  const reasoning = Math.min(normalized.outputTokens, normalized.reasoningTokens || 0);
  const components = {
    input: billableInput * price.inputPerMillion / 1_000_000,
    cacheRead: cached * price.cacheReadPerMillion / 1_000_000,
    cacheWrite: cacheWrite * (price.cacheWritePerMillion || 0) / 1_000_000,
    output: (normalized.outputTokens - reasoning) * price.outputPerMillion / 1_000_000,
    reasoning: reasoning * price.outputPerMillion / 1_000_000,
  };
  return {
    costStatus: 'priced',
    costUsd: Object.values(components).reduce((sum, cost) => sum + cost, 0),
    components,
    pricingVersion: PRICING_REGISTRY_VERSION,
  };
}

function buildCall({ phase, provider, model, usage, ttftMs, durationMs, status, attempt = 1, errorCode = null, at }) {
  const tokens = normalizeUsage(usage) || {};
  const priced = priceProviderCall({ provider, model, usage, at });
  return {
    phase,
    provider: provider || null,
    model: model || null,
    serviceTier: null,
    startedAt: null,
    ttftMs: finiteOrNull(ttftMs),
    durationMs: finiteOrNull(durationMs),
    inputTokens: tokens.inputTokens ?? null,
    outputTokens: tokens.outputTokens ?? null,
    reasoningTokens: tokens.reasoningTokens ?? null,
    cachedTokens: tokens.cachedTokens ?? null,
    cacheWriteTokens: tokens.cacheWriteTokens ?? null,
    costUsd: priced.costUsd,
    costComponents: priced.components || null,
    costStatus: priced.costStatus,
    pricingVersion: priced.pricingVersion,
    status: status || 'complete',
    retry: attempt > 1,
    fallback: false,
    errorCode: errorCode || null,
  };
}

function boundedSlug(value, fallback = null) {
  if (typeof value !== 'string') return fallback;
  const safe = value.toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_').slice(0, 80);
  return safe || fallback;
}

function runWithTurnTelemetry(fn) {
  return turnStorage.run({ auxiliaryCalls: [] }, fn);
}

function recordAuxiliaryCall(call = {}) {
  const store = turnStorage.getStore();
  if (!store) return false;
  store.auxiliaryCalls.push({
    phase: boundedSlug(call.phase, 'auxiliary'),
    provider: boundedSlug(call.provider),
    model: boundedSlug(call.model),
    usage: normalizeUsage(call.usage),
    ttftMs: finiteOrNull(call.ttftMs),
    durationMs: finiteOrNull(call.durationMs),
    status: boundedSlug(call.status, 'complete'),
    retry: call.retry === true,
    fallback: call.fallback === true,
    errorCode: boundedSlug(call.errorCode),
  });
  return true;
}

function trailieTurnTelemetryScope(req, _res, next) {
  const route = String(req.path || '').replace(/^\//, '');
  if (req.method !== 'POST' || !CHAT_ROUTES.has(route)) return next();
  return runWithTurnTelemetry(next);
}

function callsFromEvent(event, at) {
  const generation = event.itineraryGenerationMeta || {};
  const auxiliaryCalls = turnStorage.getStore()?.auxiliaryCalls || [];
  const calls = auxiliaryCalls.map((call) => {
    const built = buildCall({ ...call, at });
    built.retry = call.retry;
    built.fallback = call.fallback;
    return built;
  });
  calls.push(...(generation.structuredAttempts || []).map((attempt) => buildCall({
    phase: 'structured_generation',
    provider: generation.structuredProvider || event.provider,
    model: generation.structuredModel || event.model,
    usage: attempt.usageKnown === false ? null : {
      inputTokens: attempt.inputTokens,
      outputTokens: attempt.outputTokens,
      cacheCreationInputTokens: attempt.cacheCreationInputTokens,
      cacheReadInputTokens: attempt.cacheReadInputTokens,
    },
    durationMs: attempt.durationMs,
    status: attempt.status,
    attempt: attempt.attempt,
    errorCode: attempt.failureCode,
    at,
  })));

  const proseAttempts = event.proseConsistencyMeta?.proseAttempts || [];
  if (proseAttempts.length > 0) {
    for (const attempt of proseAttempts) {
      calls.push(buildCall({
        phase: 'prose_generation',
        provider: attempt.provider || event.provider,
        model: attempt.model || event.model,
        usage: {
          inputTokens: attempt.inputTokens,
          outputTokens: attempt.outputTokens,
          reasoningTokens: attempt.reasoningTokens,
          cacheCreationInputTokens: attempt.cacheCreationInputTokens,
          cacheReadInputTokens: attempt.cacheReadInputTokens,
        },
        ttftMs: attempt.ttftMs,
        durationMs: attempt.durationMs,
        status: attempt.status,
        attempt: attempt.attempt,
        errorCode: attempt.errorCode,
        at,
      }));
    }
  } else {
    calls.push(buildCall({
      phase: 'prose_generation',
      provider: event.provider,
      model: event.model,
      usage: event.tokens,
      ttftMs: event.ttftMs,
      durationMs: generation.proseDurationMs ?? event.durationMs,
      status: event.error ? 'failed' : 'complete',
      errorCode: event.errorCode || (event.error ? 'provider_error' : null),
      at,
    }));
  }
  return calls;
}

function offsetDate(finalizedAt, elapsedMs) {
  if (!Number.isFinite(elapsedMs)) return null;
  return new Date(finalizedAt.getTime() - Math.max(0, elapsedMs));
}

function intentFromEvent(event, block, evidenceCount) {
  const intentV2 = event.intentV2;
  if (intentV2?.version === 'trailie-intent-v2.0.0') {
    return {
      primary: intentV2.primaryIntent,
      verticals: intentV2.verticals,
      depth: intentV2.depth,
      freshness: intentV2.freshness,
      actionability: intentV2.actionability,
      scope: intentV2.scope,
      entities: intentV2.entities,
      confidence: intentV2.confidence,
      reasonCodes: intentV2.reasonCodes,
      compound: intentV2.compound,
      shadowEligible: intentV2.requiresLunaShadow,
      shadow: null,
      version: intentV2.version,
    };
  }
  return {
    primary: typeof block.intent === 'string' ? block.intent : null,
    verticals: [],
    depth: event.response?.hasItinerary ? 'itinerary' : 'answer',
    freshness: evidenceCount > 0 ? 'fetched' : 'none',
    actionability: null,
    scope: null,
    entities: [],
    confidence: null,
    reasonCodes: [],
    compound: false,
    shadowEligible: false,
    shadow: null,
    version: 'legacy-intent-v1',
  };
}

function plannerShadowFromEvent(value) {
  if (!value || typeof value !== 'object' || value.plannerVersion !== 'evidence-planner-v1.0.0') return null;
  const boundedList = (items, limit = 40) => (Array.isArray(items) ? items : [])
    .slice(0, limit)
    .map((item) => boundedSlug(item))
    .filter(Boolean);
  const safePlan = (plan = {}) => ({
    shouldFetch: Object.fromEntries(
      ['nps', 'weather', 'web', 'events', 'transit', 'permits', 'astro', 'feeFree']
        .map((key) => [key, plan.shouldFetch?.[key] === true])
    ),
    queryTypes: boundedList(plan.queryTypes, 20),
    intentFlags: Object.fromEntries(
      ['events', 'transit', 'permits'].map((key) => [key, plan.intentFlags?.[key] === true])
    ),
    blockedFetches: (Array.isArray(plan.blockedFetches) ? plan.blockedFetches : []).slice(0, 20).map((item) => ({
      type: boundedSlug(item?.type, 'unknown'),
      reason: boundedSlug(item?.reason, 'unknown'),
    })),
    confidence: boundedSlug(plan.confidence, 'low'),
  });
  const differences = (Array.isArray(value.differences) ? value.differences : []).slice(0, 80).map((item) => ({
    reasonCode: boundedSlug(item?.reasonCode, 'unknown'),
    field: boundedSlug(item?.field, 'unknown'),
    ...(item?.value != null ? { value: boundedSlug(item.value, 'unknown') } : {}),
    ...(item?.direction != null ? { direction: boundedSlug(item.direction, 'unknown') } : {}),
    ...(typeof item?.projected === 'boolean' ? { projected: item.projected } : {}),
    ...(typeof item?.legacy === 'boolean' ? { legacy: item.legacy } : {}),
  }));
  return {
    requirementCount: Math.max(0, finiteOrNull(value.requirementCount) || 0),
    topics: boundedList(value.topics),
    hardCount: Math.max(0, finiteOrNull(value.hardCount) || 0),
    requiredCount: Math.max(0, finiteOrNull(value.requiredCount) || 0),
    optionalCount: Math.max(0, finiteOrNull(value.optionalCount) || 0),
    freshnessClasses: boundedList(value.freshnessClasses, 10),
    plannerVersion: 'evidence-planner-v1.0.0',
    legacyProjection: safePlan(value.legacyProjection),
    actualLegacyFetchPlan: safePlan(value.actualLegacyFetchPlan),
    differences,
  };
}

function buildTurnLedgerEntry(event, { now = () => new Date() } = {}) {
  if (!CHAT_ROUTES.has(event?.endpoint)) throw new Error('unsupported_trailie_telemetry_route');
  const createdAt = new Date(now());
  const durationMs = finiteOrNull(event.durationMs);
  const startedAt = offsetDate(createdAt, durationMs) || createdAt;
  const early = event.earlyDelivery || {};
  const calls = callsFromEvent(event, createdAt);
  const costKnown = calls.every((call) => call.costStatus === 'priced');
  const block = event.blocks || {};
  const evidenceCount = ['npsFacts', 'weatherFacts', 'webSearch', 'feeFree']
    .filter((key) => block[key] === true).length;
  const plannerShadow = plannerShadowFromEvent(event.evidencePlannerShadow);

  return {
    responseId: String(event.responseId || crypto.randomUUID()),
    responseVersion: Number.isFinite(Number(event.responseVersion)) ? Number(event.responseVersion) : 1,
    route: event.endpoint,
    userTier: event.userId ? 'authenticated' : 'guest',
    principalHash: hashPrincipal(event.userId),
    intent: intentFromEvent(event, block, evidenceCount),
    destinations: event.park?.code
      ? [{ entityId: `park:nps:${String(event.park.code).toLowerCase()}`, type: 'national_park' }]
      : [],
    evidence: {
      requirementCount: plannerShadow?.requirementCount ?? evidenceCount,
      hardCoverage: null,
      requiredCoverage: null,
      evidenceIds: [],
      cacheHits: 0,
      staleHits: 0,
      misses: 0,
      refreshes: 0,
      coalesced: 0,
      conflicts: finiteOrNull(block.conflicts) || 0,
      missingReasonCodes: [],
      plannerShadow,
    },
    calls,
    validation: {
      structuredStatus: event.itineraryGenerationMeta?.structuredStatus || null,
      issueCodes: [],
      corrections: [],
      planScore: finiteOrNull(event.planScore),
      consistencyStatus: event.proseConsistencyMeta?.proseConsistencyStatus || null,
      deterministicFallback: event.proseConsistencyMeta?.deterministicFallbackUsed === true,
    },
    delivery: {
      startedAt,
      firstProgressAt: event.endpoint.endsWith('stream') ? startedAt : null,
      firstUsefulAt: offsetDate(createdAt, (() => {
        const firstUsefulMs = Number.isFinite(early.timeToItineraryReadyMs)
          ? early.timeToItineraryReadyMs
          : finiteOrNull(event.ttftMs);
        if (durationMs == null || firstUsefulMs == null) return 0;
        return Math.max(0, durationMs - firstUsefulMs);
      })()),
      finalizedAt: createdAt,
      aborted: false,
    },
    persistence: {
      attempted: false,
      status: 'client_owned_not_observed',
      responseRevision: null,
      hashMatch: null,
    },
    feedback: null,
    costUsd: costKnown ? calls.reduce((sum, call) => sum + call.costUsd, 0) : null,
    costStatus: costKnown ? 'priced' : 'cost_unknown',
    schemaVersion: LEDGER_SCHEMA_VERSION,
    createdAt,
  };
}

async function recordTurnFromAiLog(event, {
  enabled = process.env.TRAILIE_V2_TELEMETRY_ENABLED === 'true',
  now,
} = {}) {
  if (!enabled || !CHAT_ROUTES.has(event?.endpoint)) return null;
  const entry = buildTurnLedgerEntry(event, { ...(now ? { now } : {}) });
  const receiptBefore = await TrailieTurnPersistence.findOne({ responseId: entry.responseId }).lean();
  if (receiptBefore) {
    entry.persistence = {
      attempted: receiptBefore.attempted,
      status: receiptBefore.status,
      responseRevision: receiptBefore.responseRevision ?? null,
      hashMatch: receiptBefore.hashMatch ?? null,
    };
  }
  let saved = await TrailieAiTurn.findOneAndUpdate(
    { responseId: entry.responseId },
    { $setOnInsert: entry },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  // Close both race orders: the browser persistence receipt may have landed
  // while the turn row was being inserted.
  const receiptAfter = await TrailieTurnPersistence.findOne({ responseId: entry.responseId }).lean();
  if (receiptAfter) {
    saved = await TrailieAiTurn.findOneAndUpdate(
      { responseId: entry.responseId },
      {
        $set: {
          persistence: {
            attempted: receiptAfter.attempted,
            status: receiptAfter.status,
            responseRevision: receiptAfter.responseRevision ?? null,
            hashMatch: receiptAfter.hashMatch ?? null,
          },
        },
      },
      { new: true }
    );
  }
  return saved;
}

async function claimPromptV2CanaryTurn({ responseId } = {}) {
  if (!responseId) return false;
  const claimed = await TrailieAiTurn.findOneAndUpdate(
    {
      responseId: String(responseId),
      'evidence.promptV2CanaryClaimed': { $ne: true },
    },
    { $set: { 'evidence.promptV2CanaryClaimed': true } },
    { new: true }
  );
  return Boolean(claimed);
}

async function markTurnPersistence({
  responseId,
  attempted,
  status,
  responseRevision = null,
  hashMatch = null,
  enabled = process.env.TRAILIE_V2_TELEMETRY_ENABLED === 'true',
} = {}) {
  if (!enabled || !responseId) return null;
  const receipt = {
    responseId: String(responseId),
    attempted: attempted === true,
    status: boundedSlug(status, 'unknown'),
    responseRevision: finiteOrNull(responseRevision),
    hashMatch: typeof hashMatch === 'boolean' ? hashMatch : null,
    observedAt: new Date(),
  };
  await TrailieTurnPersistence.findOneAndUpdate(
    { responseId: receipt.responseId },
    { $set: receipt },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await TrailieAiTurn.updateOne(
    { responseId: receipt.responseId },
    {
      $set: {
        persistence: {
          attempted: receipt.attempted,
          status: receipt.status,
          responseRevision: receipt.responseRevision,
          hashMatch: receipt.hashMatch,
        },
      },
    }
  );
  return receipt;
}

async function recordIntentShadowOutcome({ responseId, outcome, at = new Date() } = {}) {
  if (!responseId || !outcome) return null;
  const shadow = {
    eligible: outcome.eligible === true,
    attempted: outcome.attempted === true,
    status: boundedSlug(outcome.status, 'unknown'),
    provider: boundedSlug(outcome.provider),
    model: boundedSlug(outcome.model),
    durationMs: finiteOrNull(outcome.durationMs),
    primaryIntent: boundedSlug(outcome.classification?.primaryIntent),
    verticals: Array.isArray(outcome.classification?.verticals)
      ? outcome.classification.verticals.map((value) => boundedSlug(value)).filter(Boolean)
      : [],
    confidence: finiteOrNull(outcome.classification?.confidence),
    agreement: outcome.agreement ? {
      primaryIntent: outcome.agreement.primaryIntent === true,
      verticals: outcome.agreement.verticals === true,
      depth: outcome.agreement.depth === true,
      freshness: outcome.agreement.freshness === true,
      actionability: outcome.agreement.actionability === true,
      scope: outcome.agreement.scope === true,
    } : null,
    errorCode: boundedSlug(outcome.errorCode),
  };
  const update = { $set: { 'intent.shadow': shadow } };
  if (outcome.attempted === true) {
    update.$push = {
      calls: buildCall({
        phase: 'intent_classification_shadow',
        provider: outcome.provider,
        model: outcome.model,
        usage: outcome.usage,
        durationMs: outcome.durationMs,
        status: outcome.status,
        errorCode: outcome.errorCode,
        at,
      }),
    };
  }
  let saved = await TrailieAiTurn.findOneAndUpdate(
    { responseId: String(responseId), 'intent.shadow.status': { $exists: false } },
    update,
    { new: true }
  );
  if (!saved) return TrailieAiTurn.findOne({ responseId: String(responseId) });
  const calls = saved.calls || [];
  const costKnown = calls.every((call) => call.costStatus === 'priced');
  saved = await TrailieAiTurn.findOneAndUpdate(
    { responseId: String(responseId) },
    {
      $set: {
        costStatus: costKnown ? 'priced' : 'cost_unknown',
        costUsd: costKnown ? calls.reduce((sum, call) => sum + Number(call.costUsd || 0), 0) : null,
      },
    },
    { new: true }
  );
  return saved;
}

function sanitizeEvidenceBrokerShadow(outcome = {}) {
  const boundedCounts = (value) => Object.fromEntries(Object.entries(value || {})
    .filter(([key, count]) => boundedSlug(key) && Number.isFinite(Number(count)))
    .slice(0, 20)
    .map(([key, count]) => [boundedSlug(key), Math.max(0, Number(count))]));
  const boundedList = (value, limit = 30) => [...new Set((Array.isArray(value) ? value : [])
    .map((item) => boundedSlug(item)).filter(Boolean))].slice(0, limit);
  const hashes = (Array.isArray(outcome.refreshKeyHashes) ? outcome.refreshKeyHashes : [])
    .filter((value) => /^[a-f0-9]{64}$/.test(value)).slice(0, 20);
  const prompt = outcome.promptV2Shadow || null;
  const promptAccounting = prompt?.accounting || {};
  const canary = prompt?.canary || null;
  const promptCanary = canary ? {
    status: boundedSlug(canary.status, 'failed'),
    attempted: canary.attempted === true,
    reasonCode: boundedSlug(canary.reasonCode),
    authoritativeProvider: boundedSlug(canary.authoritativeProvider),
    authoritativeModel: boundedSlug(canary.authoritativeModel),
    canaryProvider: boundedSlug(canary.canaryProvider),
    canaryModel: boundedSlug(canary.canaryModel),
    exactModelMatch: canary.exactModelMatch === true,
    promptTokens: finiteOrNull(canary.promptTokens),
    legacyPromptTokens: finiteOrNull(canary.legacyPromptTokens),
    coreSourceTokens: finiteOrNull(canary.coreSourceTokens),
    coreSectionTokens: finiteOrNull(canary.coreSectionTokens),
    maxOutputTokens: finiteOrNull(canary.maxOutputTokens),
    estimatedCostUsd: finiteOrNull(canary.estimatedCostUsd),
    usage: canary.usage ? {
      inputTokens: finiteOrNull(canary.usage.inputTokens),
      outputTokens: finiteOrNull(canary.usage.outputTokens),
    } : null,
    factuality: canary.factuality ? {
      issueCodes: boundedList(canary.factuality.issueCodes, 12),
      legacyIssueCount: finiteOrNull(canary.factuality.legacyIssueCount),
      regressionCodes: boundedList(canary.factuality.regressionCodes, 12),
    } : null,
    constraintAdherence: canary.constraintAdherence ? {
      evaluatedConstraintCount: finiteOrNull(canary.constraintAdherence.evaluatedConstraintCount),
      legacyScore: finiteOrNull(canary.constraintAdherence.legacyScore),
      canaryScore: finiteOrNull(canary.constraintAdherence.canaryScore),
      parity: canary.constraintAdherence.parity === true,
    } : null,
    outputContract: canary.outputContract ? {
      structurePreserved: canary.outputContract.structurePreserved === true,
      excessiveRefusal: canary.outputContract.excessiveRefusal === true,
      verbosityRatio: finiteOrNull(canary.outputContract.verbosityRatio),
      lengthAcceptable: canary.outputContract.lengthAcceptable === true,
      parity: canary.outputContract.parity === true,
      semanticWordingEqualityRequired: false,
    } : null,
    evidenceUtilization: canary.evidenceUtilization ? {
      requiredEvidenceTopics: boundedList(canary.evidenceUtilization.requiredEvidenceTopics, 30),
      renderedEvidenceTopics: boundedList(canary.evidenceUtilization.renderedEvidenceTopics, 30),
      usedEvidenceTopics: boundedList(canary.evidenceUtilization.usedEvidenceTopics, 30),
      missingRequiredTopics: boundedList(canary.evidenceUtilization.missingRequiredTopics, 30),
    } : null,
    privacy: canary.privacy ? { violationCount: finiteOrNull(canary.privacy.violationCount) } : null,
    acceptance: canary.acceptance ? {
      criticalRegressionCount: finiteOrNull(canary.acceptance.criticalRegressionCount),
      passed: canary.acceptance.passed === true,
    } : null,
  } : null;
  const promptV2Shadow = prompt ? {
    status: boundedSlug(prompt.status, 'failed'),
    attempted: prompt.attempted === true,
    reasonCode: boundedSlug(prompt.reasonCode),
    policyId: boundedSlug(prompt.policyId),
    contractId: boundedSlug(prompt.contractId),
    legacyTokens: finiteOrNull(prompt.legacyTokens),
    v2Tokens: finiteOrNull(prompt.v2Tokens),
    staticTokenSavings: finiteOrNull(prompt.staticTokenSavings),
    savingsPercent: finiteOrNull(prompt.savingsPercent),
    accounting: {
      tokenizerId: boundedSlug(promptAccounting.tokenizerId),
      coreSourceTokens: finiteOrNull(promptAccounting.coreSourceTokens),
      coreSectionTokens: finiteOrNull(promptAccounting.coreSectionTokens),
      coreWrapperTokens: finiteOrNull(promptAccounting.coreWrapperTokens),
      coreTokens: finiteOrNull(promptAccounting.coreTokens),
      contractTokens: finiteOrNull(promptAccounting.contractTokens),
      evidenceTokens: finiteOrNull(promptAccounting.evidenceTokens),
      tripStateTokens: finiteOrNull(promptAccounting.tripStateTokens),
      historyTokens: finiteOrNull(promptAccounting.historyTokens),
      userTokens: finiteOrNull(promptAccounting.userTokens),
      totalTokens: finiteOrNull(promptAccounting.totalTokens),
    },
    instructionCoverage: Object.fromEntries(Object.entries(prompt.instructionCoverage || {})
      .filter(([key, value]) => boundedSlug(key) && typeof value === 'boolean')
      .slice(0, 12)
      .map(([key, value]) => [boundedSlug(key), value])),
    outputComparisonStatus: boundedSlug(prompt.outputComparisonStatus),
    canary: promptCanary,
  } : null;
  return {
    status: boundedSlug(outcome.status, 'failed'),
    attempted: outcome.attempted === true,
    durationMs: finiteOrNull(outcome.durationMs),
    reasonCode: boundedSlug(outcome.reasonCode),
    schemaVersion: boundedSlug(outcome.schemaVersion),
    brokerVersion: boundedSlug(outcome.brokerVersion),
    requirementCount: finiteOrNull(outcome.requirementCount),
    coverageStatuses: boundedCounts(outcome.coverageStatuses),
    cacheStatuses: boundedCounts(outcome.cacheStatuses),
    providersUsed: boundedList(outcome.providersUsed),
    reasonCodes: boundedList(outcome.reasonCodes),
    refreshKeyHashes: hashes,
    legacyFetchedNps: typeof outcome.legacyFetchedNps === 'boolean' ? outcome.legacyFetchedNps : null,
    brokerTopicsCovered: boundedList(outcome.brokerTopicsCovered),
    missingLegacyTopics: boundedList(outcome.missingLegacyTopics),
    semanticCoverageMatch: typeof outcome.semanticCoverageMatch === 'boolean'
      ? outcome.semanticCoverageMatch : null,
    promptV2Shadow,
  };
}

async function recordEvidenceBrokerShadowOutcome({ responseId, outcome } = {}) {
  if (!responseId || !outcome) return null;
  const update = { $set: { 'evidence.brokerShadow': sanitizeEvidenceBrokerShadow(outcome) } };
  const canary = outcome.promptV2Shadow?.canary;
  if (canary?.attempted === true) {
    update.$push = {
      calls: buildCall({
        phase: 'prompt_v2_canary',
        provider: boundedSlug(canary.canaryProvider),
        model: boundedSlug(canary.canaryModel),
        usage: canary.usage,
        status: canary.status,
        errorCode: boundedSlug(canary.reasonCode),
        at: new Date(),
      }),
    };
  }
  let saved = await TrailieAiTurn.findOneAndUpdate(
    { responseId: String(responseId), 'evidence.brokerShadow.status': { $exists: false } },
    update,
    { new: true }
  );
  if (!saved || canary?.attempted !== true) return saved;
  const calls = saved.calls || [];
  const costKnown = calls.every((call) => call.costStatus === 'priced');
  saved = await TrailieAiTurn.findOneAndUpdate(
    { responseId: String(responseId) },
    { $set: {
      costStatus: costKnown ? 'priced' : 'cost_unknown',
      costUsd: costKnown ? calls.reduce((sum, call) => sum + Number(call.costUsd || 0), 0) : null,
    } },
    { new: true }
  );
  return saved;
}

module.exports = {
  CHAT_ROUTES,
  LEDGER_SCHEMA_VERSION,
  buildTurnLedgerEntry,
  claimPromptV2CanaryTurn,
  hashPrincipal,
  markTurnPersistence,
  normalizeUsage,
  priceProviderCall,
  recordIntentShadowOutcome,
  recordEvidenceBrokerShadowOutcome,
  recordAuxiliaryCall,
  recordTurnFromAiLog,
  runWithTurnTelemetry,
  trailieTurnTelemetryScope,
};
