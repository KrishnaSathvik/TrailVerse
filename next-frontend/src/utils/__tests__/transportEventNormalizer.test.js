import { describe, it, expect } from 'vitest';
import {
  CLIENT_EVENT,
  createTransportEventNormalizer,
} from '@/utils/transportEventNormalizer';
import { resolveThinkingStageCopy } from '@/utils/thinkingStageCopy';

/**
 * WP10F-1 — the web transport normalizer must leave the UI's normalized state
 * EQUIVALENT whether a turn arrives in the legacy or the v2 dialect. These tests
 * drive the normalizer with paired recorded/synthetic streams and assert the
 * normalized client-event layer matches (modulo events that are, by contract,
 * observational-only or deferred to WP10F-2).
 */

/** Feed a whole raw event sequence through one normalizer; flatten the output. */
function run(rawEvents) {
  const n = createTransportEventNormalizer();
  const out = [];
  for (const e of rawEvents) out.push(...n.normalize(e));
  return out;
}

/**
 * Fold a normalized event list into the UI-relevant state snapshot the React
 * machinery would derive from it. Equivalence is asserted on THIS snapshot, not
 * on the raw event list: legacy's overloaded `thinking` emits a transient empty
 * evidence (its response-start/display carrier) that v2 folds into
 * `response_started` + a future `display_context`, so the intermediate event
 * lists differ while the resulting state does not (last-writer-wins on sources).
 */
function reduceToUiState(events) {
  const state = {
    text: '',
    sources: [], // last evidence wins, mirroring setThinkingSources
    progressStage: null,
    streamFinished: 0,
    itinerary: null,
    prose: null,
    finalizedPayload: null,
    error: null,
    // Display merges INCREMENTALLY and only on meaningful values, mirroring the
    // real UI (pendingParkImagesRef is set only when parkImages is non-empty; an
    // absent field never wipes prior display state).
    display: { parkName: null, parkNames: [], parkImages: [] },
  };
  for (const e of events) {
    switch (e.kind) {
      case CLIENT_EVENT.CONTENT_DELTA: state.text += e.content; break;
      case CLIENT_EVENT.CONTENT_RESET: state.text = ''; break;
      case CLIENT_EVENT.EVIDENCE: state.sources = e.sources; break;
      case CLIENT_EVENT.PROGRESS: state.progressStage = e.stage; break;
      case CLIENT_EVENT.STREAM_FINISHED: state.streamFinished += 1; break;
      case CLIENT_EVENT.ITINERARY_READY: state.itinerary = e; break;
      case CLIENT_EVENT.PROSE_READY: state.prose = e; break;
      case CLIENT_EVENT.DISPLAY_CONTEXT: {
        if (e.parkName != null) state.display.parkName = e.parkName;
        if (Array.isArray(e.parkNames) && e.parkNames.length > 0) state.display.parkNames = e.parkNames;
        if (Array.isArray(e.parkImages) && e.parkImages.length > 0) state.display.parkImages = e.parkImages;
        break;
      }
      case CLIENT_EVENT.FINALIZED: {
        // The terminal payload differs only by its wire `type` discriminator;
        // the meaningful fields are spread identically on both dialects.
        const { type, ...rest } = e.payload || {};
        state.finalizedPayload = rest;
        break;
      }
      case CLIENT_EVENT.ERROR: state.error = e; break;
      default: break; // response_started — dialect-specific, observational
    }
  }
  return state;
}

// ── Recorded/synthetic stream pairs ─────────────────────────────────────────

const TERMINAL_PAYLOAD = {
  contentUnchanged: true,
  provider: 'claude',
  model: 'claude-sonnet-5',
  parkName: 'Zion National Park',
  parkNames: ['Zion National Park'],
  parkImages: ['https://img/1.jpg'],
  hasItinerary: false,
  itineraryData: null,
  confidence: 0.9,
  remainingAllowance: 4,
  canSendMore: true,
};

/** A plain content turn (no itinerary), both dialects. */
const LEGACY_CONTENT_TURN = [
  { type: 'thinking', sources: [], parkName: 'Zion National Park', parkNames: [] },
  { type: 'thinking', sources: ['nps', 'weather'], parkName: 'Zion National Park', parkNames: ['Zion National Park'], parkImages: ['https://img/1.jpg'] },
  { type: 'thinking', stage: 'writing_response' },
  { type: 'chunk', content: 'Day 1: ' },
  { type: 'chunk', content: 'Angels Landing.' },
  { type: 'stream_end' },
  { type: 'done', ...TERMINAL_PAYLOAD },
];

