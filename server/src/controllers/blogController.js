const BlogPost = require('../models/BlogPost');
const User = require('../models/User');
const emailService = require('../services/resendEmailService');
const unsubscribeService = require('../services/unsubscribeService');
const { getScheduledPostsInfo } = require('../services/schedulerService');
const { clearCache } = require('../middleware/cache');

// @desc    Get all blog posts with pagination
// @route   GET /api/blogs
// @access  Public
exports.getAllPosts = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      tag,
      search,
      status = 'published',
      featured,
      sortBy = 'publishedAt'
    } = req.query;

    const skip = (page - 1) * limit;

    // Build query
    const query = { status };

    if (category) {
      query.category = category;
    }

    if (tag) {
      query.tags = tag;
    }

    if (search) {
      query.$text = { $search: search };
    }

    if (featured) {
      query.featured = featured === 'true';
    }

    // Build sort object
    let sort = {};
    if (sortBy === 'views') {
      sort = { views: -1 };
    } else if (sortBy === 'publishedAt') {
      sort = { publishedAt: -1 };
    } else {
      sort = { publishedAt: -1 };
    }

    // Execute query with pagination
    const [posts, total] = await Promise.all([
      BlogPost.find(query)
        .select('-content') // Exclude heavy content field
        .sort(sort)
        .limit(parseInt(limit))
        .skip(skip)
        .lean(), // Convert to plain JS objects (faster)
      BlogPost.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      count: posts.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: posts
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single blog post by slug
// @route   GET /api/blogs/:slug
// @access  Public
exports.getPostBySlug = async (req, res, next) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug });
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }
    
    // Increment views
    post.views += 1;
    await post.save();
    
    res.status(200).json({
      success: true,
      data: post
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Get single blog post by ID (for admin editing)
// @route   GET /api/blogs/id/:id
// @access  Private/Admin
exports.getPostById = async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: post
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create blog post
// @route   POST /api/blogs
// @access  Private/Admin
exports.createPost = async (req, res, next) => {
  try {
    const { title, excerpt, content, featuredImage, author, category, tags, status, featured, scheduledAt } = req.body;
    
    console.log('📝 Creating blog post with data:', {
      title,
      excerpt,
      content: content ? `${content.substring(0, 100)}...` : 'No content',
      contentLength: content ? content.length : 0,
      featuredImage,
      author,
      category,
      tags,
      status,
      featured,
      scheduledAt
    });
    
    // Log request size
    const requestSize = JSON.stringify(req.body).length;
    console.log(`📊 Request size: ${requestSize} bytes (${(requestSize / 1024).toFixed(2)} KB)`);
    
    // Handle scheduling logic
    let finalStatus = status;
    let finalScheduledAt = null;
    let finalPublishedAt = null;

    if (scheduledAt && new Date(scheduledAt) > new Date()) {
      // If scheduled for future, set status to scheduled
      finalStatus = 'scheduled';
      finalScheduledAt = new Date(scheduledAt);
    } else if (status === 'published') {
      // If publishing now, set publishedAt
      finalPublishedAt = new Date();
    }

    const post = await BlogPost.create({
      title,
      excerpt,
      content,
      featuredImage,
      author,
      category,
      tags,
      status: finalStatus,
      featured,
      scheduledAt: finalScheduledAt,
      publishedAt: finalPublishedAt
    });
    
    console.log('✅ Blog post created successfully:', post._id);
    
    // Clear server cache for blog posts
    clearCache('blogs');
    
    // Send email notifications if published
    if (status === 'published') {
      sendBlogNotifications(post).catch(err => 
        console.error('Failed to send blog notifications:', err)
      );
    }
    
    res.status(201).json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error('❌ Error creating blog post:', error);
    next(error);
  }
};

// @desc    Update blog post
// @route   PUT /api/blogs/:id
// @access  Private/Admin
exports.updatePost = async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }
    
    const wasPublished = post.status === 'published';
    
    console.log('📝 Updating blog post with data:', {
      postId: req.params.id,
      requestBody: req.body,
      featured: req.body.featured
    });
    
    // Handle scheduling logic for updates
    const { scheduledAt, status } = req.body;
    
    if (scheduledAt && new Date(scheduledAt) > new Date()) {
      // If scheduled for future, set status to scheduled
      post.status = 'scheduled';
      post.scheduledAt = new Date(scheduledAt);
      post.publishedAt = null;
    } else if (status === 'published' && post.status !== 'published') {
      // If publishing now and wasn't published before
      post.status = 'published';
      post.publishedAt = new Date();
      post.scheduledAt = null;
    } else {
      // Update other fields normally
      Object.keys(req.body).forEach(key => {
        if (key !== 'scheduledAt') {
          post[key] = req.body[key];
        }
      });
    }
    
    await post.save();
    
    // Clear server cache for blog posts
    clearCache('blogs');
    
    // Send notifications if newly published
    if (!wasPublished && post.status === 'published') {
      sendBlogNotifications(post).catch(err => 
        console.error('Failed to send blog notifications:', err)
      );
    }
    
    res.status(200).json({
      success: true,
      data: post
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete blog post
// @route   DELETE /api/blogs/:id
// @access  Private/Admin
exports.deletePost = async (req, res, next) => {
  try {
    const post = await BlogPost.findByIdAndDelete(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }
    
    // Clear server cache for blog posts
    clearCache('blogs');
    
    res.status(200).json({
      success: true,
      message: 'Blog post deleted'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get blog categories
// @route   GET /api/blogs/categories
// @access  Public
exports.getBlogCategories = async (req, res, next) => {
  try {
    const [categories, totalCount] = await Promise.all([
      BlogPost.aggregate([
        { $match: { status: 'published' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      BlogPost.countDocuments({ status: 'published' })
    ]);
    
    res.status(200).json({
      success: true,
      data: categories,
      totalCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Publish scheduled posts
// @route   POST /api/blogs/publish-scheduled
// @access  Private/Admin
exports.publishScheduledPosts = async (req, res, next) => {
  try {
    const now = new Date();
    
    // Find posts that are scheduled and should be published now
    const scheduledPosts = await BlogPost.find({
      status: 'scheduled',
      scheduledAt: { $lte: now }
    });
    
    console.log(`📅 Found ${scheduledPosts.length} scheduled posts to publish`);
    
    const publishedPosts = [];
    
    for (const post of scheduledPosts) {
      post.status = 'published';
      post.publishedAt = new Date();
      post.scheduledAt = null;
      await post.save();
      
      publishedPosts.push(post);
      
      // Send email notifications
      sendBlogNotifications(post).catch(err => 
        console.error(`Failed to send notifications for post ${post._id}:`, err)
      );
      
      console.log(`✅ Published scheduled post: ${post.title}`);
    }
    
    res.status(200).json({
      success: true,
      message: `Published ${publishedPosts.length} scheduled posts`,
      data: publishedPosts
    });
  } catch (error) {
    console.error('❌ Error publishing scheduled posts:', error);
    next(error);
  }
};

// @desc    Get scheduled posts information
// @route   GET /api/blogs/scheduled
// @access  Private/Admin
exports.getScheduledPosts = async (req, res, next) => {
  try {
    const result = await getScheduledPostsInfo();
    
    if (result.success) {
      res.status(200).json({
        success: true,
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    console.error('❌ Error getting scheduled posts:', error);
    next(error);
  }
};

// @desc    Get blog tags
// @route   GET /api/blogs/tags
// @access  Public
exports.getBlogTags = async (req, res, next) => {
  try {
    const tags = await BlogPost.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);
    
    res.status(200).json({
      success: true,
      data: tags
    });
  } catch (error) {
    next(error);
  }
};

// Helper function to send blog notifications
async function sendBlogNotifications(post) {
  try {
    // Check if Resend is properly configured
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY not found in environment variables');
      return;
    }
    
    if (!process.env.EMAIL_FROM_ADDRESS) {
      console.error('❌ EMAIL_FROM_ADDRESS not found in environment variables');
      return;
    }
    
    // Get all subscribed users
    const users = await User.find({
      emailNotifications: true
    }).select('email name firstName');
    
    console.log(`📧 Sending blog notification to ${users.length} subscribers`);
    
    if (users.length === 0) {
      console.log('⚠️ No subscribed users found');
      return;
    }
    
    // Send emails using Resend service
    const emailPromises = users.map(async (user) => {
      // Check if user should receive this email type
      const shouldReceive = await unsubscribeService.shouldReceiveEmail(user.email, 'blog_notification');
      if (shouldReceive) {
        try {
          return await emailService.sendBlogNotification(user, post);
        } catch (error) {
          console.error(`Failed to send blog notification to ${user.email}:`, error.message);
          return null;
        }
      }
      return null;
    });
    
    // Filter out null promises and wait for all
    const validPromises = emailPromises.filter(promise => promise !== null);
    await Promise.all(validPromises);
    
    console.log(`✅ Blog notifications sent successfully to ${validPromises.length} subscribers`);
  } catch (error) {
    console.error('Error sending blog notifications:', error);
  }
}

// @desc    Like/Unlike a blog post
// @route   POST /api/blogs/:id/like
// @access  Private
exports.toggleLike = async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }
    
    const userId = req.user.id || req.user._id;
    const isLiked = post.likes.includes(userId);
    
    if (isLiked) {
      // Unlike
      post.likes = post.likes.filter(like => like.toString() !== userId);
    } else {
      // Like
      post.likes.push(userId);
    }
    
    await post.save();
    
    res.status(200).json({
      success: true,
      data: {
        isLiked: !isLiked,
        likesCount: post.likes.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Favorite/Unfavorite a blog post
// @route   POST /api/blogs/:id/favorite
// @access  Private
exports.toggleFavorite = async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }
    
    const userId = req.user.id || req.user._id;
    const isFavorited = post.favorites.includes(userId);
    
    if (isFavorited) {
      // Unfavorite
      post.favorites = post.favorites.filter(fav => fav.toString() !== userId);
    } else {
      // Favorite
      post.favorites.push(userId);
    }
    
    await post.save();
    
    // Notify via WebSocket
    const wsService = req.app.get('wsService');
    if (wsService) {
      if (isFavorited) {
        wsService.sendToUserChannel(userId, 'blogs', 'blog_unfavorited', { 
          blogId: post._id,
          isFavorited: false,
          favoritesCount: post.favorites.length
        });
      } else {
        wsService.sendToUserChannel(userId, 'blogs', 'blog_favorited', { 
          blogId: post._id,
          isFavorited: true,
          favoritesCount: post.favorites.length
        });
      }
    }
    
    res.status(200).json({
      success: true,
      data: {
        isFavorited: !isFavorited,
        favoritesCount: post.favorites.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's favorited blog posts
// @route   GET /api/blogs/favorites
// @access  Private
exports.getFavoritedPosts = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    const posts = await BlogPost.find({ 
      favorites: userId,
      status: 'published'
    })
    .select('-content')
    .sort({ updatedAt: -1 })
    .limit(parseInt(limit))
    .skip(skip)
    .lean();
    
    const total = await BlogPost.countDocuments({ 
      favorites: userId,
      status: 'published'
    });
    
    res.status(200).json({
      success: true,
      count: posts.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: posts
    });
  } catch (error) {
    next(error);
  }
};
