const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  parkCode: {
    type: String,
    default: null,
    trim: true
  },
  parkName: {
    type: String,
    default: null,
    trim: true
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
    metadata: {
      provider: String,
      model: String,
      tokens: {
        input: Number,
        output: Number
      }
    }
  }],
  settings: {
    provider: {
      type: String,
      enum: ['claude', 'openai'],
      default: 'claude'
    },
    model: {
      type: String,
      default: null
    },
    temperature: {
      type: Number,
      default: 0.4,
      min: 0,
      max: 2
    },
    maxTokens: {
      type: Number,
      default: 2000
    }
  },
  totalTokens: {
    type: Number,
    default: 0
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  category: {
    type: String,
    enum: ['trip-planning', 'park-info', 'general', 'hiking', 'camping', 'wildlife', 'photography'],
    default: 'general'
  }
}, {
  timestamps: true
});

// Add indexes
conversationSchema.index({ userId: 1, lastMessageAt: -1 });
conversationSchema.index({ userId: 1, isActive: 1 });
conversationSchema.index({ parkCode: 1 });
conversationSchema.index({ category: 1 });
conversationSchema.index({ tags: 1 });

// Virtual for message count
conversationSchema.virtual('messageCount').get(function() {
  return this.messages.length;
});

// Method to add message
conversationSchema.methods.addMessage = function(message) {
  this.messages.push(message);
  this.lastMessageAt = new Date();
  if (message.metadata && message.metadata.tokens) {
    this.totalTokens += (message.metadata.tokens.input || 0) + (message.metadata.tokens.output || 0);
  }
  return this.save();
};

// Method to update title based on first user message
conversationSchema.methods.updateTitle = function() {
  if (!this.title || this.title === 'New Conversation') {
    const firstUserMessage = this.messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      this.title = firstUserMessage.content.substring(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '');
    }
  }
  return this.save();
};

// Method to archive conversation
conversationSchema.methods.archive = function() {
  this.isActive = false;
  return this.save();
};

// Method to restore conversation
conversationSchema.methods.restore = function() {
  this.isActive = true;
  return this.save();
};

module.exports = mongoose.model('Conversation', conversationSchema);
