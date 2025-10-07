const express = require('express');
const router = express.Router();
const { 
  getUserFavorites, 
  addFavorite, 
  removeFavorite, 
  updateFavorite,
  checkFavorite
} = require('../controllers/favoriteController');
const { protect } = require('../middleware/auth');

// All routes are protected
router.use(protect);

router.get('/user/:userId', getUserFavorites);
router.post('/', addFavorite);
router.delete('/:parkCode', removeFavorite);
router.put('/:favoriteId', updateFavorite);
router.get('/check/:parkCode', checkFavorite);

module.exports = router;
