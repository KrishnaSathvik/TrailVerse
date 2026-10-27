'use strict';

const mongoose = require('mongoose');

// Observability-only daily Trailie model spend counters (UTC day). Never read
// on the admission path; used to emit at most one operational alert per
// scope/metric/day. _id = `user:<principalHash>:<YYYY-MM-DD>` or
// `aggregate:all:<YYYY-MM-DD>`.
const trailieSpendDailySchema = new mongoose.Schema({
  _id: { type: String, required: true },
  scope: { type: String, enum: ['user', 'aggregate'], required: true },
  principalHash: { type: String, default: null },
  day: { type: String, required: true },
  costUsd: { type: Number, default: 0 },
  tokens: { type: Number, default: 0 },
  turns: { type: Number, default: 0 },
  unpricedTurns: { type: Number, default: 0 },
  alerts: {
    cost: { type: Date, default: null },
    tokens: { type: Date, default: null },
  },
  expiresAt: { type: Date, required: true },
}, {
  strict: 'throw',
  versionKey: false,
  collection: 'trailie_spend_daily',
});

trailieSpendDailySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.TrailieSpendDaily
  || mongoose.model('TrailieSpendDaily', trailieSpendDailySchema);
