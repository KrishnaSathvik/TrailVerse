const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a title'],
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Please provide a description'],
    trim: true
  },
  parkCode: {
    type: String,
    required: [true, 'Please provide a park code'],
    trim: true
  },
  parkName: {
    type: String,
    required: [true, 'Please provide park name'],
    trim: true
  },
  date: {
    type: Date,
    required: [true, 'Please provide event date']
  },
  time: {
    type: String,
    required: [true, 'Please provide event time'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Please provide event category'],
    enum: ['workshop', 'guided-tour', 'wildlife', 'photography', 'camping', 'ranger-program', 'volunteer', 'educational', 'special-event'],
    default: 'special-event'
  },
  imageUrl: {
    type: String,
    default: null
  },
  capacity: {
    type: Number,
    required: [true, 'Please provide event capacity'],
    min: [1, 'Capacity must be at least 1']
  },
  price: {
    type: String,
    required: [true, 'Please provide event price'],
    default: 'Free'
  },
  registrationUrl: {
    type: String,
    default: null
  },
  registrations: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    registeredAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  featured: {
    type: Boolean,
    default: false
  },
  organizer: {
    type: String,
    default: 'National Park Service'
  },
  contactEmail: {
    type: String,
    default: null
  },
  requirements: [{
    type: String
  }],
  equipment: [{
    type: String
  }],
  difficulty: {
    type: String,
    enum: ['easy', 'moderate', 'strenuous'],
    default: 'easy'
  },
  ageRestriction: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Add indexes
eventSchema.index({ parkCode: 1, date: 1 });
eventSchema.index({ date: 1, status: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ featured: 1, status: 1 });
eventSchema.index({ parkCode: 1, category: 1 });
eventSchema.index({ date: 1, category: 1 });
eventSchema.index({ capacity: 1 });

// Text index for search
eventSchema.index({ 
  title: 'text', 
  description: 'text',
  parkName: 'text'
});

// Virtual for registration count
eventSchema.virtual('registrationCount').get(function() {
  return this.registrations.length;
});

// Virtual for availability
eventSchema.virtual('isAvailable').get(function() {
  return this.registrations.length < this.capacity;
});

// Method to register user for event
eventSchema.methods.registerUser = function(userId) {
  // Check if user already registered
  const alreadyRegistered = this.registrations.some(reg => 
    reg.user.toString() === userId.toString()
  );
  
  if (alreadyRegistered) {
    throw new Error('User already registered for this event');
  }
  
  if (this.registrations.length >= this.capacity) {
    throw new Error('Event is at full capacity');
  }
  
  this.registrations.push({ user: userId });
  return this.save();
};

// Method to unregister user from event
eventSchema.methods.unregisterUser = function(userId) {
  this.registrations = this.registrations.filter(reg => 
    reg.user.toString() !== userId.toString()
  );
  return this.save();
};

// Method to check if user is registered
eventSchema.methods.isUserRegistered = function(userId) {
  return this.registrations.some(reg => 
    reg.user.toString() === userId.toString()
  );
};

module.exports = mongoose.model('Event', eventSchema);
