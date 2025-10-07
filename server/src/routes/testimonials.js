const express = require('express');
const router = express.Router();
const { 
  getTestimonials, 
  createTestimonial, 
  updateTestimonial, 
  deleteTestimonial,
  approveTestimonial,
  featureTestimonial
} = require('../controllers/testimonialController');
const { protect, admin } = require('../middleware/auth');

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
