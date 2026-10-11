'use strict';

const mongoose = require('mongoose');
const TrailieAiTurn = require('../models/TrailieAiTurn');
const { hashPrincipal } = require('./trailieTurnLedger');

const SCHEMA_VERSION = 1;
const codes = value => (Array.isArray(value) ? value : []).filter(c => typeof c === 'string' && /^[a-z0-9_]{1,80}$/.test(c)).slice(0, 32);

/**
 * Persist the bounded mutation outcome of one model-first turn on its
 * `trailie_ai_turns` row, so a rejected edit stays diagnosable after the
 * process log is gone. Never affects the traveler's response.
 */
async function recordMutationOutcome({ responseId, userId = null, outcome, now = new Date() } = {}) {
  if (!responseId || !outcome || mongoose.connection.readyState !== 1) return false;
  const mutation = {
    mutationStatus: String(outcome.mutationStatus || 'unknown').slice(0, 40),
    mutationIssues: codes(outcome.mutationIssues),
    correctionAttempted: outcome.correctionAttempted === true,
    correctionIssues: codes(outcome.correctionIssues),
    recordedAt: now,
  };
  await TrailieAiTurn.updateOne({ responseId: String(responseId) }, {
    $set: { 'validation.mutation': mutation },
    $setOnInsert: { responseVersion: 0, route: 'model_first', userTier: userId ? 'authenticated' : 'guest',
      principalHash: userId ? hashPrincipal(userId) : null, costStatus: 'cost_unknown', schemaVersion: SCHEMA_VERSION, createdAt: now },
  }, { upsert: true });
  return true;
}

module.exports = { recordMutationOutcome };
