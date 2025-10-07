const express = require('express');
const router = express.Router();
const {
  getEnhancedParkData,
  getParkComparison,
  getParkWeather,
  getParkCrowdLevel,
  getBestTimeToVisit,
  getParkFacilities,
  getParkComparisonSummary
} = require('../controllers/enhancedParkController');
const { getParkReviews } = require('../controllers/reviewController');
const { body } = require('express-validator');

// Validation middleware for comparison requests
const comparisonValidation = [
  body('parkCodes')
    .isArray({ min: 2, max: 4 })
    .withMessage('Must provide 2-4 park codes for comparison')
    .custom((parkCodes) => {
      if (!parkCodes.every(code => typeof code === 'string' && code.length > 0)) {
        throw new Error('All park codes must be non-empty strings');
      }
      return true;
    })
];

// Comparison routes (support both GET and POST) - must come before parameterized routes
router.get('/compare', getParkComparison);
router.post('/compare', comparisonValidation, getParkComparison);
router.get('/compare/summary', getParkComparisonSummary);
router.post('/compare/summary', comparisonValidation, getParkComparisonSummary);

// Enhanced park data routes
router.get('/:parkCode/enhanced', getEnhancedParkData);
router.get('/:parkCode/weather', getParkWeather);
router.get('/:parkCode/crowd', getParkCrowdLevel);
router.get('/:parkCode/best-time', getBestTimeToVisit);
router.get('/:parkCode/facilities', getParkFacilities);

// Park reviews route - must come after other specific routes
router.get('/:parkCode/reviews', getParkReviews);

module.exports = router;
