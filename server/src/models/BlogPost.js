const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a title'],
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  excerpt: {
    type: String,
    required: [true, 'Please provide an excerpt'],
    maxlength: [300, 'Excerpt cannot be more than 300 characters']
  },
  content: {
    type: String,
    required: [true, 'Please provide content']
  },
  featuredImage: {
    type: String,
    default: null
  },
  author: {
    type: String,
    required: [true, 'Please provide author name'],
    default: 'TrailVerse Team'
  },
  category: {
    type: String,
    enum: ['Hiking', 'Photography', 'Wildlife', 'Travel Tips', 'Park Guides', 'Camping', 'History', 'Conservation', 'Fall Travel Blog', 'Travel Blogs'],
    default: 'Park Guides'
  },
  tags: [{
    type: String
  }],
  status: {
    type: String,
    enum: ['draft', 'published', 'archived', 'scheduled'],
    default: 'draft'
  },
  publishedAt: {
    type: Date,
    default: null
  },
  scheduledAt: {
    type: Date,
    default: null
  },
  views: {
    type: Number,
    default: 0
  },
  readTime: {
    type: Number, // in minutes
    default: 5
  },
  featured: {
    type: Boolean,
    default: false
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

// Add indexes for frequently queried fields
// Note: slug index is already created by unique: true in schema

// Primary query patterns
blogPostSchema.index({ status: 1, publishedAt: -1 }); // Main blog list
blogPostSchema.index({ status: 1, featured: 1, publishedAt: -1 }); // Featured posts
blogPostSchema.index({ category: 1, status: 1, publishedAt: -1 }); // Category filtering
blogPostSchema.index({ tags: 1, status: 1, publishedAt: -1 }); // Tag filtering
blogPostSchema.index({ views: -1, status: 1 }); // Popular posts

// Secondary indexes
blogPostSchema.index({ author: 1, status: 1 }); // Author's posts
blogPostSchema.index({ scheduledAt: 1, status: 1 }); // Scheduled posts

// Text index for search functionality
blogPostSchema.index({ 
  title: 'text',
  excerpt: 'text',
  content: 'text'
}, {
  weights: {
    title: 10,
    excerpt: 5,
    content: 1
  }
});

// Generate slug from title before saving
blogPostSchema.pre('save', function(next) {
  if (this.isModified('title')) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
  
  // Calculate read time (average 200 words per minute)
  if (this.isModified('content')) {
    const wordCount = this.content.split(/\s+/).length;
    this.readTime = Math.ceil(wordCount / 200);
  }
  
  next();
});

// Set publishedAt when status changes to published
blogPostSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('BlogPost', blogPostSchema);
