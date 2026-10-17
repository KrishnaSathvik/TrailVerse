'use strict';

const mongoose = require('mongoose');

/**
 * Small race-proof bridge between the AI response and the browser-owned trip
 * save. It carries no trip content or user identifier and expires with the turn
 * ledger. The final ledger row mirrors this receipt when either side arrives.
 */
const trailieTurnPersistenceSchema = new mongoose.Schema({
  responseId: { type: String, required: true, unique: true },
  attempted: { type: Boolean, required: true },
  status: { type: String, required: true },
  responseRevision: { type: Number, default: null },
  hashMatch: { type: Boolean, default: null },
  observedAt: { type: Date, required: true, default: Date.now },
}, { versionKey: false, collection: 'trailie_turn_persistence' });

trailieTurnPersistenceSchema.index({ observedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports =
  mongoose.models.TrailieTurnPersistence ||
  mongoose.model('TrailieTurnPersistence', trailieTurnPersistenceSchema);
