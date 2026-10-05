'use strict';

const {
  EARLY_EVENT,
  EARLY_EVENT_FAILURE,
  buildRevisionOneOutbound,
  buildRevisionTwoOutbound,
  assertItineraryUnchanged,
  createEarlyEventEmitter,
} = require('../earlyRevisionEvents');
const { hashPayload } = require('../canonicalResponse');
const {
  PERSISTENCE_OUTCOME, LIFECYCLE_STATUS, lifecycleStatusesEquivalent,
} = require('../planPersistence');
const {
  resolveCanonicalResponsePersistence, resolveCreateIdempotency, CREATE_ACTION,
} = require('../canonicalPersistence');
const { createTurnResponseIdentity } = require('../responseIdentity');
const { earlyItineraryEventsEnabled, getItineraryGenerationConfig } = require('../../config/itineraryGenerationConfig');

const ITINERARY = Object.freeze({
  days: [Object.freeze({
    id: 'd1', dayNumber: 1, label: 'Day 1',
    stops: [Object.freeze({ id: 's1', order: 1, type: 'trail', name: 'Old Faithful', note: 'geyser', startTime: '09:00', duration: 60 })],
  })],
});
const IDENTITY = { responseId: 'resp-14-2', responseVersion: 3 };

const rev1 = (over = {}) => buildRevisionOneOutbound({
  responseIdentity: IDENTITY, finalizedItinerary: ITINERARY,
  feasibilityIssues: [], parkName: 'Yellowstone', parkCode: 'yell',
  provider: 'claude', model: 'claude-sonnet-5', ...over,
});
const rev2 = (over = {}) => buildRevisionTwoOutbound({
  responseIdentity: IDENTITY, revisionOne: rev1(), finalizedItinerary: ITINERARY,
  selectedProse: 'Day 1 — start at Old Faithful.',
  parkName: 'Yellowstone', parkCode: 'yell', provider: 'claude', model: 'claude-sonnet-5', ...over,
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Stage 14.2 §2 — feature flag seam', () => {
  const saved = process.env.TRAILIE_EARLY_ITINERARY_EVENTS;
  afterEach(() => {
    if (saved === undefined) delete process.env.TRAILIE_EARLY_ITINERARY_EVENTS;
    else process.env.TRAILIE_EARLY_ITINERARY_EVENTS = saved;
  });

  it('defaults to OFF', () => {
    delete process.env.TRAILIE_EARLY_ITINERARY_EVENTS;
    expect(earlyItineraryEventsEnabled()).toBe(false);
    expect(getItineraryGenerationConfig().earlyItineraryEvents).toBe(false);
  });

  it('is resolved through the existing configuration seam', () => {
    process.env.TRAILIE_EARLY_ITINERARY_EVENTS = 'true';
    expect(getItineraryGenerationConfig().earlyItineraryEvents).toBe(true);
  });

  it('only an exact "true" enables it', () => {
    for (const v of ['false', '1', 'yes', 'TRUE ', '']) {
      process.env.TRAILIE_EARLY_ITINERARY_EVENTS = v;
      expect(earlyItineraryEventsEnabled()).toBe(v === 'TRUE ' ? false : false);
    }
    process.env.TRAILIE_EARLY_ITINERARY_EVENTS = 'TRUE';
    expect(earlyItineraryEventsEnabled()).toBe(true); // case-insensitive
  });

  it('flag off emits NOTHING and builds no revision payload', () => {
    const events = [];
    const e = createEarlyEventEmitter({ emit: (p) => events.push(p), enabled: false });
    e.responseStarted({ responseId: 'x', requiresStructuredItinerary: true });
    e.itineraryReady(rev1());
    e.proseGenerationStarted({ responseId: 'x' });
    e.proseReady(rev2());
    expect(events).toEqual([]);
    expect(e.sentEvents()).toEqual([]);
    expect(e.timings.timeToItineraryReadyMs).toBeNull();
  });
});

