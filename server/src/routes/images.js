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

// Multer error handler middleware
const handleMulterError = (err, req, res, next) => {
  if (err.name === 'MulterError') {
    console.error('❌ Multer error:', {
      message: err.message,
      code: err.code,
      field: err.field
    });
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size too large. Maximum size is 10MB.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files. Maximum 5 files per upload.'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: 'Unexpected field in upload.'
      });
    }
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
  // Pass other errors to the next error handler
  next(err);
};

// Wrapper to catch multer errors
const uploadWithErrorHandling = (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      return handleMulterError(err, req, res, next);
    }
    next();
  });
};

// Public file serving route (no auth required) - MUST be before protect middleware
// Use wildcard to capture full path including subdirectories (e.g., profile/image.jpg)
router.get('/file/*', serveImage);

// All other routes require authentication
router.use(protect);

// Image upload routes with error handling
router.post('/upload', uploadWithErrorHandling, uploadImages);
router.get('/', getUserImages);
router.get('/stats', getImageStats);
router.get('/:id', getImage);
router.put('/:id', updateImage);
router.delete('/:id', deleteImage);

module.exports = router;
