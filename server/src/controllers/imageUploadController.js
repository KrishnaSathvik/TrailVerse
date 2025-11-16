const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const ImageUpload = require('../models/ImageUpload');
const { protect } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    const category = req.body.category || 'general';
    const categoryDir = path.join(uploadDir, category);
    
    console.log('📁 Multer destination:', {
      category: category,
      categoryDir: categoryDir,
      body: req.body
    });
    
    try {
      await fs.mkdir(categoryDir, { recursive: true });
      cb(null, categoryDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// File filter for image types
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP, SVG)'));
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files per request
  },
  fileFilter: fileFilter
});

// Middleware for handling uploads
exports.uploadMiddleware = upload.array('images', 5);

// @desc    Upload images
// @route   POST /api/images/upload
// @access  Private
exports.uploadImages = async (req, res, next) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      console.error('❌ No user found in request - authentication failed');
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Get user ID - handle both id and _id
    const userId = req.user._id || req.user.id;
    
    if (!userId) {
      console.error('❌ User ID not found:', { user: req.user });
      return res.status(401).json({
        success: false,
        error: 'User ID not found'
      });
    }

    console.log('📤 Image upload request received:', {
      filesCount: req.files?.length || 0,
      userId: userId,
      category: req.body.category,
      isPublic: req.body.isPublic
    });

    if (!req.files || req.files.length === 0) {
      console.log('❌ No files provided in request');
      return res.status(400).json({
        success: false,
        error: 'No images provided'
      });
    }

    const { category = 'general', relatedId, relatedType, tags, isPublic = false } = req.body;
    const uploadedImages = [];

    for (const file of req.files) {
      try {
        console.log('🖼️  Processing file:', {
          filename: file.filename,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          path: file.path
        });

        // Check if file exists
        try {
          await fs.access(file.path);
        } catch (accessError) {
          throw new Error(`File not found: ${file.path}`);
        }

        // Check if file is SVG (sharp doesn't handle SVG well)
        const isSvg = file.mimetype === 'image/svg+xml' || path.extname(file.path).toLowerCase() === '.svg';
        
        // Get image metadata (skip for SVG)
        let metadata;
        let thumbnailPath = null;
        let thumbnailRelativePath = null;
        
        if (!isSvg) {
          try {
            metadata = await sharp(file.path).metadata();
          } catch (sharpError) {
            console.error('❌ Sharp error processing image:', sharpError);
            throw new Error(`Failed to process image: ${sharpError.message}`);
          }
          
          // Generate thumbnail (always save as JPEG for consistency)
          thumbnailPath = file.path.replace(path.extname(file.path), '_thumb.jpg');
          try {
            await sharp(file.path)
              .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 80 })
              .toFile(thumbnailPath);
            
            thumbnailRelativePath = path.relative(path.join(__dirname, '../../uploads'), thumbnailPath).replace(/\\/g, '/');
            console.log('✅ Thumbnail generated:', thumbnailRelativePath);
          } catch (thumbnailError) {
            console.error('❌ Error generating thumbnail:', thumbnailError);
            // Clean up failed thumbnail file if it was partially created
            try {
              await fs.unlink(thumbnailPath).catch(() => {});
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
            thumbnailPath = null;
            thumbnailRelativePath = null;
          }
        } else {
          // For SVG files, get basic metadata without sharp
          metadata = {
            width: null,
            height: null,
            format: 'svg',
            space: 'srgb',
            exif: null
          };
          console.log('ℹ️  SVG file detected, skipping thumbnail generation');
        }

        // Generate URLs - store as relative paths for easier normalization
        // The client will normalize these to the correct format based on environment
        const relativePath = path.relative(path.join(__dirname, '../../uploads'), file.path).replace(/\\/g, '/');
        
        // Store as relative path - client will normalize to full URL or API endpoint as needed
        // Format: /uploads/category/filename.jpg
        const imageUrl = `/uploads/${relativePath}`;
        const thumbnailUrl = thumbnailRelativePath ? `/uploads/${thumbnailRelativePath}` : null;

        const imageUpload = await ImageUpload.create({
          userId: userId, // Already validated above
          originalName: file.originalname,
          filename: file.filename,
          mimeType: file.mimetype,
          size: file.size,
          url: imageUrl,
          thumbnailUrl: thumbnailUrl,
          category,
          relatedId: relatedId || null,
          relatedType: relatedType || (category === 'profile' ? 'user' : null),
          metadata: {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            colorSpace: metadata.space,
            exif: metadata.exif
          },
          tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
          isPublic,
          processingStatus: 'completed',
          isProcessed: true
        });

        uploadedImages.push(imageUpload);
        console.log('✅ Image uploaded successfully:', {
          id: imageUpload._id,
          filename: imageUpload.filename,
          url: imageUpload.url
        });
      } catch (processingError) {
        console.error('❌ Error processing image:', {
          error: processingError.message,
          stack: processingError.stack,
          file: file?.originalname
        });
        // Clean up failed file
        try {
          await fs.unlink(file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up failed file:', cleanupError);
        }
        
        // Continue with other files
        continue;
      }
    }

    if (uploadedImages.length === 0) {
      console.log('❌ All image uploads failed');
      return res.status(500).json({
        success: false,
        error: 'Failed to upload images'
      });
    }

    console.log(`✅ Successfully uploaded ${uploadedImages.length} image(s)`);
    res.status(201).json({
      success: true,
      count: uploadedImages.length,
      data: uploadedImages
    });
  } catch (error) {
    console.error('❌ Image upload controller error:', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      userId: req.user?.id || req.user?._id || 'unknown',
      filesCount: req.files?.length || 0
    });
    
    // Return a proper error response
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload images',
      ...(process.env.NODE_ENV === 'development' && { 
        details: error.stack,
        errorName: error.name 
      })
    });
  }
};

