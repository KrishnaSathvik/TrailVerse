'use strict';

const {
  PERSISTENCE_OUTCOME,
  RESPONSE_REVISION,
  LIFECYCLE_STATUS,
  TRANSIENT_LIFECYCLE_STATUSES,
  DURABLE_LIFECYCLE_STATUSES,
  normalizeRevision,
  extractPlanIdentity,
  decidePersistenceOutcome,
} = require('../planPersistence');
const {
  resolveCanonicalResponsePersistence,
  resolveCreateIdempotency,
  mergeTerminalRevisionIntoConversation,
  CREATE_ACTION,
} = require('../canonicalPersistence');
const { buildCanonicalTrailieResponse, hashPayload } = require('../canonicalResponse');
const { createTurnResponseIdentity, readPriorResponseVersion } = require('../responseIdentity');

const RID = 'resp-abc';
const ITIN = 'itin-hash-1';
const EMPTY_HASH = hashPayload('');

const rev1Plan = (over = {}) => ({
  responseId: RID, responseVersion: 3, responseRevision: 1,
  contentHash: EMPTY_HASH, itineraryHash: ITIN, days: [{ dayNumber: 1 }], ...over,
});
const rev2Plan = (over = {}) => ({
  responseId: RID, responseVersion: 3, responseRevision: 2,
  contentHash: hashPayload('final prose'), itineraryHash: ITIN, days: [{ dayNumber: 1 }], ...over,
});
const legacyPlan = (over = {}) => ({
  responseId: RID, responseVersion: 3,
  contentHash: hashPayload('final prose'), itineraryHash: ITIN, ...over,
});

const decide = (incoming, existing) => decidePersistenceOutcome({
  incoming: extractPlanIdentity(incoming) && { ...extractPlanIdentity(incoming), ...(incoming.expectedPreviousRevision != null ? { expectedPreviousRevision: incoming.expectedPreviousRevision } : {}) },
  existing: extractPlanIdentity(existing),
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Stage 14.1 §2 — stable identity minted at turn admission', () => {
  it('mints one identity before Phase A', () => {
    const id = createTurnResponseIdentity({ priorResponseVersion: 4 });
    expect(id.responseId).toMatch(/^[0-9a-f-]{36}$/);
    expect(id.responseVersion).toBe(5);
    expect(id.mintedAt).toBeTruthy();
  });

  it('reuses the SAME id across both revisions and a terminal failure', () => {
    const id = createTurnResponseIdentity({ priorResponseVersion: 0 });
    const rev1 = buildCanonicalTrailieResponse({
      responseId: id.responseId, responseVersion: id.responseVersion,
      responseRevision: 1, previousRevision: null,
      lifecycleStatus: LIFECYCLE_STATUS.ITINERARY_READY,
      processedContent: '', itineraryData: { days: [1] },
    });
    const rev2 = buildCanonicalTrailieResponse({
      responseId: id.responseId, responseVersion: id.responseVersion,
      responseRevision: 2, previousRevision: 1,
      lifecycleStatus: LIFECYCLE_STATUS.PROSE_READY,
      processedContent: 'prose', itineraryData: { days: [1] },
    });
    const terminalFailure = buildCanonicalTrailieResponse({
      responseId: id.responseId, responseVersion: id.responseVersion,
      processedContent: 'prose-only answer',
    });
    expect(rev1.responseId).toBe(id.responseId);
    expect(rev2.responseId).toBe(id.responseId);
    expect(terminalFailure.responseId).toBe(id.responseId);
    // Same turn ⇒ same version slot for both revisions.
    expect(rev1.responseVersion).toBe(rev2.responseVersion);
    // The itinerary hash is identical across revisions; content differs.
    expect(rev1.itineraryHash).toBe(rev2.itineraryHash);
    expect(rev1.contentHash).not.toBe(rev2.contentHash);
  });

  it('never derives identity from raw client input', () => {
    const a = createTurnResponseIdentity({ priorResponseVersion: 1 });
    const b = createTurnResponseIdentity({ priorResponseVersion: 1 });
    expect(a.responseId).not.toBe(b.responseId); // random, not content-derived
  });

  it('reads priorResponseVersion defensively', () => {
    expect(readPriorResponseVersion({ metadata: { priorResponseVersion: 7 } })).toBe(7);
    expect(readPriorResponseVersion({ metadata: { priorResponseVersion: 'x' } })).toBe(0);
    expect(readPriorResponseVersion({})).toBe(0);
    expect(readPriorResponseVersion(undefined)).toBe(0);
  });
});

