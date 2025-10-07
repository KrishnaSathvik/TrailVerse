const Conversation = require('../models/Conversation');
const { protect } = require('../middleware/auth');

// @desc    Get all conversations for user
// @route   GET /api/conversations
// @access  Private
exports.getConversations = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, isActive = true } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    const query = { 
      userId: req.user.id,
      isActive: isActive === 'true'
    };

    if (category) {
      query.category = category;
    }

    const [conversations, total] = await Promise.all([
      Conversation.find(query)
        .select('-messages') // Exclude messages for list view
        .sort({ lastMessageAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      Conversation.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      count: conversations.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: conversations
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single conversation
// @route   GET /api/conversations/:id
// @access  Private
exports.getConversation = async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user.id
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

// @desc    Create new conversation
// @route   POST /api/conversations
// @access  Private
exports.createConversation = async (req, res, next) => {
  try {
    const { title, parkCode, parkName, category, tags, settings } = req.body;

    const conversation = await Conversation.create({
      userId: req.user.id,
      title: title || 'New Conversation',
      parkCode,
      parkName,
      category: category || 'general',
      tags: tags || [],
      settings: {
        provider: settings?.provider || 'claude',
        model: settings?.model || null,
        temperature: settings?.temperature || 0.4,
        maxTokens: settings?.maxTokens || 2000
      }
    });

    res.status(201).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update conversation
// @route   PUT /api/conversations/:id
// @access  Private
exports.updateConversation = async (req, res, next) => {
  try {
    const { title, tags, category, settings } = req.body;

    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    // Update fields
    if (title) conversation.title = title;
    if (tags) conversation.tags = tags;
    if (category) conversation.category = category;
    if (settings) {
      conversation.settings = { ...conversation.settings, ...settings };
    }

    await conversation.save();

    res.status(200).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add message to conversation
// @route   POST /api/conversations/:id/messages
// @access  Private
exports.addMessage = async (req, res, next) => {
  try {
    const { role, content, metadata } = req.body;

    if (!role || !content) {
      return res.status(400).json({
        success: false,
        error: 'Role and content are required'
      });
    }

    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    const message = {
      role,
      content,
      metadata: metadata || {},
      timestamp: new Date()
    };

    await conversation.addMessage(message);

    // Update title if it's the first user message
    if (role === 'user' && conversation.messages.length === 1) {
      await conversation.updateTitle();
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
// @route   DELETE /api/conversations/:id
// @access  Private
exports.deleteConversation = async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    await Conversation.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Conversation deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Archive conversation
// @route   PUT /api/conversations/:id/archive
// @access  Private
exports.archiveConversation = async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    await conversation.archive();

    res.status(200).json({
      success: true,
      message: 'Conversation archived successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Restore conversation
// @route   PUT /api/conversations/:id/restore
// @access  Private
exports.restoreConversation = async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    await conversation.restore();

    res.status(200).json({
      success: true,
      message: 'Conversation restored successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get conversation statistics
// @route   GET /api/conversations/stats
// @access  Private
exports.getConversationStats = async (req, res, next) => {
  try {
    const stats = await Conversation.aggregate([
      { $match: { userId: req.user._id || req.user.id } },
      {
        $group: {
          _id: null,
          totalConversations: { $sum: 1 },
          activeConversations: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          totalMessages: { $sum: { $size: '$messages' } },
          totalTokens: { $sum: '$totalTokens' },
          averageMessagesPerConversation: {
            $avg: { $size: '$messages' }
          }
        }
      }
    ]);

    const categoryStats = await Conversation.aggregate([
      { $match: { userId: req.user._id || req.user.id } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalMessages: { $sum: { $size: '$messages' } }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const recentActivity = await Conversation.find({
      userId: req.user._id || req.user.id
    })
      .sort({ lastMessageAt: -1 })
      .limit(5)
      .select('title lastMessageAt category')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        overview: stats[0] || {
          totalConversations: 0,
          activeConversations: 0,
          totalMessages: 0,
          totalTokens: 0,
          averageMessagesPerConversation: 0
        },
        categories: categoryStats,
        recentActivity
      }
    });
  } catch (error) {
    next(error);
  }
};
