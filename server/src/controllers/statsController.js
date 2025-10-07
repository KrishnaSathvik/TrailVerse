const User = require('../models/User');
const BlogPost = require('../models/BlogPost');
const TripPlan = require('../models/TripPlan');
const Review = require('../models/Review');
const Event = require('../models/Event');
const Testimonial = require('../models/Testimonial');
const Favorite = require('../models/Favorite');

// @desc    Get site statistics
// @route   GET /api/stats/site
// @access  Public
exports.getSiteStats = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalTrips,
      totalReviews,
      totalEvents,
      totalFavorites,
      featuredTestimonials
    ] = await Promise.all([
      User.countDocuments(),
      TripPlan.countDocuments({ status: 'active' }),
      Review.countDocuments(),
      Event.countDocuments({ status: 'upcoming' }),
      Favorite.countDocuments(),
      Testimonial.find({ approved: true, featured: true })
        .populate('user', 'name email avatar')
        .limit(5)
        .sort({ submittedAt: -1 })
    ]);

    res.status(200).json({
      success: true,
      data: {
        stats: {
          users: totalUsers,
          trips: totalTrips,
          reviews: totalReviews,
          events: totalEvents,
          favorites: totalFavorites,
          parks: 63 // NPS has 63 national parks
        },
        testimonials: featuredTestimonials
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get park statistics
// @route   GET /api/stats/parks
// @access  Public
exports.getParkStats = async (req, res, next) => {
  try {
    // Most visited parks (based on trips)
    const mostVisited = await TripPlan.aggregate([
      { $match: { status: 'active' } },
      { $group: { 
        _id: '$parkCode', 
        parkName: { $first: '$parkName' },
        count: { $sum: 1 } 
      }},
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Most favorited parks
    const mostFavorited = await Favorite.aggregate([
      { $group: { 
        _id: '$parkCode',
        parkName: { $first: '$parkName' },
        count: { $sum: 1 } 
      }},
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Highest rated parks (based on reviews)
    const highestRated = await Review.aggregate([
      { $group: { 
        _id: '$parkCode',
        avgRating: { $avg: '$rating' },
        count: { $sum: 1 }
      }},
      { $match: { count: { $gte: 3 } } }, // At least 3 reviews
      { $sort: { avgRating: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        mostVisited,
        mostFavorited,
        highestRated
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user statistics
// @route   GET /api/stats/users
// @access  Public
exports.getUserStats = async (req, res, next) => {
  try {
    // Recent user registrations (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [
      totalUsers,
      recentUsers,
      userGrowth
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      // Calculate growth compared to previous month
      User.aggregate([
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 2 }
      ])
    ]);

    // Calculate growth percentage
    let growthPercentage = 0;
    if (userGrowth.length === 2) {
      const currentMonth = userGrowth[0].count;
      const previousMonth = userGrowth[1].count;
      growthPercentage = previousMonth > 0 
        ? ((currentMonth - previousMonth) / previousMonth * 100)
        : 0;
    }

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        recentUsers,
        growthPercentage: Math.round(growthPercentage * 10) / 10
      }
    });
  } catch (error) {
    next(error);
  }
};
