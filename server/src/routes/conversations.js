const express = require('express');
const router = express.Router();
const {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  addMessage,
  archiveConversation,
  restoreConversation,
  getConversationStats
} = require('../controllers/conversationController');
const { protect } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Conversation management routes
router.get('/', getConversations);
router.get('/stats', getConversationStats);
router.get('/:id', getConversation);
router.post('/', createConversation);
router.put('/:id', updateConversation);
router.delete('/:id', deleteConversation);

// Message routes
router.post('/:id/messages', addMessage);

// Archive/restore routes
router.put('/:id/archive', archiveConversation);
router.put('/:id/restore', restoreConversation);

module.exports = router;
