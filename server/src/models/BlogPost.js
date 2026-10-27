const crypto = require('crypto');
const mongoose = require('mongoose');
const { normalizeBlogCategory } = require('../utils/blogCategories');

/**
 * Fields whose change is a genuine editorial modification of a published post.
 * Only these advance `contentUpdatedAt` (the public "dateModified" / sitemap lastmod).
 *
 * Deliberately NOT editorial (operational / lifecycle / derived):
 *   views, likes, favorites, featured, notificationSentAt, status, publishedAt,
 *   scheduledAt, slug/previousSlugs (URL plumbing), seoNoindex (indexing directive),
 *   author (admin form always sends a placeholder), readTime (derived from content).
 */
const EDITORIAL_FIELDS = Object.freeze([
  'title',
  'excerpt',
  'content',
  'featuredImage',
  'category',
  'tags',
  'metaDescription',
  'seoSchema',
]);

function normalizeEditorialValue(field, value) {
  if (field === 'tags') {
    return (Array.isArray(value) ? value : [])
      .map((tag) => String(tag ?? '').trim())
      .filter(Boolean);
  }
  if (field === 'category') {
    return normalizeBlogCategory(value);
  }
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, '\n').trim();
}

function editorialSnapshot(doc) {
  const snapshot = {};
  for (const field of EDITORIAL_FIELDS) {
    const raw = doc.get(field);
    snapshot[field] = normalizeEditorialValue(field, Array.isArray(raw) ? [...raw] : raw);
  }
  return snapshot;
}

/** Names of editorial fields whose normalized value differs between two snapshots. */
function changedEditorialFields(before, after) {
  if (!before || !after) return [];
  return EDITORIAL_FIELDS.filter(
    (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field])
  );
}

/** Stable fingerprint of a normalized editorial snapshot. */
function editorialHash(snapshot) {
  return crypto.createHash('sha1').update(JSON.stringify(snapshot)).digest('hex');
}

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
    default: 'Krishna'
  },
  category: {
    type: String,
    enum: [
      'trip-planning',
      'national-parks',
      'park-guides',
      'gear-packing',
      'seasonal',
      'astrophotography',
      'budget-travel',
      // Legacy values kept for existing posts
      'Hiking',
      'Photography',
      'Wildlife',
      'Travel Tips',
      'Park Guides',
      'Camping',
      'History',
      'Conservation',
      'Fall Travel Blog',
      'Travel Blogs',
      'Astrophotography',
      'National Parks',
      'Seasonal Guides',
    ],
    default: 'park-guides',
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
  seoSchema: {
    type: String,
    default: null
  },
  metaDescription: {
    type: String,
    maxlength: [160, 'Meta description cannot be more than 160 characters'],
    default: null
  },
  seoNoindex: {
    type: Boolean,
    default: false
  },
  previousSlugs: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  notificationSentAt: {
    type: Date,
    default: null
  },
  // Last genuine editorial change made AFTER publication (see EDITORIAL_FIELDS).
  // Null means "unchanged since publishedAt". Never set by views, likes,
  // favorites, featured toggles, notification bookkeeping, or publish itself.
  // Historical posts stay null (no reliable edit record; `updatedAt` was
  // polluted by view increments), so consumers fall back to publishedAt.
  contentUpdatedAt: {
    type: Date,
    default: null
  },
  // Fingerprint of the editorial fields as they were last visible to the
  // public. Lets a re-publish (after an intentional unpublish) detect whether
  // the revision going live differs from what readers saw before. Null for
  // never-published posts and for legacy posts until their next save.
  lastPublicEditorialHash: {
    type: String,
    default: null
  }
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

// Text index for search functionality.
// Weights match the existing production index and must stay 1/1/1.
blogPostSchema.index({ 
  title: 'text',
  excerpt: 'text',
  content: 'text'
}, {
  weights: {
    title: 1,
    excerpt: 1,
    content: 1
  }
});

// Generate slug from title only when slug is not set (new posts)
blogPostSchema.pre('save', function(next) {
  if (!this.slug && this.title) {
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

// Remember the editorial state as loaded, so saves can detect real changes
// (and ignore no-op saves that re-send identical/trimmed/legacy-category values).
blogPostSchema.post('init', function() {
  this.$locals.editorialSnapshot = editorialSnapshot(this);
  this.$locals.wasPublished = this.status === 'published' && Boolean(this.publishedAt);
});

// Set publishedAt the first time a post goes live. Runs before the freshness
// hook so a publish via the model alone still records the public baseline.
// An existing publishedAt is never overwritten (re-publish keeps the original).
blogPostSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

// Advance contentUpdatedAt only when a genuine editorial revision becomes
// public: saving changes to a live post, or re-publishing a previously
// published post whose editorial fields differ from what readers last saw.
// Edits made while drafting/scheduling a never-published post are part of the
// original publication; draft saves of an unpublished post never touch it.
blogPostSchema.pre('save', function(next) {
  const loadedSnapshot = this.$locals.editorialSnapshot;

  // Legacy posts (no stored fingerprint): the version loaded while live is
  // the last public one.
  if (!this.lastPublicEditorialHash && this.$locals.wasPublished && loadedSnapshot) {
    this.lastPublicEditorialHash = editorialHash(loadedSnapshot);
  }

  const isLive = this.status === 'published' && this.publishedAt;
  if (!isLive) return next();

  const currentHash = editorialHash(editorialSnapshot(this));
  const baseline = this.lastPublicEditorialHash;
  if (!this.isNew && baseline && baseline !== currentHash) {
    const now = new Date();
    if (now >= this.publishedAt) this.contentUpdatedAt = now;
  }
  if (baseline !== currentHash) this.lastPublicEditorialHash = currentHash;
  next();
});

// Refresh the snapshot after a successful save so a reused document compares
// against what is now persisted.
blogPostSchema.post('save', function() {
  this.$locals.editorialSnapshot = editorialSnapshot(this);
  this.$locals.wasPublished = this.status === 'published' && Boolean(this.publishedAt);
});


const BlogPost = mongoose.model('BlogPost', blogPostSchema);

module.exports = BlogPost;
module.exports.EDITORIAL_FIELDS = EDITORIAL_FIELDS;
module.exports.changedEditorialFields = changedEditorialFields;
module.exports.editorialSnapshot = editorialSnapshot;
module.exports.editorialHash = editorialHash;
