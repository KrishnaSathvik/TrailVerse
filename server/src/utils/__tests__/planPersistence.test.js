'use strict';

const {
  PERSISTENCE_OUTCOME,
  decidePersistenceOutcome,
  extractPlanIdentity,
  resolvePlanPersistence,
} = require('../planPersistence');

const identity = (over = {}) => ({
  responseId: 'resp-A',
  responseVersion: 2,
  contentHash: 'chash',
  itineraryHash: 'ihash',
  ...over,
});

describe('decidePersistenceOutcome', () => {
  test('accepts the first write when nothing is stored', () => {
    expect(decidePersistenceOutcome({ incoming: identity(), existing: null }).outcome).toBe(
      PERSISTENCE_OUTCOME.ACCEPT
    );
  });

  test('same id + version + hashes is an idempotent success', () => {
    expect(
      decidePersistenceOutcome({ incoming: identity(), existing: identity() }).outcome
    ).toBe(PERSISTENCE_OUTCOME.IDEMPOTENT);
  });

  test('an older responseVersion is rejected as stale', () => {
    expect(
      decidePersistenceOutcome({
        incoming: identity({ responseVersion: 1 }),
        existing: identity({ responseVersion: 2 }),
      }).outcome
    ).toBe(PERSISTENCE_OUTCOME.STALE);
  });

  test('same id + version but a different content hash is a conflict', () => {
    expect(
      decidePersistenceOutcome({
        incoming: identity({ contentHash: 'different' }),
        existing: identity(),
      }).outcome
    ).toBe(PERSISTENCE_OUTCOME.CONFLICT);
  });

  test('same id + version but a different itinerary hash is a conflict', () => {
    expect(
      decidePersistenceOutcome({
        incoming: identity({ itineraryHash: 'different' }),
        existing: identity(),
      }).outcome
    ).toBe(PERSISTENCE_OUTCOME.CONFLICT);
  });

  test('a newer responseVersion is accepted (regeneration / next turn)', () => {
    expect(
      decidePersistenceOutcome({
        incoming: identity({ responseId: 'resp-B', responseVersion: 3 }),
        existing: identity({ responseVersion: 2 }),
      }).outcome
    ).toBe(PERSISTENCE_OUTCOME.ACCEPT);
  });

  test('two different responses claiming the same version slot is a conflict', () => {
    expect(
      decidePersistenceOutcome({
        incoming: identity({ responseId: 'resp-B' }),
        existing: identity({ responseId: 'resp-A' }),
      }).outcome
    ).toBe(PERSISTENCE_OUTCOME.CONFLICT);
  });

  test('a delayed stale write cannot overwrite a newer stored result', () => {
    // Response A (v2) autosave arrives AFTER response B (v3) was stored.
    const outcome = decidePersistenceOutcome({
      incoming: identity({ responseId: 'resp-A', responseVersion: 2 }),
      existing: identity({ responseId: 'resp-B', responseVersion: 3 }),
    }).outcome;
    expect(outcome).toBe(PERSISTENCE_OUTCOME.STALE);
  });
});

describe('decidePersistenceOutcome — expectedPreviousVersion (Stage 8.1 §6)', () => {
  test('accepts exactly stored+1 when the expected base matches', () => {
    expect(
      decidePersistenceOutcome({
        incoming: identity({ responseId: 'resp-B', responseVersion: 3, expectedPreviousVersion: 2 }),
        existing: identity({ responseVersion: 2 }),
      }).outcome
    ).toBe(PERSISTENCE_OUTCOME.ACCEPT);
  });

  test('a version jump (stored+2) is a conflict, not an accept', () => {
    expect(
      decidePersistenceOutcome({
        incoming: identity({ responseId: 'resp-B', responseVersion: 4, expectedPreviousVersion: 2 }),
        existing: identity({ responseVersion: 2 }),
      }).outcome
    ).toBe(PERSISTENCE_OUTCOME.CONFLICT);
  });

  test('an expected base behind the stored version is stale (a newer response already landed)', () => {
    expect(
      decidePersistenceOutcome({
        incoming: identity({ responseId: 'resp-C', responseVersion: 3, expectedPreviousVersion: 1 }),
        existing: identity({ responseVersion: 2 }),
      }).outcome
    ).toBe(PERSISTENCE_OUTCOME.STALE);
  });

  test('an idempotent retry still succeeds regardless of expectedPreviousVersion', () => {
    expect(
      decidePersistenceOutcome({
        incoming: identity({ expectedPreviousVersion: 99 }),
        existing: identity(),
      }).outcome
    ).toBe(PERSISTENCE_OUTCOME.IDEMPOTENT);
  });
});

