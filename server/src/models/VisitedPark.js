const mongoose = require('mongoose');

const visitedParkSchema = new mongoose.Schema({
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
  visitDate: {
    type: Date,
    default: Date.now
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  notes: {
    type: String,
    default: '',
    maxlength: [500, 'Notes cannot be more than 500 characters']
  },
  photos: [{
    type: String
  }]
}, {
  timestamps: true
});

// Add indexes
visitedParkSchema.index({ user: 1, parkCode: 1 }, { unique: true });
visitedParkSchema.index({ user: 1, visitDate: -1 });
visitedParkSchema.index({ parkCode: 1 });
visitedParkSchema.index({ user: 1, createdAt: -1 });
visitedParkSchema.index({ visitDate: -1 });

module.exports = mongoose.model('VisitedPark', visitedParkSchema);
