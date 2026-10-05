'use strict';

const mongoose = require('mongoose');

/**
 * Stage 9 — sanitized async review telemetry.
 *
 * Observational data ONLY, persisted separately from the trip plan. It never
 * stores the full response, full facts, model rationale, or replacement prose.
 * Issue records are capped and carry only ids, hashes, reason codes, and a short
 * sanitized excerpt.
 */

const issueRecordSchema = new mongoose.Schema(
  {
    issueType: String,
    sectionId: String,
    policyBasis: String,
    evidenceFactIds: [String],
    resolutionStatus: String,
    quoteHash: String,
    shortSanitizedExcerpt: String,
  },
  { _id: false }
);

const trailieReviewTelemetrySchema = new mongoose.Schema(
  {
    responseId: { type: String, required: true, index: true },
    responseVersion: { type: Number, required: true },
    contentHash: { type: String, required: true },
    itineraryHash: { type: String, default: null },
    reviewerVersion: { type: String, required: true },
    jobId: { type: String, index: true },

    reviewStatus: { type: String },
    attempts: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },

    sectionsTotal: { type: Number, default: 0 },
    sectionsReviewed: { type: Number, default: 0 },
    sectionsFailed: { type: Number, default: 0 },
    reviewCoverageRatio: { type: Number, default: 0 },

    issuesDetected: { type: Number, default: 0 },
    policyApproved: { type: Number, default: 0 },
    hypotheticalPatchesVerified: { type: Number, default: 0 },
    hypotheticalPatchesFailed: { type: Number, default: 0 },

    wouldApply: { type: Number, default: 0 },
    wouldWarn: { type: Number, default: 0 },
    wouldQuarantine: { type: Number, default: 0 },

    contentUnverified: { type: Boolean, default: false },
    evidenceReasonCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    issueTypeCounts: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Capped, sanitized issue records only.
    issues: { type: [issueRecordSchema], default: [] },

    completedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One telemetry row per canonical response evaluation under a reviewer version.
trailieReviewTelemetrySchema.index(
  { responseId: 1, contentHash: 1, itineraryHash: 1, reviewerVersion: 1 },
  { unique: true }
);

module.exports = mongoose.model('TrailieReviewTelemetry', trailieReviewTelemetrySchema);
