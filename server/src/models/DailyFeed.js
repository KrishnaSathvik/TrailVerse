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
  isShared: {
    type: Boolean,
    default: false,
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
    moonIllumination: Number,
    moonAge: Number,
    nextNewMoon: Date,
    nextFullMoon: Date,
    milkyWayVisibility: String,
    auroraProbability: String,
    skyInsights: String,
    dayLength: Number,
    isPolarDay: Boolean,
    isPolarNight: Boolean,
    sunDeclination: Number,
    sunRightAscension: Number
  },
  personalizedRecommendations: [String],
  // NEW AI-Powered Fields
  quickStatsInsights: [String],
  skyDataInsights: [String],
  parkInfoInsights: [String],
  stargazingGuide: String,
  // Raw API data (for reference)
  rawWeatherData: {
    type: mongoose.Schema.Types.Mixed,
    required: false
  },
  rawAstroData: {
    type: mongoose.Schema.Types.Mixed,
    required: false
  },
  // Metadata
  generatedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Expire after 24 hours from creation
      const expiration = new Date();
      expiration.setTime(expiration.getTime() + (24 * 60 * 60 * 1000)); // 24 hours from now
      return expiration;
    },
    index: { expireAfterSeconds: 0 } // TTL index - documents expire at expiresAt time
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
dailyFeedSchema.index({ userId: 1, date: 1 }, { unique: true });
// Unique index for shared daily feeds (one per day)
dailyFeedSchema.index({ date: 1, isShared: 1 }, { unique: true, partialFilterExpression: { isShared: true } });

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
    console.log(`💾 Saving 100% AI-powered daily feed data:`, {
      userId,
      date,
      hasParkOfDay: !!feedData.parkOfDay,
      hasNatureFact: !!feedData.natureFact,
      hasWeatherInsights: !!feedData.weatherInsights,
      hasQuickStatsInsights: !!feedData.quickStatsInsights,
      hasSkyDataInsights: !!feedData.skyDataInsights,
      hasParkInfoInsights: !!feedData.parkInfoInsights,
      hasPersonalizedRecommendations: !!feedData.personalizedRecommendations,
      hasStargazingGuide: !!feedData.stargazingGuide,
      hasRawWeatherData: !!feedData.rawWeatherData,
      hasRawAstroData: !!feedData.rawAstroData
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
    console.log(`💾 Saved 100% AI-powered feed structure:`, {
      hasParkOfDay: !!savedFeed.parkOfDay,
      hasNatureFact: !!savedFeed.natureFact,
      hasWeatherInsights: !!savedFeed.weatherInsights,
      hasQuickStatsInsights: !!savedFeed.quickStatsInsights,
      hasSkyDataInsights: !!savedFeed.skyDataInsights,
      hasParkInfoInsights: !!savedFeed.parkInfoInsights,
      hasPersonalizedRecommendations: !!savedFeed.personalizedRecommendations,
      hasStargazingGuide: !!savedFeed.stargazingGuide,
      hasRawWeatherData: !!savedFeed.rawWeatherData,
      hasRawAstroData: !!savedFeed.rawAstroData
    });
    return savedFeed;
  } catch (error) {
    console.error('Error saving daily feed to DB:', error);
    throw error;
  }
};

module.exports = mongoose.model('DailyFeed', dailyFeedSchema);
