const express = require('express');
const router = express.Router();
const { 
  getAllEvents, 
  getEvent, 
  createEvent, 
  updateEvent, 
  deleteEvent,
  registerForEvent,
  unregisterFromEvent,
  getUserEvents
} = require('../controllers/eventController');
const { protect, admin } = require('../middleware/auth');

// Public routes
router.get('/', getAllEvents);
router.get('/:id', getEvent);

// Protected routes
router.post('/:id/register', protect, registerForEvent);
router.delete('/:id/register', protect, unregisterFromEvent);
router.get('/user/:userId', protect, getUserEvents);

// Admin routes
router.post('/', protect, admin, createEvent);
router.put('/:id', protect, admin, updateEvent);
router.delete('/:id', protect, admin, deleteEvent);

module.exports = router;
