const BlogPost = require('../models/BlogPost');
const { sendBlogNotifications } = require('./resendEmailService');

/**
 * Scheduler Service for Blog Posts
 * Handles automatic publishing of scheduled blog posts
 */

/**
 * Publish scheduled blog posts that are due
 * @returns {Promise<Object>} Result of the scheduling operation
 */
const publishScheduledPosts = async () => {
  try {
    const now = new Date();
    
    // Find posts that are scheduled and should be published now
    const scheduledPosts = await BlogPost.find({
      status: 'scheduled',
      scheduledAt: { $lte: now }
    });
    
    console.log(`📅 Scheduler: Found ${scheduledPosts.length} scheduled posts to publish`);
    
    if (scheduledPosts.length === 0) {
      return {
        success: true,
        message: 'No scheduled posts to publish',
        publishedCount: 0,
        publishedPosts: []
      };
    }
    
    const publishedPosts = [];
    
    for (const post of scheduledPosts) {
      try {
        // Update post status
        post.status = 'published';
        post.publishedAt = new Date();
        post.scheduledAt = null;
        await post.save();
        
        publishedPosts.push({
          id: post._id,
          title: post.title,
          publishedAt: post.publishedAt
        });
        
        // Send email notifications
        sendBlogNotifications(post).catch(err => 
          console.error(`Failed to send notifications for post ${post._id}:`, err)
        );
        
        console.log(`✅ Scheduler: Published scheduled post: ${post.title}`);
      } catch (error) {
        console.error(`❌ Scheduler: Failed to publish post ${post._id}:`, error);
      }
    }
    
    return {
      success: true,
      message: `Successfully published ${publishedPosts.length} scheduled posts`,
      publishedCount: publishedPosts.length,
      publishedPosts
    };
  } catch (error) {
    console.error('❌ Scheduler: Error in publishScheduledPosts:', error);
    return {
      success: false,
      message: 'Failed to publish scheduled posts',
      error: error.message,
      publishedCount: 0,
      publishedPosts: []
    };
  }
};

/**
 * Get scheduled posts information
 * @returns {Promise<Object>} Information about scheduled posts
 */
const getScheduledPostsInfo = async () => {
  try {
    const now = new Date();
    
    // Get all scheduled posts
    const scheduledPosts = await BlogPost.find({
      status: 'scheduled'
    }).select('title scheduledAt createdAt').sort({ scheduledAt: 1 });
    
    // Get posts due soon (next 24 hours)
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dueSoon = scheduledPosts.filter(post => 
      post.scheduledAt <= next24Hours && post.scheduledAt > now
    );
    
    // Get overdue posts
    const overdue = scheduledPosts.filter(post => post.scheduledAt <= now);
    
    return {
      success: true,
      data: {
        total: scheduledPosts.length,
        dueSoon: dueSoon.length,
        overdue: overdue.length,
        scheduledPosts: scheduledPosts.map(post => ({
          id: post._id,
          title: post.title,
          scheduledAt: post.scheduledAt,
          createdAt: post.createdAt
        }))
      }
    };
  } catch (error) {
    console.error('❌ Scheduler: Error getting scheduled posts info:', error);
    return {
      success: false,
      message: 'Failed to get scheduled posts information',
      error: error.message
    };
  }
};

/**
 * Start the scheduler (for manual setup or testing)
 * Runs every 5 minutes to check for scheduled posts
 */
const startScheduler = () => {
  console.log('🚀 Starting blog post scheduler...');
  
  // Run immediately
  publishScheduledPosts();
  
  // Then run every 5 minutes
  setInterval(() => {
    publishScheduledPosts();
  }, 5 * 60 * 1000); // 5 minutes
  
  console.log('✅ Blog post scheduler started (checking every 5 minutes)');
};

module.exports = {
  publishScheduledPosts,
  getScheduledPostsInfo,
  startScheduler
};
