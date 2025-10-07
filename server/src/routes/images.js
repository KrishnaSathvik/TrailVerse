const express = require('express');
const router = express.Router();
const {
  uploadMiddleware,
  uploadImages,
  getUserImages,
  getImage,
  updateImage,
  deleteImage,
  getImageStats,
  serveImage
} = require('../controllers/imageUploadController');
const { protect } = require('../middleware/auth');

// All routes are protected except file serving
router.use(protect);

// Image upload routes
router.post('/upload', uploadMiddleware, uploadImages);
router.get('/', getUserImages);
router.get('/stats', getImageStats);
router.get('/:id', getImage);
router.put('/:id', updateImage);
router.delete('/:id', deleteImage);

// Public file serving route (no auth required)
router.get('/file/:filename', serveImage);

module.exports = router;
