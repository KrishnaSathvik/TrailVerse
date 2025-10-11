const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  blogPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlogPost',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    maxlength: [500, 'Comment cannot exceed 500 characters']
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isApproved: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Add indexes for efficient querying
commentSchema.index({ blogPost: 1, createdAt: -1 });
commentSchema.index({ user: 1, createdAt: -1 });
commentSchema.index({ isApproved: 1 });
commentSchema.index({ blogPost: 1, isApproved: 1 });
commentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
