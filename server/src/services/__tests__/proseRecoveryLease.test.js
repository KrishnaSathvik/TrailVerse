const {
  LEASE_STATE,
  LEASE_OUTCOME,
  acquireRecoveryLease,
  transitionToAwaitingPersistence,
  releaseRecoveryLease,
  clearLeaseAfterPersistence,
} = require('../proseRecoveryLease');

const USER = 'user-1';
const RESPONSE = 'resp-1';
const TRIP = 'trip-1';
const ITIN_HASH = 'itin-hash';

/**
 * In-memory stand-in for the mongoose model. It faithfully enforces the UNIQUE
 * index on (userId, responseId) by throwing a real duplicate-key error, which is
 * the exact race the production acquisition path relies on.
 */
function makeFakeModel(seed = []) {
  const docs = seed.map((d) => ({ ...d }));
  const key = (d) => `${d.userId}::${d.responseId}`;
  const matches = (doc, filter) =>
    Object.entries(filter).every(([k, v]) => {
      if (v && typeof v === 'object' && '$lte' in v) return doc[k] != null && doc[k] <= v.$lte;
      if (v && typeof v === 'object' && '$in' in v) return v.$in.includes(doc[k]);
      return doc[k] === v;
    });

  return {
    docs,
    calls: { findOneAndUpdate: 0, deleteOne: 0 },

    async findOne(filter) {
      return docs.find((d) => matches(d, filter)) || null;
    },

    async findOneAndUpdate(filter, update, options = {}) {
      this.calls.findOneAndUpdate += 1;
      const found = docs.find((d) => matches(d, filter));
      if (found) {
        Object.assign(found, update.$set || {});
        // Mongoose hands back a fresh document, never a live reference into the
        // collection. Copying here is what makes stale-owner tests meaningful.
        return { ...found };
      }
      if (!options.upsert) return null;

      const inserted = { ...(update.$setOnInsert || {}), ...(update.$set || {}) };
      // UNIQUE INDEX enforcement — this is the whole point of the fake.
      if (docs.some((d) => key(d) === key(inserted))) {
        const err = new Error('E11000 duplicate key error');
        err.code = 11000;
        throw err;
      }
      docs.push(inserted);
      return { ...inserted };
    },

    async deleteOne(filter) {
      this.calls.deleteOne += 1;
      const i = docs.findIndex((d) => matches(d, filter));
      if (i === -1) return { deletedCount: 0 };
      docs.splice(i, 1);
      return { deletedCount: 1 };
    },
  };
}

const T0 = new Date('2026-08-01T00:00:00.000Z');
const at = (ms) => new Date(T0.getTime() + ms);
const base = { userId: USER, responseId: RESPONSE, tripId: TRIP, itineraryHash: ITIN_HASH };

