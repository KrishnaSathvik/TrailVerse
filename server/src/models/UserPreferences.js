const mongoose = require('mongoose');

const userPreferencesSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // UI State & Preferences
  theme: {
    type: String,
    enum: ['light', 'dark', 'auto'],
    default: 'auto'
  },
  
  // Map State
  mapState: {
    lastSearchQuery: {
      type: String,
      default: ''
    },
    lastSelectedPlace: {
      name: String,
      lat: Number,
      lng: Number,
      placeId: String
    },
    lastMapCenter: {
      lat: Number,
      lng: Number
    },
    lastMapZoom: {
      type: Number,
      default: 10
    },
    lastMapType: {
      type: String,
      enum: ['roadmap', 'satellite', 'hybrid', 'terrain'],
      default: 'roadmap'
    }
  },
  
  // Navigation State
  navigation: {
    lastVisitedPage: {
      type: String,
      default: '/'
    },
    lastVisitedPark: {
      parkCode: String,
      parkName: String,
      visitedAt: Date
    },
    breadcrumbs: [{
      page: String,
      title: String,
      timestamp: Date
    }]
  },
  
  // App Preferences
  preferences: {
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      blogUpdates: {
        type: Boolean,
        default: true
      },
      parkUpdates: {
        type: Boolean,
        default: true
      }
    },
    display: {
      parksPerPage: {
        type: Number,
        default: 12
      },
      showVisitedParks: {
        type: Boolean,
        default: true
      },
      showFavoritesFirst: {
        type: Boolean,
        default: false
      },
      compactMode: {
        type: Boolean,
        default: false
      }
    },
    privacy: {
      showProfile: {
        type: Boolean,
        default: true
      },
      showVisitedParks: {
        type: Boolean,
        default: true
      },
      showReviews: {
        type: Boolean,
        default: true
      }
    }
  },
  
  // Device-specific data (for cross-device sync)
  devices: [{
    deviceId: String,
    deviceName: String,
    deviceType: {
      type: String,
      enum: ['mobile', 'tablet', 'desktop'],
      default: 'desktop'
    },
    lastActive: Date,
    userAgent: String,
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // Sync metadata
  lastSyncAt: {
    type: Date,
    default: Date.now
  },
  syncVersion: {
    type: Number,
    default: 1
  }
  
}, {
  timestamps: true
});

// Add indexes
// Note: user field already has unique index from schema definition
userPreferencesSchema.index({ lastSyncAt: -1 });
userPreferencesSchema.index({ 'devices.deviceId': 1 });

// Method to update map state
userPreferencesSchema.methods.updateMapState = function(mapState) {
  this.mapState = { ...this.mapState, ...mapState };
  this.lastSyncAt = new Date();
  return this.save();
};

// Method to update navigation state
userPreferencesSchema.methods.updateNavigation = function(navigation) {
  this.navigation = { ...this.navigation, ...navigation };
  this.lastSyncAt = new Date();
  return this.save();
};

// Method to update preferences
userPreferencesSchema.methods.updatePreferences = function(preferences) {
  this.preferences = { ...this.preferences, ...preferences };
  this.lastSyncAt = new Date();
  return this.save();
};

// Method to register device
userPreferencesSchema.methods.registerDevice = function(deviceInfo) {
  const existingDevice = this.devices.find(d => d.deviceId === deviceInfo.deviceId);
  
  if (existingDevice) {
    existingDevice.lastActive = new Date();
    existingDevice.isActive = true;
  } else {
    this.devices.push({
      ...deviceInfo,
      lastActive: new Date(),
      isActive: true
    });
  }
  
  this.lastSyncAt = new Date();
  return this.save();
};

// Method to get active devices
userPreferencesSchema.methods.getActiveDevices = function() {
  return this.devices.filter(d => d.isActive);
};

// Static method to get or create preferences
userPreferencesSchema.statics.getOrCreate = async function(userId) {
  let preferences = await this.findOne({ user: userId });
  
  if (!preferences) {
    preferences = new this({ user: userId });
    await preferences.save();
  }
  
  return preferences;
};

module.exports = mongoose.model('UserPreferences', userPreferencesSchema);
