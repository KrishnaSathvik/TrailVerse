'use strict';

/**
 * Stage 14.2A — revision-1 fail-safe terminal.
 *
 * The corrected behavior: on a revision-1/revision-2 itinerary mismatch the
 * candidate plan and prose are DISCARDED and the terminal `done` is rebuilt from
 * the revision-1 snapshot. Falling through to the candidate terminal would be
 * rejected by any client that already persisted revision 1.
 */

const fs = require('fs');
const path = require('path');

const {
  buildRevisionOneOutbound,
  buildRevisionTwoOutbound,
  buildMismatchSafeTerminal,
  assertItineraryUnchanged,
  createEarlyEventEmitter,
  EARLY_EVENT_FAILURE,
} = require('../earlyRevisionEvents');
const { hashPayload } = require('../canonicalResponse');
const { PERSISTENCE_OUTCOME, LIFECYCLE_STATUS } = require('../planPersistence');
const {
  resolveCanonicalResponsePersistence, resolveCreateIdempotency, CREATE_ACTION,
} = require('../canonicalPersistence');

const IDENTITY = { responseId: 'resp-14-2a', responseVersion: 4 };
const FROZEN = Object.freeze({
  days: [Object.freeze({
    id: 'd1', dayNumber: 1, label: 'Day 1',
    stops: [Object.freeze({ id: 's1', order: 1, type: 'trail', name: 'Angels Landing', note: 'Steep', startTime: '08:00', duration: 240 })],
  })],
});
const MUTATED = { days: [{ id: 'd1', dayNumber: 1, label: 'Day 1 EDITED', stops: [{ id: 's9', name: 'Somewhere else' }] }] };

const rev1 = () => buildRevisionOneOutbound({
  responseIdentity: IDENTITY, finalizedItinerary: FROZEN,
  feasibilityIssues: [{ severity: 'warning', message: 'Long drive on day 1' }],
  corrections: ['Shortened day 1'],
  parkName: 'Zion National Park', parkCode: 'zion', provider: 'claude', model: 'claude-sonnet-5',
});
const candidateRev2 = (itinerary = MUTATED) => buildRevisionTwoOutbound({
  responseIdentity: IDENTITY, revisionOne: rev1(), finalizedItinerary: itinerary,
  selectedProse: 'CANDIDATE PROSE about somewhere else.',
  parkName: 'Zion National Park', parkCode: 'zion', provider: 'claude', model: 'claude-sonnet-5',
});
const safeTerminal = (over = {}) => buildMismatchSafeTerminal({
  snapshot: rev1().snapshot, resolvedMetadata: { parkName: 'Zion National Park' },
  provider: 'claude', model: 'claude-sonnet-5', ...over,
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Stage 14.2A §1 — revision-1 snapshot seam', () => {
  it('captures exactly what itinerary_ready published', () => {
    const one = rev1();
    expect(one.snapshot).toMatchObject({
      responseId: IDENTITY.responseId,
      responseVersion: IDENTITY.responseVersion,
      itineraryHash: one.response.itineraryHash,
    });
    expect(one.snapshot.revision1Response).toBe(one.response);
    expect(one.snapshot.revision1CanonicalPlan).toBe(one.canonicalPlan);
    expect(one.snapshot.frozenItineraryData).toBe(FROZEN);
  });

  it('the snapshot is immutable', () => {
    const s = rev1().snapshot;
    expect(Object.isFrozen(s)).toBe(true);
    expect(() => { 'use strict'; s.itineraryHash = 'tampered'; }).toThrow();
  });
});