describe('Stage 14.4 §7 — atomic acquisition', () => {
  test('first caller acquires a generating lease with a random token', async () => {
    const Model = makeFakeModel();
    const res = await acquireRecoveryLease({ Model, ...base, now: T0, leaseMs: 1000 });

    expect(res.outcome).toBe(LEASE_OUTCOME.ACQUIRED);
    expect(res.lease.state).toBe(LEASE_STATE.GENERATING);
    expect(res.lease.leaseToken).toEqual(expect.any(String));
    expect(res.lease.leaseToken.length).toBeGreaterThanOrEqual(16);
    expect(res.lease.expiresAt.getTime()).toBe(T0.getTime() + 1000);
  });

  test('two acquisitions produce different tokens', async () => {
    const a = await acquireRecoveryLease({ Model: makeFakeModel(), ...base, now: T0, leaseMs: 1000 });
    const b = await acquireRecoveryLease({ Model: makeFakeModel(), ...base, now: T0, leaseMs: 1000 });
    expect(a.lease.leaseToken).not.toBe(b.lease.leaseToken);
  });

  test('a simultaneous second caller is rejected while generating', async () => {
    const Model = makeFakeModel();
    await acquireRecoveryLease({ Model, ...base, now: T0, leaseMs: 1000 });
    const second = await acquireRecoveryLease({ Model, ...base, now: at(10), leaseMs: 1000 });

    expect(second.outcome).toBe(LEASE_OUTCOME.CONFLICT_GENERATING);
    expect(second.lease).toBeUndefined();
    expect(second.retryAfterSeconds).toBeGreaterThan(0);
  });

  test('a caller is rejected while awaiting persistence', async () => {
    const Model = makeFakeModel([
      { ...base, leaseToken: 't', state: LEASE_STATE.AWAITING_PERSISTENCE, acquiredAt: T0, expiresAt: at(1000) },
    ]);
    const res = await acquireRecoveryLease({ Model, ...base, now: at(10), leaseMs: 1000 });

    expect(res.outcome).toBe(LEASE_OUTCOME.CONFLICT_AWAITING_PERSISTENCE);
  });

  test('a duplicate-key race is a conflict, never a server error', async () => {
    const Model = makeFakeModel();
    // Both read "no live lease", then both try to insert.
    const [a, b] = await Promise.all([
      acquireRecoveryLease({ Model, ...base, now: T0, leaseMs: 1000 }),
      acquireRecoveryLease({ Model, ...base, now: T0, leaseMs: 1000 }),
    ]);

    const outcomes = [a.outcome, b.outcome].sort();
    expect(outcomes).toEqual([LEASE_OUTCOME.ACQUIRED, LEASE_OUTCOME.CONFLICT_GENERATING].sort());
    expect(Model.docs).toHaveLength(1);
  });

  test('an expired lease is reclaimable without waiting for TTL deletion', async () => {
    const Model = makeFakeModel([
      { ...base, leaseToken: 'old', state: LEASE_STATE.GENERATING, acquiredAt: T0, expiresAt: at(1000) },
    ]);
    const res = await acquireRecoveryLease({ Model, ...base, now: at(1001), leaseMs: 1000 });

    expect(res.outcome).toBe(LEASE_OUTCOME.ACQUIRED);
    expect(res.lease.leaseToken).not.toBe('old');
    expect(Model.docs).toHaveLength(1);
  });

  test('an expired awaiting_persistence lease permits a later retry', async () => {
    const Model = makeFakeModel([
      { ...base, leaseToken: 'old', state: LEASE_STATE.AWAITING_PERSISTENCE, acquiredAt: T0, expiresAt: at(1000) },
    ]);
    const res = await acquireRecoveryLease({ Model, ...base, now: at(5000), leaseMs: 1000 });

    expect(res.outcome).toBe(LEASE_OUTCOME.ACQUIRED);
    expect(res.lease.state).toBe(LEASE_STATE.GENERATING);
  });

  test('correctness does not depend on TTL deletion — expiry is compared explicitly', async () => {
    const Model = makeFakeModel([
      { ...base, leaseToken: 'old', state: LEASE_STATE.GENERATING, acquiredAt: T0, expiresAt: at(1000) },
    ]);
    // The document is still present (TTL has not run), yet it is reclaimable.
    expect(Model.docs).toHaveLength(1);
    const res = await acquireRecoveryLease({ Model, ...base, now: at(2000), leaseMs: 1000 });
    expect(res.outcome).toBe(LEASE_OUTCOME.ACQUIRED);
  });

  test('leases for different responses are independent', async () => {
    const Model = makeFakeModel();
    const a = await acquireRecoveryLease({ Model, ...base, now: T0, leaseMs: 1000 });
    const b = await acquireRecoveryLease({ Model, ...base, responseId: 'resp-2', now: T0, leaseMs: 1000 });

    expect(a.outcome).toBe(LEASE_OUTCOME.ACQUIRED);
    expect(b.outcome).toBe(LEASE_OUTCOME.ACQUIRED);
  });

  test('leases for different users are independent', async () => {
    const Model = makeFakeModel();
    await acquireRecoveryLease({ Model, ...base, now: T0, leaseMs: 1000 });
    const other = await acquireRecoveryLease({ Model, ...base, userId: 'user-2', now: T0, leaseMs: 1000 });
    expect(other.outcome).toBe(LEASE_OUTCOME.ACQUIRED);
  });
});