const V2_CONTENT_TURN = [
  { type: 'response_started', responseId: 'resp-1' },
  // WP10F-2 — the server adapter now promotes the display bag to display_context.
  { type: 'display_context', parkName: 'Zion National Park', parkNames: [] },
  { type: 'evidence_ready', publicSources: ['nps', 'weather'], coverage: 'partial', freshness: 'fresh' },
  { type: 'display_context', parkName: 'Zion National Park', parkNames: ['Zion National Park'], parkImages: ['https://img/1.jpg'] },
  { type: 'progress', stage: 'writing_response' },
  { type: 'content_delta', content: 'Day 1: ' },
  { type: 'content_delta', content: 'Angels Landing.' },
  { type: 'response_finalized', ...TERMINAL_PAYLOAD },
];

describe('WP10F-1 — plain content turn parity', () => {
  it('legacy and v2 leave the UI in an equivalent normalized state — INCLUDING full display (WP10F-2)', () => {
    const legacyState = reduceToUiState(run(LEGACY_CONTENT_TURN));
    const v2State = reduceToUiState(run(V2_CONTENT_TURN));
    expect(v2State).toEqual(legacyState);
    // and it is the state we expect, not two matching empties
    expect(v2State.text).toBe('Day 1: Angels Landing.');
    expect(v2State.sources).toEqual(['nps', 'weather']);
    expect(v2State.progressStage).toBe('writing_response');
    expect(v2State.streamFinished).toBe(1);
    expect(v2State.finalizedPayload).toBeTruthy();
    // Full display parity — the whole point of the WP10F-2 display_context event.
    expect(v2State.display).toEqual({
      parkName: 'Zion National Park',
      parkNames: ['Zion National Park'],
      parkImages: ['https://img/1.jpg'],
    });
  });

  it('content deltas concatenate to the same streamed text in both dialects', () => {
    const text = (events) =>
      events.filter((e) => e.kind === CLIENT_EVENT.CONTENT_DELTA).map((e) => e.content).join('');
    expect(text(run(V2_CONTENT_TURN))).toBe('Day 1: Angels Landing.');
    expect(text(run(LEGACY_CONTENT_TURN))).toBe(text(run(LEGACY_CONTENT_TURN)));
    expect(text(run(V2_CONTENT_TURN))).toBe(text(run(LEGACY_CONTENT_TURN)));
  });

  it('emits exactly one stream_finished before the terminal in both dialects', () => {
    for (const seq of [LEGACY_CONTENT_TURN, V2_CONTENT_TURN]) {
      const events = run(seq);
      const finishes = events.filter((e) => e.kind === CLIENT_EVENT.STREAM_FINISHED);
      const termIdx = events.findIndex((e) => e.kind === CLIENT_EVENT.FINALIZED);
      const finishIdx = events.findIndex((e) => e.kind === CLIENT_EVENT.STREAM_FINISHED);
      expect(finishes).toHaveLength(1);
      expect(finishIdx).toBeGreaterThanOrEqual(0);
      expect(finishIdx).toBeLessThan(termIdx);
    }
  });
});

describe('WP10F-1 — response start', () => {
  it('maps v2 response_started to a normalized response_started carrying the responseId', () => {
    const out = run([{ type: 'response_started', responseId: 'resp-42' }]);
    expect(out).toEqual([{ kind: CLIENT_EVENT.RESPONSE_STARTED, responseId: 'resp-42' }]);
  });
});

describe('Phase 8D.4 — provisional content ownership', () => {
  it('resets rejected-attempt prose before reducing the accepted attempt', () => {
    const state = reduceToUiState(run([
      { type: 'content_delta', content: 'Bad first prose.' },
      { type: 'content_reset' },
      { type: 'content_delta', content: 'Good second prose.' },
    ]));

    expect(state.text).toBe('Good second prose.');
  });

  it('drops a content reset after the terminal seal', () => {
    const n = createTransportEventNormalizer();
    n.normalize({ type: 'response_finalized', content: 'final' });
    expect(n.normalize({ type: 'content_reset' })).toEqual([]);
  });
});