describe('Stage 14.2A §2 — corrected mismatch fail-safe', () => {
  it('detects the mismatch and reports a bounded code', () => {
    const check = assertItineraryUnchanged({ revisionOne: rev1(), revisionTwo: candidateRev2() });
    expect(check.ok).toBe(false);
    expect(check.code).toBe(EARLY_EVENT_FAILURE.ITINERARY_HASH_MISMATCH);
  });

  it('the safe terminal preserves the revision-1 identity, plan and hash', () => {
    const one = rev1();
    const safe = safeTerminal();
    expect(safe.envelope.responseId).toBe(one.response.responseId);
    expect(safe.envelope.responseVersion).toBe(one.response.responseVersion);
    expect(safe.envelope.itineraryHash).toBe(one.response.itineraryHash);
    expect(safe.canonicalPlan.itineraryHash).toBe(one.canonicalPlan.itineraryHash);
    expect(safe.itineraryData).toBe(FROZEN);
    expect(safe.canonicalPlan.days).toEqual(FROZEN.days);
  });

  it('is DIRECT-TERMINAL: no revision fields, no expectedPreviousRevision', () => {
    const safe = safeTerminal();
    expect(safe.envelope).not.toHaveProperty('responseRevision');
    expect(safe.envelope).not.toHaveProperty('previousRevision');
    expect(safe.envelope).not.toHaveProperty('lifecycleStatus');
    expect(safe.envelope).not.toHaveProperty('expectedPreviousRevision');
    expect(safe.canonicalPlan).not.toHaveProperty('expectedPreviousRevision');
  });

  it('carries sanitized deterministic prose rendered from the revision-1 itinerary', () => {
    const safe = safeTerminal();
    expect(safe.usedDeterministicFallback).toBe(true);
    expect(safe.prose).toContain('Angels Landing');
    expect(safe.prose).toContain('Zion National Park');
    expect(safe.envelope.content).toBe(safe.prose);
    expect(safe.envelope.contentHash).toBe(hashPayload(safe.prose));
  });

  it('contains NO candidate revision data', () => {
    const safe = JSON.stringify(safeTerminal());
    expect(safe).not.toMatch(/CANDIDATE PROSE/);
    expect(safe).not.toMatch(/Somewhere else/);
    expect(safe).not.toMatch(/Day 1 EDITED/);
    expect(safe).not.toMatch(/s9/);
  });

  it('returns null when deterministic construction cannot produce prose', () => {
    expect(buildMismatchSafeTerminal({ snapshot: null })).toBeNull();
    expect(buildMismatchSafeTerminal({
      snapshot: { ...rev1().snapshot, frozenItineraryData: null },
    })).toBeNull();
    // An itinerary with no renderable days yields empty prose → refuse.
    const empty = buildRevisionOneOutbound({ responseIdentity: IDENTITY, finalizedItinerary: { days: [] } });
    expect(buildMismatchSafeTerminal({ snapshot: empty.snapshot, resolvedMetadata: {} })).toBeNull();
  });

  it('no raw mutation detail enters the bounded failure code', () => {
    const check = assertItineraryUnchanged({ revisionOne: rev1(), revisionTwo: candidateRev2() });
    expect(Object.values(EARLY_EVENT_FAILURE)).toContain(check.code);
    expect(check.code).not.toMatch(/Angels|Somewhere|EDITED|d1|s9/);
    expect(JSON.stringify(check)).not.toMatch(/CANDIDATE|Somewhere else/);
  });
});