// @desc    Get user's uploaded images
// @route   GET /api/images
// @access  Private
exports.getUserImages = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, search, isPublic } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    const query = { userId: req.user.id };
    
    if (category) {
      query.category = category;
    }
    
    if (isPublic !== undefined) {
      query.isPublic = isPublic === 'true';
    }
    
    if (search) {
      query.$or = [
        { originalName: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const [images, total] = await Promise.all([
      ImageUpload.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      ImageUpload.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      count: images.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: images
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single image
// @route   GET /api/images/:id
// @access  Private
exports.getImage = async (req, res, next) => {
  try {
    const image = await ImageUpload.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user.id },
        { isPublic: true }
      ]
    });

    if (!image) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      });
    }

    // Increment download count if accessed by owner
    if (image.userId.toString() === req.user.id) {
      await image.incrementDownload();
    }

    res.status(200).json({
      success: true,
      data: image
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update image
// @route   PUT /api/images/:id
// @access  Private
exports.updateImage = async (req, res, next) => {
  try {
    const { tags, isPublic, category } = req.body;

    const image = await ImageUpload.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!image) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      });
    }

    // Update fields
    if (tags !== undefined) {
      image.tags = tags;
    }
    if (isPublic !== undefined) {
      image.isPublic = isPublic;
    }
    if (category) {
      image.category = category;
    }

    await image.save();

    res.status(200).json({
      success: true,
      data: image
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete image
// @route   DELETE /api/images/:id
// @access  Private
exports.deleteImage = async (req, res, next) => {
  try {
    const image = await ImageUpload.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!image) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      });
    }

    // Delete physical files
    try {
      const imagePath = path.join(__dirname, '../../uploads', image.filename);
      const thumbnailPath = imagePath.replace(path.extname(imagePath), '_thumb' + path.extname(imagePath));
      
      await Promise.all([
        fs.unlink(imagePath).catch(() => {}), // Ignore if file doesn't exist
        fs.unlink(thumbnailPath).catch(() => {}) // Ignore if file doesn't exist
      ]);
    } catch (fileError) {
      console.error('Error deleting physical files:', fileError);
    }

    // Delete database record
    await ImageUpload.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get image statistics
// @route   GET /api/images/stats
// @access  Private
exports.getImageStats = async (req, res, next) => {
  try {
    const stats = await ImageUpload.aggregate([
      { $match: { userId: req.user._id || req.user.id } },
      {
        $group: {
          _id: null,
          totalImages: { $sum: 1 },
          totalSize: { $sum: '$size' },
          publicImages: {
            $sum: { $cond: ['$isPublic', 1, 0] }
          },
          totalDownloads: { $sum: '$downloadCount' }
        }
      }
    ]);

    const categoryStats = await ImageUpload.aggregate([
      { $match: { userId: req.user._id || req.user.id } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalSize: { $sum: '$size' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: stats[0] || {
          totalImages: 0,
          totalSize: 0,
          publicImages: 0,
          totalDownloads: 0
        },
        categories: categoryStats
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Serve image file
// @route   GET /api/images/file/*
// @access  Public
exports.serveImage = async (req, res, next) => {
  try {
    // Extract the full file path from the wildcard (everything after /file/)
    const filePath = req.params[0]; // Get wildcard content
    
    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path is required'
      });
    }

    // Prevent directory traversal attacks
    if (filePath.includes('..') || filePath.includes('~')) {
      return res.status(403).json({
        success: false,
        error: 'Invalid file path'
      });
    }

    const imagePath = path.join(__dirname, '../../uploads', filePath);

    // Check if file exists
    try {
      await fs.access(imagePath);
    } catch (error) {
      // Only log missing images in development to reduce production noise
      if (process.env.NODE_ENV === 'development') {
        console.warn(`⚠️ Image file not found:`, {
          requestedPath: filePath,
          fullPath: imagePath
        });
      }
      
      // Return 404 with proper content type
      res.status(404);
      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: false,
        error: 'Image file not found',
        path: filePath
      });
    }

    // Detect content type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    const contentTypeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    };
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS for images

    // Stream the file
    const fileStream = require('fs').createReadStream(imagePath);
    
    // Handle stream errors
    fileStream.on('error', (err) => {
      console.error('❌ Error streaming file:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Error serving image'
        });
      }
    });
    
    fileStream.pipe(res);
  } catch (error) {
    console.error('❌ serveImage error:', error);
    next(error);
  }
};