describe('Stage 14.1 §3 — revision contracts', () => {
  it('revision 1 is an empty-content itinerary_ready shell', () => {
    const e = buildCanonicalTrailieResponse({
      responseId: RID, responseVersion: 1, responseRevision: 1, previousRevision: null,
      lifecycleStatus: LIFECYCLE_STATUS.ITINERARY_READY,
      itineraryReadyAt: '2026-08-02T00:00:00.000Z',
      processedContent: '', itineraryData: { days: [{ dayNumber: 1 }] },
    });
    expect(e.responseRevision).toBe(1);
    expect(e.previousRevision).toBeNull();
    expect(e.lifecycleStatus).toBe('itinerary_ready');
    expect(e.content).toBe('');
    expect(e.contentHash).toBe(EMPTY_HASH);
    expect(e.itineraryHash).toBeTruthy();
    expect(e.itineraryReadyAt).toBe('2026-08-02T00:00:00.000Z');
  });

  it('an envelope without revision fields keeps pre-Stage-14 shape exactly', () => {
    const legacy = buildCanonicalTrailieResponse({ responseId: RID, processedContent: 'hi' });
    expect(legacy).not.toHaveProperty('responseRevision');
    expect(legacy).not.toHaveProperty('previousRevision');
    expect(legacy).not.toHaveProperty('lifecycleStatus');
  });

  it('revision fields never change the content or itinerary hash', () => {
    const base = { responseId: RID, processedContent: 'same prose', itineraryData: { days: [1] } };
    const plain = buildCanonicalTrailieResponse(base);
    const revised = buildCanonicalTrailieResponse({
      ...base, responseRevision: 2, previousRevision: 1, lifecycleStatus: 'prose_ready',
    });
    expect(revised.contentHash).toBe(plain.contentHash);
    expect(revised.itineraryHash).toBe(plain.itineraryHash);
  });

  it('separates durable from transient lifecycle states', () => {
    expect([...DURABLE_LIFECYCLE_STATUSES].sort()).toEqual(
      ['fallback_complete', 'itinerary_ready', 'prose_failed', 'prose_ready']
    );
    expect(TRANSIENT_LIFECYCLE_STATUSES.has('generating_itinerary')).toBe(true);
    expect(TRANSIENT_LIFECYCLE_STATUSES.has('generating_prose')).toBe(true);
    for (const s of TRANSIENT_LIFECYCLE_STATUSES) {
      expect(DURABLE_LIFECYCLE_STATUSES.has(s)).toBe(false);
    }
  });
});

