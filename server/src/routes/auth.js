const express = require('express');
const router = express.Router();
const { signup, login, getMe, logout, forgotPassword, resetPassword, verifyEmail, resendVerification } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const AnonymousSession = require('../models/AnonymousSession');
const TripPlan = require('../models/TripPlan');
const { migrateGuestConversation } = require('../services/guestConversationMigration');
const { isValidGuestSessionId } = require('../utils/anonymousIdGenerator');

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
    const { anonymousId, conversationId } = req.body;
    const userId = req.user._id || req.user.id;

    if (!isValidGuestSessionId(anonymousId)) {
      return res.status(400).json({
        success: false,
        error: 'A valid guest session ID is required'
      });
    }

    const tripId = await migrateGuestConversation({
      AnonymousSession, TripPlan, anonymousId, conversationId, userId, keyTopics: extractKeyTopics,
    });

    res.status(200).json({
      success: true,
      data: {
        tripId,
        message: 'Conversation migrated successfully'
      }
    });

  } catch (error) {
    console.error('Error migrating anonymous conversation:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.status ? error.message : 'Failed to migrate conversation'
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