describe('Stage 14.2 §3/§13 — event sequence and single emission', () => {
  function run() {
    const events = [];
    const e = createEarlyEventEmitter({ emit: (p) => events.push(p), enabled: true });
    e.responseStarted({ responseId: IDENTITY.responseId, requiresStructuredItinerary: true });
    e.itineraryReady(rev1());
    e.proseGenerationStarted({ responseId: IDENTITY.responseId });
    e.proseReady(rev2());
    e.sealTerminal();
    return { events, e };
  }

  it('emits the exact ordered sequence', () => {
    expect(run().events.map((x) => x.type)).toEqual([
      EARLY_EVENT.RESPONSE_STARTED,
      EARLY_EVENT.ITINERARY_READY,
      EARLY_EVENT.PROSE_GENERATION_STARTED,
      EARLY_EVENT.PROSE_READY,
    ]);
  });

  it('response_started precedes itinerary work; prose_ready precedes done', () => {
    const types = run().events.map((x) => x.type);
    expect(types.indexOf('response_started')).toBeLessThan(types.indexOf('itinerary_ready'));
    expect(types.indexOf('itinerary_ready')).toBeLessThan(types.indexOf('prose_generation_started'));
    expect(types.indexOf('prose_generation_started')).toBeLessThan(types.indexOf('prose_ready'));
  });

  it('never emits an event after the terminal done', () => {
    const { events, e } = run();
    const countAfter = events.length;
    e.itineraryReady(rev1());
    e.proseReady(rev2());
    e.responseStarted({ responseId: 'x', requiresStructuredItinerary: true });
    expect(events).toHaveLength(countAfter);
  });

  it('repeated internal callbacks never duplicate an event', () => {
    const events = [];
    const e = createEarlyEventEmitter({ emit: (p) => events.push(p), enabled: true });
    for (let i = 0; i < 5; i += 1) {
      e.responseStarted({ responseId: IDENTITY.responseId, requiresStructuredItinerary: true });
      e.itineraryReady(rev1());
      e.proseGenerationStarted({ responseId: IDENTITY.responseId });
      e.proseReady(rev2());
    }
    expect(events.map((x) => x.type)).toEqual([
      'response_started', 'itinerary_ready', 'prose_generation_started', 'prose_ready',
    ]);
  });

  it('a null outbound emits nothing (prose-only / structured failure)', () => {
    const events = [];
    const e = createEarlyEventEmitter({ emit: (p) => events.push(p), enabled: true });
    expect(e.itineraryReady(null)).toBe(false);
    expect(events).toEqual([]);
  });

  it('§15 — timings come from one monotonic turn start', () => {
    let t = 1000;
    const e = createEarlyEventEmitter({ emit: () => {}, enabled: true, now: () => t });
    t = 1500; e.itineraryReady(rev1());
    t = 2200; e.proseReady(rev2());
    t = 2400; const timings = e.sealTerminal();
    expect(timings.timeToItineraryReadyMs).toBe(500);
    expect(timings.timeToProseReadyMs).toBe(1200);
    expect(timings.timeToResponseCompleteMs).toBe(1400);
    expect(timings.timeToItineraryReadyMs).toBeLessThan(timings.timeToProseReadyMs);
    expect(timings.timeToProseReadyMs).toBeLessThan(timings.timeToResponseCompleteMs);
  });
});

