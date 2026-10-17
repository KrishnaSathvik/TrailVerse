'use strict';

const { PERSISTENCE_OUTCOME } = require('../planPersistence');
const {
  extractIncomingResponseIdentity,
  extractStoredResponseIdentity,
  resolveCanonicalResponsePersistence,
  resolveCreateIdempotency,
  mergeTerminalRevisionIntoConversation,
  preserveHistoricalAssistantTurns,
  CREATE_ACTION,
} = require('../canonicalPersistence');

const planV = (v, over = {}) => ({
  type: 'itinerary',
  responseId: `resp-${v}`,
  responseVersion: v,
  contentHash: `c${v}`,
  itineraryHash: `i${v}`,
  days: [],
  ...over,
});

const assistantMsg = (v, over = {}) => ({
  role: 'assistant',
  content: `assistant v${v}`,
  responseId: `resp-${v}`,
  responseVersion: v,
  contentHash: `c${v}`,
  itineraryHash: `i${v}`,
  ...over,
});

describe('extractIncomingResponseIdentity', () => {
  test('prefers the plan identity', () => {
    expect(extractIncomingResponseIdentity({ plan: planV(2), conversation: [] }).responseId).toBe(
      'resp-2'
    );
  });
  test('falls back to the latest assistant message carrying a responseId', () => {
    const id = extractIncomingResponseIdentity({
      plan: null,
      conversation: [{ role: 'user', content: 'hi' }, assistantMsg(3)],
    });
    expect(id.responseId).toBe('resp-3');
    expect(id.responseVersion).toBe(3);
  });
  test('returns null for a legacy update with no identity anywhere', () => {
    expect(
      extractIncomingResponseIdentity({ plan: { days: [] }, conversation: [{ role: 'user', content: 'x' }] })
    ).toBeNull();
  });
});

describe('resolveCanonicalResponsePersistence — atomic accept/reject', () => {
  test('ACCEPT writes both the conversation and the plan', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: planV(3),
      incomingConversation: [assistantMsg(3)],
      expectedPreviousVersion: 2,
      existingPlan: planV(2),
      existingConversation: [assistantMsg(2)],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.ACCEPT);
    expect(r.writePlan).toBe(true);
    expect(r.writeConversation).toBe(true);
    expect(r.success).toBe(true);
  });

  test('IDEMPOTENT retry rewrites neither content nor plan', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: planV(2),
      incomingConversation: [assistantMsg(2)],
      existingPlan: planV(2),
      existingConversation: [assistantMsg(2)],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.IDEMPOTENT);
    expect(r.writePlan).toBe(false);
    expect(r.writeConversation).toBe(false);
    expect(r.success).toBe(true);
  });

  test('STALE rejects BOTH the plan and the assistant conversation content', () => {
    // The delayed v3 write arrives after v4 is stored.
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: planV(3),
      incomingConversation: [assistantMsg(3)],
      expectedPreviousVersion: 2,
      existingPlan: planV(4),
      existingConversation: [assistantMsg(4)],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.STALE);
    expect(r.writePlan).toBe(false);
    expect(r.writeConversation).toBe(false);
    expect(r.success).toBe(false);
  });

  test('never leaves conversation v3 beside plan v4 (the invariant)', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: planV(3),
      incomingConversation: [assistantMsg(3)],
      expectedPreviousVersion: 2,
      existingPlan: planV(4),
      existingConversation: [assistantMsg(4)],
    });
    // Reject both → stored stays v4/v4, never mixed.
    expect(r.writeConversation || r.writePlan).toBe(false);
  });

  test('CONFLICT rejects both and returns the stored identity for reconciliation', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: planV(2, { contentHash: 'other' }),
      incomingConversation: [assistantMsg(2, { contentHash: 'other' })],
      existingPlan: planV(2),
      existingConversation: [assistantMsg(2)],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.CONFLICT);
    expect(r.writePlan).toBe(false);
    expect(r.writeConversation).toBe(false);
    expect(r.success).toBe(false);
    expect(r.storedIdentity).toEqual({
      responseId: 'resp-2',
      responseVersion: 2,
      // Stage 14.1 — a stored plan with no explicit revision reads as TERMINAL (2).
      responseRevision: 2,
      revisionExplicit: false,
      // Stage 14.2 — durable lifecycle joins the semantic identity tuple.
      lifecycleStatus: null,
      contentHash: 'c2',
      itineraryHash: 'i2',
    });
  });

  test('a full-conversation client update cannot overwrite canonical content when stale', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: null,
      incomingConversation: [{ role: 'user', content: 'edit' }, assistantMsg(1)],
      expectedPreviousVersion: 0,
      existingPlan: planV(2),
      existingConversation: [assistantMsg(2)],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.STALE);
    expect(r.writeConversation).toBe(false);
  });

  test('legacy update migrates a legacy-stored trip (writes what it carries)', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: undefined,
      incomingConversation: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'legacy' }],
      existingPlan: null, // legacy stored trip (no canonical identity)
      existingConversation: [],
    });
    expect(r.outcome).toBe('legacy_migration');
    expect(r.writeConversation).toBe(true);
    expect(r.writePlan).toBe(false); // no plan in the update
    expect(r.success).toBe(true);
  });

  test('first response on a new trip accepts and writes both', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: planV(1),
      incomingConversation: [assistantMsg(1)],
      expectedPreviousVersion: 0,
      existingPlan: null,
      existingConversation: [],
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.ACCEPT);
    expect(r.writePlan).toBe(true);
    expect(r.writeConversation).toBe(true);
  });
});

