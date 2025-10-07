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
    const categoryDir = path.join(uploadDir, req.body.category || 'general');
    
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
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No images provided'
      });
    }

    const { category = 'general', relatedId, relatedType, tags, isPublic = false } = req.body;
    const uploadedImages = [];

    for (const file of req.files) {
      try {
        // Get image metadata
        const metadata = await sharp(file.path).metadata();
        
        // Generate thumbnail
        const thumbnailPath = file.path.replace(path.extname(file.path), '_thumb' + path.extname(file.path));
        await sharp(file.path)
          .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(thumbnailPath);

        // Generate URLs
        const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;
        const relativePath = path.relative(path.join(__dirname, '../../uploads'), file.path);
        const thumbnailRelativePath = path.relative(path.join(__dirname, '../../uploads'), thumbnailPath);

        const imageUpload = await ImageUpload.create({
          userId: req.user.id,
          originalName: file.originalname,
          filename: file.filename,
          mimeType: file.mimetype,
          size: file.size,
          url: `${baseUrl}/${relativePath.replace(/\\/g, '/')}`,
          thumbnailUrl: `${baseUrl}/${thumbnailRelativePath.replace(/\\/g, '/')}`,
          category,
          relatedId: relatedId || null,
          relatedType: relatedType || null,
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
      } catch (processingError) {
        console.error('Error processing image:', processingError);
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

    res.status(201).json({
      success: true,
      count: uploadedImages.length,
      data: uploadedImages
    });
  } catch (error) {
    next(error);
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
// @route   GET /api/images/file/:filename
// @access  Public
exports.serveImage = async (req, res, next) => {
  try {
    const filename = req.params.filename;
    const imagePath = path.join(__dirname, '../../uploads', filename);

    // Check if file exists
    try {
      await fs.access(imagePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'Image file not found'
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

    // Stream the file
    const fileStream = require('fs').createReadStream(imagePath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
};
