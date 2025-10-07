const express = require('express');
const router = express.Router();
const {
  getAllParks,
  getParkByCode,
  getParkDetails,
  searchParks,
  getParkAlerts
} = require('../controllers/parkController');

router.get('/', getAllParks);
router.get('/search', searchParks);
router.get('/:parkCode/details', getParkDetails);
router.get('/:parkCode/alerts', getParkAlerts);
router.get('/:parkCode', getParkByCode);

module.exports = router;
