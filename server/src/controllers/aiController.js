const mongoose = require('mongoose');
const TripPlan = require('../models/TripPlan');
const openaiService = require('../services/openaiService');

// Optional Claude service - only load if available
let claudeService = null;
try {
  claudeService = require('../services/claudeService');
} catch (error) {
  console.warn('Claude service not available:', error.message);
}

// @desc    Chat with AI
// @route   POST /api/ai/chat
// @access  Private
exports.chat = async (req, res, next) => {
  try {
    const { 
      message, 
      conversationId, 
      systemPrompt, 
      conversationHistory, 
      userContext,
      aiProvider = 'openai' // Default to OpenAI, can be 'claude' or 'openai'
    } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a message'
      });
    }

    // Get or create trip plan
    let tripPlan;
    if (conversationId) {
      // Validate ObjectId format for conversationId
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid conversation ID format'
        });
      }
      
      tripPlan = await TripPlan.findOne({
        _id: conversationId,
        userId: req.user._id || req.user.id // Handle both _id and id for compatibility
      });
      
      if (!tripPlan) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }
    } else {
      tripPlan = await TripPlan.create({
        userId: req.user._id || req.user.id, // Handle both _id and id for compatibility
        conversation: []
      });
    }

    // Add user message to conversation
    tripPlan.conversation.push({
      role: 'user',
      content: message
    });

    // Use provided conversation history or build from trip plan
    let messages;
    if (conversationHistory && conversationHistory.length > 0) {
      messages = conversationHistory;
    } else {
      messages = tripPlan.conversation.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    }

    // Get AI response with system prompt based on provider
    let aiResponse;
    if (aiProvider === 'claude' && claudeService) {
      aiResponse = await claudeService.chat(messages, systemPrompt);
    } else if (aiProvider === 'claude' && !claudeService) {
      return res.status(400).json({
        success: false,
        error: 'Claude service is not available. Please check your ANTHROPIC_API_KEY.'
      });
    } else {
      aiResponse = await openaiService.chat(messages, systemPrompt);
    }

    // Add AI response to conversation
    tripPlan.conversation.push({
      role: 'assistant',
      content: aiResponse
    });

    await tripPlan.save();

    res.status(200).json({
      success: true,
      data: {
        conversationId: tripPlan._id,
        message: aiResponse
      }
    });
  } catch (error) {
    console.error('Chat error:', error);
    next(error);
  }
};

// @desc    Get available AI providers
// @route   GET /api/ai/providers
// @access  Private
exports.getProviders = async (req, res, next) => {
  try {
    const providers = [
      {
        id: 'openai',
        name: 'OpenAI GPT-4',
        description: 'Advanced language model with excellent reasoning capabilities',
        model: 'gpt-4',
        available: !!process.env.OPENAI_API_KEY
      },
      {
        id: 'claude',
        name: 'Claude 3.5 Sonnet',
        description: 'Anthropic\'s most capable model with strong safety features',
        model: 'claude-3-5-sonnet-20241022',
        available: !!process.env.ANTHROPIC_API_KEY && !!claudeService
      }
    ];

    res.status(200).json({
      success: true,
      data: providers
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all conversations
// @route   GET /api/ai/conversations
// @access  Private
exports.getConversations = async (req, res, next) => {
  try {
    const conversations = await TripPlan.find({ userId: req.user._id || req.user.id })
      .sort({ updatedAt: -1 })
      .select('_id title createdAt updatedAt conversation');

    res.status(200).json({
      success: true,
      count: conversations.length,
      data: conversations
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single conversation
// @route   GET /api/ai/conversations/:id
// @access  Private
exports.getConversation = async (req, res, next) => {
  try {
    const conversation = await TripPlan.findOne({
      _id: req.params.id,
      userId: req.user._id || req.user.id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    res.status(200).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete conversation
// @route   DELETE /api/ai/conversations/:id
// @access  Private
exports.deleteConversation = async (req, res, next) => {
  try {
    const conversation = await TripPlan.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id || req.user.id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Conversation deleted'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update conversation title
// @route   PUT /api/ai/conversations/:id
// @access  Private
exports.updateConversation = async (req, res, next) => {
  try {
    const { title } = req.body;

    const conversation = await TripPlan.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id || req.user.id },
      { title },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    res.status(200).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    next(error);
  }
};
