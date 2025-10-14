const TripPlan = require('../models/TripPlan');

// @desc    Get user's trips
// @route   GET /api/trips/user/:userId
// @access  Private
exports.getUserTrips = async (req, res, next) => {
  try {
    // Users can only view their own trips
    if (req.user.id !== req.params.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const trips = await TripPlan.find({ 
      userId: req.params.userId,
      status: { $ne: 'deleted' }
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: trips.length,
      data: trips
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single trip
// @route   GET /api/trips/:tripId
// @access  Private
exports.getTrip = async (req, res, next) => {
  try {
    const trip = await TripPlan.findById(req.params.tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    // Users can only view their own trips
    if (trip.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    res.status(200).json({
      success: true,
      data: trip
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create trip
// @route   POST /api/trips
// @access  Private
exports.createTrip = async (req, res, next) => {
  try {
    const tripData = {
      ...req.body,
      userId: req.user.id
    };

    const trip = await TripPlan.create(tripData);

    // Notify via WebSocket
    const wsService = req.app.get('wsService');
    if (wsService) {
      wsService.notifyTripCreated(req.user.id, trip);
    }

    res.status(201).json({
      success: true,
      data: trip
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update trip
// @route   PUT /api/trips/:tripId
// @access  Private
exports.updateTrip = async (req, res, next) => {
  try {
    const trip = await TripPlan.findById(req.params.tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    // Users can only update their own trips
    if (trip.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Update allowed fields
    const allowedFields = ['title', 'formData', 'plan', 'status', 'conversation', 'summary', 'provider'];
    console.log('🔄 TripController: Updating trip with body:', req.body);
    console.log('🔄 TripController: Current trip status:', trip.status);
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        console.log(`🔄 TripController: Updating ${field} from ${trip[field]} to ${req.body[field]}`);
        trip[field] = req.body[field];
      }
    });

    console.log('🔄 TripController: Trip status after update:', trip.status);
    await trip.save();
    console.log('🔄 TripController: Trip saved successfully with status:', trip.status);

    // Notify via WebSocket
    const wsService = req.app.get('wsService');
    if (wsService) {
      wsService.notifyTripUpdated(req.user.id, trip);
    }

    res.status(200).json({
      success: true,
      data: trip
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete trip (soft delete)
// @route   DELETE /api/trips/:tripId
// @access  Private
exports.deleteTrip = async (req, res, next) => {
  try {
    const trip = await TripPlan.findById(req.params.tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    // Users can only delete their own trips
    if (trip.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    trip.status = 'deleted';
    await trip.save();

    // Notify via WebSocket
    const wsService = req.app.get('wsService');
    if (wsService) {
      wsService.notifyTripDeleted(req.user.id, trip._id);
    }

    res.status(200).json({
      success: true,
      message: 'Trip deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add message to trip
// @route   POST /api/trips/:tripId/messages
// @access  Private
exports.addMessage = async (req, res, next) => {
  try {
    const { role, content, provider, model } = req.body;

    const trip = await TripPlan.findById(req.params.tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    // Users can only add messages to their own trips
    if (trip.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    await trip.addMessage({
      role,
      content,
      provider,
      model
    });

    res.status(200).json({
      success: true,
      data: trip
    });
  } catch (error) {
    next(error);
  }
};