describe('Stage 14.1 §4/§5 — persistence comparison matrix', () => {
  it('newer logical turn is ACCEPTed', () => {
    const r = decide(rev2Plan({ responseId: 'new', responseVersion: 4 }), rev2Plan());
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.ACCEPT);
  });

  it('revision 1 → revision 2 of the same turn is ACCEPTed', () => {
    const r = decide(rev2Plan({ expectedPreviousRevision: 1 }), rev1Plan());
    expect(r).toEqual({ outcome: PERSISTENCE_OUTCOME.ACCEPT, reason: 'newer_revision' });
  });

  it('revision succession works without an explicit expectedPreviousRevision', () => {
    expect(decide(rev2Plan(), rev1Plan()).outcome).toBe(PERSISTENCE_OUTCOME.ACCEPT);
  });

  it('same revision with identical hashes is IDEMPOTENT', () => {
    expect(decide(rev1Plan(), rev1Plan()).outcome).toBe(PERSISTENCE_OUTCOME.IDEMPOTENT);
    expect(decide(rev2Plan(), rev2Plan()).outcome).toBe(PERSISTENCE_OUTCOME.IDEMPOTENT);
  });

  it('same revision with differing content hash is CONFLICT', () => {
    const r = decide(rev2Plan({ contentHash: hashPayload('other') }), rev2Plan());
    expect(r).toEqual({ outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'same_version_different_hash' });
  });

  it('same revision with differing itinerary hash is CONFLICT', () => {
    expect(decide(rev1Plan({ itineraryHash: 'other' }), rev1Plan()).outcome)
      .toBe(PERSISTENCE_OUTCOME.CONFLICT);
  });

  it('revision 2 with a CHANGED itinerary hash is CONFLICT — the frozen plan is immutable', () => {
    const r = decide(rev2Plan({ itineraryHash: 'mutated', expectedPreviousRevision: 1 }), rev1Plan());
    expect(r).toEqual({ outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'revision_itinerary_hash_changed' });
  });

  it('a lower revision is STALE', () => {
    const r = decide(rev1Plan(), rev2Plan());
    expect(r).toEqual({ outcome: PERSISTENCE_OUTCOME.STALE, reason: 'older_revision' });
  });

  it('an older responseVersion is still STALE', () => {
    expect(decide(rev2Plan({ responseVersion: 2 }), rev2Plan()).outcome).toBe(PERSISTENCE_OUTCOME.STALE);
  });

  it('a different responseId in the same version slot is CONFLICT', () => {
    expect(decide(rev1Plan({ responseId: 'other' }), rev1Plan()).outcome)
      .toBe(PERSISTENCE_OUTCOME.CONFLICT);
  });

  it('a mismatched expectedPreviousRevision is CONFLICT', () => {
    const r = decide(rev2Plan({ expectedPreviousRevision: 2 }), rev1Plan());
    expect(r).toEqual({ outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'revision_base_mismatch' });
  });

  it('a write expecting a base revision when nothing is stored is CONFLICT, not a create', () => {
    const r = decidePersistenceOutcome({
      incoming: { ...extractPlanIdentity(rev2Plan()), expectedPreviousRevision: 1 },
      existing: null,
    });
    expect(r).toEqual({ outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'expected_revision_but_none_stored' });
  });
});

describe('Stage 14.1 §5/§6 — legacy compatibility and direct-terminal writes', () => {
  it('normalizes a missing revision to terminal (2)', () => {
    expect(normalizeRevision(undefined)).toBe(RESPONSE_REVISION.TERMINAL);
    expect(normalizeRevision(null)).toBe(2);
    expect(normalizeRevision(0)).toBe(2);
    expect(normalizeRevision('x')).toBe(2);
    expect(normalizeRevision(1)).toBe(1);
  });

  it('a STORED response without a revision is read as terminal', () => {
    const id = extractPlanIdentity(legacyPlan());
    expect(id.responseRevision).toBe(2);
    expect(id.revisionExplicit).toBe(false);
  });

  it('legacy incoming vs legacy stored behaves exactly as before (idempotent)', () => {
    expect(decide(legacyPlan(), legacyPlan()).outcome).toBe(PERSISTENCE_OUTCOME.IDEMPOTENT);
  });

  it('legacy incoming vs stored revision 1 is treated as the terminal succession', () => {
    const r = decide(legacyPlan(), rev1Plan());
    expect(r).toEqual({ outcome: PERSISTENCE_OUTCOME.ACCEPT, reason: 'newer_revision' });
  });

  it('a revision-1 write against a stored LEGACY terminal response is STALE', () => {
    expect(decide(rev1Plan(), legacyPlan()).outcome).toBe(PERSISTENCE_OUTCOME.STALE);
  });

  it('direct terminal revision 2 is accepted with no revision 1 (flag off / non-streaming)', () => {
    const r = decidePersistenceOutcome({ incoming: extractPlanIdentity(rev2Plan()), existing: null });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.ACCEPT);
  });

  it('a new turn may land directly as terminal over a completed previous turn', () => {
    const r = decide(rev2Plan({ responseId: 'turn-2', responseVersion: 4 }), rev2Plan());
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.ACCEPT);
  });
});