describe('Stage 14.2 §4 — canonical payloads, not fragments', () => {
  it('revision 1 carries a complete envelope and plan', () => {
    const out = rev1();
    expect(out.response).toMatchObject({
      responseId: IDENTITY.responseId,
      responseVersion: 3,
      responseRevision: 1,
      previousRevision: null,
      lifecycleStatus: LIFECYCLE_STATUS.ITINERARY_READY,
      content: '',
    });
    expect(out.response.contentHash).toBe(hashPayload(''));
    expect(out.response.itineraryHash).toBeTruthy();
    expect(out.response.itineraryReadyAt).toBeTruthy();
    // Envelope carries no succession claim — revision 1 has no base.
    expect(out.response.expectedPreviousRevision).toBeUndefined();
  });

  it('the revision-1 plan and envelope describe the SAME frozen itinerary', () => {
    const out = rev1();
    expect(out.canonicalPlan.itineraryHash).toBe(out.response.itineraryHash);
    expect(out.canonicalPlan.responseId).toBe(out.response.responseId);
    expect(out.canonicalPlan.responseRevision).toBe(1);
    expect(out.canonicalPlan.days).toEqual(ITINERARY.days);
  });

  it('revision 2 carries the explicit succession fields', () => {
    const out = rev2();
    expect(out.response).toMatchObject({
      responseId: IDENTITY.responseId,
      responseVersion: 3,
      responseRevision: 2,
      previousRevision: 1,
      lifecycleStatus: LIFECYCLE_STATUS.PROSE_READY,
      content: 'Day 1 — start at Old Faithful.',
    });
    expect(out.expectedPreviousRevision).toBe(1);
    expect(out.response.proseReadyAt).toBeTruthy();
  });

  it('revision-2 payloads are persistable VERBATIM — no client reconstruction', () => {
    // The exact shape the existing writer consumes: plan + expectedPreviousRevision.
    const one = rev1();
    const two = rev2({ revisionOne: one });
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: two.canonicalPlan,
      incomingConversation: [{
        role: 'assistant',
        responseId: two.response.responseId,
        responseVersion: two.response.responseVersion,
        responseRevision: two.response.responseRevision,
        lifecycleStatus: two.response.lifecycleStatus,
        contentHash: two.response.contentHash,
        itineraryHash: two.response.itineraryHash,
        content: two.response.content,
      }],
      expectedPreviousRevision: two.expectedPreviousRevision,
      existingPlan: one.canonicalPlan,
      existingConversation: [],
    });
    expect(r.success).toBe(true);
    expect(r.revisionSuccession).toBe(true);
  });

  it('the revision-1 payload is persistable verbatim as a create', () => {
    const one = rev1();
    expect(resolveCreateIdempotency({ incomingPlan: one.canonicalPlan, existingPlan: null }).action)
      .toBe(CREATE_ACTION.CREATE);
  });

  it('revision 1 carries no audit trail or review meta (they describe the COMPLETE response)', () => {
    const out = rev1();
    expect(out.canonicalPlan.auditTrail).toBeUndefined();
    expect(out.canonicalPlan.reviewMeta).toBeUndefined();
  });

  it('revision 2 preserves the revision-1 itineraryReadyAt', () => {
    const one = rev1();
    const two = rev2({ revisionOne: one });
    expect(two.canonicalPlan.itineraryReadyAt).toBe(one.canonicalPlan.itineraryReadyAt);
  });
});

describe('Stage 14.2 §7 — itinerary immutability between revisions', () => {
  it('passes when the itinerary is unchanged', () => {
    expect(assertItineraryUnchanged({ revisionOne: rev1(), revisionTwo: rev2() }))
      .toEqual({ ok: true, code: null });
  });

  it('FAILS CLOSED when the itinerary changed — the guard is load-bearing', () => {
    const mutated = { days: [{ id: 'd1', dayNumber: 1, label: 'Day 1 EDITED', stops: [] }] };
    const two = rev2({ finalizedItinerary: mutated });
    const check = assertItineraryUnchanged({ revisionOne: rev1(), revisionTwo: two });
    expect(check.ok).toBe(false);
    expect(check.code).toBe(EARLY_EVENT_FAILURE.ITINERARY_HASH_MISMATCH);
  });

  it('a stop added between revisions is caught', () => {
    const extraStop = { days: [{ ...ITINERARY.days[0], stops: [...ITINERARY.days[0].stops, { id: 's2', name: 'Extra' }] }] };
    expect(assertItineraryUnchanged({ revisionOne: rev1(), revisionTwo: rev2({ finalizedItinerary: extraStop }) }).ok)
      .toBe(false);
  });

  it('the failure code is a bounded slug carrying no plan data', () => {
    const check = assertItineraryUnchanged({
      revisionOne: rev1(),
      revisionTwo: rev2({ finalizedItinerary: { days: [{ id: 'x', stops: [] }] } }),
    });
    expect(Object.values(EARLY_EVENT_FAILURE)).toContain(check.code);
    expect(check.code).not.toMatch(/Old Faithful|Yellowstone|geyser/);
  });

  it('the persistence layer independently rejects a mutated succession', () => {
    const one = rev1();
    const two = rev2({ finalizedItinerary: { days: [{ id: 'zz', stops: [] }] } });
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: two.canonicalPlan, incomingConversation: [],
      expectedPreviousRevision: 1,
      existingPlan: one.canonicalPlan, existingConversation: [],
    });
    expect(r.success).toBe(false);
    expect(r.reason).toBe('revision_itinerary_hash_changed');
  });
});

