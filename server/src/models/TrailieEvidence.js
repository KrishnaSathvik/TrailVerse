'use strict';

const mongoose = require('mongoose');
const { assertPublicEvidenceWrite } = require('../utils/evidencePrivacy');

const strictChild = { _id: false, strict: 'throw' };

const claimSchema = new mongoose.Schema({
  identity: { type: String, required: true },
  text: { type: String, default: null },
  normalizedValue: { type: mongoose.Schema.Types.Mixed, default: null },
  unit: { type: String, default: null },
  status: { type: String, default: null },
  subjectId: { type: String, default: null },
  objectId: { type: String, default: null },
  qualifiers: { type: [mongoose.Schema.Types.Mixed], default: [] },
  polarity: { type: String, enum: ['positive', 'negative'], default: 'positive' },
}, strictChild);

const absenceProofSchema = new mongoose.Schema({
  providerDeclaredComplete: { type: Boolean, required: true },
  completenessScope: { type: String, required: true },
  observedAt: { type: Date, required: true },
  ruleCode: { type: String, enum: ['authoritative_complete_empty_result'], required: true },
}, strictChild);

const evidenceRouteScopeSchema = new mongoose.Schema({
  originEntityId: { type: String, required: true },
  destinationEntityId: { type: String, required: true },
  travelMode: {
    type: String,
    enum: ['driving', 'walking', 'bicycling', 'transit'],
    required: true,
  },
  departureTimeBucket: { type: String, required: true },
}, strictChild);

const scopeSchema = new mongoose.Schema({
  geographicEntityIds: { type: [String], default: [] },
  validFrom: { type: Date, default: null },
  validThrough: { type: Date, default: null },
  audience: { type: String, enum: ['public'], default: 'public', required: true },
  locale: { type: String, default: 'en-US' },
  // WP5C / Maps driving_time evidence: required for coverage routeScope matching.
  route: { type: evidenceRouteScopeSchema, default: null },
}, strictChild);

const sourceSchema = new mongoose.Schema({
  provider: { type: String, required: true },
  sourceClass: { type: String, required: true },
  sourceId: { type: String, default: null },
  url: { type: String, default: null },
  title: { type: String, default: null },
  publishedAt: { type: Date, default: null },
  sourceUpdatedAt: { type: Date, default: null },
}, strictChild);

const observationSchema = new mongoose.Schema({
  observedAt: { type: Date, required: true },
  fetchedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  staleUntil: { type: Date, required: true },
  retrievalMode: {
    type: String,
    enum: ['live', 'scheduled', 'generated', 'manual'],
    required: true,
  },
  httpEtag: { type: String, default: null },
  httpLastModified: { type: String, default: null },
}, strictChild);

const qualitySchema = new mongoose.Schema({
  authorityClass: { type: String, required: true },
  freshnessStatus: {
    type: String,
    enum: ['fresh', 'stale_safe', 'stale_unsafe', 'expired'],
    default: 'fresh',
  },
  scopeMatch: { type: String, enum: ['exact', 'partial', 'broad', 'unknown'], default: 'exact' },
  /**
   * Continuous companion to `scopeMatch`, produced by verifyWebDestinationRelevance
   * on the same 0..1 scale (1 = verified official relationship or matching NPS URL
   * code, 0.9 = geographic proximity, ≤0.95 = canonical name match, 0 = conflict).
   *
   * `searchCandidate()` and directOfficialPageEvidenceProvider have always set it,
   * but the subdocument is `strict: 'throw'` and never declared it — so EVERY web
   * candidate (Brave, Serper, Tavily) and every official-follow result failed
   * validation with an unnamed ValidationError and was counted as a generic
   * `provider_response_invalid`. Declaring the field registers what the producers
   * already emit; it introduces no new concept and nothing reads it for authority.
   */
  relationshipConfidence: { type: Number, min: 0, max: 1, default: null },
  corroboratingEvidenceIds: { type: [String], default: [] },
  conflictingEvidenceIds: { type: [String], default: [] },
  conflictStatus: {
    type: String,
    enum: ['none', 'open', 'resolved', 'expired'],
    default: 'none',
  },
}, strictChild);

const provenanceSchema = new mongoose.Schema({
  extractionMethod: { type: String, required: true },
  extractorVersion: { type: String, required: true },
  rawPayloadHash: { type: String, default: null },
  contentHash: { type: String, required: true },
}, strictChild);

const retentionSchema = new mongoose.Schema({
  class: { type: String, required: true },
  licenseClass: { type: String, required: true },
  storeClaimText: { type: Boolean, default: true },
  deleteAfter: { type: Date, default: null },
}, strictChild);

const trailieEvidenceSchema = new mongoose.Schema({
  evidenceId: { type: String, required: true, immutable: true },
  logicalKey: { type: String, required: true, immutable: true },
  canonicalKey: { type: String, required: true, immutable: true },
  schemaVersion: { type: Number, default: 1, immutable: true },
  entityId: { type: String, required: true },
  topic: { type: String, required: true },
  evidenceType: {
    type: String,
    enum: ['fact', 'rule', 'live_state', 'description', 'relationship', 'recommendation_signal'],
    required: true,
  },
  claim: { type: claimSchema, required: true },
  scope: { type: scopeSchema, required: true },
  source: { type: sourceSchema, required: true },
  observation: { type: observationSchema, required: true },
  quality: { type: qualitySchema, required: true },
  provenance: { type: provenanceSchema, required: true },
  retention: { type: retentionSchema, required: true },
  absenceProof: { type: absenceProofSchema, default: null },
  isCurrent: { type: Boolean, default: true, required: true },
  supersedesEvidenceId: { type: String, default: null },
}, {
  timestamps: true,
  strict: 'throw',
  collection: 'trailie_evidence',
});

trailieEvidenceSchema.pre('validate', function assertCanonicalWriteIsPublic(next) {
  try {
    if (this.claim?.polarity === 'negative' && !this.absenceProof?.providerDeclaredComplete) {
      throw new Error('Negative evidence requires authoritative completeness proof');
    }
    const item = { privacyScope: 'public', ...this.toObject({ depopulate: true }) };
    assertPublicEvidenceWrite({
      item,
      sourceRequest: { privacyScope: 'public', provider: this.source?.provider || 'unknown' },
    });
    next();
  } catch (error) {
    next(error);
  }
});

trailieEvidenceSchema.index({ evidenceId: 1 }, { unique: true });
trailieEvidenceSchema.index({ canonicalKey: 1 }, { unique: true });
trailieEvidenceSchema.index(
  { logicalKey: 1, isCurrent: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true } }
);
trailieEvidenceSchema.index({ entityId: 1, topic: 1, isCurrent: 1, 'observation.expiresAt': 1 });
trailieEvidenceSchema.index({ 'observation.expiresAt': 1 });
trailieEvidenceSchema.index({ 'source.provider': 1, 'source.sourceId': 1 });
trailieEvidenceSchema.index({ 'quality.conflictStatus': 1, updatedAt: -1 });
trailieEvidenceSchema.index({ 'retention.deleteAfter': 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.TrailieEvidence
  || mongoose.model('TrailieEvidence', trailieEvidenceSchema);
