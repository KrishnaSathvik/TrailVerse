const mongoose = require('mongoose');
const { ANONYMOUS_USER_MESSAGE_LIMIT, ANONYMOUS_SESSION_TTL_SECONDS } = require('../config/anonymousChatLimits');
const { countCompletedTurns, remainingAllowance } = require('../utils/guestTurnQuota');

/**
 * Stage 14.8A.2 §3 — one guest quota unit is ONE logical turn:
 *   one admitted user message + one successful terminal assistant response.
 *
 * The turn record carries that lifecycle explicitly so quota can never be
 * inferred from raw message-array length. `messages` therefore holds COMPLETED
 * history only; a pending or failed turn lives solely in `turns`.
 */
const GuestTurnMessageSchema = new mongoose.Schema({
  conversationId: String,
  planningState: mongoose.Schema.Types.Mixed,
  artifactStatus: mongoose.Schema.Types.Mixed,
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  provider: String,
  model: String,
  responseTime: Number,
  travelLogistics: mongoose.Schema.Types.Mixed,
  canonicalPlan: mongoose.Schema.Types.Mixed,
  responseArtifacts: mongoose.Schema.Types.Mixed,
  intent: mongoose.Schema.Types.Mixed,
  presentation: mongoose.Schema.Types.Mixed,
  // WP-TU Phase 3 Task 8B — same additive field as TripPlan.js's conversation
  // subdocument; persisted the same way intent/presentation already are.
  activeTripPresentation: mongoose.Schema.Types.Mixed,
  // WP-TU Phase 4 Task 10 — same additive field as TripPlan.js's
  // conversation subdocument; persisted the same way (Task 8B's recipe).
  targetTripId: String,
  itineraryHash: String,
  contentHash: String,
  responseId: String,
  responseVersion: Number,
  responseRevision: Number,
  lifecycleStatus: String,
  presentationKind: String,
  parkName: String,
  parkNames: [String],
  hasLiveData: Boolean,
  hasWebSearch: Boolean
}, { _id: false });

const GuestTurnSchema = new mongoose.Schema({
  turnId: { type: String, required: true },
  clientTurnId: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    required: true,
    default: 'pending'
  },
  userMessage: { type: GuestTurnMessageSchema, required: true },
  assistantMessage: { type: GuestTurnMessageSchema, default: undefined },
  admittedAt: { type: Date, required: true },
  completedAt: { type: Date, default: undefined },
  failedAt: { type: Date, default: undefined },
  failureCode: { type: String, default: undefined }
}, { _id: false });

const AnonymousSessionSchema = new mongoose.Schema({
  anonymousId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  browserFingerprint: {
    type: String,
    required: true
  },
  messages: [{
    conversationId: String,
    planningState: mongoose.Schema.Types.Mixed,
    artifactStatus: mongoose.Schema.Types.Mixed,
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    historyOrigin: String,
    provider: String,
    model: String,
    responseTime: Number,
    travelLogistics: mongoose.Schema.Types.Mixed,
    canonicalPlan: mongoose.Schema.Types.Mixed,
    responseArtifacts: mongoose.Schema.Types.Mixed,
    intent: mongoose.Schema.Types.Mixed,
    presentation: mongoose.Schema.Types.Mixed,
    // WP-TU Phase 3 Task 8B — same additive field, kept in sync with
    // GuestTurnMessageSchema above (these two are hand-duplicated).
    activeTripPresentation: mongoose.Schema.Types.Mixed,
    // WP-TU Phase 4 Task 10 — same additive field, kept in sync with
    // GuestTurnMessageSchema above (these two are hand-duplicated).
    targetTripId: String,
    itineraryHash: String,
    contentHash: String,
    responseId: String,
    responseVersion: Number,
    responseRevision: Number,
    lifecycleStatus: String,
    presentationKind: String,
    parkName: String,
    parkNames: [String],
    hasLiveData: Boolean,
    hasWebSearch: Boolean
  }],
  /**
   * Explicit logical-turn records. Authoritative for quota (Stage 14.8A.2 §4).
   * Completed turns are never pruned; failed turns are pruned to a bounded
   * diagnostic window by the turn ledger.
   */
  turns: {
    type: [GuestTurnSchema],
    default: []
  },
  /**
   * Performance cache only. `turns` remains authoritative — drift is a detected
   * defect, never a quota source (Stage 14.8A.2 §4).
   */
  completedTurnCount: {
    type: Number,
    default: 0
  },
  parkName: {
    type: String,
    default: 'General Planning'
  },
  parkCode: String,
  formData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  planningState: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  },
  entryContext: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  },
  messageCount: {
    type: Number,
    default: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  historyRecoveryHash: String,
  conversationConversions: { type: mongoose.Schema.Types.Mixed, default: {} },
  convertedTripId: { type: mongoose.Schema.Types.ObjectId, ref: 'TripPlan' },
  isConverted: {
    type: Boolean,
    default: false
  },
  convertedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  convertedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for cleanup of expired sessions
AnonymousSessionSchema.index({ lastActivity: 1 }, { expireAfterSeconds: ANONYMOUS_SESSION_TTL_SECONDS });

// Index for finding sessions by anonymousId
// anonymousId already has a unique index; a second plain declaration conflicts.

// Method to add a message
AnonymousSessionSchema.methods.addMessage = function(message) {
  this.messages.push(message);
  this.messageCount = this.messages.length;
  this.lastActivity = new Date();
  return this.save();
};

/**
 * Stage 14.8A.2 §4 — completion-coupled. A guest may send again while fewer
 * than ANONYMOUS_USER_MESSAGE_LIMIT logical turns have COMPLETED. Pending and
 * failed turns, and raw user-role messages, never consume allowance.
 */
AnonymousSessionSchema.methods.completedGuestTurns = function() {
  return countCompletedTurns(this.turns);
};

AnonymousSessionSchema.methods.remainingGuestAllowance = function() {
  return remainingAllowance(this.completedGuestTurns(), ANONYMOUS_USER_MESSAGE_LIMIT);
};

AnonymousSessionSchema.methods.canSendMessage = function() {
  return this.completedGuestTurns() < ANONYMOUS_USER_MESSAGE_LIMIT;
};

// Method to get conversation summary
AnonymousSessionSchema.methods.getConversationSummary = function() {
  const userMessages = this.messages.filter(msg => msg.role === 'user');
  const assistantMessages = this.messages.filter(msg => msg.role === 'assistant');
  
  return {
    totalMessages: this.messages.length,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    lastUserMessage: userMessages[userMessages.length - 1]?.content || '',
    lastAssistantMessage: assistantMessages[assistantMessages.length - 1]?.content || '',
    parkName: this.parkName,
    formData: this.formData
  };
};

// Static method to find or create session
AnonymousSessionSchema.statics.findOrCreateSession = async function(anonymousId, sessionData) {
  let session = await this.findOne({ anonymousId });
  
  if (!session) {
    session = await this.create({
      anonymousId,
      ...sessionData
    });
  }
  
  return session;
};

module.exports = mongoose.model('AnonymousSession', AnonymousSessionSchema);
