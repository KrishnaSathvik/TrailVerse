'use strict';

const mongoose = require('mongoose');

/**
 * The one ACTIVE conversational canonical plan per authenticated user —
 * conversation state, not durable persistence (that is TripPlan's job).
 * Written when an authenticated turn completes with an accepted plan; read on
 * the next turn so a continuation ("make day 2 easier") refines instead of
 * regenerating, exactly as guest sessions already do via their messages.
 * See utils/conversationPlanContinuity.js for the trust model.
 */
const trailieConversationPlanSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  responseId: { type: String, default: null },
  // Normalized server-authored prose prefix — the continuity signal a
  // continuation must echo before the plan is recalled.
  contentKey: { type: String, required: true },
  canonicalPlan: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, required: true, default: Date.now },
}, { versionKey: false, collection: 'trailie_conversation_plans' });

trailieConversationPlanSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports =
  mongoose.models.TrailieConversationPlan ||
  mongoose.model('TrailieConversationPlan', trailieConversationPlanSchema);