describe('resolvePlanPersistence (controller guard)', () => {
  const planWith = (over = {}) => ({
    type: 'itinerary',
    responseId: 'resp-A',
    responseVersion: 2,
    contentHash: 'chash',
    itineraryHash: 'ihash',
    days: [],
    ...over,
  });

  test('writes when there is no existing plan', () => {
    const r = resolvePlanPersistence({ incomingPlan: planWith(), existingPlan: null });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.ACCEPT);
    expect(r.shouldWrite).toBe(true);
  });

  test('does not re-write on an idempotent duplicate but reports success', () => {
    const r = resolvePlanPersistence({ incomingPlan: planWith(), existingPlan: planWith() });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.IDEMPOTENT);
    expect(r.shouldWrite).toBe(false);
    expect(r.success).toBe(true);
  });

  test('refuses to overwrite a newer stored plan with a stale write', () => {
    const r = resolvePlanPersistence({
      incomingPlan: planWith({ responseVersion: 2 }),
      existingPlan: planWith({ responseId: 'resp-B', responseVersion: 3 }),
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.STALE);
    expect(r.shouldWrite).toBe(false);
    expect(r.success).toBe(false);
  });

  test('reports a conflict without writing', () => {
    const r = resolvePlanPersistence({
      incomingPlan: planWith({ contentHash: 'other' }),
      existingPlan: planWith(),
    });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.CONFLICT);
    expect(r.shouldWrite).toBe(false);
    expect(r.success).toBe(false);
  });

  test('legacy incoming plan without identity writes (backward compatible)', () => {
    const r = resolvePlanPersistence({ incomingPlan: { days: [] }, existingPlan: planWith() });
    expect(r.outcome).toBe(PERSISTENCE_OUTCOME.ACCEPT);
    expect(r.shouldWrite).toBe(true);
    expect(r.reason).toBe('legacy_incoming_no_identity');
  });

  test('null incoming plan is a no-op write (e.g. non-plan update)', () => {
    const r = resolvePlanPersistence({ incomingPlan: undefined, existingPlan: planWith() });
    expect(r.shouldWrite).toBe(false);
    expect(r.success).toBe(true);
  });
});

describe('extractPlanIdentity', () => {
  test('reads the identity fields from a stored plan document', () => {
    const plan = {
      type: 'itinerary',
      responseId: 'resp-A',
      responseVersion: 2,
      contentHash: 'chash',
      itineraryHash: 'ihash',
      days: [],
    };
    expect(extractPlanIdentity(plan)).toEqual({
      responseId: 'resp-A',
      responseVersion: 2,
      // Stage 14.1 — the identity tuple gained an intra-turn revision axis. A plan
      // stored without one is read as TERMINAL (2), which is what keeps every
      // pre-Stage-14 row behaving exactly as it did before.
      responseRevision: 2,
      revisionExplicit: false,
      // Stage 14.2 — the durable lifecycle status participates in same-revision
      // semantic identity. Absent on legacy rows, and an absent status is the one
      // documented equivalent (it matches any durable status).
      lifecycleStatus: null,
      contentHash: 'chash',
      itineraryHash: 'ihash',
    });
  });

  test('returns null for a plan without an envelope identity (legacy trips)', () => {
    expect(extractPlanIdentity({ days: [] })).toBeNull();
    expect(extractPlanIdentity(null)).toBeNull();
  });
});
