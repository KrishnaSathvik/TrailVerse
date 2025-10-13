const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TrailVerse API',
      version: '1.0.0',
      description: 'API for TrailVerse - AI-Powered National Parks Trip Planner',
      contact: {
        name: 'TrailVerse Team',
        email: 'trailverseteam@gmail.com'
      }
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://www.nationalparksexplorerusa.com/api'
          : 'http://localhost:5001/api',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              example: 'Error message'
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js'] // Paths to files containing OpenAPI definitions
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Security middleware
app.use(helmet());

// CORS
const allowedOrigins = [
  'http://localhost:3000',
  'https://www.nationalparksexplorerusa.com',
  'https://nationalparksexplorerusa.com'
];

if (process.env.CLIENT_URL) {
  allowedOrigins.push(process.env.CLIENT_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parser with increased limits for blog content (MUST come before compression)
app.use(express.json({ limit: '10mb' })); // Increased from default 100kb to 10mb
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Increased from default 100kb to 10mb

// Compression middleware (MUST come after body parser)
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Compression level (0-9)
  threshold: 1024, // Only compress responses > 1kb
}));

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting - Different limits for different operations
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes

// General API rate limiting (more generous for read operations)
const generalLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // 1000 requests per 15 minutes
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for localhost in development
  skip: (req) => {
    return process.env.NODE_ENV === 'development' && 
           (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1');
  }
});

// Stricter rate limiting for auth endpoints (prevent brute force attacks)
const authLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 50, // 50 auth requests per 15 minutes
  message: 'Too many authentication attempts from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return process.env.NODE_ENV === 'development' && 
           (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1');
  }
});

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

// Routes
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/parks', require('./routes/enhancedParks')); // Enhanced parks routes first
app.use('/api/parks', require('./routes/parks'));
app.use('/api/users', require('./routes/users'));
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/blogs', require('./routes/blogs'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/ai/feedback', require('./routes/feedback'));
app.use('/api/events', require('./routes/events'));
app.use('/api/trips', require('./routes/trips'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/testimonials', require('./routes/testimonials'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/email', require('./routes/emailRoutes'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/images', require('./routes/images'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api', require('./routes/comments'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/gmaps', require('./routes/gmaps')); // Google Maps proxy

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'TrailVerse API Documentation'
}));

// SEO Routes
app.use('/', require('./routes/sitemap'));

// Health check routes
app.use('/health', require('./routes/health'));

// Error handler
app.use(require('./middleware/errorHandler'));

module.exports = app;
