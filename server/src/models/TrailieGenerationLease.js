'use strict';

const mongoose = require('mongoose');

// Cross-instance "one active Trailie generation" leases for signed-in users.
// _id is the lease key (`c:<principal>:<conversation>` or `u:<principal>:<slot>`),
// so atomic acquire relies only on the implicit unique _id index. Correctness
// never depends on the TTL monitor: acquire treats `expiresAt <= now` as free.
// Principals are HMAC hashes (trailieTurnLedger.hashPrincipal), not user ids.
const trailieGenerationLeaseSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  scope: { type: String, enum: ['conversation', 'user'], required: true },
  principalHash: { type: String, required: true },
  ownerToken: { type: String, required: true },
  clientTurnId: { type: String, default: null },
  route: { type: String, default: null },
  acquiredAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, {
  strict: 'throw',
  versionKey: false,
  collection: 'trailie_generation_leases',
});

// Garbage collection only (runs ~every 60s); abandoned leases are already
// reclaimable at acquire time once expiresAt has passed.
trailieGenerationLeaseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.TrailieGenerationLease
  || mongoose.model('TrailieGenerationLease', trailieGenerationLeaseSchema);
