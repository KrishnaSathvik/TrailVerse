const mongoose = require('mongoose');

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
    provider: String,
    model: String,
    responseTime: Number
  }],
  parkName: {
    type: String,
    default: 'General Planning'
  },
  parkCode: String,
  formData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  messageCount: {
    type: Number,
    default: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
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
AnonymousSessionSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 48 * 60 * 60 }); // 48 hours

// Index for finding sessions by anonymousId
AnonymousSessionSchema.index({ anonymousId: 1 });

// Method to add a message
AnonymousSessionSchema.methods.addMessage = function(message) {
  this.messages.push(message);
  this.messageCount = this.messages.length;
  this.lastActivity = new Date();
  return this.save();
};

// Method to check if user can send more messages
AnonymousSessionSchema.methods.canSendMessage = function() {
  const userMessageCount = this.messages.filter(msg => msg.role === 'user').length;
  return userMessageCount < 3;
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
