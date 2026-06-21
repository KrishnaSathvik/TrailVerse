const Testimonial = require('../models/Testimonial');

// @desc    Get testimonials
// @route   GET /api/testimonials
// @access  Public
exports.getTestimonials = async (req, res, next) => {
  try {
    const { approved = true, featured, parkCode, limit = 10 } = req.query;

    const query = {};
    if (approved === 'true') query.approved = true;
    if (featured === 'true') query.featured = true;
    if (parkCode) query.parkCode = parkCode;

    const testimonials = await Testimonial.find(query)
      .populate('user', 'name email avatar')
      .sort({ featured: -1, approvedAt: 1, submittedAt: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      count: testimonials.length,
      data: testimonials
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create testimonial
// @route   POST /api/testimonials
// @access  Public (optionalAuth — links to user when logged in)
exports.createTestimonial = async (req, res, next) => {
  try {
    const { name, content, rating, role, parkCode, parkName, sourceUrl, sourceLabel, source } = req.body;
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedContent = typeof content === 'string' ? content.trim() : '';

    if (!trimmedName) {
      return res.status(400).json({
        success: false,
        error: 'Please provide your name'
      });
    }

    if (!trimmedContent || trimmedContent.length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Testimonial must be at least 50 characters'
      });
    }

    const numericRating = Number(rating);
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a rating between 1 and 5'
      });
    }

    const isAdmin = req.user?.role === 'admin';

    const testimonialData = {
      name: trimmedName,
      content: trimmedContent,
      rating: numericRating,
      role: typeof role === 'string' && role.trim() ? role.trim() : 'Park Explorer',
      parkCode: typeof parkCode === 'string' && parkCode.trim() ? parkCode.trim() : null,
      parkName: typeof parkName === 'string' && parkName.trim() ? parkName.trim() : null,
      approved: false,
      source: 'user-submission',
      sourceUrl: null,
      sourceLabel: null,
      user: req.user ? req.user.id : null
    };

    if (isAdmin) {
      if (source) testimonialData.source = source;
      if (typeof sourceUrl === 'string' && sourceUrl.trim()) {
        testimonialData.sourceUrl = sourceUrl.trim();
      }
      if (typeof sourceLabel === 'string' && sourceLabel.trim()) {
        testimonialData.sourceLabel = sourceLabel.trim();
      }
    }

    const testimonial = await Testimonial.create(testimonialData);

    res.status(201).json({
      success: true,
      data: testimonial
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update testimonial
// @route   PUT /api/testimonials/:id
// @access  Private
exports.updateTestimonial = async (req, res, next) => {
  try {
    const testimonial = await Testimonial.findById(req.params.id);

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        error: 'Testimonial not found'
      });
    }

    // Users can only update their own testimonials
    if (testimonial.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const allowedFields = [
      'name', 'role', 'content', 'rating', 'parkCode', 'parkName',
      'source', 'sourceUrl', 'sourceLabel'
    ];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        testimonial[field] = req.body[field];
      }
    });

    await testimonial.save();

    res.status(200).json({
      success: true,
      data: testimonial
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete testimonial
// @route   DELETE /api/testimonials/:id
// @access  Private
exports.deleteTestimonial = async (req, res, next) => {
  try {
    const testimonial = await Testimonial.findById(req.params.id);

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        error: 'Testimonial not found'
      });
    }

    // Users can only delete their own testimonials
    if (testimonial.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    await testimonial.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Testimonial deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get testimonial stats
// @route   GET /api/testimonials/stats
// @access  Private/Admin
exports.getTestimonialStats = async (req, res, next) => {
  try {
    const [total, pending, approved, featured] = await Promise.all([
      Testimonial.countDocuments(),
      Testimonial.countDocuments({ approved: false }),
      Testimonial.countDocuments({ approved: true }),
      Testimonial.countDocuments({ featured: true })
    ]);

    res.status(200).json({
      success: true,
      data: { total, pending, approved, featured }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve testimonial
// @route   PUT /api/testimonials/:id/approve
// @access  Private/Admin
exports.approveTestimonial = async (req, res, next) => {
  try {
    const testimonial = await Testimonial.findById(req.params.id);

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        error: 'Testimonial not found'
      });
    }

    await testimonial.approve(req.user.id);

    res.status(200).json({
      success: true,
      data: testimonial
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Feature testimonial
// @route   PUT /api/testimonials/:id/feature
// @access  Private/Admin
exports.featureTestimonial = async (req, res, next) => {
  try {
    const testimonial = await Testimonial.findById(req.params.id);

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        error: 'Testimonial not found'
      });
    }

    if (req.body.featured) {
      await testimonial.feature();
    } else {
      await testimonial.unfeature();
    }

    res.status(200).json({
      success: true,
      data: testimonial
    });
  } catch (error) {
    next(error);
  }
};
