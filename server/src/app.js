const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const http = require('http');
const socketIo = require('socket.io');
const { getUploadsDir } = require('./utils/uploads');

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

// Security middleware with custom configuration for image serving
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin images
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "https:", "http:"], // Allow images from any origin
    },
  },
}));

// CORS
const staticAllowedOrigins = [
  'http://localhost:3000',
  'https://www.nationalparksexplorerusa.com',
  'https://nationalparksexplorerusa.com',
  process.env.CLIENT_URL
].filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (staticAllowedOrigins.includes(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    const isSecure = protocol === 'https:';
    const isVercelPreview =
      hostname.endsWith('.vercel.app') &&
      (
        hostname.includes('trail-verse') ||
        hostname.includes('shadowdevils-projects')
      );

    return isSecure && isVercelPreview;
  } catch {
    return false;
  }
};

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
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

// Serve uploaded files from a configurable root so production can use a persistent disk.
app.use('/uploads', express.static(getUploadsDir()));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting - Tiered model for public/authenticated access
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const jwt = require('jsonwebtoken');

// Helper to extract user ID from JWT token (without requiring auth)
const extractUserId = (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded.id || null;
    }
  } catch {
    // Token invalid or expired — treat as anonymous
  }
  return null;
};

// Tiered API rate limiting: 200 req/15min for authenticated, 60 req/15min for anonymous
const tieredLimiter = rateLimit({
  windowMs,
  max: (req) => {
    const userId = extractUserId(req);
    return userId 
      ? (parseInt(process.env.RATE_LIMIT_AUTH_USER_MAX) || 200)   // Authenticated users
      : (parseInt(process.env.RATE_LIMIT_ANON_MAX) || 60);       // Anonymous users
  },
  keyGenerator: (req) => {
    // Use user ID for authenticated users (so limit is per-user, not per-IP)
    const userId = extractUserId(req);
    return userId || req.ip;
  },
  message: 'Too many requests, please try again later. Sign in for higher rate limits.',
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

// Apply tiered rate limiting to all API routes
app.use('/api/', tieredLimiter);

// Routes
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/parks', require('./routes/enhancedParks')); // Enhanced parks routes first
app.use('/api/parks', require('./routes/parks'));
app.use('/api/activities', require('./routes/activities')); // Activities/Trails routes
app.use('/api/users', require('./routes/users'));
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/users/preferences', require('./routes/userPreferences'));
app.use('/api/blogs', require('./routes/blogs'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/ai/feedback', require('./routes/feedback'));
app.use('/api/feed', require('./routes/dailyFeed'));
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
app.use('/api/feature-announcement', require('./routes/featureAnnouncement')); // Feature announcement emails

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'TrailVerse API Documentation'
}));

// SEO Routes
app.use('/', require('./routes/sitemap'));

// Meta tags API route (for client-side fetching)
app.use('/api/meta-tags', require('./routes/metaTags'));

// Prerender route for social media crawlers (must be before static file serving)
// Note: This only works if server serves the React app. If using Vercel/Netlify, use their prerender features instead
app.use('/', require('./routes/prerender'));

// Health check routes
app.use('/health', require('./routes/health'));

// Error handler
app.use(require('./middleware/errorHandler'));

// Create HTTP server
const server = http.createServer(app);

// Setup WebSocket with proper CORS for production
const io = socketIo(server, {
  cors: {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or postman)
      if (!origin) return callback(null, true);
      
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        console.log('[WebSocket] Rejected connection from origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  // Allow both WebSocket and polling transports
  transports: ['websocket', 'polling'],
  // Increase ping timeout for production reliability
  pingTimeout: 60000,
  pingInterval: 25000
});

// Initialize WebSocket service
const WebSocketService = require('./services/websocketService');
const wsService = new WebSocketService(io);

// Initialize WebSocket utility
const { initializeWebSocketService } = require('./utils/websocket');
initializeWebSocketService(wsService);

// Make WebSocket service available globally
app.set('wsService', wsService);

module.exports = { app, server, wsService };