describe('WP10F-1 — progress stage copy equivalence', () => {
  it.each([
    ['building_structured_itinerary', 'building_itinerary'],
    ['validating_trip', 'validating_trip'],
    ['writing_response', 'writing_response'],
    ['checking_response_matches_plan', 'checking_response'],
  ])('legacy stage %s and v2 product stage %s resolve to the same copy', (legacyStage, productStage) => {
    const legacy = run([{ type: 'thinking', stage: legacyStage }]);
    const v2 = run([{ type: 'progress', stage: productStage }]);
    expect(legacy).toHaveLength(1);
    expect(v2).toHaveLength(1);
    expect(legacy[0].kind).toBe(CLIENT_EVENT.PROGRESS);
    expect(v2[0].kind).toBe(CLIENT_EVENT.PROGRESS);
    // Same resolvable copy — the whole point of mapping product → internal.
    const copy = resolveThinkingStageCopy(legacyStage);
    expect(copy).toBeTruthy();
    expect(resolveThinkingStageCopy(v2[0].stage)).toBe(copy);
    expect(resolveThinkingStageCopy(legacy[0].stage)).toBe(copy);
  });

  // `checking_park_information` used to be the example here, because no product
  // stage outside the four internal ones had copy. The honest-progress pass gave
  // the emitted lifecycle stages copy, so the example moved to `building_route` —
  // still a declared product stage, still never emitted, still uncopied.
  it('a product stage with no copy passes through and resolves to null', () => {
    const out = run([{ type: 'progress', stage: 'building_route' }]);
    expect(out[0].kind).toBe(CLIENT_EVENT.PROGRESS);
    expect(resolveThinkingStageCopy(out[0].stage)).toBeNull();
  });

  it('the lifecycle stages the server actually emits all resolve to copy', () => {
    for (const stage of [
      'understanding_request', 'checking_park_information', 'checking_current_conditions',
      'checking_permits', 'checking_transport', 'validating_trip',
    ]) {
      const out = run([{ type: 'progress', stage }]);
      expect(out[0].kind).toBe(CLIENT_EVENT.PROGRESS);
      expect(resolveThinkingStageCopy(out[0].stage)).toBeTruthy();
    }
  });
});

describe('WP10F-1 — source badges/copy', () => {
  it('legacy thinking sources and v2 evidence_ready publicSources normalize identically', () => {
    const legacy = run([{ type: 'thinking', sources: ['nps', 'web'] }]);
    const v2 = run([{ type: 'evidence_ready', publicSources: ['nps', 'web'] }]);
    expect(legacy).toEqual([{ kind: CLIENT_EVENT.EVIDENCE, sources: ['nps', 'web'] }]);
    expect(v2).toEqual([{ kind: CLIENT_EVENT.EVIDENCE, sources: ['nps', 'web'] }]);
  });
});

describe('WP10F-1 — park display metadata is NOT inferred from evidence (deferred to WP10F-2)', () => {
  it('v2 evidence_ready never yields a display_context, even if park fields leak onto it', () => {
    const out = run([
      {
        type: 'evidence_ready',
        publicSources: ['nps'],
        parkName: 'Zion National Park', // must be ignored
        parkImages: ['https://img/x.jpg'], // must be ignored
      },
    ]);
    expect(out).toEqual([{ kind: CLIENT_EVENT.EVIDENCE, sources: ['nps'] }]);
    expect(out.some((e) => e.kind === CLIENT_EVENT.DISPLAY_CONTEXT)).toBe(false);
  });

  it('legacy thinking display DOES still fold into a display_context (today’s behavior)', () => {
    const out = run([
      { type: 'thinking', sources: ['nps'], parkName: 'Zion National Park', parkImages: ['https://img/1.jpg'] },
    ]);
    expect(out).toContainEqual({
      kind: CLIENT_EVENT.DISPLAY_CONTEXT,
      parkName: 'Zion National Park',
      parkNames: [],
      parkImages: ['https://img/1.jpg'],
    });
    expect(out).toContainEqual({ kind: CLIENT_EVENT.EVIDENCE, sources: ['nps'] });
  });
});