describe('resolveCreateIdempotency (new-trip duplicate protection)', () => {
  test('creates when no matching trip exists', () => {
    const r = resolveCreateIdempotency({ incomingPlan: planV(1), existingPlan: null });
    expect(r.action).toBe(CREATE_ACTION.CREATE);
  });

  test('returns the existing trip for a duplicate terminal event (same id + hashes)', () => {
    const r = resolveCreateIdempotency({ incomingPlan: planV(1), existingPlan: planV(1) });
    expect(r.action).toBe(CREATE_ACTION.RETURN_EXISTING);
  });

  test('conflicts when the same responseId carries different hashes', () => {
    const r = resolveCreateIdempotency({
      incomingPlan: planV(1, { contentHash: 'other' }),
      existingPlan: planV(1),
    });
    expect(r.action).toBe(CREATE_ACTION.CONFLICT);
  });

  test('creates for a legacy plan with no identity', () => {
    const r = resolveCreateIdempotency({ incomingPlan: { days: [] }, existingPlan: null });
    expect(r.action).toBe(CREATE_ACTION.CREATE);
  });
});

describe('resolveCanonicalResponsePersistence — response-coupled metadata gate (8.2)', () => {
  test('ACCEPT allows response-coupled metadata to be written', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: planV(3),
      incomingConversation: [assistantMsg(3)],
      expectedPreviousVersion: 2,
      existingPlan: planV(2),
      existingConversation: [assistantMsg(2)],
    });
    expect(r.writeResponseCoupled).toBe(true);
  });

  test('STALE forbids ALL response-coupled metadata (formData/summary/destination)', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: planV(3),
      incomingConversation: [assistantMsg(3)],
      expectedPreviousVersion: 2,
      existingPlan: planV(4),
      existingConversation: [assistantMsg(4)],
    });
    expect(r.writeResponseCoupled).toBe(false);
  });

  test('CONFLICT forbids response-coupled metadata', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: planV(2, { contentHash: 'other' }),
      incomingConversation: [assistantMsg(2, { contentHash: 'other' })],
      existingPlan: planV(2),
      existingConversation: [assistantMsg(2)],
    });
    expect(r.writeResponseCoupled).toBe(false);
  });

  test('IDEMPOTENT does not rewrite response-coupled metadata (summary/formData)', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: planV(2),
      incomingConversation: [assistantMsg(2)],
      existingPlan: planV(2),
      existingConversation: [assistantMsg(2)],
    });
    expect(r.writeResponseCoupled).toBe(false);
  });

  test('legacy (no identity) migrating a legacy-stored trip writes what it carries', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: undefined,
      incomingConversation: [{ role: 'user', content: 'hi' }],
      existingPlan: null, // legacy stored trip
      existingConversation: [],
    });
    expect(r.writeResponseCoupled).toBe(true);
  });
});

