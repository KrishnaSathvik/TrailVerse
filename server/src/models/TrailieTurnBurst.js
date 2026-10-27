'use strict';

const mongoose = require('mongoose');

// Sliding-window log of user-initiated signed-in Trailie turns, one document
// per hashed principal. Updated by optimistic compare-and-swap on `version`,
// so concurrent instances cannot both admit past the window limit.
const burstTurnSchema = new mongoose.Schema({
  id: { type: String, default: null },
  at: { type: Date, required: true },
  attempts: { type: Number, default: 1 },
}, { _id: false });

const trailieTurnBurstSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  version: { type: Number, required: true },
  turns: { type: [burstTurnSchema], default: [] },
  expiresAt: { type: Date, required: true },
}, {
  strict: 'throw',
  versionKey: false,
  collection: 'trailie_turn_bursts',
});

trailieTurnBurstSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.TrailieTurnBurst
  || mongoose.model('TrailieTurnBurst', trailieTurnBurstSchema);
