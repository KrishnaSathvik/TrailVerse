const express = require('express');
const router = express.Router();
const {
  getParkReviews,
  getParkReviewStats,
  createParkReview,
  updateParkReview,
  deleteParkReview,
  voteOnReview,
  getTopRatedParks,
  getUserReviews,
  respondToReview,
  moderateReview,
  getAllParkRatings
} = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');
const { body } = require('express-validator');

// Validation middleware
const reviewValidation = [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('title')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('comment')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Comment must be between 10 and 2000 characters'),
  body('visitYear')
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Visit year must be a valid year'),
  body('activities')
    .optional()
    .isArray()
    .withMessage('Activities must be an array'),
  body('highlights')
    .optional()
    .isArray()
    .withMessage('Highlights must be an array'),
  body('challenges')
    .optional()
    .isArray()
    .withMessage('Challenges must be an array')
];

// Public routes
router.get('/ratings', getAllParkRatings);
router.get('/top-parks', getTopRatedParks);
router.get('/:parkCode/stats', getParkReviewStats);
router.get('/:parkCode', getParkReviews);

// Protected routes
router.use(protect); // All routes below require authentication

router.post('/:parkCode', reviewValidation, createParkReview);
router.get('/user/my-reviews', getUserReviews);
router.put('/:reviewId', updateParkReview);
router.delete('/:reviewId', deleteParkReview);
router.post('/:reviewId/vote', voteOnReview);

// Admin/Ranger routes
router.post('/:reviewId/respond', respondToReview);
router.put('/:reviewId/moderate', moderateReview);

module.exports = router;