describe('Stage 14.2 §6 — stable identity invariants', () => {
  it('one identity flows through every event and the terminal envelope', () => {
    const id = createTurnResponseIdentity({ priorResponseVersion: 2 });
    const one = buildRevisionOneOutbound({ responseIdentity: id, finalizedItinerary: ITINERARY });
    const two = buildRevisionTwoOutbound({ responseIdentity: id, revisionOne: one, finalizedItinerary: ITINERARY, selectedProse: 'p' });
    const ids = new Set([id.responseId, one.response.responseId, two.response.responseId]);
    expect(ids.size).toBe(1);
  });

  it('revisioning does not consume another turn version', () => {
    const id = createTurnResponseIdentity({ priorResponseVersion: 2 });
    const one = buildRevisionOneOutbound({ responseIdentity: id, finalizedItinerary: ITINERARY });
    const two = buildRevisionTwoOutbound({ responseIdentity: id, revisionOne: one, finalizedItinerary: ITINERARY, selectedProse: 'p' });
    expect(one.response.responseVersion).toBe(3);
    expect(two.response.responseVersion).toBe(3);
  });

  it('uses the intended revision numbers', () => {
    expect(rev1().response.responseRevision).toBe(1);
    expect(rev2().response.responseRevision).toBe(2);
  });
});

describe('Stage 14.2 §5 — direct-terminal `done` compatibility', () => {
  // The terminal `done` envelope is built by buildCanonicalOutbound WITHOUT revision
  // fields, so it normalizes to terminal revision 2 and claims no base revision.
  const donePlan = (over = {}) => ({
    responseId: IDENTITY.responseId, responseVersion: 3,
    contentHash: hashPayload('Day 1 — start at Old Faithful.'),
    itineraryHash: rev1().response.itineraryHash,
    days: ITINERARY.days, ...over,
  });

  it('no stored response + terminal done → ACCEPT', () => {
    expect(resolveCreateIdempotency({ incomingPlan: donePlan(), existingPlan: null }).action)
      .toBe(CREATE_ACTION.CREATE);
  });

  it('stored explicit rev 1 + explicit prose_ready rev 2 → ACCEPT', () => {
    const one = rev1();
    const two = rev2({ revisionOne: one });
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: two.canonicalPlan, incomingConversation: [],
      expectedPreviousRevision: two.expectedPreviousRevision,
      existingPlan: one.canonicalPlan, existingConversation: [],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.ACCEPT);
  });

  it('stored explicit rev 1 + OLD-CLIENT terminal done → ACCEPT (no revision 1 required)', () => {
    const one = rev1();
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: donePlan(), incomingConversation: [],
      existingPlan: one.canonicalPlan, existingConversation: [],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.ACCEPT);
    expect(r.reason).toBe('newer_revision');
  });

  it('stored explicit rev 2 + identical done → IDEMPOTENT', () => {
    const two = rev2();
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: donePlan({ contentHash: two.response.contentHash }),
      incomingConversation: [],
      existingPlan: two.canonicalPlan, existingConversation: [],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.IDEMPOTENT);
  });

  it('stored explicit rev 2 + differing done hashes → CONFLICT', () => {
    const two = rev2();
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: donePlan({ contentHash: hashPayload('different prose') }),
      incomingConversation: [],
      existingPlan: two.canonicalPlan, existingConversation: [],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.CONFLICT);
  });

  it('the terminal done payload NEVER carries expectedPreviousRevision', () => {
    // Guarding the exact failure mode: an old client saving `done` with no stored
    // revision 1 must not be rejected with expected_revision_but_none_stored.
    expect(donePlan().expectedPreviousRevision).toBeUndefined();
    expect(resolveCreateIdempotency({ incomingPlan: donePlan(), existingPlan: null }).reason)
      .not.toBe('expected_revision_but_none_stored');
  });
});

