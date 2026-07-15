const Comment = require('../models/Comment');
const BlogPost = require('../models/BlogPost');

function userIdFromReq(req) {
  if (!req.user) return null;
  return req.user._id || req.user.id;
}

function nestComments(flatComments) {
  const byId = new Map();
  const roots = [];

  for (const comment of flatComments) {
    const plain = comment.toObject ? comment.toObject() : { ...comment };
    plain.replies = [];
    byId.set(String(plain._id), plain);
  }

  for (const comment of byId.values()) {
    const parentId = comment.parent ? String(comment.parent) : null;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).replies.push(comment);
    } else {
      roots.push(comment);
    }
  }

  // Newest roots first; replies oldest → newest (conversation order)
  roots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  for (const root of roots) {
    root.replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  return roots;
}

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
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 });

    const nested = nestComments(comments);

    res.status(200).json({
      success: true,
      count: comments.length,
      data: nested
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create comment (or reply when parent is set)
// @route   POST /api/blogs/:blogId/comments
// @access  Private
exports.createComment = async (req, res, next) => {
  try {
    const { blogId } = req.params;
    const { content, parent } = req.body;

    const blogPost = await BlogPost.findById(blogId);
    if (!blogPost) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }

    let parentId = null;
    if (parent) {
      const parentComment = await Comment.findById(parent);
      if (!parentComment || String(parentComment.blogPost) !== String(blogId)) {
        return res.status(400).json({
          success: false,
          error: 'Parent comment not found'
        });
      }
      // One level of nesting only
      if (parentComment.parent) {
        return res.status(400).json({
          success: false,
          error: 'Cannot reply to a reply'
        });
      }
      parentId = parentComment._id;
    }

    const uid = userIdFromReq(req);
    const userName = req.user.name || req.user.firstName || 'TrailVerse member';

    const comment = await Comment.create({
      blogPost: blogId,
      user: uid,
      userName,
      content,
      parent: parentId,
    });

    await comment.populate('user', 'name avatar');

    const payload = comment.toObject();
    payload.replies = [];

    res.status(201).json({
      success: true,
      data: payload
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete comment (and its replies)
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

    const uid = String(userIdFromReq(req));
    if (comment.user.toString() !== uid && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this comment'
      });
    }

    await Comment.deleteMany({
      $or: [{ _id: comment._id }, { parent: comment._id }],
    });

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
// @access  Private for identity (optionalAuth; guests cannot like ObjectId list)
exports.likeComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found'
      });
    }

    const uid = userIdFromReq(req);
    if (!uid) {
      return res.status(401).json({
        success: false,
        error: 'Sign in to like comments'
      });
    }

    const idStr = String(uid);
    const alreadyLiked = comment.likes.some((id) => String(id) === idStr);

    if (alreadyLiked) {
      comment.likes = comment.likes.filter((id) => String(id) !== idStr);
    } else {
      comment.likes.push(uid);
    }

    await comment.save();
    await comment.populate('user', 'name avatar');

    const payload = comment.toObject();
    // Preserve nested replies shape for clients that replace the whole node
    if (!payload.parent) {
      const replies = await Comment.find({ parent: comment._id, isApproved: true })
        .populate('user', 'name avatar')
        .sort({ createdAt: 1 });
      payload.replies = replies.map((r) => {
        const plain = r.toObject();
        plain.replies = [];
        return plain;
      });
    } else {
      payload.replies = [];
    }

    res.status(200).json({
      success: true,
      data: payload
    });
  } catch (error) {
    next(error);
  }
};
