'use strict';

const mongoose = require('mongoose');
const { assertPublicEvidenceWrite } = require('../utils/evidencePrivacy');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_MS = 7 * DAY_MS;
const MAX_RETENTION_MS = 30 * DAY_MS;

const trailieEvidenceRawSchema = new mongoose.Schema({
  rawId: { type: String, required: true, immutable: true },
  privacyScope: { type: String, enum: ['public'], required: true, default: 'public' },
  provider: { type: String, required: true },
  sourceId: { type: String, default: null },
  sourceUrl: { type: String, required: true },
  httpStatus: { type: Number, default: null },
  rawPayloadHash: { type: String, required: true },
  excerpt: { type: String, maxlength: 4000, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  fetchedAt: { type: Date, default: Date.now, required: true },
  deleteAfter: {
    type: Date,
    required: true,
    validate: {
      validator(value) {
        return value >= this.fetchedAt
          && value.getTime() - this.fetchedAt.getTime() <= MAX_RETENTION_MS;
      },
      message: 'raw evidence retention must be between zero and thirty days',
    },
  },
}, {
  timestamps: true,
  strict: 'throw',
  collection: 'trailie_evidence_raw',
});

trailieEvidenceRawSchema.pre('validate', function boundAndInspectRawEvidence(next) {
  try {
    if (!this.fetchedAt) this.fetchedAt = new Date();
    if (!this.deleteAfter) this.deleteAfter = new Date(this.fetchedAt.getTime() + DEFAULT_RETENTION_MS);
    assertPublicEvidenceWrite({
      item: this.toObject({ depopulate: true }),
      sourceRequest: { privacyScope: 'public', provider: this.provider },
    });
    next();
  } catch (error) {
    next(error);
  }
});

trailieEvidenceRawSchema.index({ rawId: 1 }, { unique: true });
trailieEvidenceRawSchema.index({ provider: 1, rawPayloadHash: 1 });
trailieEvidenceRawSchema.index({ deleteAfter: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.TrailieEvidenceRaw
  || mongoose.model('TrailieEvidenceRaw', trailieEvidenceRawSchema);
