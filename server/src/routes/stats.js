const express = require('express');
const router = express.Router();
const { 
  getSiteStats, 
  getParkStats, 
  getUserStats 
} = require('../controllers/statsController');

// All routes are public
router.get('/site', getSiteStats);
router.get('/parks', getParkStats);
router.get('/users', getUserStats);

module.exports = router;
