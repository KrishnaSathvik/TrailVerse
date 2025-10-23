const express = require('express');
const router = express.Router();
const { signup, login, getMe, logout, forgotPassword, resetPassword, verifyEmail, resendVerification } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const AnonymousSession = require('../models/AnonymousSession');
const TripPlan = require('../models/TripPlan');

router.post('/signup', signup);
router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.post('/forgot-password', forgotPassword);
router.post('/resend-verification', resendVerification);
router.put('/reset-password/:token', resetPassword);
router.get('/verify-email/:token', verifyEmail);

// Migrate anonymous conversation to user account
router.post('/migrate-chat', protect, async (req, res) => {
  try {
    const { anonymousId } = req.body;
    const userId = req.user._id || req.user.id;

    if (!anonymousId) {
      return res.status(400).json({
        success: false,
        error: 'Anonymous ID is required'
      });
    }

    // Find the anonymous session
    const anonymousSession = await AnonymousSession.findOne({ 
      anonymousId,
      isConverted: false 
    });

    if (!anonymousSession) {
      return res.status(404).json({
        success: false,
        error: 'Anonymous session not found or already converted'
      });
    }

    // Create new trip in user's account
    const newTrip = await TripPlan.create({
      userId: userId,
      parkName: anonymousSession.parkName,
      parkCode: anonymousSession.parkCode,
      title: anonymousSession.parkName ? `${anonymousSession.parkName} Trip Plan` : 'General Planning Session',
      formData: anonymousSession.formData,
      conversation: anonymousSession.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        provider: msg.provider,
        model: msg.model,
        responseTime: msg.responseTime
      })),
      status: 'active',
      summary: {
        totalMessages: anonymousSession.messages.length,
        userQuestions: anonymousSession.messages.filter(m => m.role === 'user').slice(0, 3).map(m => m.content),
        hasPlan: anonymousSession.messages.some(m => 
          m.role === 'assistant' && /(Day\s*\d+[:\-\s]|Itinerary|Schedule|Plan|## Day)/i.test(m.content)
        ),
        lastActivity: anonymousSession.lastActivity,
        keyTopics: extractKeyTopics(anonymousSession.messages)
      }
    });

    // Mark anonymous session as converted
    anonymousSession.isConverted = true;
    anonymousSession.convertedUserId = userId;
    anonymousSession.convertedAt = new Date();
    await anonymousSession.save();

    console.log(`✅ Migrated anonymous session ${anonymousId} to user ${userId}, created trip ${newTrip._id}`);

    res.status(200).json({
      success: true,
      data: {
        tripId: newTrip._id,
        message: 'Conversation migrated successfully'
      }
    });

  } catch (error) {
    console.error('Error migrating anonymous conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to migrate conversation'
    });
  }
});

// Helper function to extract key topics from messages
function extractKeyTopics(messages) {
  const topics = new Set();
  
  const userMessages = messages.filter(msg => msg.role === 'user');
  const userContent = userMessages.map(msg => msg.content).join(' ').toLowerCase();
  
  const allContent = userMessages.length > 0 ? userContent : messages.map(msg => msg.content).join(' ').toLowerCase();
  
  const topicKeywords = {
    'hiking': ['hiking', 'trails', 'hike', 'walking', 'trekking'],
    'photography': ['photo', 'photography', 'pictures', 'camera', 'photograph'],
    'wildlife': ['wildlife', 'animals', 'birds', 'wildlife viewing', 'animal watching'],
    'camping': ['camping', 'campsite', 'tent', 'camp', 'backpacking'],
    'lodging': ['hotel', 'lodge', 'accommodation', 'stay', 'accommodations'],
    'dining': ['food', 'restaurant', 'dining', 'eat', 'meal', 'cuisine'],
    'weather': ['weather', 'temperature', 'climate', 'season', 'forecast'],
    'transportation': ['transport', 'car', 'drive', 'travel', 'transportation'],
    'budget': ['budget', 'cost', 'price', 'expensive', 'cheap', 'affordable'],
    'safety': ['safety', 'dangerous', 'safe', 'precautions', 'security']
  };
  
  Object.entries(topicKeywords).forEach(([topic, keywords]) => {
    const keywordCount = keywords.filter(keyword => allContent.includes(keyword)).length;
    const threshold = ['farms', 'festivals', 'local', 'parks', 'cities'].includes(topic) ? 1 : 2;
    if (keywordCount >= threshold) {
      topics.add(topic);
    }
  });
  
  return Array.from(topics).slice(0, 5);
}

module.exports = router;
