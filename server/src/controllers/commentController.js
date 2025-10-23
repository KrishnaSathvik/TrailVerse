const Comment = require('../models/Comment');
const BlogPost = require('../models/BlogPost');

// @desc    Get comments for a blog post
// @route   GET /api/blogs/:blogId/comments
// @access  Public
exports.getComments = async (req, res, next) => {
  try {
    const { blogId } = req.params;
    
    const comments = await Comment.find({ 
      blogPost: blogId,
      isApproved: true
    })
      .populate('user', 'name')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: comments.length,
      data: comments
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create comment
// @route   POST /api/blogs/:blogId/comments
// @access  Public (optional auth)
exports.createComment = async (req, res, next) => {
  try {
    const { blogId } = req.params;
    const { content } = req.body;
    
    // Check if blog post exists
    const blogPost = await BlogPost.findById(blogId);
    if (!blogPost) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }
    
    // For anonymous users, use IP address and generate a name
    const userName = req.user ? req.user.name : `Anonymous User ${req.ip.slice(-4)}`;
    const userId = req.user ? req.user.id : req.ip;
    
    const comment = await Comment.create({
      blogPost: blogId,
      user: userId,
      userName: userName,
      content
    });
    
    await comment.populate('user', 'name');
    
    res.status(201).json({
      success: true,
      data: comment
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete comment
// @route   DELETE /api/comments/:id
// @access  Private
exports.deleteComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found'
      });
    }
    
    // Check if user owns comment or is admin
    if (comment.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this comment'
      });
    }
    
    await comment.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Comment deleted'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Like comment
// @route   PUT /api/comments/:id/like
// @access  Public (optional auth)
exports.likeComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found'
      });
    }
    
    // For anonymous users, use IP address as identifier
    const identifier = req.user ? req.user.id : req.ip;
    const alreadyLiked = comment.likes.includes(identifier);
    
    if (alreadyLiked) {
      // Unlike
      comment.likes = comment.likes.filter(id => id.toString() !== identifier);
    } else {
      // Like
      comment.likes.push(identifier);
    }
    
    await comment.save();
    
    res.status(200).json({
      success: true,
      data: comment
    });
  } catch (error) {
    next(error);
  }
};
