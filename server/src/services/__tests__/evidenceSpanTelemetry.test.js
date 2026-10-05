'use strict';

/**
 * §A — the span projection is only useful if the broker actually labels its
 * spans. This drives the real broker and the real layered resolver with fake
 * providers and asserts what the timeline records.
 *
 * Offline: injected providers only, no network.
 */

const { buildEvidenceKeys } = require('../../utils/evidenceKey');
const { createEvidenceBroker } = require('../evidenceBrokerService');
const { createLayeredEvidenceResolver } = require('../layeredEvidenceBroker');
const { createTurnTimeline } = require('../../utils/turnTimeline');

const NOW = new Date('2026-08-26T12:00:00.000Z');

function requirement(topic, ordinal, overrides = {}) {
  return {
    requirementId: `req:${ordinal}:${topic}`,
    entity: { entityId: 'nps:park:thro', entityType: 'national_park', displayName: 'Theodore Roosevelt National Park' },
    topic,
    evidenceTypes: topic === 'alerts_closures' ? ['live_state'] : ['fact'],
    temporalScope: { mode: 'current', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' },
    freshnessClass: 'daily',
    maxAgeSeconds: 86400,
    maxStaleSeconds: 86400,
    criticality: 'required',
    absenceSemantics: 'unknown',
    minimumAuthorityClass: 'official_owner',
    acceptedSourceClasses: ['official_owner'],
    preferredProviders: ['nps'],
    allowedFallbackProviders: [],
    privacyScope: 'public',
    ...overrides,
  };
}

function candidateFor(topic) {
  const candidate = {
    entityId: 'nps:park:thro',
    topic,
    evidenceType: topic === 'alerts_closures' ? 'live_state' : 'fact',
    claim: {
      identity: topic, text: topic, normalizedValue: topic, unit: null, status: null,
      subjectId: 'nps:park:thro', objectId: null, qualifiers: [],
    },
    scope: { geographicEntityIds: ['nps:park:thro'], validFrom: null, validThrough: null, audience: 'public', locale: 'en-US' },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: `nps-${topic}`, url: null, title: null, publishedAt: null, sourceUpdatedAt: null },
    quality: { authorityClass: 'official_owner', freshnessStatus: 'fresh', scopeMatch: 'exact', corroboratingEvidenceIds: [], conflictingEvidenceIds: [], conflictStatus: 'none' },
    provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'nps-evidence-v1', rawPayloadHash: null, contentHash: 'pending' },
    observedAt: NOW.toISOString(),
  };
  return candidate;
}

function makeBroker() {
  const docs = [];
  const provider = {
    id: 'nps',
    supports: (req) => ['destination_identity', 'alerts_closures'].includes(req.topic),
    estimateCost: () => ({ costStatus: 'known', costUsd: 0 }),
    buildRequest: (req) => {
      const operation = req.topic === 'alerts_closures' ? 'alerts' : 'parks';
      return {
        provider: 'nps',
        operation,
        parameters: { parkCode: 'thro' },
        dedupeKey: `nps|${operation}|thro`,
        publicCanonicalRequest: { provider: 'nps', operation, parkCode: 'thro' },
      };
    },
    fetch: async () => ({
      raw: {}, metadata: { observedAt: NOW.toISOString() },
      completeness: { isComplete: true, emptyMeans: 'unknown' }, providerAttempts: 1,
    }),
    normalize: (_raw, request) => [candidateFor(request.operation === 'alerts' ? 'alerts_closures' : 'destination_identity')],
    classifyError: () => ({ code: 'provider_unavailable', retryable: false }),
  };

  const broker = createEvidenceBroker({
    providers: [provider],
    queryEvidence: async (req) => docs.filter((d) => d.entityId === req.entity.entityId && d.topic === req.topic && d.isCurrent),
    persistCandidate: async ({ candidate }) => {
      const keys = buildEvidenceKeys(candidate);
      const evidence = { ...candidate, ...keys, isCurrent: true, provenance: { ...candidate.provenance, contentHash: keys.contentHash } };
      docs.push(evidence);
      return { outcome: 'created', evidence };
    },
    acquireLease: async ({ leaseKey, ownerId }) => ({ outcome: 'acquired', lease: { leaseKey, ownerId, fencingToken: 1 } }),
    releaseLease: async () => ({ released: true }),
    waitForRefresh: async () => ({ outcome: 'coalesced_store_update' }),
    recordRefreshEvent: async () => {},
    refreshHashSecret: 'span-telemetry-test-secret',
    now: () => NOW,
  });
  return { broker, provider };
}