describe('Stage 14.1 §7 — atomic revision writes', () => {
  it('flags a revision succession so the caller updates in place', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: rev2Plan(),
      incomingConversation: [{ role: 'assistant', responseId: RID, responseVersion: 3, responseRevision: 2, content: 'prose' }],
      expectedPreviousRevision: 1,
      existingPlan: rev1Plan(),
      existingConversation: [{ role: 'assistant', responseId: RID, responseVersion: 3, responseRevision: 1, content: '' }],
    });
    expect(r.success).toBe(true);
    expect(r.revisionSuccession).toBe(true);
    expect(r.storedRevision).toBe(1);
    expect(r.incomingRevision).toBe(2);
  });

  it('a normal new-turn write is NOT flagged as a succession', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: rev2Plan({ responseId: 'other', responseVersion: 4 }),
      incomingConversation: [],
      existingPlan: rev2Plan(),
      existingConversation: [],
    });
    expect(r.success).toBe(true);
    expect(r.revisionSuccession).toBe(false);
  });

  it('rejects the WHOLE unit when the terminal revision mutates the itinerary', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: rev2Plan({ itineraryHash: 'mutated' }),
      incomingConversation: [{ role: 'assistant', responseId: RID, responseVersion: 3, content: 'prose' }],
      expectedPreviousRevision: 1,
      existingPlan: rev1Plan(),
      existingConversation: [],
    });
    expect(r.success).toBe(false);
    expect(r.writePlan).toBe(false);
    expect(r.writeConversation).toBe(false);
    expect(r.reason).toBe('revision_itinerary_hash_changed');
  });

  describe('conversation merge — update in place, never append', () => {
    const shell = { id: 11, role: 'assistant', responseId: RID, responseRevision: 1, content: '', timestamp: 'T0' };
    const user = { id: 10, role: 'user', content: 'plan a week' };

    it('replaces the revision-1 shell and keeps its id and timestamp', () => {
      const out = mergeTerminalRevisionIntoConversation({
        storedConversation: [user, shell],
        incomingConversation: [user, { id: 99, role: 'assistant', responseId: RID, responseRevision: 2, content: 'prose', timestamp: 'T1' }],
        responseId: RID,
      });
      expect(out).toHaveLength(2);
      expect(out[1]).toMatchObject({ id: 11, timestamp: 'T0', content: 'prose', responseRevision: 2 });
    });

    it('never yields two assistant messages for one response', () => {
      const out = mergeTerminalRevisionIntoConversation({
        storedConversation: [user, shell],
        incomingConversation: [
          user,
          { id: 11, role: 'assistant', responseId: RID, responseRevision: 1, content: '' },
          { id: 99, role: 'assistant', responseId: RID, responseRevision: 2, content: 'prose' },
        ],
        responseId: RID,
      });
      expect(out.filter((m) => m.role === 'assistant' && m.responseId === RID)).toHaveLength(1);
      expect(out[1].content).toBe('prose');
    });

    it('preserves unrelated turns and their order', () => {
      const older = { id: 1, role: 'assistant', responseId: 'older', content: 'prev' };
      const out = mergeTerminalRevisionIntoConversation({
        storedConversation: [older, user, shell],
        incomingConversation: [older, user, { id: 99, role: 'assistant', responseId: RID, content: 'prose' }],
        responseId: RID,
      });
      expect(out.map((m) => m.id)).toEqual([1, 10, 11]);
    });

    it('is idempotent when replayed', () => {
      const args = {
        storedConversation: [user, shell],
        incomingConversation: [user, { id: 99, role: 'assistant', responseId: RID, content: 'prose' }],
        responseId: RID,
      };
      expect(mergeTerminalRevisionIntoConversation(args))
        .toEqual(mergeTerminalRevisionIntoConversation(args));
    });

    it('passes through untouched when the response is absent', () => {
      const incoming = [user];
      expect(mergeTerminalRevisionIntoConversation({
        storedConversation: [], incomingConversation: incoming, responseId: RID,
      })).toBe(incoming);
    });
  });
});

