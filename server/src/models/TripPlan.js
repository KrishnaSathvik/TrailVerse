const mongoose = require('mongoose');

/**
 * Stage 14.7F1/F4 — the ONLY conversation message permitted to carry empty
 * content is the durable revision-1 assistant shell produced by
 * `itinerary_ready`: the itinerary is canonical and stored, the prose has not
 * been generated yet, and revision 2 later fills the same slot.
 *
 * The predicate lives in `validation/tripWriteContract` so the create path
 * (this schema) and the update path (the controller's write validator) share
 * ONE definition and cannot drift apart.
 *
 * Historical read compatibility is separate: existing records are never
 * migrated or rewritten. Being able to READ a historical empty message is not
 * permission to CREATE a malformed new one.
 */
const { isCanonicalRevisionOneShell } = require('../validation/tripWriteContract');

const tripPlanSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  shareId: {
    type: String,
    unique: true,
    sparse: true // allows null values
  },
  // Stage 8 — how much of the trip a public share link exposes. Defaults to the
  // privacy-safe 'plan_only'; broader scopes are an explicit owner opt-in.
  shareScope: {
    type: String,
    enum: ['plan_only', 'plan_plus_explanation', 'full_conversation'],
    default: 'plan_only'
  },
  title: {
    type: String,
    default: 'New Trip Plan'
  },
  parkCode: {
    type: String,
    required: false
  },
  parkName: {
    type: String,
    required: false
  },
  formData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  /**
   * Pass #5 — durable normalized planning contract (trailie-planning-state-v1).
   * User/planning intent only — not evidence, weather, or model payloads.
   */
  planningState: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  entryContext: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  conversation: [{
    id: Number,
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },
    content: {
      type: String,
      /**
       * Stage 14.7F1 — `required: true` rejected empty strings, which made the
       * canonical revision-1 assistant shell unstorable: early delivery persists
       * `content: ''` at `itinerary_ready` and fills the prose at revision 2.
       * A new trip therefore could not be created from `itinerary_ready` at all.
       *
       * The exemption is deliberately narrow — it is a conditional requirement,
       * not a relaxation. Every other message still needs real content, and no
       * placeholder text is ever written into canonical content (the
       * "Trip notes pending" label is presentation state only).
       */
      required: [
        function contentRequiredUnlessRevisionOneShell() {
          return !isCanonicalRevisionOneShell(this);
        },
        'Path `content` is required.'
      ],
      validate: {
        // The converse rule: prose belongs to revision 2. A revision-1 shell
        // carrying content would mean the itinerary and the prose were written
        // in one step, which the two-revision contract does not allow.
        validator: function revisionOneShellMustBeEmpty(value) {
          if (!isCanonicalRevisionOneShell(this)) return true;
          return value === '' || value == null;
        },
        message: 'revision_1_shell_must_have_empty_content'
      }
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    provider: {
      type: String,
      enum: ['claude', 'openai', 'auto'],
      default: 'claude'
    },
    model: String,
    responseTime: Number,
    // Stage 8.1 — canonical response identity on the assistant message, so it is
    // persisted/guarded atomically with the plan of the same response.
    responseId: String,
    responseVersion: Number,
    // Stage 14.1 — intra-turn revision (1 = itinerary_ready, 2 = terminal). Absent
    // on every pre-Stage-14 message, which is read as terminal revision 2.
    responseRevision: Number,
    previousRevision: Number,
    lifecycleStatus: String,
    itineraryReadyAt: Date,
    proseReadyAt: Date,
    contentHash: String,
    itineraryHash: String,
    hasLiveData: Boolean,
    hasWebSearch: Boolean,
    hasItinerary: Boolean,
    parkName: String,
    parkNames: [String],
    parkImages: [mongoose.Schema.Types.Mixed],
    travelLogistics: mongoose.Schema.Types.Mixed,
    canonicalPlan: mongoose.Schema.Types.Mixed,
    itineraryPlan: mongoose.Schema.Types.Mixed,
    artifactStatus: mongoose.Schema.Types.Mixed,
    responseArtifacts: mongoose.Schema.Types.Mixed,
    intent: mongoose.Schema.Types.Mixed,
    presentation: mongoose.Schema.Types.Mixed,
    // WP-TU Phase 3 Task 8B — the authoritative active-trip destination for
    // THIS turn (Task 7B's additive field). Persisted the same way
    // intent/presentation already are, so it survives a cold reload instead
    // of only living on the in-memory live-session message.
    activeTripPresentation: mongoose.Schema.Types.Mixed,
    // WP-TU Phase 4 Task 10 — the plan-mutation target this turn's
    // `resolveTargetTripId` (Task 9) resolved, when it reached `resolved`.
    // Persisted the same way activeTripPresentation already is (Task 8B's
    // exact recipe), so the NEXT turn's prior-target continuity input can be
    // recovered by scanning recent messages, the same way
    // `deriveLastConversationalSubject` already does for the conversational
    // subject.
    targetTripId: String,
    // Historical compatibility only. New responses use `presentation` above.
    presentationKind: String,
    userFeedback: {
      type: String,
      default: null,
      required: false,
      validate: {
        validator: (value) => value === null || value === undefined || ['up', 'down'].includes(value),
        message: 'userFeedback must be "up", "down", or null'
      }
    },
    // Stage 8.1 — set by the narrow feedback command only.
    feedbackAt: {
      type: Date,
      default: null
    }
  }],
  plan: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active'
  },
  provider: {
    type: String,
    enum: ['claude', 'openai', 'auto'],
    default: 'auto'
  },
  summary: {
    totalMessages: Number,
    userQuestions: [String],
    hasPlan: Boolean,
    planPreview: String,
    lastActivity: Date,
    keyTopics: [String]
  }
}, {
  timestamps: true
});

// Add indexes
tripPlanSchema.index({ userId: 1, createdAt: -1 });
tripPlanSchema.index({ parkCode: 1 });
tripPlanSchema.index({ status: 1 });
// Stage 8.1 — owner-scoped lookup for new-trip idempotency (create dedupe).
tripPlanSchema.index({ userId: 1, 'plan.responseId': 1 });

// Method to add message
tripPlanSchema.methods.addMessage = function(messageData) {
  const messageId = this.conversation.length + 1;
  this.conversation.push({
    id: messageId,
    ...messageData,
    timestamp: new Date()
  });
  return this.save();
};

module.exports = mongoose.model('TripPlan', tripPlanSchema);