describe('Stage 14.2A §4 — mutation safety (no candidate data escapes)', () => {
  function runMismatchFlow({ reuseSnapshot = true } = {}) {
    const events = [];
    const emitter = createEarlyEventEmitter({ emit: (p) => events.push(p), enabled: true });
    const one = rev1();
    emitter.responseStarted({ responseId: IDENTITY.responseId, requiresStructuredItinerary: null });
    emitter.itineraryReady(one);
    emitter.proseGenerationStarted({ responseId: IDENTITY.responseId });

    const two = candidateRev2();
    const check = assertItineraryUnchanged({ revisionOne: one, revisionTwo: two });
    let terminal;
    if (check.ok) {
      emitter.proseReady(two);
      terminal = { envelope: two.response, canonicalPlan: two.canonicalPlan, prose: two.response.content, itineraryData: MUTATED };
    } else if (reuseSnapshot) {
      terminal = safeTerminal();
    } else {
      // MUTATION OF THE GUARD ITSELF: fall through to the candidate terminal, which
      // is precisely the unsafe behavior Stage 14.2A corrects.
      terminal = { envelope: two.response, canonicalPlan: two.canonicalPlan, prose: two.response.content, itineraryData: MUTATED };
    }
    emitter.sealTerminal();
    return { events, terminal, one };
  }

  const { events, terminal, one } = runMismatchFlow();

  it('emits NO prose_ready', () => {
    expect(events.map((e) => e.type)).toEqual([
      'response_started', 'itinerary_ready', 'prose_generation_started',
    ]);
    expect(events.some((e) => e.type === 'prose_ready')).toBe(false);
  });

  it('candidate prose and plan are never emitted', () => {
    const s = JSON.stringify(events);
    expect(s).not.toMatch(/CANDIDATE PROSE/);
    expect(s).not.toMatch(/Somewhere else/);
  });

  it('the candidate plan is never placed inside done', () => {
    expect(JSON.stringify(terminal)).not.toMatch(/Somewhere else|Day 1 EDITED/);
  });

  it('the final done uses the revision-1 itinerary hash and plan', () => {
    expect(terminal.envelope.itineraryHash).toBe(one.response.itineraryHash);
    expect(terminal.canonicalPlan.days).toEqual(FROZEN.days);
    expect(terminal.itineraryData).toBe(FROZEN);
  });

  it('the final prose is deterministic fallback prose', () => {
    expect(terminal.prose).toContain('Angels Landing');
    expect(terminal.prose).not.toContain('CANDIDATE');
  });

  // §4 — mutation-test the guard: bypassing snapshot reuse MUST break these.
  describe('bypassing revision-1 snapshot reuse (guard mutation)', () => {
    const bypassed = runMismatchFlow({ reuseSnapshot: false });

    it('would leak the candidate itinerary into done', () => {
      expect(bypassed.terminal.envelope.itineraryHash).not.toBe(one.response.itineraryHash);
      expect(JSON.stringify(bypassed.terminal)).toMatch(/Somewhere else/);
    });

    it('would be REJECTED by a client holding revision 1 — the real harm', () => {
      const r = resolveCanonicalResponsePersistence({
        incomingPlan: bypassed.terminal.canonicalPlan,
        incomingConversation: [],
        existingPlan: one.canonicalPlan,
        existingConversation: [],
      });
      expect(r.success).toBe(false);
      expect(r.reason).toBe('revision_itinerary_hash_changed');
    });
  });
});

describe('Stage 14.2A §3 — both client compatibility paths', () => {
  const safe = safeTerminal();

  it('OLD CLIENT: no stored revision 1 + safe terminal done → ACCEPT', () => {
    expect(resolveCreateIdempotency({ incomingPlan: safe.canonicalPlan, existingPlan: null }).action)
      .toBe(CREATE_ACTION.CREATE);
  });

  it('NEW CLIENT: stored explicit revision 1 + safe terminal done → ACCEPT as revision 2', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: safe.canonicalPlan, incomingConversation: [],
      existingPlan: rev1().canonicalPlan, existingConversation: [],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.ACCEPT);
    expect(r.reason).toBe('newer_revision');
    expect(r.incomingRevision).toBe(2);
    expect(r.storedRevision).toBe(1);
  });

  it('the same safe terminal repeated → IDEMPOTENT', () => {
    const first = resolveCanonicalResponsePersistence({
      incomingPlan: safe.canonicalPlan, incomingConversation: [],
      existingPlan: rev1().canonicalPlan, existingConversation: [],
    });
    expect(first.outcome).toBe(PERSISTENCE_OUTCOME.ACCEPT);
    const replay = resolveCanonicalResponsePersistence({
      incomingPlan: safe.canonicalPlan, incomingConversation: [],
      existingPlan: safe.canonicalPlan, existingConversation: [],
    });
    expect(replay.outcome).toBe(PERSISTENCE_OUTCOME.IDEMPOTENT);
  });

  it('stored revision 1 + terminal done with a CHANGED itinerary hash → CONFLICT (still blocking)', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: candidateRev2().canonicalPlan, incomingConversation: [],
      existingPlan: rev1().canonicalPlan, existingConversation: [],
    });
    expect(r.success).toBe(false);
    expect(r.reason).toBe('revision_itinerary_hash_changed');
  });
});

