const mongoose = require('mongoose');

const tripPlanSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
    startDate: Date,
    endDate: Date,
    groupSize: Number,
    budget: String,
    fitnessLevel: String,
    interests: [String],
    accommodation: String,
    activities: [String],
    transportation: String
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
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    provider: {
      type: String,
      enum: ['claude', 'openai'],
      default: 'claude'
    },
    model: String,
    responseTime: Number,
    userFeedback: {
      type: String,
      enum: ['up', 'down'],
      default: null,
      required: false
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
    enum: ['claude', 'openai'],
    default: 'claude'
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