describe('resolveCanonicalResponsePersistence — legacy hardening (8.3)', () => {
  const legacyPlan = { type: 'itinerary', days: [{ id: 'd1' }] }; // no identity

  test('legacy request + legacy stored trip → one-time migration write', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: legacyPlan,
      incomingConversation: [{ role: 'assistant', content: 'legacy' }],
      existingPlan: null,
      existingConversation: [],
    });
    expect(r.outcome).toBe('legacy_migration');
    expect(r.writeResponseCoupled).toBe(true);
    expect(r.needsMigrationStamp).toBe(true);
    expect(r.success).toBe(true);
  });

  test('legacy request + CANONICAL stored trip → rejected (no bypass)', () => {
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: legacyPlan,
      incomingConversation: [{ role: 'assistant', content: 'legacy overwrite attempt' }],
      existingPlan: planV(4),
      existingConversation: [assistantMsg(4)],
    });
    expect(r.outcome).toBe('canonical_identity_required');
    expect(r.writeResponseCoupled).toBe(false);
    expect(r.success).toBe(false);
    expect(r.storedIdentity.responseId).toBe('resp-4');
  });

  test('a second legacy request after migration cannot modify response fields', () => {
    // After migration the stored trip now HAS identity (v1).
    const r = resolveCanonicalResponsePersistence({
      incomingPlan: legacyPlan,
      incomingConversation: [{ role: 'assistant', content: 'x' }],
      existingPlan: planV(1),
      existingConversation: [assistantMsg(1)],
    });
    expect(r.outcome).toBe('canonical_identity_required');
    expect(r.writeResponseCoupled).toBe(false);
  });
});

/**
 * WP-TU Phase 3 Task 8B — the authenticated save path takes the FULL
 * conversation array from the client and merges it through these two
 * helpers before persisting. Neither may strip `activeTripPresentation`
 * (Task 7B's field) off the message it selects/preserves — proving the
 * authenticated controller merge step is not a second allowlist gap.
 */
describe('mergeTerminalRevisionIntoConversation / preserveHistoricalAssistantTurns — activeTripPresentation survives the merge (Task 8B)', () => {
  const activeTripPresentation = {
    destination: { parkCode: 'badl', parkName: 'Badlands National Park' },
    activeContextAction: 'set',
  };

  test('mergeTerminalRevisionIntoConversation keeps activeTripPresentation on the terminal message it selects', () => {
    const shell = { id: 11, role: 'assistant', responseId: 'RID', responseRevision: 1, content: '', timestamp: 'T0' };
    const user = { id: 10, role: 'user', content: 'plan a week' };
    const out = mergeTerminalRevisionIntoConversation({
      storedConversation: [user, shell],
      incomingConversation: [
        user,
        { id: 99, role: 'assistant', responseId: 'RID', responseRevision: 2, content: 'prose', activeTripPresentation },
      ],
      responseId: 'RID',
    });
    expect(out[1].activeTripPresentation).toEqual(activeTripPresentation);
  });

  test('preserveHistoricalAssistantTurns keeps activeTripPresentation on a preserved historical turn', () => {
    const historical = {
      id: 1, role: 'assistant', responseId: 'older', content: 'prev', activeTripPresentation,
    };
    const out = preserveHistoricalAssistantTurns({
      storedConversation: [historical],
      // Client sent a SPARSE projection of the historical turn (missing the
      // field) alongside the new target turn — the stored, richer version
      // must win for every non-target turn.
      incomingConversation: [
        { id: 1, role: 'assistant', responseId: 'older', content: 'prev' },
        { id: 2, role: 'assistant', responseId: 'new-target', content: 'new' },
      ],
      targetResponseId: 'new-target',
    });
    expect(out[0].activeTripPresentation).toEqual(activeTripPresentation);
  });
});
