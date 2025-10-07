const User = require('../models/User');
const TripPlan = require('../models/TripPlan');
const Review = require('../models/Review');

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, location, website, bio, avatar } = req.body;
    
    console.log('Backend: Received profile update request:', { firstName, lastName, email, phone, location, website, bio, avatar });
    
    const user = await User.findById(req.user.id);
    
    // Update basic fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    
    // Update additional profile fields
    if (phone !== undefined) user.phone = phone;
    if (location !== undefined) user.location = location;
    if (website !== undefined) user.website = website;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;
    
    // Update the combined name field for backward compatibility
    if (firstName || lastName) {
      user.name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    }
    
    await user.save();
    
    console.log('Backend: Profile updated successfully:', { 
      id: user._id, 
      firstName: user.firstName, 
      lastName: user.lastName, 
      avatar: user.avatar,
      fullUser: user
    });
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Save a park
// @route   POST /api/users/saved-parks
// @access  Private
exports.savePark = async (req, res, next) => {
  try {
    const { parkCode, parkName } = req.body;
    
    if (!parkCode || !parkName) {
      return res.status(400).json({
        success: false,
        error: 'Please provide parkCode and parkName'
      });
    }
    
    // For development, create user if doesn't exist
    let user = await User.findById(req.user.id);
    if (!user) {
      user = new User({
        _id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        password: 'development123',
        savedParks: []
      });
      await user.save();
    }
    
    await user.savePark(parkCode, parkName);
    
    res.status(200).json({
      success: true,
      data: user.savedParks
    });
  } catch (error) {
    console.error('Error saving park:', error);
    next(error);
  }
};

// @desc    Remove a saved park
// @route   DELETE /api/users/saved-parks/:parkCode
// @access  Private
exports.removeSavedPark = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    
    if (!parkCode) {
      return res.status(400).json({
        success: false,
        error: 'Park code is required'
      });
    }
    
    // For development, create user if doesn't exist
    let user = await User.findById(req.user.id);
    if (!user) {
      user = new User({
        _id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        password: 'development123',
        savedParks: []
      });
      await user.save();
    }
    
    await user.removeSavedPark(parkCode);
    
    res.status(200).json({
      success: true,
      data: user.savedParks
    });
  } catch (error) {
    console.error('Error removing saved park:', error);
    next(error);
  }
};

