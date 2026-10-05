'use strict';

const mongoose = require('mongoose');

const intentEntitySchema = new mongoose.Schema({
  type: { type: String, required: true },
  role: { type: String, required: true },
  canonicalId: { type: String, default: null },
  confidence: { type: Number, required: true },
}, { _id: false });

const intentShadowAgreementSchema = new mongoose.Schema({
  primaryIntent: { type: Boolean, default: null },
  verticals: { type: Boolean, default: null },
  depth: { type: Boolean, default: null },
  freshness: { type: Boolean, default: null },
  actionability: { type: Boolean, default: null },
  scope: { type: Boolean, default: null },
}, { _id: false });

const intentShadowSchema = new mongoose.Schema({
  eligible: { type: Boolean, required: true },
  attempted: { type: Boolean, required: true },
  status: { type: String, required: true },
  provider: { type: String, default: null },
  model: { type: String, default: null },
  durationMs: { type: Number, default: null },
  primaryIntent: { type: String, default: null },
  verticals: { type: [String], default: [] },
  confidence: { type: Number, default: null },
  agreement: { type: intentShadowAgreementSchema, default: null },
  errorCode: { type: String, default: null },
}, { _id: false });

const intentSchema = new mongoose.Schema({
  primary: { type: String, default: null },
  verticals: { type: [String], default: [] },
  depth: { type: String, default: null },
  freshness: { type: String, default: null },
  actionability: { type: String, default: null },
  scope: { type: String, default: null },
  entities: { type: [intentEntitySchema], default: [] },
  confidence: { type: Number, default: null },
  reasonCodes: { type: [String], default: [] },
  compound: { type: Boolean, default: false },
  shadowEligible: { type: Boolean, default: false },
  shadow: { type: intentShadowSchema, default: null },
  version: { type: String, default: null },
}, { _id: false });

const destinationSchema = new mongoose.Schema({
  entityId: { type: String, required: true },
  type: { type: String, required: true },
}, { _id: false });

const callSchema = new mongoose.Schema({
  phase: { type: String, required: true },
  provider: { type: String, default: null },
  model: { type: String, default: null },
  serviceTier: { type: String, default: null },
  startedAt: { type: Date, default: null },
  ttftMs: { type: Number, default: null },
  durationMs: { type: Number, default: null },
  inputTokens: { type: Number, default: null },
  outputTokens: { type: Number, default: null },
  reasoningTokens: { type: Number, default: null },
  cachedTokens: { type: Number, default: null },
  cacheWriteTokens: { type: Number, default: null },
  costUsd: { type: Number, default: null },
  costComponents: { type: new mongoose.Schema({
    input: Number, cacheRead: Number, cacheWrite: Number, output: Number, reasoning: Number,
  }, { _id: false }), default: null },
  costStatus: { type: String, enum: ['priced', 'cost_unknown'], required: true },
  pricingVersion: { type: String, default: null },
  status: { type: String, required: true },
  retry: { type: Boolean, default: false },
  fallback: { type: Boolean, default: false },
  errorCode: { type: String, default: null },
}, { _id: false });

const trailieAiTurnSchema = new mongoose.Schema({
  responseId: { type: String, required: true, unique: true },
  responseVersion: { type: Number, required: true },
  route: { type: String, required: true, index: true },
  userTier: { type: String, required: true },
  principalHash: { type: String, default: null, index: true },
  intent: { type: intentSchema, default: () => ({}) },
  destinations: { type: [destinationSchema], default: [] },
  evidence: { type: mongoose.Schema.Types.Mixed, default: {} },
  calls: { type: [callSchema], default: [] },
  validation: { type: mongoose.Schema.Types.Mixed, default: {} },
  delivery: { type: mongoose.Schema.Types.Mixed, default: {} },
  persistence: { type: mongoose.Schema.Types.Mixed, default: {} },
  feedback: { type: mongoose.Schema.Types.Mixed, default: null },
  costUsd: { type: Number, default: null },
  costStatus: { type: String, enum: ['priced', 'cost_unknown'], required: true },
  schemaVersion: { type: Number, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
}, { versionKey: false, collection: 'trailie_ai_turns' });

trailieAiTurnSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
trailieAiTurnSchema.index({ route: 1, createdAt: -1 });
trailieAiTurnSchema.index({ 'intent.primary': 1, createdAt: -1 });

module.exports = mongoose.models.TrailieAiTurn || mongoose.model('TrailieAiTurn', trailieAiTurnSchema);