describe('WP10F-2 — v2 display_context maps to the same normalized shape as legacy', () => {
  it('a v2 display_context becomes a normalized display_context', () => {
    const out = run([
      { type: 'display_context', parkName: 'Zion National Park', parkNames: ['Zion National Park'], parkImages: ['https://img/1.jpg'] },
    ]);
    expect(out).toEqual([
      {
        kind: CLIENT_EVENT.DISPLAY_CONTEXT,
        parkName: 'Zion National Park',
        parkNames: ['Zion National Park'],
        parkImages: ['https://img/1.jpg'],
      },
    ]);
  });

  it('legacy thinking-display and v2 display_context normalize to the SAME shape', () => {
    const legacy = run([{ type: 'thinking', sources: [], parkName: 'Zion', parkNames: ['Zion'], parkImages: ['a.jpg'] }])
      .find((e) => e.kind === CLIENT_EVENT.DISPLAY_CONTEXT);
    const v2 = run([{ type: 'display_context', parkName: 'Zion', parkNames: ['Zion'], parkImages: ['a.jpg'] }])[0];
    expect(v2).toEqual(legacy);
  });

  it('a partial v2 display_context defaults its missing presentation keys', () => {
    const out = run([{ type: 'display_context', parkName: 'Zion' }]);
    expect(out).toEqual([{ kind: CLIENT_EVENT.DISPLAY_CONTEXT, parkName: 'Zion', parkNames: [], parkImages: [] }]);
  });

  it('incremental display updates merge — a later name change never wipes earlier images', () => {
    const out = run([
      { type: 'display_context', parkName: 'Zion', parkImages: ['a.jpg'] },
      { type: 'display_context', parkName: 'Zion Canyon' }, // no images this time
    ]);
    const state = reduceToUiState(out);
    expect(state.display).toEqual({
      parkName: 'Zion Canyon', // updated
      parkNames: [],
      parkImages: ['a.jpg'], // preserved, NOT reset by the second event
    });
  });

  it('a malformed v2 display_context fails safe (non-array park fields default cleanly)', () => {
    const out = run([{ type: 'display_context', parkName: 'Zion', parkNames: 'not-an-array', parkImages: null }]);
    expect(out).toEqual([{ kind: CLIENT_EVENT.DISPLAY_CONTEXT, parkName: 'Zion', parkNames: [], parkImages: [] }]);
  });

  it('a display_context after the terminal is ignored (client seal)', () => {
    const n = createTransportEventNormalizer();
    n.normalize({ type: 'response_finalized', content: 'final' });
    expect(n.normalize({ type: 'display_context', parkName: 'Late' })).toEqual([]);
  });

  it('evidence_ready STILL cannot create display state (permanent WP10F-1 gate)', () => {
    // The permanent boundary: evidence is not presentation. Even alongside a real
    // display_context, evidence_ready contributes nothing to display state.
    const state = reduceToUiState(run([
      { type: 'evidence_ready', publicSources: ['nps'], parkName: 'LEAK', parkImages: ['leak.jpg'] },
    ]));
    expect(state.display).toEqual({ parkName: null, parkNames: [], parkImages: [] });
    expect(state.sources).toEqual(['nps']);
  });
});

describe('WP10F-1 — authenticated itinerary turn', () => {
  const REV1 = { responseId: 'r1', responseRevision: 1, itineraryHash: 'hash-abc' };
  const REV2 = { responseId: 'r1', responseRevision: 2, itineraryHash: 'hash-abc' };
  const PLAN1 = { days: [{ day: 1 }] };

  const V2_ITINERARY_TURN = [
    { type: 'response_started', responseId: 'r1' },
    { type: 'progress', stage: 'building_itinerary' },
    { type: 'itinerary_ready', response: REV1, canonicalPlan: PLAN1 },
    { type: 'content_delta', content: 'Here is your plan.' },
    { type: 'prose_ready', response: REV2, canonicalPlan: PLAN1, expectedPreviousRevision: 1 },
    { type: 'response_finalized', responseId: 'r1', itineraryHash: 'hash-abc', content: 'Here is your plan.' },
  ];

  it('forwards itinerary_ready and prose_ready verbatim for the coordinator to guard', () => {
    const out = run(V2_ITINERARY_TURN);
    expect(out).toContainEqual({
      kind: CLIENT_EVENT.ITINERARY_READY,
      response: REV1,
      canonicalPlan: PLAN1,
    });
    expect(out).toContainEqual({
      kind: CLIENT_EVENT.PROSE_READY,
      response: REV2,
      canonicalPlan: PLAN1,
      expectedPreviousRevision: 1,
    });
  });

  it('prose_ready drives the one stream_finished, ahead of the terminal', () => {
    const out = run(V2_ITINERARY_TURN);
    const finishes = out.filter((e) => e.kind === CLIENT_EVENT.STREAM_FINISHED);
    expect(finishes).toHaveLength(1);
    const finishIdx = out.findIndex((e) => e.kind === CLIENT_EVENT.STREAM_FINISHED);
    const proseIdx = out.findIndex((e) => e.kind === CLIENT_EVENT.PROSE_READY);
    const termIdx = out.findIndex((e) => e.kind === CLIENT_EVENT.FINALIZED);
    expect(finishIdx).toBeLessThanOrEqual(proseIdx);
    expect(finishIdx).toBeLessThan(termIdx);
  });

  it('the normalizer does NOT itself guard the itinerary hash — it only forwards', () => {
    // A prose_ready whose plan hash differs is still forwarded; the coordinator,
    // not the normalizer, owns the succession/hash guard.
    const out = run([
      { type: 'itinerary_ready', response: REV1, canonicalPlan: PLAN1 },
      { type: 'prose_ready', response: { ...REV2, itineraryHash: 'DIFFERENT' }, canonicalPlan: { days: [] }, expectedPreviousRevision: 1 },
    ]);
    expect(out.some((e) => e.kind === CLIENT_EVENT.PROSE_READY)).toBe(true);
  });
});

