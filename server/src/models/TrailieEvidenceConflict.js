'use strict';

const mongoose = require('mongoose');

const resolutionSchema = new mongoose.Schema({
  winningEvidenceId: { type: String, default: null },
  ruleCode: { type: String, default: null },
  explanationCode: { type: String, default: null },
  resolvedAt: { type: Date, default: null },
}, { _id: false, strict: 'throw' });

const trailieEvidenceConflictSchema = new mongoose.Schema({
  conflictId: { type: String, required: true, immutable: true },
  entityId: { type: String, required: true },
  topic: { type: String, required: true },
  scopeHash: { type: String, required: true },
  evidenceIds: { type: [String], required: true },
  status: {
    type: String,
    enum: ['open', 'deterministically_resolved', 'manually_resolved', 'expired'],
    default: 'open',
    required: true,
  },
  resolution: { type: resolutionSchema, default: () => ({}) },
  firstObservedAt: { type: Date, default: Date.now, required: true },
  lastObservedAt: { type: Date, default: Date.now, required: true },
}, {
  timestamps: true,
  strict: 'throw',
  collection: 'trailie_evidence_conflicts',
});

trailieEvidenceConflictSchema.pre('validate', function validateConflictLinks(next) {
  const distinct = [...new Set(this.evidenceIds || [])];
  if (distinct.length < 2 || distinct.length !== (this.evidenceIds || []).length) {
    return next(new Error('Conflict requires at least two distinct evidence IDs'));
  }
  this.evidenceIds = distinct.sort();
  if (this.status !== 'open' && this.status !== 'expired') {
    if (!this.resolution?.winningEvidenceId || !distinct.includes(this.resolution.winningEvidenceId)) {
      return next(new Error('Resolved conflict winning evidence must link to a conflicting evidence ID'));
    }
  }
  return next();
});

trailieEvidenceConflictSchema.index({ conflictId: 1 }, { unique: true });
trailieEvidenceConflictSchema.index({ entityId: 1, topic: 1, scopeHash: 1, status: 1 });
trailieEvidenceConflictSchema.index({ evidenceIds: 1 });

module.exports = mongoose.models.TrailieEvidenceConflict
  || mongoose.model('TrailieEvidenceConflict', trailieEvidenceConflictSchema);