describe('Stage 14.1 §8 — new-trip idempotency', () => {
  it('creates on first revision-1 save', () => {
    expect(resolveCreateIdempotency({ incomingPlan: rev1Plan(), existingPlan: null }))
      .toEqual({ action: CREATE_ACTION.CREATE, reason: 'no_match' });
  });

  it('a repeated revision-1 create returns the existing trip', () => {
    expect(resolveCreateIdempotency({ incomingPlan: rev1Plan(), existingPlan: rev1Plan() }).action)
      .toBe(CREATE_ACTION.RETURN_EXISTING);
  });

  it('a revision-2 create against the revision-1 trip becomes an UPDATE, never a second trip', () => {
    expect(resolveCreateIdempotency({
      incomingPlan: rev2Plan(), existingPlan: rev1Plan(), expectedPreviousRevision: 1,
    })).toEqual({ action: CREATE_ACTION.UPDATE_EXISTING, reason: 'revision_succession' });
  });

  it('a repeated revision-2 create is idempotent', () => {
    expect(resolveCreateIdempotency({ incomingPlan: rev2Plan(), existingPlan: rev2Plan() }).action)
      .toBe(CREATE_ACTION.RETURN_EXISTING);
  });

  it('revision 2 arriving BEFORE revision 1 persisted refuses to build a partial trip', () => {
    expect(resolveCreateIdempotency({
      incomingPlan: rev2Plan(), existingPlan: null, expectedPreviousRevision: 1,
    })).toEqual({ action: CREATE_ACTION.CONFLICT, reason: 'expected_revision_but_none_stored' });
  });

  it('direct-terminal create (no base revision claimed) still works', () => {
    expect(resolveCreateIdempotency({ incomingPlan: rev2Plan(), existingPlan: null }).action)
      .toBe(CREATE_ACTION.CREATE);
  });

  it('concurrent revision-1 creates converge on one trip', () => {
    const first = resolveCreateIdempotency({ incomingPlan: rev1Plan(), existingPlan: null });
    const second = resolveCreateIdempotency({ incomingPlan: rev1Plan(), existingPlan: rev1Plan() });
    expect(first.action).toBe(CREATE_ACTION.CREATE);
    expect(second.action).toBe(CREATE_ACTION.RETURN_EXISTING);
  });

  it('a genuinely different response at the same slot conflicts', () => {
    expect(resolveCreateIdempotency({
      incomingPlan: rev1Plan({ itineraryHash: 'other' }), existingPlan: rev1Plan(),
    }).action).toBe(CREATE_ACTION.CONFLICT);
  });
});

describe('Stage 14.1 §12 — duplicate semantics', () => {
  it('duplicate PERSISTENCE of one responseId is idempotent', () => {
    expect(decide(rev2Plan(), rev2Plan()).outcome).toBe(PERSISTENCE_OUTCOME.IDEMPOTENT);
    expect(resolveCreateIdempotency({ incomingPlan: rev2Plan(), existingPlan: rev2Plan() }).action)
      .toBe(CREATE_ACTION.RETURN_EXISTING);
  });

  it('a duplicate GENERATION request produces a new responseId and is NOT deduped here', () => {
    // Documented limitation: two AI requests mint two identities, so the
    // plan.responseId key cannot recognize them as the same logical intent.
    // Cross-request idempotency needs a stable client request key (future work).
    const a = createTurnResponseIdentity({ priorResponseVersion: 1 });
    const b = createTurnResponseIdentity({ priorResponseVersion: 1 });
    expect(a.responseId).not.toBe(b.responseId);
    const r = decide(
      rev2Plan({ responseId: b.responseId, responseVersion: 2 }),
      rev2Plan({ responseId: a.responseId, responseVersion: 2 })
    );
    // Same slot, different id → CONFLICT (rejected), NOT silently deduped.
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.CONFLICT);
  });
});
