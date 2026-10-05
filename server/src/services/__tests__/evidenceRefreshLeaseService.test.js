'use strict';

const LeaseModel = require('../../models/TrailieEvidenceRefreshLease');
const {
  LEASE_OUTCOME,
  acquireEvidenceRefreshLease,
  verifyEvidenceRefreshLease,
  releaseEvidenceRefreshLease,
} = require('../evidenceRefreshLeaseService');

const T0 = new Date('2026-08-09T12:00:00.000Z');
const args = { LeaseModel, leaseKey: 'req:nps:yose:alerts', ownerId: 'worker:a', now: T0, leaseMs: 60000 };

describe('WP3 distributed evidence refresh leases', () => {
  beforeEach(async () => LeaseModel.createIndexes());

  test('acquires once and reports live contention without replacing the owner', async () => {
    const first = await acquireEvidenceRefreshLease(args);
    const second = await acquireEvidenceRefreshLease({ ...args, ownerId: 'worker:b' });

    expect(first).toMatchObject({ outcome: LEASE_OUTCOME.ACQUIRED, lease: { fencingToken: 1, ownerId: 'worker:a' } });
    expect(second).toMatchObject({ outcome: LEASE_OUTCOME.CONTENDED, lease: { fencingToken: 1, ownerId: 'worker:a' } });
    expect(await LeaseModel.countDocuments({ leaseKey: args.leaseKey })).toBe(1);
  });

  // Regression: the coordinator/store thread the lease via object spread
  // (`verifyEvidenceRefreshLease({ ...lease })`, `persistCandidate({ lease })`).
  // A raw Mongoose document loses every field when spread, so the acquired lease
  // MUST be a plain, spread-safe object. Direct-getter access hid this for a long
  // time; live persistence failed with stale_evidence_refresh_lease.
  test('returns a plain, spread-safe lease so downstream verify/persist can read its fields', async () => {
    const { lease } = await acquireEvidenceRefreshLease({ ...args, leaseKey: 'req:nps:zion:parks:spread' });
    const spread = { ...lease };
    expect(spread.leaseKey).toBe('req:nps:zion:parks:spread');
    expect(spread.ownerId).toBe('worker:a');
    expect(Number.isInteger(spread.fencingToken)).toBe(true);
  });

  test('reclaims an expired lease with a higher fencing token', async () => {
    const first = await acquireEvidenceRefreshLease({ ...args, leaseMs: 1000 });
    const second = await acquireEvidenceRefreshLease({
      ...args,
      ownerId: 'worker:b',
      now: new Date(T0.getTime() + 1001),
      leaseMs: 1000,
    });

    expect(first.lease.fencingToken).toBe(1);
    expect(second).toMatchObject({ outcome: LEASE_OUTCOME.ACQUIRED, lease: { fencingToken: 2, ownerId: 'worker:b' } });
  });

  test('rejects stale token, wrong owner, and expired verification', async () => {
    const { lease } = await acquireEvidenceRefreshLease({ ...args, leaseMs: 1000 });

    await expect(verifyEvidenceRefreshLease({
      LeaseModel, leaseKey: args.leaseKey, ownerId: 'worker:b', fencingToken: lease.fencingToken, now: T0,
    })).rejects.toMatchObject({ code: 'stale_evidence_refresh_lease' });
    await expect(verifyEvidenceRefreshLease({
      LeaseModel, leaseKey: args.leaseKey, ownerId: lease.ownerId, fencingToken: 999, now: T0,
    })).rejects.toMatchObject({ code: 'stale_evidence_refresh_lease' });
    await expect(verifyEvidenceRefreshLease({
      LeaseModel, leaseKey: args.leaseKey, ownerId: lease.ownerId, fencingToken: lease.fencingToken,
      now: new Date(T0.getTime() + 1001),
    })).rejects.toMatchObject({ code: 'stale_evidence_refresh_lease' });
  });

  test('a stale owner cannot release a reclaimed lease', async () => {
    const first = await acquireEvidenceRefreshLease({ ...args, leaseMs: 1000 });
    const second = await acquireEvidenceRefreshLease({
      ...args, ownerId: 'worker:b', now: new Date(T0.getTime() + 1001), leaseMs: 1000,
    });

    await expect(releaseEvidenceRefreshLease({
      LeaseModel, leaseKey: args.leaseKey, ownerId: first.lease.ownerId,
      fencingToken: first.lease.fencingToken,
    })).resolves.toMatchObject({ released: false, reason: 'stale_evidence_refresh_lease' });
    await expect(releaseEvidenceRefreshLease({
      LeaseModel, leaseKey: args.leaseKey, ownerId: second.lease.ownerId,
      fencingToken: second.lease.fencingToken,
    })).resolves.toMatchObject({ released: true });
  });
});