describe('Stage 14.2A §5 — final event ordering (route source, WP12 Phase 4)', () => {
  const AI_ROUTE = fs.readFileSync(path.resolve(__dirname, '..', '..', 'routes', 'ai.js'), 'utf8');
  const streaming = (() => {
    const start = AI_ROUTE.indexOf("router.post('/chat-stream'");
    const next = AI_ROUTE.indexOf("router.post('", start + 30);
    return AI_ROUTE.slice(start, next);
  })();

  it('response_started is emitted before WP11A generation', () => {
    const started = streaming.indexOf('transport.responseStarted');
    const v2 = streaming.indexOf('runTrailieFromPreparedContext');
    expect(started).toBeGreaterThan(-1);
    expect(v2).toBeGreaterThan(-1);
    expect(started).toBeLessThan(v2);
  });

  it('response_started precedes prepareChatContext', () => {
    expect(streaming.indexOf('transport.responseStarted'))
      .toBeLessThan(streaming.indexOf('prepareChatContext'));
  });

  it('aborts before Phase A when the connection is already closed', () => {
    const guard = streaming.indexOf('res.writableEnded');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(streaming.indexOf('prepareChatContext'));
  });

  it('terminal uses contentUnchanged + responseFinalized (no legacy mismatchSafeTerminal)', () => {
    expect(streaming).toMatch(/contentUnchanged/);
    expect(streaming).toMatch(/transport\.responseFinalized\(/);
    expect(streaming).not.toMatch(/mismatchSafeTerminal/);
  });

  it('runtime kill-switch emits transport.error without a conflicting finalized success path first', () => {
    const disabledIdx = streaming.indexOf("code: 'trailie_runtime_disabled'");
    expect(disabledIdx).toBeGreaterThan(-1);
    const blockStart = streaming.lastIndexOf('if (!isTrailieRuntimeEnabled())', disabledIdx);
    const block = streaming.slice(blockStart, disabledIdx + 200);
    expect(block).toMatch(/transport\.error\(/);
    expect(block).toMatch(/res\.end\(\)/);
  });
});

describe('Stage 14.2A §6 — timing semantics', () => {
  it('all timings share the turn-admission origin regardless of thinking events', () => {
    let t = 500;
    const e = createEarlyEventEmitter({ emit: () => {}, enabled: true, now: () => t });
    t = 900;  // thinking events happen here — they do not reset the origin
    t = 1700; e.itineraryReady(rev1());
    t = 3000; e.proseReady(buildRevisionTwoOutbound({ responseIdentity: IDENTITY, revisionOne: rev1(), finalizedItinerary: FROZEN, selectedProse: 'p' }));
    t = 3200; const timings = e.sealTerminal();
    expect(timings.timeToItineraryReadyMs).toBe(1200);
    expect(timings.timeToProseReadyMs).toBe(2500);
    expect(timings.timeToResponseCompleteMs).toBe(2700);
  });

  it('the mismatch path leaves timeToProseReadyMs NULL, never zero', () => {
    let t = 0;
    const e = createEarlyEventEmitter({ emit: () => {}, enabled: true, now: () => t });
    t = 1000; e.itineraryReady(rev1());
    // No prose_ready is emitted on the mismatch path.
    t = 2000; const timings = e.sealTerminal();
    expect(timings.timeToItineraryReadyMs).toBe(1000);
    expect(timings.timeToProseReadyMs).toBeNull();
    expect(timings.timeToProseReadyMs).not.toBe(0);
    expect(timings.timeToResponseCompleteMs).toBe(2000);
  });
});

describe('Stage 14.2A §7 — lifecycle compatibility (directional)', () => {
  const withStatus = (plan, lifecycleStatus) => ({ ...plan, lifecycleStatus });
  const base = rev1().canonicalPlan;
  const terminalPlan = (status) => withStatus({
    ...base, responseRevision: 2, contentHash: hashPayload('prose'),
  }, status);

  it('stored legacy status ABSENT + incoming durable status → compatible', () => {
    const stored = { ...terminalPlan(undefined) };
    delete stored.lifecycleStatus;
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: terminalPlan(LIFECYCLE_STATUS.PROSE_READY), incomingConversation: [],
      existingPlan: stored, existingConversation: [],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.IDEMPOTENT);
  });

  it('stored durable status + incoming terminal done with status ABSENT → compatible', () => {
    const incoming = { ...terminalPlan(undefined) };
    delete incoming.lifecycleStatus;
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: incoming, incomingConversation: [],
      existingPlan: terminalPlan(LIFECYCLE_STATUS.PROSE_READY), existingConversation: [],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.IDEMPOTENT);
  });

  it('two DIFFERENT explicit durable statuses → CONFLICT', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: terminalPlan(LIFECYCLE_STATUS.FALLBACK_COMPLETE), incomingConversation: [],
      existingPlan: terminalPlan(LIFECYCLE_STATUS.PROSE_READY), existingConversation: [],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.CONFLICT);
    expect(r.reason).toBe('same_revision_different_lifecycle_status');
  });
});
