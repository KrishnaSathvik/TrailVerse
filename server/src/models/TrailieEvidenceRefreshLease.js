'use strict';

const mongoose = require('mongoose');

const trailieEvidenceRefreshLeaseSchema = new mongoose.Schema({
  leaseKey: { type: String, required: true, immutable: true },
  ownerId: { type: String, required: true },
  fencingToken: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['active'], default: 'active', required: true },
  acquiredAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  attempt: { type: Number, min: 1, default: 1, required: true },
  lastErrorCode: { type: String, default: null },
}, {
  timestamps: true,
  strict: 'throw',
  collection: 'trailie_evidence_refresh_leases',
});

trailieEvidenceRefreshLeaseSchema.index({ leaseKey: 1 }, { unique: true });
trailieEvidenceRefreshLeaseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.TrailieEvidenceRefreshLease
  || mongoose.model('TrailieEvidenceRefreshLease', trailieEvidenceRefreshLeaseSchema);
