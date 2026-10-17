'use strict';

/**
 * WP10 — transport/client compatibility adapter.
 *
 * ONE canonical v2 event source translated per-connection into the dialect the
 * connected client speaks (v2 or legacy), enforcing the WP10 invariants:
 *   1. exactly one authoritative terminal, even across Luna/Terra/retry/Sol;
 *   2. progress carries product-stage tokens only — never model/provider identity;
 *   3. evidence_ready exposes only { coverage, freshness, publicSources };
 *   4. the itinerary hash published at itinerary_ready survives to the terminal;
 *   5. nothing may be emitted after the terminal (the adapter seals).
 */

const {
  CANONICAL_EVENT,
  LEGACY_EVENT,
  PRODUCT_STAGE,
  createTrailieTransportAdapter,
  mapInternalStageToProduct,
} = require('../trailieTransportAdapter');

const collector = () => {
  const events = [];
  return { events, emit: (p) => events.push(p) };
};

const finalizedPayload = (over = {}) => ({
  contentUnchanged: false,
  content: 'Day 1 — start at Old Faithful.',
  responseId: 'resp-1',
  responseVersion: 2,
  itineraryHash: 'hash-A',
  canonicalPlan: { days: [] },
  itineraryData: { days: [{ id: 'd1' }] },
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
describe('v2 dialect — streaming passthrough', () => {
  it('emits response_started with the canonical type', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    expect(a.responseStarted({ responseId: 'resp-1', requiresStructuredItinerary: null })).toBe(true);
    expect(events).toEqual([
      { type: CANONICAL_EVENT.RESPONSE_STARTED, responseId: 'resp-1', requiresStructuredItinerary: null },
    ]);
  });

  it('maps content_delta straight through as content_delta', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    a.contentDelta({ content: 'hello' });
    expect(events).toEqual([{ type: CANONICAL_EVENT.CONTENT_DELTA, content: 'hello' }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('progress — product stages only (invariant #2)', () => {
  it('passes a whitelisted product stage', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    expect(a.progress({ stage: PRODUCT_STAGE.CHECKING_PERMITS })).toBe(true);
    expect(events).toEqual([{ type: CANONICAL_EVENT.PROGRESS, stage: 'checking_permits' }]);
  });

  it('drops an unknown stage (never leak an arbitrary label)', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    expect(a.progress({ stage: 'escalating_to_sol' })).toBe(false);
    expect(events).toEqual([]);
  });

  it('strips model/provider identity even on a valid stage', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    a.progress({ stage: PRODUCT_STAGE.BUILDING_ITINERARY, model: 'gpt-5.6', provider: 'openai' });
    expect(events).toEqual([{ type: CANONICAL_EVENT.PROGRESS, stage: 'building_itinerary' }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('progress — legacy verbatim stage passthrough (WP10B)', () => {
  it('legacy emits the internal stage verbatim (preserves today\'s thinking stage copy)', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'legacy', emit, mode: 'stream' });
    a.progress({ stage: PRODUCT_STAGE.BUILDING_ITINERARY, legacyStage: 'building_structured_itinerary' });
    expect(events).toEqual([{ type: LEGACY_EVENT.THINKING, stage: 'building_structured_itinerary' }]);
  });

  it('v2 emits the mapped canonical stage, ignoring the legacy stage string', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    a.progress({ stage: PRODUCT_STAGE.BUILDING_ITINERARY, legacyStage: 'building_structured_itinerary' });
    expect(events).toEqual([{ type: CANONICAL_EVENT.PROGRESS, stage: 'building_itinerary' }]);
  });

  it('v2 drops progress when the canonical stage is unmapped/null, even with a legacy stage', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    expect(a.progress({ stage: null, legacyStage: 'some_internal_thing' })).toBe(false);
    expect(events).toEqual([]);
  });

  it('mapInternalStageToProduct maps the turn\'s internal stages to product vocabulary', () => {
    expect(mapInternalStageToProduct('building_structured_itinerary')).toBe('building_itinerary');
    expect(mapInternalStageToProduct('validating_trip')).toBe('validating_trip');
    expect(mapInternalStageToProduct('writing_response')).toBe('writing_response');
    expect(mapInternalStageToProduct('checking_response_matches_plan')).toBe('checking_response');
    expect(mapInternalStageToProduct('unknown_internal')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('evidence_ready — metadata allowlist (invariant #3)', () => {
  it('keeps only coverage, freshness, publicSources', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    a.evidenceReady({
      coverage: 0.8,
      freshness: 'fresh',
      publicSources: ['nps', 'weather'],
      // everything below is forbidden and must be stripped:
      evidenceItems: [{ secret: true }],
      tripState: { userId: 'u1' },
      rawProviderResponse: { body: '...' },
      brokerDiagnostics: { lease: 'x' },
      refreshKey: 'k',
    });
    expect(events).toEqual([
      { type: CANONICAL_EVENT.EVIDENCE_READY, coverage: 0.8, freshness: 'fresh', publicSources: ['nps', 'weather'] },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('one authoritative terminal (invariant #1 / #5)', () => {
  it('emits response_finalized exactly once', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    expect(a.responseFinalized(finalizedPayload())).toBe(true);
    expect(a.responseFinalized(finalizedPayload({ content: 'DIFFERENT' }))).toBe(false);
    const finals = events.filter((e) => e.type === CANONICAL_EVENT.RESPONSE_FINALIZED);
    expect(finals).toHaveLength(1);
    expect(finals[0].content).toBe('Day 1 — start at Old Faithful.');
  });

  it('drops any event after the terminal (seal)', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    a.responseFinalized(finalizedPayload());
    expect(a.contentDelta({ content: 'late' })).toBe(false);
    expect(a.progress({ stage: PRODUCT_STAGE.WRITING_RESPONSE })).toBe(false);
    expect(events.filter((e) => e.type === CANONICAL_EVENT.CONTENT_DELTA)).toHaveLength(0);
  });

  it('an error is terminal and seals the adapter', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    expect(a.error({ message: 'boom' })).toBe(true);
    expect(a.responseFinalized(finalizedPayload())).toBe(false);
    expect(events.filter((e) => e.type === LEGACY_EVENT.ERROR)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('itinerary hash preservation (invariant #4)', () => {
  it('finalizing with the same hash published at itinerary_ready is allowed', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    a.itineraryReady({ response: { itineraryHash: 'hash-A' }, canonicalPlan: { days: [] } });
    expect(a.responseFinalized(finalizedPayload({ itineraryHash: 'hash-A' }))).toBe(true);
    expect(events.some((e) => e.type === CANONICAL_EVENT.RESPONSE_FINALIZED)).toBe(true);
  });

  it('refuses to finalize a changed plan — emits bounded error, no altered plan (invariant #4)', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    a.itineraryReady({ response: { itineraryHash: 'hash-A' }, canonicalPlan: { days: [] } });
    expect(a.responseFinalized(finalizedPayload({ itineraryHash: 'hash-B' }))).toBe(false);
    expect(events.some((e) => e.type === CANONICAL_EVENT.RESPONSE_FINALIZED)).toBe(false);
    const err = events.find((e) => e.type === LEGACY_EVENT.ERROR);
    expect(err).toBeTruthy();
    expect(err.code).toBe('revision_itinerary_hash_mismatch');
    // bounded: the changed plan must never appear on the wire
    expect(JSON.stringify(events)).not.toContain('hash-B');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('legacy dialect — streaming fan-out', () => {
  const build = () => {
    const { events, emit } = collector();
    return { events, a: createTrailieTransportAdapter({ dialect: 'legacy', emit, mode: 'stream' }) };
  };

  it('response_started becomes an empty-sources thinking', () => {
    const { events, a } = build();
    a.responseStarted({ responseId: 'r', requiresStructuredItinerary: null });
    expect(events).toEqual([{ type: LEGACY_EVENT.THINKING, sources: [] }]);
  });

  it('progress becomes a thinking with the stage', () => {
    const { events, a } = build();
    a.progress({ stage: PRODUCT_STAGE.BUILDING_ROUTE });
    expect(events).toEqual([{ type: LEGACY_EVENT.THINKING, stage: 'building_route' }]);
  });

  it('evidence_ready becomes a thinking carrying the public sources', () => {
    const { events, a } = build();
    a.evidenceReady({ coverage: 1, freshness: 'fresh', publicSources: ['nps'] });
    expect(events).toEqual([{ type: LEGACY_EVENT.THINKING, sources: ['nps'] }]);
  });

  it('content_delta becomes a chunk', () => {
    const { events, a } = build();
    a.contentDelta({ content: 'abc' });
    expect(events).toEqual([{ type: LEGACY_EVENT.CHUNK, content: 'abc' }]);
  });

  it('itinerary_ready and prose_ready are suppressed (legacy is terminal-only for plans)', () => {
    const { events, a } = build();
    expect(a.itineraryReady({ response: { itineraryHash: 'hash-A' }, canonicalPlan: {} })).toBe(false);
    expect(a.proseReady({ response: { itineraryHash: 'hash-A' }, canonicalPlan: {} })).toBe(false);
    expect(events).toEqual([]);
  });

  it('after streaming, finalize emits stream_end then exactly one done', () => {
    const { events, a } = build();
    a.contentDelta({ content: 'abc' });
    a.responseFinalized(finalizedPayload());
    const types = events.map((e) => e.type);
    expect(types).toEqual([LEGACY_EVENT.CHUNK, LEGACY_EVENT.STREAM_END, LEGACY_EVENT.DONE]);
    // done carries the terminal payload
    const done = events.find((e) => e.type === LEGACY_EVENT.DONE);
    expect(done.responseId).toBe('resp-1');
    expect(done.itineraryHash).toBe('hash-A');
  });

  it('finalize without any content_delta emits done with NO stream_end (buffered)', () => {
    const { events, a } = build();
    a.responseFinalized(finalizedPayload());
    expect(events.map((e) => e.type)).toEqual([LEGACY_EVENT.DONE]);
  });

  it('a second finalize during escalation produces no second done', () => {
    const { events, a } = build();
    a.responseFinalized(finalizedPayload());
    a.responseFinalized(finalizedPayload({ content: 'ESCALATED' }));
    expect(events.filter((e) => e.type === LEGACY_EVENT.DONE)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('contentStreamEnded — preserve legacy stream_end timing (WP10B)', () => {
  it('legacy emits stream_end at stream completion, and finalize does not repeat it', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'legacy', emit, mode: 'stream' });
    a.contentDelta({ content: 'abc' });
    expect(a.contentStreamEnded()).toBe(true);
    a.responseFinalized(finalizedPayload());
    expect(events.map((e) => e.type)).toEqual([LEGACY_EVENT.CHUNK, LEGACY_EVENT.STREAM_END, LEGACY_EVENT.DONE]);
    expect(events.filter((e) => e.type === LEGACY_EVENT.STREAM_END)).toHaveLength(1);
  });

  it('legacy contentStreamEnded with no prior content emits nothing (buffered path)', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'legacy', emit, mode: 'stream' });
    expect(a.contentStreamEnded()).toBe(false);
    expect(events).toEqual([]);
  });

  it('legacy contentStreamEnded is idempotent', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'legacy', emit, mode: 'stream' });
    a.contentDelta({ content: 'abc' });
    a.contentStreamEnded();
    expect(a.contentStreamEnded()).toBe(false);
    expect(events.filter((e) => e.type === LEGACY_EVENT.STREAM_END)).toHaveLength(1);
  });

  it('v2 contentStreamEnded is a no-op (no stream_end in the canonical dialect)', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    a.contentDelta({ content: 'abc' });
    expect(a.contentStreamEnded()).toBe(false);
    expect(events.map((e) => e.type)).toEqual([CANONICAL_EVENT.CONTENT_DELTA]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('legacy display passthrough — WP10B (park presentation metadata)', () => {
  it('legacy evidence_ready folds display metadata into the thinking event', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'legacy', emit, mode: 'stream' });
    a.evidenceReady({
      coverage: 1,
      freshness: 'fresh',
      publicSources: ['nps', 'weather'],
      display: { parkName: 'Zion', parkNames: ['Zion'], parkImages: ['img-1'] },
    });
    expect(events).toEqual([
      { type: LEGACY_EVENT.THINKING, sources: ['nps', 'weather'], parkName: 'Zion', parkNames: ['Zion'], parkImages: ['img-1'] },
    ]);
  });

  it('v2 evidence_ready keeps evidence minimal AND promotes display to a separate display_context (WP10F-2)', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    a.evidenceReady({
      coverage: 1,
      freshness: 'fresh',
      publicSources: ['nps'],
      display: { parkName: 'Zion', parkImages: ['img-1'] },
    });
    // The evidence_ready event itself never carries presentation fields…
    expect(events[0]).toEqual({ type: CANONICAL_EVENT.EVIDENCE_READY, coverage: 1, freshness: 'fresh', publicSources: ['nps'] });
    // …and the display rides its own first-class event instead.
    expect(events[1]).toEqual({ type: CANONICAL_EVENT.DISPLAY_CONTEXT, parkName: 'Zion', parkImages: ['img-1'] });
    expect(events).toHaveLength(2);
  });

  it('legacy response_started folds display metadata into the initial thinking', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'legacy', emit, mode: 'stream' });
    a.responseStarted({ responseId: 'r', requiresStructuredItinerary: null, display: { parkName: 'Zion', parkNames: [] } });
    expect(events).toEqual([{ type: LEGACY_EVENT.THINKING, sources: [], parkName: 'Zion', parkNames: [] }]);
  });

  it('v2 response_started keeps the canonical event minimal AND promotes display to display_context (WP10F-2)', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'stream' });
    a.responseStarted({ responseId: 'r', requiresStructuredItinerary: null, display: { parkName: 'Zion' } });
    expect(events[0]).toEqual({ type: CANONICAL_EVENT.RESPONSE_STARTED, responseId: 'r', requiresStructuredItinerary: null });
    expect(events[1]).toEqual({ type: CANONICAL_EVENT.DISPLAY_CONTEXT, parkName: 'Zion' });
    expect(events).toHaveLength(2);
  });

  it('the display bag is itself allowlisted — non-presentation keys never pass, even to legacy', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'legacy', emit, mode: 'stream' });
    a.evidenceReady({
      coverage: 1,
      freshness: 'fresh',
      publicSources: ['nps'],
      display: { parkName: 'Zion', tripState: { userId: 'u1' }, refreshKey: 'k' },
    });
    expect(events).toEqual([{ type: LEGACY_EVENT.THINKING, sources: ['nps'], parkName: 'Zion' }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('WP10F-2 — first-class v2 display_context', () => {
  const v2 = (mode = 'stream') => {
    const { events, emit } = collector();
    return { events, a: createTrailieTransportAdapter({ dialect: 'v2', emit, mode }) };
  };
  const legacy = (mode = 'stream') => {
    const { events, emit } = collector();
    return { events, a: createTrailieTransportAdapter({ dialect: 'legacy', emit, mode }) };
  };

  it('allowed display metadata creates a display_context event (v2)', () => {
    const { events, a } = v2();
    a.responseStarted({ responseId: 'r', display: { parkName: 'Zion', parkNames: ['Zion'], parkImages: ['img-1'] } });
    expect(events).toContainEqual({
      type: CANONICAL_EVENT.DISPLAY_CONTEXT, parkName: 'Zion', parkNames: ['Zion'], parkImages: ['img-1'],
    });
  });

  it('reuses the SAME display allowlist — private/non-presentation fields never pass', () => {
    const { events, a } = v2();
    a.evidenceReady({
      coverage: 1, freshness: 'fresh', publicSources: ['nps'],
      display: { parkName: 'Zion', tripState: { userId: 'u1' }, refreshKey: 'k', provider: 'openai', model: 'gpt-5.6' },
    });
    const dc = events.find((e) => e.type === CANONICAL_EVENT.DISPLAY_CONTEXT);
    expect(dc).toEqual({ type: CANONICAL_EVENT.DISPLAY_CONTEXT, parkName: 'Zion' });
    // nothing forbidden anywhere on the wire
    expect(JSON.stringify(events)).not.toContain('tripState');
    expect(JSON.stringify(events)).not.toContain('refreshKey');
    expect(JSON.stringify(events)).not.toContain('gpt-5.6');
  });

  it('empty / non-meaningful display creates NO display_context event (v2)', () => {
    // no display at all
    const noDisplay = v2();
    noDisplay.a.responseStarted({ responseId: 'r' });
    expect(noDisplay.events.some((e) => e.type === CANONICAL_EVENT.DISPLAY_CONTEXT)).toBe(false);
    // present but empty: null parkName + empty arrays is not presentation-worthy
    const empty = v2();
    empty.a.responseStarted({ responseId: 'r', display: { parkName: null, parkNames: [], parkImages: [] } });
    expect(empty.events.some((e) => e.type === CANONICAL_EVENT.DISPLAY_CONTEXT)).toBe(false);
    expect(empty.events).toEqual([{ type: CANONICAL_EVENT.RESPONSE_STARTED, responseId: 'r', requiresStructuredItinerary: null }]);
  });

  it('supports incremental display updates — multiple display_context events across a turn', () => {
    const { events, a } = v2();
    a.responseStarted({ responseId: 'r', display: { parkName: 'Zion' } });
    a.evidenceReady({ coverage: 1, freshness: 'fresh', publicSources: ['nps'], display: { parkName: 'Zion', parkNames: ['Zion'], parkImages: ['img-1'] } });
    const dcs = events.filter((e) => e.type === CANONICAL_EVENT.DISPLAY_CONTEXT);
    expect(dcs).toEqual([
      { type: CANONICAL_EVENT.DISPLAY_CONTEXT, parkName: 'Zion' },
      { type: CANONICAL_EVENT.DISPLAY_CONTEXT, parkName: 'Zion', parkNames: ['Zion'], parkImages: ['img-1'] },
    ]);
  });

  it('cannot emit display_context after the terminal (seal)', () => {
    const { events, a } = v2();
    a.responseFinalized(finalizedPayload());
    expect(a.evidenceReady({ coverage: 1, freshness: 'fresh', publicSources: ['nps'], display: { parkName: 'Zion' } })).toBe(false);
    expect(events.some((e) => e.type === CANONICAL_EVENT.DISPLAY_CONTEXT)).toBe(false);
  });

  it('terminal mode suppresses display_context entirely', () => {
    const { events, a } = v2('terminal');
    a.responseStarted({ responseId: 'r', display: { parkName: 'Zion', parkImages: ['img-1'] } });
    a.evidenceReady({ coverage: 1, freshness: 'fresh', publicSources: ['nps'], display: { parkName: 'Zion' } });
    expect(events.some((e) => e.type === CANONICAL_EVENT.DISPLAY_CONTEXT)).toBe(false);
  });

  it('LEGACY output is byte-equivalent — no display_context, no extra thinking events', () => {
    const { events, a } = legacy();
    a.responseStarted({ responseId: 'r', display: { parkName: 'Zion', parkNames: [] } });
    a.evidenceReady({ coverage: 1, freshness: 'fresh', publicSources: ['nps'], display: { parkName: 'Zion', parkImages: ['img-1'] } });
    // exactly today's two thinking events, display folded in — nothing new.
    expect(events).toEqual([
      { type: LEGACY_EVENT.THINKING, sources: [], parkName: 'Zion', parkNames: [] },
      { type: LEGACY_EVENT.THINKING, sources: ['nps'], parkName: 'Zion', parkImages: ['img-1'] },
    ]);
    expect(events.some((e) => e.type === 'display_context')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('terminal mode — non-stream JSON body (WP10C)', () => {
  it('suppresses every intermediate event and emits exactly one terminal', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'terminal' });
    expect(a.responseStarted({ responseId: 'r' })).toBe(false);
    expect(a.progress({ stage: PRODUCT_STAGE.WRITING_RESPONSE })).toBe(false);
    expect(a.evidenceReady({ coverage: 1, freshness: 'fresh', publicSources: [] })).toBe(false);
    expect(a.contentDelta({ content: 'x' })).toBe(false);
    expect(a.responseFinalized(finalizedPayload())).toBe(true);
    expect(events).toHaveLength(1);
  });

  it('legacy terminal body is { data: payload } (today\'s /chat shape), no SSE type', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'legacy', emit, mode: 'terminal' });
    a.contentDelta({ content: 'x' }); // suppressed
    const payload = finalizedPayload();
    a.responseFinalized(payload);
    expect(events).toEqual([{ data: payload }]);
    expect(events[0].type).toBeUndefined();
  });

  it('v2 terminal body is { type: response_finalized, ...payload }', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'v2', emit, mode: 'terminal' });
    a.responseFinalized(finalizedPayload({ content: 'hi' }));
    expect(events[0].type).toBe(CANONICAL_EVENT.RESPONSE_FINALIZED);
    expect(events[0].content).toBe('hi');
    expect(events[0].data).toBeUndefined();
  });

  it('a second terminal never produces a second HTTP body', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'legacy', emit, mode: 'terminal' });
    expect(a.responseFinalized(finalizedPayload())).toBe(true);
    expect(a.responseFinalized(finalizedPayload({ content: 'again' }))).toBe(false);
    expect(events).toHaveLength(1);
  });

  it('legacy terminal error body is { error: message }', () => {
    const { events, emit } = collector();
    const a = createTrailieTransportAdapter({ dialect: 'legacy', emit, mode: 'terminal' });
    a.error({ message: 'boom', code: 'x' });
    expect(events).toEqual([{ error: 'boom' }]);
  });
});