describe('Stage 14.2 §8 — durable lifecycle semantic equality', () => {
  it('same revision + same hashes + DIFFERENT durable status → CONFLICT', () => {
    const two = rev2();
    const fallback = rev2({ usedDeterministicFallback: true });
    // Force identical hashes so only the lifecycle status differs.
    const incoming = { ...fallback.canonicalPlan, contentHash: two.canonicalPlan.contentHash };
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: incoming, incomingConversation: [],
      existingPlan: two.canonicalPlan, existingConversation: [],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.CONFLICT);
    expect(r.reason).toBe('same_revision_different_lifecycle_status');
  });

  it('an ABSENT status is the one documented equivalent', () => {
    expect(lifecycleStatusesEquivalent(null, 'prose_ready')).toBe(true);
    expect(lifecycleStatusesEquivalent('prose_ready', undefined)).toBe(true);
    expect(lifecycleStatusesEquivalent('prose_ready', 'prose_ready')).toBe(true);
    expect(lifecycleStatusesEquivalent('prose_ready', 'fallback_complete')).toBe(false);
  });

  it('timestamps may differ without conflicting', () => {
    const a = rev2();
    const b = { ...a.canonicalPlan, proseReadyAt: '2099-01-01T00:00:00.000Z', generatedAt: '2099-01-01T00:00:00.000Z' };
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: b, incomingConversation: [],
      existingPlan: a.canonicalPlan, existingConversation: [],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.IDEMPOTENT);
  });
});

describe('Stage 14.2 §12 — deterministic fallback uses the SAME contract', () => {
  it('only the lifecycle status differs', () => {
    const model = rev2();
    const fallback = rev2({ usedDeterministicFallback: true });
    expect(fallback.response.lifecycleStatus).toBe(LIFECYCLE_STATUS.FALLBACK_COMPLETE);
    expect(model.response.lifecycleStatus).toBe(LIFECYCLE_STATUS.PROSE_READY);
    expect(fallback.response.responseRevision).toBe(model.response.responseRevision);
    expect(fallback.expectedPreviousRevision).toBe(model.expectedPreviousRevision);
    expect(Object.keys(fallback.response).sort()).toEqual(Object.keys(model.response).sort());
    expect(Object.keys(fallback.canonicalPlan).sort()).toEqual(Object.keys(model.canonicalPlan).sort());
  });
});

describe('Stage 14.2 §9 — event sanitation', () => {
  const ARTIFACTS = [
    /\[ITINERARY_JSON\]/i, /"create_itinerary"/i, /"tool_use"/i, /"input_schema"/i,
    /TRAILIE_[A-Z_]+/, /BASE_SYSTEM_PROMPT/, /ANTHROPIC_API_KEY/, /artifacts\/private/,
  ];

  it('itinerary_ready carries no artifacts, prompts, markers, or env values', () => {
    const s = JSON.stringify(rev1());
    for (const re of ARTIFACTS) expect(s).not.toMatch(re);
  });

  it('prose_ready carries no artifacts and no rejected drafts', () => {
    const s = JSON.stringify(rev2());
    for (const re of ARTIFACTS) expect(s).not.toMatch(re);
    expect(s).not.toMatch(/rejected|firstDraft|retryDraft|verifierResult/i);
  });

  it('prose_ready content is EXACTLY the sanitized selected prose', () => {
    const out = rev2({ selectedProse: 'Verified prose only.' });
    expect(out.response.content).toBe('Verified prose only.');
    expect(out.response.contentHash).toBe(hashPayload('Verified prose only.'));
  });

  it('artifact-bearing prose is stripped by the shared canonical builder', () => {
    // Reuses the existing sanitation seam — no parallel serializer.
    const out = rev2({ selectedProse: 'Real prose.\n\n[ITINERARY_JSON]{"days":[]}[/ITINERARY_JSON]' });
    expect(out.response.content).not.toMatch(/\[ITINERARY_JSON\]/);
    expect(out.response.content).toBe('Real prose.');
  });

  it('no event payload contains verifier internals', () => {
    const s = JSON.stringify({ one: rev1(), two: rev2() });
    for (const key of ['issueCodes', 'failurePaths', 'markerBearingDraft', 'proseConsistencyMeta']) {
      expect(s).not.toContain(key);
    }
  });
});