describe('evidence spans carry wave, provider and requirement', () => {
  test('cache lookups name the requirement topic they are for', async () => {
    const { broker } = makeBroker();
    const timeline = createTurnTimeline();
    await broker.resolveEvidence({
      requirements: [requirement('destination_identity', 0), requirement('alerts_closures', 1)],
      requestId: 'turn-span',
      beginSpan: (stage, meta) => timeline.begin(stage, meta),
    });

    const lookups = timeline.snapshot({ totalMs: 1 }).spans
      .filter((span) => span.stage === 'evidence_cache_lookup');
    expect(lookups).toHaveLength(2);
    expect(lookups.map((span) => span.requirement).sort())
      .toEqual(['alerts_closures', 'destination_identity']);
  });

  test('provider refreshes name their provider and whether they blocked', async () => {
    const { broker } = makeBroker();
    const timeline = createTurnTimeline();
    await broker.resolveEvidence({
      requirements: [requirement('destination_identity', 0), requirement('alerts_closures', 1)],
      requestId: 'turn-span',
      beginSpan: (stage, meta) => timeline.begin(stage, meta),
    });

    const refreshes = timeline.snapshot({ totalMs: 1 }).spans
      .filter((span) => span.stage === 'evidence_provider_refresh');
    expect(refreshes.length).toBeGreaterThan(0);
    for (const span of refreshes) {
      expect(span.provider).toBe('nps');
      expect(span.blocking).toBe(true);
      // Group-shaped: the key the broker deduplicated on, and every requirement
      // that key actually served.
      expect(span.groupKey).toMatch(/^nps\|(alerts|parks)\|thro$/);
      expect(Array.isArray(span.requirements)).toBe(true);
      expect(span.requirements.length).toBeGreaterThan(0);
    }
  });

  test('one call serving several requirements lists all of them', async () => {
    const { broker } = makeBroker();
    const timeline = createTurnTimeline();
    // Both topics build the same `nps|parks|thro` request in this harness.
    await broker.resolveEvidence({
      requirements: [
        requirement('destination_identity', 0),
        requirement('destination_identity', 1, { requirementId: 'req:1:overview', topic: 'destination_identity' }),
      ],
      requestId: 'turn-group',
      beginSpan: (stage, meta) => timeline.begin(stage, meta),
    });

    const [refresh] = timeline.snapshot({ totalMs: 1 }).spans
      .filter((span) => span.stage === 'evidence_provider_refresh');
    expect(refresh.groupKey).toBe('nps|parks|thro');
    expect(refresh.requirements).toEqual(['destination_identity', 'destination_identity']);
    // And no misleading single-requirement label.
    expect(refresh.requirement).toBeUndefined();
  });

  test('the layered resolver labels each wave, so serialisation is visible', async () => {
    const { broker } = makeBroker();
    const resolver = createLayeredEvidenceResolver({ broker, now: () => NOW });
    const timeline = createTurnTimeline();

    await resolver.resolveEvidence({
      requirements: [
        requirement('destination_identity', 0),
        requirement('alerts_closures', 1),
        // No structured provider supports this one, so it reaches wave 2.
        requirement('roads', 2, { preferredProviders: ['nps'], allowedFallbackProviders: ['brave'] }),
      ],
      requestId: 'turn-wave',
      beginSpan: (stage, meta) => timeline.begin(stage, meta),
    });

    const waves = new Set(timeline.snapshot({ totalMs: 1 }).spans.map((span) => span.wave));
    expect(waves.has('structured')).toBe(true);
    expect(waves.has('web_discovery')).toBe(true);
  });

  test('a multi-page follow requirement is discriminated in the span label (R3)', async () => {
    // P0-5 multi-page follows share one topic across up to three requirements
    // (`:follow2`, `:follow3` id suffixes); without the suffix in the span
    // label, the official_pages wave's three fetches are indistinguishable —
    // exactly what the 191s cold-path decomposition could not see.
    const { broker } = makeBroker();
    const timeline = createTurnTimeline();
    await broker.resolveEvidence({
      requirements: [
        requirement('destination_identity', 0, { requirementId: 'req:0:destination_identity:follow2' }),
      ],
      requestId: 'turn-follow',
      beginSpan: (stage, meta) => timeline.begin(stage, meta),
    });

    const [refresh] = timeline.snapshot({ totalMs: 1 }).spans
      .filter((span) => span.stage === 'evidence_provider_refresh');
    expect(refresh.requirements).toEqual(['destination_identity_follow2']);
  });

  test('span metadata stays bounded slugs even from real requirement ids', async () => {
    const { broker } = makeBroker();
    const timeline = createTurnTimeline();
    await broker.resolveEvidence({
      requirements: [requirement('destination_identity', 0)],
      requestId: 'turn-span',
      beginSpan: (stage, meta) => timeline.begin(stage, meta),
    });
    for (const span of timeline.snapshot({ totalMs: 1 }).spans) {
      if (span.requirement) expect(span.requirement).toMatch(/^[a-z0-9_]{1,40}$/);
      if (span.provider) expect(span.provider).toMatch(/^[a-z0-9_]{1,40}$/);
      if (span.wave) expect(span.wave).toMatch(/^[a-z0-9_]{1,40}$/);
    }
  });

  test('a broker used without beginSpan still works', async () => {
    const { broker } = makeBroker();
    const bundle = await broker.resolveEvidence({
      requirements: [requirement('destination_identity', 0)],
      requestId: 'turn-nospan',
    });
    expect(bundle.resolutions).toHaveLength(1);
  });
});

