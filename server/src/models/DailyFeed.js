const mongoose = require('mongoose');

const dailyFeedSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: String, // Format: "Wed Oct 22 2025"
    required: true,
    index: true
  },
  parkOfDay: {
    parkCode: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    image: {
      type: String,
      required: true
    },
    latitude: {
      type: String,
      required: true
    },
    longitude: {
      type: String,
      required: true
    },
    weather: {
      temp: Number,
      condition: String,
      icon: String
    },
    mustDo: [String],
    crowdLevel: String,
    bestTime: String
  },
  natureFact: {
    type: String,
    required: true
  },
  weatherData: {
    current: {
      temp: Number,
      temperature: Number,
      condition: String,
      humidity: Number,
      windSpeed: Number,
      visibility: Number
    },
    recommendation: String
  },
  weatherInsights: {
    type: String,
    required: true
  },
  astroData: {
    sunrise: String,
    sunset: String,
    moonPhase: String,
    milkyWayVisibility: String,
    auroraProbability: String,
    skyInsights: String
  },
  personalizedRecommendations: [String],
  // Metadata
  generatedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Expire at midnight next day
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow;
    },
    index: { expireAfterSeconds: 0 } // TTL index
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
dailyFeedSchema.index({ userId: 1, date: 1 }, { unique: true });

// Static method to find or create daily feed
dailyFeedSchema.statics.findOrCreateDailyFeed = async function(userId, date) {
  try {
    // Try to find existing feed and convert to plain object
    let dailyFeed = await this.findOne({ userId, date }).lean();
    
    if (dailyFeed) {
      console.log(`📦 Found existing daily feed in DB for user ${userId} on ${date}`);
      // Convert _id to string for consistency
      if (dailyFeed._id) {
        dailyFeed._id = dailyFeed._id.toString();
      }
      return dailyFeed;
    }
    
    console.log(`🔄 No existing daily feed found in DB for user ${userId} on ${date}`);
    return null;
  } catch (error) {
    console.error('Error finding daily feed in DB:', error);
    return null;
  }
};

// Static method to save daily feed
dailyFeedSchema.statics.saveDailyFeed = async function(userId, date, feedData) {
  try {
    console.log(`💾 Saving daily feed data:`, {
      userId,
      date,
      hasParkOfDay: !!feedData.parkOfDay,
      hasWeatherData: !!feedData.weatherData,
      hasAstroData: !!feedData.astroData,
      hasWeatherInsights: !!feedData.weatherInsights,
      hasNatureFact: !!feedData.natureFact,
      hasPersonalizedRecommendations: !!feedData.personalizedRecommendations
    });
    
    console.log(`💾 Feed data structure:`, {
      parkOfDay: feedData.parkOfDay ? Object.keys(feedData.parkOfDay) : 'null',
      weatherData: feedData.weatherData ? Object.keys(feedData.weatherData) : 'null',
      astroData: feedData.astroData ? Object.keys(feedData.astroData) : 'null'
    });
    
    const dailyFeed = new this({
      userId,
      date,
      ...feedData
    });
    
    const savedFeed = await dailyFeed.save();
    console.log(`💾 Saved daily feed to DB for user ${userId} on ${date}`);
    console.log(`💾 Saved feed structure:`, {
      hasParkOfDay: !!savedFeed.parkOfDay,
      hasWeatherData: !!savedFeed.weatherData,
      hasAstroData: !!savedFeed.astroData,
      hasWeatherInsights: !!savedFeed.weatherInsights,
      hasNatureFact: !!savedFeed.natureFact,
      hasPersonalizedRecommendations: !!savedFeed.personalizedRecommendations
    });
    return savedFeed;
  } catch (error) {
    console.error('Error saving daily feed to DB:', error);
    throw error;
  }
};

module.exports = mongoose.model('DailyFeed', dailyFeedSchema);