describe('WP10F-1 — terminal seal', () => {
  it('a duplicate legacy done is ignored — first terminal wins', () => {
    const n = createTransportEventNormalizer();
    n.normalize({ type: 'stream_end' });
    const first = n.normalize({ type: 'done', content: 'A', ...TERMINAL_PAYLOAD });
    const second = n.normalize({ type: 'done', content: 'B', ...TERMINAL_PAYLOAD });
    expect(first.some((e) => e.kind === CLIENT_EVENT.FINALIZED)).toBe(true);
    expect(second).toEqual([]);
    expect(n.sealed()).toBe(true);
  });

  it('a duplicate v2 response_finalized is ignored — first terminal wins', () => {
    const n = createTransportEventNormalizer();
    const first = n.normalize({ type: 'response_finalized', content: 'A' });
    const second = n.normalize({ type: 'response_finalized', content: 'B' });
    expect(first.some((e) => e.kind === CLIENT_EVENT.FINALIZED)).toBe(true);
    expect(second).toEqual([]);
  });

  it('any event after a terminal is ignored (content_delta, progress, evidence)', () => {
    const n = createTransportEventNormalizer();
    n.normalize({ type: 'response_finalized', content: 'final' });
    expect(n.normalize({ type: 'content_delta', content: 'late' })).toEqual([]);
    expect(n.normalize({ type: 'progress', stage: 'writing_response' })).toEqual([]);
    expect(n.normalize({ type: 'evidence_ready', publicSources: ['nps'] })).toEqual([]);
  });

  it('error is a terminal — a finalized cannot overwrite it and vice versa', () => {
    const a = createTransportEventNormalizer();
    expect(a.normalize({ type: 'error', message: 'boom', code: 'x' })).toEqual([
      { kind: CLIENT_EVENT.ERROR, message: 'boom', code: 'x' },
    ]);
    expect(a.normalize({ type: 'response_finalized', content: 'late' })).toEqual([]);
    expect(a.sealed()).toBe(true);

    const b = createTransportEventNormalizer();
    b.normalize({ type: 'response_finalized', content: 'ok' });
    expect(b.normalize({ type: 'error', message: 'too late' })).toEqual([]);
  });

  it('legacy and v2 error normalize to the same shape', () => {
    const legacy = createTransportEventNormalizer().normalize({ type: 'error', message: 'bad', code: 'y' });
    const v2 = createTransportEventNormalizer().normalize({ type: 'error', message: 'bad', code: 'y' });
    expect(v2).toEqual(legacy);
  });
});

describe('WP10F-1 — robustness', () => {
  it('ignores malformed / typeless lines without emitting or sealing', () => {
    const n = createTransportEventNormalizer();
    expect(n.normalize(null)).toEqual([]);
    expect(n.normalize({})).toEqual([]);
    expect(n.normalize({ foo: 'bar' })).toEqual([]);
    expect(n.sealed()).toBe(false);
    // still able to process a real terminal afterwards
    expect(n.normalize({ type: 'done', ...TERMINAL_PAYLOAD }).some((e) => e.kind === CLIENT_EVENT.FINALIZED)).toBe(true);
  });

  it('ignores purely observational v2 events (prose_generation_started)', () => {
    const n = createTransportEventNormalizer();
    expect(n.normalize({ type: 'prose_generation_started', responseId: 'r1' })).toEqual([]);
    expect(n.sealed()).toBe(false);
  });
});
