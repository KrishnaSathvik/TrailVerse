const express = require('express');
const router = express.Router();
const {
  getTestimonials,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
  approveTestimonial,
  featureTestimonial,
  getTestimonialStats
} = require('../controllers/testimonialController');
const { protect, admin } = require('../middleware/auth');

// Admin stats route (must be before /:id routes)
router.get('/stats', protect, admin, getTestimonialStats);

// Public routes
router.get('/', getTestimonials);

// Protected routes
router.post('/', protect, createTestimonial);
router.put('/:id', protect, updateTestimonial);
router.delete('/:id', protect, deleteTestimonial);

// Admin routes
router.put('/:id/approve', protect, admin, approveTestimonial);
router.put('/:id/feature', protect, admin, featureTestimonial);

module.exports = router;
