'use strict';

const mongoose = require('mongoose');

const immutable = { immutable: true };
const rejectedCandidateCountsSchema = new mongoose.Schema({
  invalid: { type: Number, min: 0, default: 0, ...immutable },
  privacy: { type: Number, min: 0, default: 0, ...immutable },
}, { _id: false, strict: 'throw' });

const trailieEvidenceRefreshEventSchema = new mongoose.Schema({
  refreshEventId: { type: String, required: true, ...immutable },
  refreshKeyHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, ...immutable },
  provider: { type: String, required: true, ...immutable },
  operation: { type: String, required: true, ...immutable },
  startedAt: { type: Date, required: true, ...immutable },
  completedAt: { type: Date, required: true, ...immutable },
  requirementCount: { type: Number, min: 1, required: true, ...immutable },
  coalescedRequirements: { type: Number, min: 0, default: 0, ...immutable },
  coalescedWaiters: { type: Number, min: 0, default: 0, ...immutable },
  waiterPeak: { type: Number, min: 1, default: 1, ...immutable },
  leaseOutcome: { type: String, enum: ['acquired', 'contended', 'not_applicable'], required: true, ...immutable },
  providerAttemptCount: { type: Number, min: 0, default: 0, ...immutable },
  retryCount: { type: Number, min: 0, default: 0, ...immutable },
  normalizedCandidateCount: { type: Number, min: 0, default: 0, ...immutable },
  persistedCandidateCount: { type: Number, min: 0, default: 0, ...immutable },
  rejectedCandidateCounts: { type: rejectedCandidateCountsSchema, default: () => ({}), ...immutable },
  outcome: {
    type: String, enum: ['succeeded', 'failed', 'cancelled', 'wait_timeout'], required: true, ...immutable,
  },
  reasonCode: { type: String, default: null, ...immutable },
  latencyMs: { type: Number, min: 0, required: true, ...immutable },
  costStatus: { type: String, enum: ['known', 'unknown'], required: true, ...immutable },
  costUsd: { type: Number, min: 0, default: null, ...immutable },
}, {
  versionKey: false,
  timestamps: false,
  strict: 'throw',
  collection: 'trailie_evidence_refresh_events',
});

trailieEvidenceRefreshEventSchema.index({ refreshEventId: 1 }, { unique: true });
trailieEvidenceRefreshEventSchema.index({ refreshKeyHash: 1, completedAt: -1 });
trailieEvidenceRefreshEventSchema.index({ provider: 1, operation: 1, completedAt: -1 });

trailieEvidenceRefreshEventSchema.pre('validate', function validateTerminalEvent(next) {
  if (this.completedAt < this.startedAt) return next(new Error('Evidence refresh completion precedes start'));
  if (this.costStatus === 'unknown' && this.costUsd != null) return next(new Error('Unknown evidence refresh cost must be null'));
  return next();
});

module.exports = mongoose.models.TrailieEvidenceRefreshEvent
  || mongoose.model('TrailieEvidenceRefreshEvent', trailieEvidenceRefreshEventSchema);
