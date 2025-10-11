const ParkReview = require('../models/ParkReview');
const { validationResult } = require('express-validator');

// @desc    Get park reviews
// @route   GET /api/parks/:parkCode/reviews
// @access  Public
exports.getParkReviews = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      sort = 'newest',
      rating,
      verified
    } = req.query;

    // Build query
    const query = { parkCode, status: 'approved' };
    
    if (rating) {
      query.rating = parseInt(rating);
    }
    
    if (verified === 'true') {
      query.verified = true;
    }

    // Build sort options
    let sortOptions = {};
    switch (sort) {
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      case 'oldest':
        sortOptions = { createdAt: 1 };
        break;
      case 'highest':
        sortOptions = { rating: -1, createdAt: -1 };
        break;
      case 'lowest':
        sortOptions = { rating: 1, createdAt: -1 };
        break;
      case 'helpful':
        sortOptions = { helpfulVotes: -1, createdAt: -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const [reviews, total] = await Promise.all([
      ParkReview.find(query)
        .populate('userId', 'name avatar')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .select('-__v'),
      ParkReview.countDocuments(query)
    ]);

    // Get park stats
    const stats = await ParkReview.getParkStats(parkCode);

    res.status(200).json({
      success: true,
      data: reviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalReviews: total,
        hasNext: skip + reviews.length < total,
        hasPrev: parseInt(page) > 1
      },
      stats
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get park review statistics
// @route   GET /api/parks/:parkCode/reviews/stats
// @access  Public
exports.getParkReviewStats = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    
    const stats = await ParkReview.getParkStats(parkCode);
    
    // Get recent reviews for context
    const recentReviews = await ParkReview.getRecentReviews(parkCode, 5);

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        recentReviews
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Create a park review
// @route   POST /api/parks/:parkCode/reviews
// @access  Private
exports.createParkReview = async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { parkCode } = req.params;
    const userId = req.user.id;

    // Check if user already reviewed this park
    const existingReview = await ParkReview.findOne({ parkCode, userId });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        error: 'You have already reviewed this park'
      });
    }

    // Create review
    const reviewData = {
      ...req.body,
      parkCode,
      userId,
      userName: req.user.name || req.user.firstName + ' ' + req.user.lastName
    };

    const review = await ParkReview.create(reviewData);

    // Populate user data for response
    await review.populate('userId', 'name avatar');

    res.status(201).json({
      success: true,
      data: review
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Update a park review
// @route   PUT /api/parks/:parkCode/reviews/:reviewId
// @access  Private
exports.updateParkReview = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;

    // Find review
    const review = await ParkReview.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        error: 'Review not found'
      });
    }

    // Check ownership or admin
    if (review.userId.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this review'
      });
    }

    // Update review
    const updatedReview = await ParkReview.findByIdAndUpdate(
      reviewId,
      req.body,
      { new: true, runValidators: true }
    ).populate('userId', 'name avatar');

    res.status(200).json({
      success: true,
      data: updatedReview
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Delete a park review
// @route   DELETE /api/parks/:parkCode/reviews/:reviewId
// @access  Private
exports.deleteParkReview = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;

    // Find review
    const review = await ParkReview.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        error: 'Review not found'
      });
    }

    // Check ownership or admin
    if (review.userId.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this review'
      });
    }

    await ParkReview.findByIdAndDelete(reviewId);

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Vote on a review (helpful/not helpful)
// @route   POST /api/reviews/:reviewId/vote
// @access  Private
exports.voteOnReview = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { isHelpful } = req.body;

    const review = await ParkReview.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        error: 'Review not found'
      });
    }

    // For now, just increment votes (in production, you'd want to track who voted)
    if (isHelpful) {
      review.helpfulVotes += 1;
    } else {
      review.notHelpfulVotes += 1;
    }

    await review.save();

    res.status(200).json({
      success: true,
      data: {
        helpfulVotes: review.helpfulVotes,
        notHelpfulVotes: review.notHelpfulVotes,
        helpfulScore: review.helpfulScore
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get top rated parks
// @route   GET /api/reviews/top-parks
// @access  Public
exports.getTopRatedParks = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    
    const topParks = await ParkReview.getTopRatedParks(parseInt(limit));

    res.status(200).json({
      success: true,
      data: topParks
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get user's reviews
// @route   GET /api/users/reviews
// @access  Private
exports.getUserReviews = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total] = await Promise.all([
      ParkReview.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-__v'),
      ParkReview.countDocuments({ userId })
    ]);

    res.status(200).json({
      success: true,
      data: reviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalReviews: total,
        hasNext: skip + reviews.length < total,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Respond to a review (admin/ranger only)
// @route   POST /api/reviews/:reviewId/respond
// @access  Private (Admin/Ranger)
exports.respondToReview = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { text } = req.body;
    const userId = req.user.id;

    // Check if user is admin or ranger
    if (!['admin', 'ranger'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to respond to reviews'
      });
    }

    const review = await ParkReview.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        error: 'Review not found'
      });
    }

    await review.addResponse(text, userId);
    await review.populate('userId', 'name avatar');

    res.status(200).json({
      success: true,
      data: review
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Moderate review (approve/reject)
// @route   PUT /api/reviews/:reviewId/moderate
// @access  Private (Admin only)
exports.moderateReview = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { status } = req.body;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to moderate reviews'
      });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be "approved" or "rejected"'
      });
    }

    const review = await ParkReview.findByIdAndUpdate(
      reviewId,
      { status },
      { new: true, runValidators: true }
    ).populate('userId', 'name avatar');

    if (!review) {
      return res.status(404).json({
        success: false,
        error: 'Review not found'
      });
    }

    res.status(200).json({
      success: true,
      data: review
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get all park ratings (for park cards/explore page)
// @route   GET /api/reviews/ratings
// @access  Public
exports.getAllParkRatings = async (req, res, next) => {
  try {
    // Get aggregated ratings for all parks
    const parkRatings = await ParkReview.aggregate([
      {
        $match: { status: 'approved' }
      },
      {
        $group: {
          _id: '$parkCode',
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          ratings: {
            $push: {
              rating: '$rating',
              createdAt: '$createdAt'
            }
          }
        }
      },
      {
        $project: {
          parkCode: '$_id',
          averageRating: { $round: ['$averageRating', 1] },
          totalReviews: 1,
          ratingDistribution: {
            $map: {
              input: [1, 2, 3, 4, 5],
              as: 'star',
              in: {
                star: '$$star',
                count: {
                  $size: {
                    $filter: {
                      input: '$ratings',
                      cond: { $eq: ['$$this.rating', '$$star'] }
                    }
                  }
                }
              }
            }
          },
          _id: 0
        }
      },
      {
        $sort: { averageRating: -1, totalReviews: -1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: parkRatings
    });

  } catch (error) {
    next(error);
  }
};