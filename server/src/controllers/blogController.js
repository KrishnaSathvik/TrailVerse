const BlogPost = require('../models/BlogPost');
const User = require('../models/User');
const Subscriber = require('../models/Subscriber');
const emailService = require('../services/resendEmailService');
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
      query.tags = { $regex: new RegExp(`^${tag}$`, 'i') };
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
    const { title, excerpt, content, featuredImage, author, category, tags, status, featured, scheduledAt, seoSchema, readTime } = req.body;
    
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
      publishedAt: finalPublishedAt,
      seoSchema,
      readTime
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
    
    // Always apply field updates from req.body first
    Object.keys(req.body).forEach(key => {
      if (key !== 'scheduledAt' && key !== 'status') {
        post[key] = req.body[key];
      }
    });

    // Then handle status/scheduling logic
    if (scheduledAt && new Date(scheduledAt) > new Date()) {
      post.status = 'scheduled';
      post.scheduledAt = new Date(scheduledAt);
      post.publishedAt = null;
    } else if (status === 'published' && post.status !== 'published') {
      post.status = 'published';
      post.publishedAt = new Date();
      post.scheduledAt = null;
    } else if (status) {
      post.status = status;
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
    
    // Get all subscribed users (emailNotifications can be boolean true or object with blogNotifications: true)
    const users = await User.find({
      $or: [
        { emailNotifications: true },
        { 'emailNotifications.blogNotifications': true }
      ]
    }).select('email name firstName');
    
    console.log(`📧 Sending blog notification to ${users.length} subscribers`);
    
    if (users.length === 0) {
      console.log('⚠️ No subscribed users found');
      return;
    }
    
    // Collect all emails that will receive from registered users (to deduplicate)
    const sentEmails = new Set();

    // Send emails to all subscribed registered users
    let sentCount = 0;
    const emailPromises = users.map(async (user) => {
      try {
        sentEmails.add(user.email.toLowerCase());
        await emailService.sendBlogNotification(user, post);
        sentCount++;
      } catch (error) {
        console.error(`Failed to send blog notification to ${user.email}:`, error.message);
      }
    });

    await Promise.all(emailPromises);

    console.log(`✅ Blog notifications sent to ${sentCount} of ${users.length} registered users`);

    // Also notify confirmed newsletter subscribers (skip those already emailed as registered users)
    try {
      const subscribers = await Subscriber.find({ confirmed: true }).select('email firstName unsubscribeToken');
      const newSubscribers = subscribers.filter(s => !sentEmails.has(s.email.toLowerCase()));

      if (newSubscribers.length > 0) {
        console.log(`📧 Sending blog notification to ${newSubscribers.length} newsletter subscribers`);

        for (const sub of newSubscribers) {
          try {
            await emailService.sendBlogNotification(
              { email: sub.email, firstName: sub.firstName, name: sub.firstName },
              post
            );
          } catch (err) {
            console.error(`Failed to send blog notification to subscriber ${sub.email}:`, err.message);
          }
        }

        console.log(`✅ Blog notifications sent to ${newSubscribers.length} newsletter subscribers`);
      }
    } catch (subError) {
      console.error('Error sending to newsletter subscribers:', subError);
    }
  } catch (error) {
    console.error('Error sending blog notifications:', error);
  }
}

// Export for use by schedulerService
exports.sendBlogNotifications = sendBlogNotifications;

// @desc    Like/Unlike a blog post
// @route   POST /api/blogs/:id/like
// @access  Public (optional auth)
exports.toggleLike = async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }
    
    // For anonymous users, use IP address as identifier
    const identifier = req.user ? (req.user.id || req.user._id) : req.ip;
    const isLiked = post.likes.includes(identifier);
    
    if (isLiked) {
      // Unlike
      post.likes = post.likes.filter(like => like.toString() !== identifier);
    } else {
      // Like
      post.likes.push(identifier);
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
// @access  Public (optional auth)
exports.toggleFavorite = async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }
    
    // For anonymous users, use IP address as identifier
    const identifier = req.user ? (req.user.id || req.user._id) : req.ip;
    const isFavorited = post.favorites.includes(identifier);
    
    if (isFavorited) {
      // Unfavorite
      post.favorites = post.favorites.filter(fav => fav.toString() !== identifier);
    } else {
      // Favorite
      post.favorites.push(identifier);
    }
    
    await post.save();
    
    // Notify via WebSocket (only for authenticated users)
    if (req.user) {
      const wsService = req.app.get('wsService');
      if (wsService) {
        if (isFavorited) {
          wsService.sendToUserChannel(identifier, 'blogs', 'blog_unfavorited', { 
            blogId: post._id,
            isFavorited: false,
            favoritesCount: post.favorites.length
          });
        } else {
          wsService.sendToUserChannel(identifier, 'blogs', 'blog_favorited', { 
            blogId: post._id,
            isFavorited: true,
            favoritesCount: post.favorites.length
          });
        }
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