describe('Stage 14.4 §10 — generating → awaiting_persistence', () => {
  const acquire = async (Model) =>
    (await acquireRecoveryLease({ Model, ...base, now: T0, leaseMs: 1000 })).lease;

  test('transitions and stores only bounded reconciliation metadata', async () => {
    const Model = makeFakeModel();
    const lease = await acquire(Model);

    const res = await transitionToAwaitingPersistence({
      Model,
      userId: USER,
      responseId: RESPONSE,
      leaseToken: lease.leaseToken,
      expectedContentHash: 'content-hash',
      itineraryHash: ITIN_HASH,
      now: at(500),
      leaseMs: 1000,
    });

    expect(res.ok).toBe(true);
    const stored = Model.docs[0];
    expect(stored.state).toBe(LEASE_STATE.AWAITING_PERSISTENCE);
    expect(stored.expectedContentHash).toBe('content-hash');
    expect(stored.generationCompletedAt).toEqual(at(500));
    expect(stored.expiresAt.getTime()).toBe(at(500).getTime() + 1000);
  });

  test('never stores prose, prompts, drafts, or verifier internals', async () => {
    const Model = makeFakeModel();
    const lease = await acquire(Model);
    await transitionToAwaitingPersistence({
      Model,
      userId: USER,
      responseId: RESPONSE,
      leaseToken: lease.leaseToken,
      expectedContentHash: 'content-hash',
      itineraryHash: ITIN_HASH,
      now: at(500),
      leaseMs: 1000,
    });

    const serialized = JSON.stringify(Model.docs[0]);
    const allowed = new Set([
      'userId', 'tripId', 'responseId', 'leaseToken', 'state',
      'itineraryHash', 'expectedContentHash', 'acquiredAt', 'generationCompletedAt', 'expiresAt',
    ]);
    for (const k of Object.keys(Model.docs[0])) expect(allowed.has(k)).toBe(true);
    expect(serialized).not.toMatch(/prompt|draft|tool_use|verifier|content"\s*:\s*"[A-Za-z]{20,}/i);
  });

  test('the lease is NOT deleted when generation completes', async () => {
    const Model = makeFakeModel();
    const lease = await acquire(Model);
    await transitionToAwaitingPersistence({
      Model, userId: USER, responseId: RESPONSE, leaseToken: lease.leaseToken,
      expectedContentHash: 'c', itineraryHash: ITIN_HASH, now: at(500), leaseMs: 1000,
    });

    expect(Model.docs).toHaveLength(1);
    expect(Model.calls.deleteOne).toBe(0);
  });

  test('a stale owner cannot transition a newer lease', async () => {
    const Model = makeFakeModel();
    await acquire(Model);
    const res = await transitionToAwaitingPersistence({
      Model, userId: USER, responseId: RESPONSE, leaseToken: 'a-stale-token',
      expectedContentHash: 'c', itineraryHash: ITIN_HASH, now: at(500), leaseMs: 1000,
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe('stale_lease_token');
    expect(Model.docs[0].state).toBe(LEASE_STATE.GENERATING);
  });
});

describe('Stage 14.4 §8 — stale-owner protection on release', () => {
  test('the owner releases its own generating lease', async () => {
    const Model = makeFakeModel();
    const { lease } = await acquireRecoveryLease({ Model, ...base, now: T0, leaseMs: 1000 });
    const res = await releaseRecoveryLease({ Model, userId: USER, responseId: RESPONSE, leaseToken: lease.leaseToken });

    expect(res.released).toBe(true);
    expect(Model.docs).toHaveLength(0);
  });

  test('a reclaimed lease cannot be released by the previous owner', async () => {
    const Model = makeFakeModel();
    const first = await acquireRecoveryLease({ Model, ...base, now: T0, leaseMs: 1000 });
    // First lease expires; a new request reclaims it.
    const second = await acquireRecoveryLease({ Model, ...base, now: at(2000), leaseMs: 1000 });
    expect(second.outcome).toBe(LEASE_OUTCOME.ACQUIRED);

    const stale = await releaseRecoveryLease({
      Model, userId: USER, responseId: RESPONSE, leaseToken: first.lease.leaseToken,
    });

    expect(stale.released).toBe(false);
    expect(stale.reason).toBe('stale_lease_token');
    expect(Model.docs).toHaveLength(1);
    expect(Model.docs[0].leaseToken).toBe(second.lease.leaseToken);
  });

  test('releasing a nonexistent lease is a no-op, not an error', async () => {
    const Model = makeFakeModel();
    const res = await releaseRecoveryLease({ Model, userId: USER, responseId: RESPONSE, leaseToken: 'x' });
    expect(res.released).toBe(false);
    expect(res.reason).toBe('no_lease');
  });
});

describe('Stage 14.4 §11 — cleanup after accepted revision-2 persistence', () => {
  const awaiting = (over = {}) => [{
    ...base,
    leaseToken: 'tok',
    state: LEASE_STATE.AWAITING_PERSISTENCE,
    expectedContentHash: 'content-hash',
    acquiredAt: T0,
    generationCompletedAt: at(500),
    expiresAt: at(1000),
    ...over,
  }];

  test('an accepted terminal revision 2 clears the lease', async () => {
    const Model = makeFakeModel(awaiting());
    const res = await clearLeaseAfterPersistence({
      Model, userId: USER, responseId: RESPONSE,
      outcome: 'accept', responseRevision: 2,
      contentHash: 'content-hash', itineraryHash: ITIN_HASH,
    });

    expect(res.cleared).toBe(true);
    expect(Model.docs).toHaveLength(0);
  });

  test('an idempotent terminal revision 2 clears the lease', async () => {
    const Model = makeFakeModel(awaiting());
    const res = await clearLeaseAfterPersistence({
      Model, userId: USER, responseId: RESPONSE,
      outcome: 'idempotent', responseRevision: 2,
      contentHash: 'content-hash', itineraryHash: ITIN_HASH,
    });

    expect(res.cleared).toBe(true);
  });

  test('a conflicting persistence does NOT clear the lease', async () => {
    const Model = makeFakeModel(awaiting());
    const res = await clearLeaseAfterPersistence({
      Model, userId: USER, responseId: RESPONSE,
      outcome: 'conflict', responseRevision: 2,
      contentHash: 'content-hash', itineraryHash: ITIN_HASH,
    });

    expect(res.cleared).toBe(false);
    expect(res.reason).toBe('persistence_not_accepted');
    expect(Model.docs).toHaveLength(1);
  });

  test('a stale persistence does NOT clear the lease', async () => {
    const Model = makeFakeModel(awaiting());
    const res = await clearLeaseAfterPersistence({
      Model, userId: USER, responseId: RESPONSE,
      outcome: 'stale', responseRevision: 2,
      contentHash: 'content-hash', itineraryHash: ITIN_HASH,
    });

    expect(res.cleared).toBe(false);
    expect(Model.docs).toHaveLength(1);
  });

  test('a revision-1 write does NOT clear the lease', async () => {
    const Model = makeFakeModel(awaiting());
    const res = await clearLeaseAfterPersistence({
      Model, userId: USER, responseId: RESPONSE,
      outcome: 'accept', responseRevision: 1,
      contentHash: 'x', itineraryHash: ITIN_HASH,
    });

    expect(res.cleared).toBe(false);
    expect(res.reason).toBe('not_terminal_revision');
  });

  test('a mismatched contentHash does NOT clear the lease', async () => {
    const Model = makeFakeModel(awaiting());
    const res = await clearLeaseAfterPersistence({
      Model, userId: USER, responseId: RESPONSE,
      outcome: 'accept', responseRevision: 2,
      contentHash: 'a-different-hash', itineraryHash: ITIN_HASH,
    });

    expect(res.cleared).toBe(false);
    expect(res.reason).toBe('reconciliation_hash_mismatch');
    expect(Model.docs).toHaveLength(1);
  });

  test('a mismatched itineraryHash does NOT clear the lease', async () => {
    const Model = makeFakeModel(awaiting());
    const res = await clearLeaseAfterPersistence({
      Model, userId: USER, responseId: RESPONSE,
      outcome: 'accept', responseRevision: 2,
      contentHash: 'content-hash', itineraryHash: 'moved',
    });

    expect(res.cleared).toBe(false);
    expect(res.reason).toBe('reconciliation_hash_mismatch');
  });

  test('clears when the lease recorded no expected hashes (legacy/partial)', async () => {
    const Model = makeFakeModel(awaiting({ expectedContentHash: null, itineraryHash: null }));
    const res = await clearLeaseAfterPersistence({
      Model, userId: USER, responseId: RESPONSE,
      outcome: 'accept', responseRevision: 2,
      contentHash: 'anything', itineraryHash: 'anything',
    });

    expect(res.cleared).toBe(true);
  });

  test('no lease present is a benign no-op', async () => {
    const Model = makeFakeModel();
    const res = await clearLeaseAfterPersistence({
      Model, userId: USER, responseId: RESPONSE,
      outcome: 'accept', responseRevision: 2, contentHash: 'c', itineraryHash: ITIN_HASH,
    });

    expect(res.cleared).toBe(false);
    expect(res.reason).toBe('no_lease');
  });

  test('a cleanup failure is reported, never thrown into the caller', async () => {
    const Model = makeFakeModel(awaiting());
    Model.deleteOne = async () => {
      throw new Error('mongo unavailable');
    };
    const res = await clearLeaseAfterPersistence({
      Model, userId: USER, responseId: RESPONSE,
      outcome: 'accept', responseRevision: 2,
      contentHash: 'content-hash', itineraryHash: ITIN_HASH,
    });

    expect(res.cleared).toBe(false);
    expect(res.reason).toBe('lease_cleanup_failed');
    // Bounded code only — no driver message leaks to the caller.
    expect(JSON.stringify(res)).not.toContain('mongo unavailable');
  });
});
