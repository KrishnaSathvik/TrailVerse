const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  parkCode: {
    type: String,
    required: true,
    trim: true
  },
  parkName: {
    type: String,
    required: true,
    trim: true
  },
  imageUrl: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: '',
    maxlength: [500, 'Notes cannot be more than 500 characters']
  },
  tags: [{
    type: String,
    trim: true
  }],
  visitStatus: {
    type: String,
    enum: ['want-to-visit', 'visited', 'favorite'],
    default: 'want-to-visit'
  },
  visitDate: {
    type: Date,
    default: null
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  }
}, {
  timestamps: true
});

// Add indexes
favoriteSchema.index({ user: 1, parkCode: 1 }, { unique: true });
favoriteSchema.index({ user: 1, visitStatus: 1 });
favoriteSchema.index({ parkCode: 1 });
favoriteSchema.index({ createdAt: -1 });
favoriteSchema.index({ parkCode: 1, visitStatus: 1 });
favoriteSchema.index({ user: 1, createdAt: -1 });
favoriteSchema.index({ visitStatus: 1, rating: -1 });

// Method to update visit status
favoriteSchema.methods.markAsVisited = function(rating = null, visitDate = null) {
  this.visitStatus = 'visited';
  if (rating) this.rating = rating;
  if (visitDate) this.visitDate = visitDate;
  return this.save();
};

// Method to mark as favorite
favoriteSchema.methods.markAsFavorite = function(rating = null) {
  this.visitStatus = 'favorite';
  if (rating) this.rating = rating;
  return this.save();
};

module.exports = mongoose.model('Favorite', favoriteSchema);
