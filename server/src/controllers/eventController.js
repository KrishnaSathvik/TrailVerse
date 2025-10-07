const Event = require('../models/Event');
const npsService = require('../services/npsService');

// @desc    Get all events (both NPS and custom)
// @route   GET /api/events
// @access  Public
exports.getAllEvents = async (req, res, next) => {
  try {
    const { parkCode, category, upcoming, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Build query for custom events
    const query = {};
    if (parkCode) query.parkCode = parkCode;
    if (category) query.category = category;
    if (upcoming === 'true') {
      query.date = { $gte: new Date() };
      query.status = 'upcoming';
    }

    // Get custom events from database
    const customEvents = await Event.find(query)
      .populate('registrations.user', 'name email')
      .sort({ date: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get NPS events if no specific park code or if we want all events
    let npsEvents = [];
    try {
      if (parkCode) {
        npsEvents = await npsService.getEventsByPark(parkCode);
      } else {
        npsEvents = await npsService.getAllEvents();
      }
    } catch (npsError) {
      console.warn('NPS Events API error:', npsError.message);
      // Continue without NPS events if API fails
    }

    // Combine and sort events
    const allEvents = [...customEvents, ...npsEvents].sort((a, b) => {
      const dateA = new Date(a.date || a.eventDate);
      const dateB = new Date(b.date || b.eventDate);
      return dateA - dateB;
    });

    res.status(200).json({
      success: true,
      count: allEvents.length,
      data: allEvents
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single event
// @route   GET /api/events/:id
// @access  Public
exports.getEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('registrations.user', 'name email');

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    res.status(200).json({
      success: true,
      data: event
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create event (Admin only)
// @route   POST /api/events
// @access  Private/Admin
exports.createEvent = async (req, res, next) => {
  try {
    const event = await Event.create(req.body);

    res.status(201).json({
      success: true,
      data: event
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update event (Admin only)
// @route   PUT /api/events/:id
// @access  Private/Admin
exports.updateEvent = async (req, res, next) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    res.status(200).json({
      success: true,
      data: event
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete event (Admin only)
// @route   DELETE /api/events/:id
// @access  Private/Admin
exports.deleteEvent = async (req, res, next) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Register for event
// @route   POST /api/events/:id/register
// @access  Private
exports.registerForEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    await event.registerUser(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Successfully registered for event'
    });
  } catch (error) {
    if (error.message === 'User already registered for this event') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    if (error.message === 'Event is at full capacity') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
};

// @desc    Unregister from event
// @route   DELETE /api/events/:id/register
// @access  Private
exports.unregisterFromEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    await event.unregisterUser(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Successfully unregistered from event'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's registered events
// @route   GET /api/events/user/:userId
// @access  Private
exports.getUserEvents = async (req, res, next) => {
  try {
    const events = await Event.find({
      'registrations.user': req.params.userId
    }).sort({ date: 1 });

    res.status(200).json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    next(error);
  }
};
