const Favorite = require('../models/Favorite');

// @desc    Get user's favorites
// @route   GET /api/favorites/user/:userId
// @access  Private
exports.getUserFavorites = async (req, res, next) => {
  try {
    // Users can only view their own favorites
    if (req.user.id !== req.params.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const favorites = await Favorite.find({ user: req.params.userId })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: favorites.length,
      data: favorites
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add park to favorites
// @route   POST /api/favorites
// @access  Private
exports.addFavorite = async (req, res, next) => {
  try {
    const { parkCode, parkName, imageUrl, notes, tags, visitStatus } = req.body;

    // Check if already favorited
    const existing = await Favorite.findOne({
      user: req.user.id,
      parkCode
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Park already in favorites'
      });
    }

    const favorite = await Favorite.create({
      user: req.user.id,
      parkCode,
      parkName,
      imageUrl: imageUrl || '',
      notes: notes || '',
      tags: tags || [],
      visitStatus: visitStatus || 'want-to-visit'
    });

    // Notify via WebSocket
    const wsService = req.app.get('wsService');
    if (wsService) {
      const userId = (req.user.id || req.user._id).toString();
      console.log('[ADD Favorite] Notifying WebSocket for user:', userId);
      wsService.notifyFavoriteAdded(userId, favorite);
    }

    res.status(201).json({
      success: true,
      data: favorite
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove park from favorites
// @route   DELETE /api/favorites/:parkCode
// @access  Private
exports.removeFavorite = async (req, res, next) => {
  try {
    console.log('[DELETE Favorite] Request received for parkCode:', req.params.parkCode);
    console.log('[DELETE Favorite] User ID:', req.user.id);
    
    const favorite = await Favorite.findOneAndDelete({
      user: req.user.id,
      parkCode: req.params.parkCode
    });

    console.log('[DELETE Favorite] Favorite found:', !!favorite);

    if (!favorite) {
      console.log('[DELETE Favorite] 404 - Favorite not found in database');
      return res.status(404).json({
        success: false,
        error: 'Favorite not found'
      });
    }

    // Notify via WebSocket
    const wsService = req.app.get('wsService');
    if (wsService) {
      const userId = (req.user.id || req.user._id).toString();
      console.log('[REMOVE Favorite] Notifying WebSocket for user:', userId, 'parkCode:', req.params.parkCode);
      wsService.notifyFavoriteRemoved(userId, req.params.parkCode);
    }

    res.status(200).json({
      success: true,
      message: 'Removed from favorites'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update favorite
// @route   PUT /api/favorites/:favoriteId
// @access  Private
exports.updateFavorite = async (req, res, next) => {
  try {
    const { notes, tags, visitStatus, rating, visitDate, imageUrl } = req.body;

    const favorite = await Favorite.findById(req.params.favoriteId);

    if (!favorite) {
      return res.status(404).json({
        success: false,
        error: 'Favorite not found'
      });
    }

    // Users can only update their own favorites
    if (favorite.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Update fields
    if (notes !== undefined) favorite.notes = notes;
    if (tags !== undefined) favorite.tags = tags;
    if (visitStatus !== undefined) favorite.visitStatus = visitStatus;
    if (rating !== undefined) favorite.rating = rating;
    if (visitDate !== undefined) favorite.visitDate = visitDate;
    if (imageUrl !== undefined) favorite.imageUrl = imageUrl;

    await favorite.save();

    res.status(200).json({
      success: true,
      data: favorite
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Check if park is favorited
// @route   GET /api/favorites/check/:parkCode
// @access  Private
exports.checkFavorite = async (req, res, next) => {
  try {
    const favorite = await Favorite.findOne({
      user: req.user.id,
      parkCode: req.params.parkCode
    });

    res.status(200).json({
      success: true,
      data: {
        isFavorite: !!favorite,
        favorite: favorite || null
      }
    });
  } catch (error) {
    next(error);
  }
};