// @desc    Get saved parks
// @route   GET /api/users/saved-parks
// @access  Private
exports.getSavedParks = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.status(200).json({
      success: true,
      data: user.savedParks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Check if park is saved
// @route   GET /api/users/saved-parks/:parkCode/check
// @access  Private
exports.checkParkSaved = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    
    if (!parkCode) {
      return res.status(400).json({
        success: false,
        error: 'Park code is required'
      });
    }
    
    // For development, create user if doesn't exist
    let user = await User.findById(req.user.id);
    if (!user) {
      user = new User({
        _id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        password: 'development123', // Will be hashed by pre-save middleware
        savedParks: []
      });
      await user.save();
    }
    
    const isSaved = user.isParkSaved(parkCode);
    
    res.status(200).json({
      success: true,
      data: { isSaved }
    });
  } catch (error) {
    console.error('Error checking park saved status:', error);
    next(error);
  }
};

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private
exports.getUserStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get user with saved parks
    const userWithParks = await User.findById(userId).select('savedParks');
    
    // Get user's trips
    const trips = await TripPlan.find({ userId });
    
    // Get user's favorites from Favorite model
    const Favorite = require('../models/Favorite');
    const favorites = await Favorite.find({ user: userId });
    
    // Get user's visited parks from VisitedPark model
    const VisitedPark = require('../models/VisitedPark');
    const visitedParks = await VisitedPark.find({ user: userId });
    
    // Get user's reviews (unique parks reviewed)
    const reviews = await Review.find({ user: userId }).select('park.parkCode');
    const reviewedParkCodes = [...new Set(reviews.map(review => review.park.parkCode))];
    
    // Calculate stats
    // Parks Visited: Count from VisitedPark model (new system)
    const parksVisited = visitedParks.length;
    
    const tripsPlanned = trips.length;
    const favoritesCount = favorites.length;
    
    // Calculate total days from trips (planned days)
    const plannedDays = trips.reduce((total, trip) => {
      if (trip.formData.startDate && trip.formData.endDate) {
        const start = new Date(trip.formData.startDate);
        const end = new Date(trip.formData.endDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return total + diffDays;
      }
      return total;
    }, 0);
    
    // Calculate actual visited days from VisitedPark model
    const actualVisitedDays = visitedParks.reduce((total, visitedPark) => {
      if (visitedPark.visitDate) {
        // For now, count each visited park as 1 day
        // In the future, we could add a visitDuration field to track actual days spent
        return total + 1;
      }
      return total;
    }, 0);
    
    // Calculate days since account creation
    const userAccount = await User.findById(userId).select('createdAt');
    const accountCreatedAt = userAccount?.createdAt || new Date();
    const daysSinceAccountCreation = Math.ceil((Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24));
    
    // Use actual visited days if available, otherwise use planned days, 
    // and if no trips/visits, show days since account creation
    const totalDays = actualVisitedDays > 0 ? actualVisitedDays : 
                     plannedDays > 0 ? plannedDays : 
                     daysSinceAccountCreation;
    
    // Debug logging
    console.log('getUserStats - Calculated stats:', {
      userId,
      parksVisited,
      tripsPlanned,
      favoritesCount,
      plannedDays,
      actualVisitedDays,
      daysSinceAccountCreation,
      totalDays,
      visitedParksCount: visitedParks.length,
      allFavoritesCount: favorites.length
    });
    
    res.status(200).json({
      success: true,
      data: {
        parksVisited,
        tripsPlanned,
        favorites: favoritesCount,
        totalDays,
        reviewedParks: reviewedParkCodes.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark a park as visited
// @route   POST /api/users/saved-parks/visited
// @access  Private
exports.markParkVisited = async (req, res, next) => {
  try {
    const { parkCode, visitDate } = req.body;
    
    if (!parkCode) {
      return res.status(400).json({
        success: false,
        error: 'Park code is required'
      });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    await user.markParkVisited(parkCode, visitDate);
    
    res.status(200).json({
      success: true,
      data: user.savedParks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark a park as visited (separate from favorites)
// @route   POST /api/users/visited-parks/:parkCode
// @access  Private
exports.markParkAsVisited = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    const { visitDate, rating, parkName, imageUrl, notes } = req.body;
    
    if (!parkCode) {
      return res.status(400).json({
        success: false,
        error: 'Park code is required'
      });
    }
    
    const VisitedPark = require('../models/VisitedPark');
    
    // Check if already visited
    let visitedPark = await VisitedPark.findOne({ 
      user: req.user.id, 
      parkCode: parkCode 
    });
    
    if (visitedPark) {
      return res.status(400).json({
        success: false,
        error: 'Park is already marked as visited'
      });
    }
    
    // Create new visited park entry
    visitedPark = await VisitedPark.create({
      user: req.user.id,
      parkCode: parkCode,
      parkName: parkName || `Park ${parkCode}`,
      imageUrl: imageUrl || '',
      visitDate: visitDate ? new Date(visitDate) : new Date(),
      rating: rating || null,
      notes: notes || ''
    });
    
    res.status(201).json({
      success: true,
      data: visitedPark
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's visited parks
// @route   GET /api/users/visited-parks
// @access  Private
exports.getVisitedParks = async (req, res, next) => {
  try {
    const VisitedPark = require('../models/VisitedPark');
    
    const visitedParks = await VisitedPark.find({ user: req.user.id })
      .sort({ visitDate: -1 });
    
    res.status(200).json({
      success: true,
      data: visitedParks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Check if a park is visited
// @route   GET /api/users/visited-parks/:parkCode
// @access  Private
exports.checkParkVisited = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    
    if (!parkCode) {
      return res.status(400).json({
        success: false,
        error: 'Park code is required'
      });
    }
    
    const VisitedPark = require('../models/VisitedPark');
    
    const visitedPark = await VisitedPark.findOne({ 
      user: req.user.id, 
      parkCode: parkCode 
    });
    
    res.status(200).json({
      success: true,
      data: {
        isVisited: !!visitedPark,
        visitedPark: visitedPark
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove a park from visited list
// @route   DELETE /api/users/visited-parks/:parkCode
// @access  Private
exports.removeVisitedPark = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    
    if (!parkCode) {
      return res.status(400).json({
        success: false,
        error: 'Park code is required'
      });
    }
    
    const VisitedPark = require('../models/VisitedPark');
    
    const visitedPark = await VisitedPark.findOneAndDelete({ 
      user: req.user.id, 
      parkCode: parkCode 
    });
    
    if (!visitedPark) {
      return res.status(404).json({
        success: false,
        error: 'Visited park not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: { message: 'Park removed from visited list' }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update visited park details
// @route   PUT /api/users/visited-parks/:parkCode
// @access  Private
exports.updateVisitedPark = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    const { visitDate, rating, notes } = req.body;
    
    if (!parkCode) {
      return res.status(400).json({
        success: false,
        error: 'Park code is required'
      });
    }
    
    const VisitedPark = require('../models/VisitedPark');
    
    const visitedPark = await VisitedPark.findOne({ 
      user: req.user.id, 
      parkCode: parkCode 
    });
    
    if (!visitedPark) {
      return res.status(404).json({
        success: false,
        error: 'Visited park not found'
      });
    }
    
    // Update fields if provided
    if (visitDate) visitedPark.visitDate = new Date(visitDate);
    if (rating !== undefined) visitedPark.rating = rating;
    if (notes !== undefined) visitedPark.notes = notes;
    
    await visitedPark.save();
    
    res.status(200).json({
      success: true,
      data: visitedPark
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark a park as visited (using Favorite model) - DEPRECATED
// @route   POST /api/users/favorites/:parkCode/visited
// @access  Private
exports.markFavoriteAsVisited = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    const { visitDate, rating, parkName } = req.body;
    
    if (!parkCode) {
      return res.status(400).json({
        success: false,
        error: 'Park code is required'
      });
    }
    
    const Favorite = require('../models/Favorite');
    
    // Find or create the favorite park entry
    let favorite = await Favorite.findOne({ 
      user: req.user.id, 
      parkCode: parkCode 
    });
    
    if (!favorite) {
      // Create a new favorite entry for visited parks
      favorite = await Favorite.create({
        user: req.user.id,
        parkCode: parkCode,
        parkName: parkName || `Park ${parkCode}`,
        visitStatus: 'visited',
        visitDate: visitDate ? new Date(visitDate) : new Date(),
        rating: rating || null
      });
    } else {
      // Update existing favorite
      favorite.visitStatus = 'visited';
      if (visitDate) {
        favorite.visitDate = new Date(visitDate);
      } else {
        favorite.visitDate = new Date();
      }
      if (rating) {
        favorite.rating = rating;
      }
      
      await favorite.save();
    }
    
    res.status(200).json({
      success: true,
      data: favorite
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Check if a park is visited
// @route   GET /api/users/favorites/:parkCode/visited
// @access  Private
exports.checkParkVisited = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    
    if (!parkCode) {
      return res.status(400).json({
        success: false,
        error: 'Park code is required'
      });
    }
    
    const Favorite = require('../models/Favorite');
    
    // Find the favorite park
    const favorite = await Favorite.findOne({ 
      user: req.user.id, 
      parkCode: parkCode 
    });
    
    if (!favorite) {
      return res.status(200).json({
        success: true,
        data: { isVisited: false, isFavorited: false }
      });
    }
    
    res.status(200).json({
      success: true,
      data: { 
        isVisited: favorite.visitStatus === 'visited',
        isFavorited: true,
        visitDate: favorite.visitDate,
        rating: favorite.rating
      }
    });
  } catch (error) {
    next(error);
  }
};
