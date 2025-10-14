const express = require('express');
const router = express.Router();
const activitiesController = require('../controllers/activitiesController');

// Get all activities across all parks
router.get('/', activitiesController.getAllActivities);

// Get activity by ID
router.get('/:activityId', activitiesController.getActivityById);

module.exports = router;

