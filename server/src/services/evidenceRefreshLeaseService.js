'use strict';

const LEASE_OUTCOME = Object.freeze({
  ACQUIRED: 'acquired',
  CONTENDED: 'contended',
});

// The coordinator and evidence store thread the lease onward via object spread
// (`verifyEvidenceRefreshLease({ ...lease })`, `persistCandidate({ lease })`). A
// raw Mongoose document loses every schema field when spread, so leases MUST be
// returned as plain objects.
function plainLease(lease) {
  if (!lease) return lease;
  return typeof lease.toObject === 'function' ? lease.toObject() : lease;
}

function staleLeaseError() {
  const error = new Error('Evidence refresh lease is missing, expired, or owned by a newer worker');
  error.code = 'stale_evidence_refresh_lease';
  return error;
}

async function acquireEvidenceRefreshLease({
  LeaseModel,
  leaseKey,
  ownerId,
  now = new Date(),
  leaseMs,
} = {}) {
  if (!LeaseModel || !leaseKey || !ownerId || !Number.isFinite(leaseMs) || leaseMs <= 0) {
    throw new TypeError('LeaseModel, leaseKey, ownerId, and positive leaseMs are required');
  }
  const expiresAt = new Date(now.getTime() + leaseMs);
  try {
    const lease = await LeaseModel.findOneAndUpdate(
      { leaseKey, expiresAt: { $lte: now } },
      [
        {
          $set: {
            leaseKey,
            ownerId,
            status: 'active',
            acquiredAt: now,
            expiresAt,
            lastErrorCode: null,
            fencingToken: { $add: [{ $ifNull: ['$fencingToken', 0] }, 1] },
            attempt: { $add: [{ $ifNull: ['$attempt', 0] }, 1] },
            updatedAt: now,
            createdAt: { $ifNull: ['$createdAt', now] },
          },
        },
      ],
      { upsert: true, new: true }
    );
    return { outcome: LEASE_OUTCOME.ACQUIRED, lease: plainLease(lease) };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const lease = await LeaseModel.findOne({ leaseKey });
    return { outcome: LEASE_OUTCOME.CONTENDED, lease: plainLease(lease) };
  }
}

async function verifyEvidenceRefreshLease({
  LeaseModel,
  leaseKey,
  ownerId,
  fencingToken,
  now = new Date(),
  session = null,
} = {}) {
  if (!LeaseModel || !leaseKey || !ownerId || !Number.isInteger(fencingToken)) throw staleLeaseError();
  let query = LeaseModel.findOne({
    leaseKey,
    ownerId,
    fencingToken,
    status: 'active',
    expiresAt: { $gt: now },
  });
  if (session && typeof query.session === 'function') query = query.session(session);
  const lease = await query;
  if (!lease) throw staleLeaseError();
  return lease;
}

async function releaseEvidenceRefreshLease({ LeaseModel, leaseKey, ownerId, fencingToken } = {}) {
  if (!LeaseModel || !leaseKey || !ownerId || !Number.isInteger(fencingToken)) {
    return { released: false, reason: 'stale_evidence_refresh_lease' };
  }
  const result = await LeaseModel.deleteOne({ leaseKey, ownerId, fencingToken, status: 'active' });
  return result.deletedCount > 0
    ? { released: true, reason: 'released' }
    : { released: false, reason: 'stale_evidence_refresh_lease' };
}

module.exports = {
  LEASE_OUTCOME,
  acquireEvidenceRefreshLease,
  verifyEvidenceRefreshLease,
  releaseEvidenceRefreshLease,
};