/**
 * The projection is worthless if it never leaves the turn. `latencyBreakdown` is
 * assembled field by field, so a new snapshot field is NOT carried by default.
 */
describe('the emitted turn telemetry carries the spans', () => {
  const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');

  test('latencyBreakdown includes the bounded span list', async () => {
    const result = await executeTrailieV2Turn({
      userMessage: 'What is Yosemite like in spring?',
      conversationContext: { history: [] },
      tripState: null,
      constraints: null,
      resolvedContext: {},
    }, {
      enabled: true,
      classifyIntent: () => ({
        version: 'trailie-intent-v2.0.0', source: 'deterministic',
        primaryIntent: 'general_qa', verticals: ['parks'], depth: 'quick',
        freshness: 'stable', actionability: 'informational', scope: 'single_destination',
        entities: [], confidence: 0.9, reasonCodes: [], compound: false,
        requiresLunaShadow: false, travelerJob: null,
      }),
      planRequirements: () => [],
      resolveDeterministicRender: () => ({ eligible: false }),
      detectContradiction: () => [],
      now: () => new Date('2026-08-27T12:00:00.000Z'),
      newTurnId: () => 'turn-spans',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses: async () => ({
        provider: 'openai', model: 'gpt-5.6-terra',
        outputText: 'Yosemite is beautiful in spring.', toolCalls: [],
        completionStatus: 'complete', stopReason: 'stop', refusal: null,
        usage: { inputTokens: 800, outputTokens: 120, cachedInputTokens: 0 },
      }),
      resolveEvidence: async () => { throw new Error('not reached'); },
    });

    expect(Array.isArray(result.latencyBreakdown.spans)).toBe(true);
    // THE LIVE 2026-08-27 GAP. The execution service adapted `beginSpan` with a
    // one-argument arrow, silently dropping every label, so the first live turn
    // emitted intervals with no wave/provider/requirement at all. Asserting the
    // spans EXIST was not enough; the labels have to survive the adapter.
    expect(result.latencyBreakdown.spans.some((span) => span.stage === 'generation')).toBe(true);
    expect(result.latencyBreakdown.spans.length).toBeGreaterThan(0);
    expect(result.latencyBreakdown).toHaveProperty('spansTruncated');
    for (const span of result.latencyBreakdown.spans) {
      expect(typeof span.stage).toBe('string');
      expect(Number.isInteger(span.startMs)).toBe(true);
      expect(Number.isInteger(span.durationMs)).toBe(true);
    }
    // Frozen like every other emitted telemetry field.
    expect(Object.isFrozen(result.latencyBreakdown.spans)).toBe(true);
  });
});


/**
 * The execution service adapts `beginSpan` for the broker. That adapter must
 * forward metadata — a one-argument arrow compiles, runs, and throws every
 * label away, which is exactly what happened on the first live turn.
 */
describe('the execution service forwards span metadata to the broker', () => {
  const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');

  test('evidence spans emitted by a real turn carry their labels', async () => {
    const { broker } = makeBroker();
    const resolver = createLayeredEvidenceResolver({ broker, now: () => NOW });

    const result = await executeTrailieV2Turn({
      userMessage: 'Is Yosemite open right now?',
      conversationContext: { history: [] },
      tripState: null,
      constraints: null,
      resolvedContext: {},
    }, {
      enabled: true,
      classifyIntent: () => ({
        version: 'trailie-intent-v2.0.0', source: 'deterministic',
        primaryIntent: 'general_qa', verticals: ['parks'], depth: 'quick',
        freshness: 'stable', actionability: 'informational', scope: 'single_destination',
        entities: [], confidence: 0.9, reasonCodes: [], compound: false,
        requiresLunaShadow: false, travelerJob: null,
      }),
      planRequirements: () => [requirement('destination_identity', 0), requirement('alerts_closures', 1)],
      resolveDeterministicRender: () => ({ eligible: false }),
      detectContradiction: () => [],
      now: () => new Date('2026-08-27T12:00:00.000Z'),
      newTurnId: () => 'turn-meta',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses: async () => ({
        provider: 'openai', model: 'gpt-5.6-terra',
        outputText: 'Yosemite is open.', toolCalls: [],
        completionStatus: 'complete', stopReason: 'stop', refusal: null,
        usage: { inputTokens: 800, outputTokens: 60, cachedInputTokens: 0 },
      }),
      resolveEvidence: (args) => resolver.resolveEvidence(args),
    });

    const evidenceSpans = result.latencyBreakdown.spans
      .filter((span) => span.stage.startsWith('evidence_cache_lookup')
        || span.stage.startsWith('evidence_provider_refresh'));
    expect(evidenceSpans.length).toBeGreaterThan(0);
    expect(evidenceSpans.every((span) => typeof span.wave === 'string')).toBe(true);
    expect(evidenceSpans.some((span) => typeof span.requirement === 'string')).toBe(true);
    expect(evidenceSpans.some((span) => span.provider === 'nps')).toBe(true);
  });
});
