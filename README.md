# TrailVerse 🌲

> Your Universe of National Parks Exploration - AI-Powered Trip Planning & Discovery Platform

**Live Site:** [www.nationalparksexplorerusa.com](https://www.nationalparksexplorerusa.com)

[![Built with React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.1-47A248?logo=mongodb)](https://www.mongodb.com/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-4.1-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)

---

## 🏞️ About TrailVerse

TrailVerse is the **ultimate AI-powered platform** for exploring and planning trips to America's 63 National Parks. Built with cutting-edge technologies, it combines advanced AI integration, comprehensive park data, vibrant community features, and expert content - all in one seamless experience.

### 🎯 What Makes TrailVerse Unique

- **Dual AI Integration** - First platform offering both OpenAI GPT-4 and Anthropic Claude for trip planning
- **Real-time Conversation Persistence** - Auto-save with version conflict resolution
- **Comprehensive Park Data** - Official NPS API integration with real-time updates
- **Advanced Caching System** - Multi-layer caching with smart prefetching
- **Community-Driven** - Reviews, testimonials, and shared experiences
- **Performance First** - Optimized for speed with lazy loading and code splitting

---

## ✨ Key Features

### 🤖 AI-Powered Trip Planning
- **Dual AI Providers**: Seamless integration with OpenAI GPT-4 and Anthropic Claude
- **Conversational Interface**: Multi-turn chat with context awareness
- **Smart Auto-Save**: Real-time conversation persistence with debouncing
- **Feedback System**: Rate AI responses (thumbs up/down) for continuous improvement
- **Trip Archive Management**: Archive and restore previous trip conversations with auto-tab switching
- **Token Management**: Daily usage limits and tracking to prevent API abuse
- **Streaming Responses**: Real-time AI responses for better user experience
- **Personalized Recommendations**: AI suggestions based on user preferences, visited parks, and season
- **Provider Switching**: Seamlessly switch between AI providers mid-conversation

### 🗺️ Park Exploration & Discovery
- **All 63 National Parks**: Complete database with official NPS API integration
- **Interactive Maps**: Leaflet-powered maps with custom markers and park locations
- **Advanced Filtering**: Filter by state, activities, features, amenities, and difficulty
- **Park Comparison**: Side-by-side comparison of multiple parks with detailed metrics
- **Detailed Park Pages**: Comprehensive information including:
  - Activities and experiences
  - Real-time alerts and closures
  - Current weather conditions and forecasts
  - User reviews and ratings
  - Park events and ranger programs
  - Photo galleries and virtual tours
- **Smart Search**: Fuzzy search with autocomplete and suggestions
- **Virtualized Lists**: Efficient rendering of large park lists

### 🎯 User Management & Personalization
- **Secure Authentication**: JWT-based auth with email verification and password reset
- **Email Verification**: Required email confirmation for account security
- **User Profiles**: Customizable profiles with:
  - Avatar selection (12+ unique avatars)
  - Bio and personal information
  - Park visit tracking
  - Favorites and collections
- **Saved Parks**: Bookmark parks with personal notes and visit dates
- **Visited Parks Tracking**: Record parks you've visited with dates and memories
- **Trip History Management**: Comprehensive record of past and planned trips
- **Favorites System**: Save parks, blogs, events, and reviews
- **Archive System**: Archive completed trips with one-click restore

### 📝 Content Management System
- **Rich Blog Platform**: Admin-managed blog with TinyMCE rich text editor
- **Content Categories**: 
  - Hiking & Trails
  - Photography
  - Wildlife & Nature
  - Travel Tips
  - Park Guides
  - Camping & Gear
  - History & Culture
  - Conservation
- **SEO Optimization**: Automatic meta tags, structured data, and sitemap generation
- **Image Handling**: Secure upload with Sharp.js optimization and WebP conversion
- **Content Scheduling**: Publish and schedule blog posts
- **Draft Management**: Save drafts and preview before publishing
- **Comment System**: User comments with moderation
- **Like & Favorite**: Engage with blog content

### 💬 Community Features
- **Park Reviews**: User-generated reviews with:
  - Star ratings (1-5)
  - Written reviews
  - Image uploads (up to 5 per review)
  - Edit/delete own reviews
  - Helpful voting system
- **Testimonials Management**: Community experiences with admin moderation
- **Comment System**: Blog post engagement with nested replies
- **Events Calendar**: 
  - Park events and ranger programs
  - Filter by park, date, and category
  - Save events to profile
- **Social Sharing**: Share parks, blogs, and experiences on social media
- **User Avatars**: 12+ customizable avatars for community identity

### 🔧 Advanced Features
- **Real-time Weather**: Current conditions and 5-day forecasts for all parks
- **Performance Monitoring**: 
  - Web Vitals tracking (LCP, FID, CLS)
  - Performance metrics dashboard
  - Error tracking and reporting
- **Google Analytics 4**: 
  - Custom event tracking
  - User behavior analysis
  - Conversion tracking
- **Email System**: Automated emails for:
  - Blog post notifications
  - Account verification
  - Password reset
  - Trip reminders
  - Newsletter subscriptions
- **WebSocket Support**: Real-time features and live updates
- **Multi-layer Caching**: 
  - Browser cache (localStorage/sessionStorage)
  - TanStack Query cache
  - Service worker cache
  - Backend Redis cache
- **Rate Limiting**: Smart throttling to prevent API abuse
- **Security Headers**: Comprehensive security with Helmet.js and CSP
- **Cookie Consent**: GDPR-compliant cookie management
- **Theme System**: Light, Dark, and System preference themes
- **Responsive Design**: Mobile-first approach with all breakpoints
- **Accessibility**: WCAG 2.1 AA compliant with screen reader support
- **Error Boundaries**: Graceful error handling with fallback UI
- **Loading States**: Skeleton screens and optimistic updates

### 🛡️ Admin Dashboard
- **Analytics Dashboard**: Platform-wide statistics and insights
- **User Management**: View and manage user accounts
- **Blog Management**: Create, edit, and delete blog posts
- **Testimonials Management**: Approve, edit, or reject testimonials
- **Performance Monitoring**: Real-time performance metrics
- **Settings Management**: Configure platform settings
- **Content Moderation**: Review and moderate user-generated content

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** (LTS recommended)
- **MongoDB** (local installation or MongoDB Atlas)
- **Git** (for version control)
- **API Keys** (see configuration section below)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/KrishnaSathvik/TrailVerse.git
   cd TrailVerse
   ```

2. **Install dependencies:**
   ```bash
   # Install client dependencies
   cd client
   npm install

   # Install server dependencies
   cd ../server
   npm install
   ```

3. **Environment Configuration:**
   
   **Backend (`server/.env`):**
   ```bash
   # Server Configuration
   NODE_ENV=development
   PORT=5001
   
   # Database
   MONGODB_URI=mongodb://localhost:27017/trailverse
   
   # Authentication
   JWT_SECRET=your_super_secret_jwt_key_change_in_production
   JWT_EXPIRE=30d
   
   # External APIs
   NPS_API_KEY=your_nps_api_key_here
   OPENAI_API_KEY=sk-your_openai_api_key
   ANTHROPIC_API_KEY=your_anthropic_api_key
   OPENWEATHER_API_KEY=your_weather_api_key
   
   # Email Configuration
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password
   EMAIL_FROM_NAME=TrailVerse
   ADMIN_EMAIL=your_admin_email@gmail.com
   
   # Client URL
   CLIENT_URL=http://localhost:3001
   ```

   **Frontend (`client/.env`):**
   ```bash
   # API Configuration
   VITE_API_URL=http://localhost:5001/api
   
   # External APIs
   REACT_APP_NPS_API_KEY=your_nps_api_key_here
   
   # Analytics
   REACT_APP_GA_TRACKING_ID=G-XXXXXXXXXX
   
   # Application
   REACT_APP_NAME=TrailVerse
   REACT_APP_URL=http://localhost:3001
   
   # Environment
   VITE_APP_ENV=development
   ```

4. **Start development servers:**
   
   **Terminal 1 - Backend:**
   ```bash
   cd server
   npm run dev
   ```
   Backend will start at: **http://localhost:5001**
   
   **Terminal 2 - Frontend:**
   ```bash
   cd client
   npm run dev
   ```
   Frontend will start at: **http://localhost:3001**

5. **Access the application:**
   - **Frontend**: http://localhost:3001
   - **Backend API**: http://localhost:5001/api
   - **API Health Check**: http://localhost:5001/health

---

## 📁 Project Structure

```
TrailVerse/
├── client/                       # React frontend (Vite)
│   ├── src/
│   │   ├── components/           # Reusable UI components
│   │   │   ├── ai-chat/         # AI chat interface
│   │   │   │   ├── ChatInput.jsx
│   │   │   │   ├── MessageBubble.jsx
│   │   │   │   ├── SuggestedPrompts.jsx
│   │   │   │   └── TypingIndicator.jsx
│   │   │   ├── blog/            # Blog components
│   │   │   │   ├── BlogCard.jsx
│   │   │   │   ├── CategoryFilter.jsx
│   │   │   │   ├── CommentSection.jsx
│   │   │   │   └── LikeFavorite.jsx
│   │   │   ├── common/          # Shared components
│   │   │   │   ├── Header.jsx
│   │   │   │   ├── Footer.jsx
│   │   │   │   ├── Button.jsx
│   │   │   │   ├── SEO.jsx
│   │   │   │   ├── LoadingScreen.jsx
│   │   │   │   ├── ErrorBoundary.jsx
│   │   │   │   ├── PerformanceMonitor.jsx
│   │   │   │   ├── ScrollToTop.jsx
│   │   │   │   ├── CookieConsent.jsx
│   │   │   │   ├── ThemeSwitcher.jsx
│   │   │   │   └── OptimizedImage.jsx
│   │   │   ├── explore/         # Park exploration
│   │   │   │   ├── FilterSidebar.jsx
│   │   │   │   ├── ParkCard.jsx
│   │   │   │   ├── SearchBar.jsx
│   │   │   │   └── VirtualizedParkList.jsx
│   │   │   ├── map/             # Interactive maps
│   │   │   │   └── InteractiveMap.jsx
│   │   │   ├── park-details/    # Park detail views
│   │   │   │   ├── ParkHero.jsx
│   │   │   │   ├── ParkTabs.jsx
│   │   │   │   ├── QuickInfoCard.jsx
│   │   │   │   ├── AlertBanner.jsx
│   │   │   │   ├── WeatherWidget.jsx
│   │   │   │   └── ReviewSection.jsx
│   │   │   ├── plan-ai/         # AI trip planning
│   │   │   │   └── TripPlannerChat.jsx
│   │   │   ├── profile/         # User profile
│   │   │   │   ├── AvatarSelector.jsx
│   │   │   │   ├── SavedParks.jsx
│   │   │   │   ├── VisitedParks.jsx
│   │   │   │   ├── TripHistoryList.jsx
│   │   │   │   ├── TripSummaryCard.jsx
│   │   │   │   ├── UserReviews.jsx
│   │   │   │   └── UserTestimonials.jsx
│   │   │   └── reviews/         # Review system
│   │   │       ├── ReviewFormWithImages.jsx
│   │   │       └── ReviewSection.jsx
│   │   ├── pages/               # Page components
│   │   │   ├── LandingPage.jsx
│   │   │   ├── FeaturesPage.jsx
│   │   │   ├── ExploreParksPage.jsx
│   │   │   ├── ParkDetailPage.jsx
│   │   │   ├── MapPage.jsx
│   │   │   ├── ComparePage.jsx
│   │   │   ├── PlanAIPage.jsx
│   │   │   ├── EventsPage.jsx
│   │   │   ├── BlogPage.jsx
│   │   │   ├── BlogPostPage.jsx
│   │   │   ├── ProfilePage.jsx
│   │   │   ├── TestimonialsPage.jsx
│   │   │   ├── AboutPage.jsx
│   │   │   ├── FAQPage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   ├── SignupPage.jsx
│   │   │   ├── ForgotPasswordPage.jsx
│   │   │   ├── ResetPasswordPage.jsx
│   │   │   ├── VerifyEmailPage.jsx
│   │   │   ├── PrivacyPage.jsx
│   │   │   ├── TermsPage.jsx
│   │   │   └── admin/           # Admin pages
│   │   │       ├── AdminDashboard.jsx
│   │   │       ├── AdminUsersPage.jsx
│   │   │       ├── AdminPerformancePage.jsx
│   │   │       ├── CreateBlogPage.jsx
│   │   │       └── EditBlogPage.jsx
│   │   ├── services/            # API services
│   │   │   ├── enhancedApi.js   # Enhanced API with caching
│   │   │   ├── aiService.js
│   │   │   ├── authService.js
│   │   │   ├── tripService.js
│   │   │   ├── blogService.js
│   │   │   ├── reviewService.js
│   │   │   ├── favoriteService.js
│   │   │   ├── cacheService.js
│   │   │   └── analyticsService.js
│   │   ├── context/             # React contexts
│   │   │   ├── AuthContext.jsx
│   │   │   ├── ToastContext.jsx
│   │   │   └── ThemeContext.jsx
│   │   ├── hooks/               # Custom hooks
│   │   │   ├── useTrips.js
│   │   │   ├── useParks.js
│   │   │   ├── useFavorites.js
│   │   │   ├── useReviews.js
│   │   │   ├── useDebounce.js
│   │   │   └── useWebSocket.js
│   │   ├── utils/               # Utility functions
│   │   │   ├── analytics.js
│   │   │   ├── cacheUtils.js
│   │   │   └── validation.js
│   │   └── styles/              # Global styles
│   │       ├── index.css
│   │       └── themes.css
│   ├── public/                  # Static assets
│   │   ├── images/
│   │   └── favicon.ico
│   ├── tests/                   # Test files
│   │   └── e2e/                 # E2E tests
│   ├── vite.config.js           # Vite configuration
│   ├── tailwind.config.js       # Tailwind configuration
│   ├── vitest.config.js         # Vitest configuration
│   ├── playwright.config.js     # Playwright configuration
│   └── package.json
│
├── server/                      # Node.js backend (Express)
│   ├── src/
│   │   ├── config/              # Configuration
│   │   │   ├── database.js
│   │   │   └── validateEnv.js
│   │   ├── controllers/         # Route controllers
│   │   │   ├── authController.js
│   │   │   ├── aiController.js
│   │   │   ├── tripController.js
│   │   │   ├── parkController.js
│   │   │   ├── blogController.js
│   │   │   ├── reviewController.js
│   │   │   ├── favoriteController.js
│   │   │   ├── adminController.js
│   │   │   └── analyticsController.js
│   │   ├── middleware/          # Custom middleware
│   │   │   ├── auth.js          # Authentication
│   │   │   ├── cache.js         # Caching
│   │   │   ├── tokenLimits.js   # Rate limiting
│   │   │   ├── analytics.js     # Analytics tracking
│   │   │   └── errorHandler.js  # Error handling
│   │   ├── models/              # MongoDB models
│   │   │   ├── User.js
│   │   │   ├── TripPlan.js
│   │   │   ├── BlogPost.js
│   │   │   ├── ParkReview.js
│   │   │   ├── Favorite.js
│   │   │   ├── Testimonial.js
│   │   │   ├── Comment.js
│   │   │   ├── Event.js
│   │   │   ├── Conversation.js
│   │   │   ├── Feedback.js
│   │   │   └── Analytics.js
│   │   ├── routes/              # API routes
│   │   │   ├── auth.js
│   │   │   ├── ai.js
│   │   │   ├── trips.js
│   │   │   ├── parks.js
│   │   │   ├── blogs.js
│   │   │   ├── reviews.js
│   │   │   ├── favorites.js
│   │   │   ├── admin.js
│   │   │   ├── health.js
│   │   │   └── sitemap.js
│   │   ├── services/            # Business logic
│   │   │   ├── openaiService.js
│   │   │   ├── claudeService.js
│   │   │   ├── npsService.js
│   │   │   ├── emailService.js
│   │   │   ├── websocketService.js
│   │   │   └── factsService.js
│   │   └── utils/               # Server utilities
│   │       └── generateToken.js
│   ├── templates/               # Email templates
│   │   ├── welcome.html
│   │   ├── passwordReset.html
│   │   └── blogNotification.html
│   ├── scripts/                 # Database scripts
│   │   └── seed.js
│   ├── tests/                   # Test files
│   │   ├── unit/
│   │   └── integration/
│   ├── jest.config.js           # Jest configuration
│   ├── server.js                # Entry point
│   └── package.json
│
├── .github/                     # GitHub workflows
│   └── workflows/
│       └── test.yml
├── client/vercel.json           # Vercel config
├── .gitignore
├── package.json                 # Root package.json
└── README.md                    # This file
```

---

## 🛠️ Tech Stack

### Frontend
- **React 18.3** - Latest React with concurrent features
- **Vite 5.4** - Lightning-fast build tool and dev server
- **Tailwind CSS 4.1** - Utility-first CSS framework with custom design system
- **React Router 7.9** - Client-side routing with navigation guards
- **TanStack Query 5.90** - Server state management, caching, and synchronization
- **React Helmet Async 2.0** - Document head management for SEO
- **React Leaflet 4.2** - Interactive maps with Leaflet
- **Lucide React 0.544** - Beautiful, consistent icon library
- **Axios 1.12** - Promise-based HTTP client
- **React GA4 2.1** - Google Analytics 4 integration
- **Web Vitals 2.1** - Core Web Vitals tracking

### Backend
- **Node.js 18+** - JavaScript runtime with ES modules
- **Express.js 4.18** - Fast, unopinionated web framework
- **MongoDB 8.1** - NoSQL document database
- **Mongoose 8.1** - Elegant MongoDB ODM
- **JWT 9.0** - JSON Web Tokens for authentication
- **bcryptjs 2.4** - Password hashing
- **Helmet 7.1** - Security headers middleware
- **CORS 2.8** - Cross-origin resource sharing
- **Morgan 1.10** - HTTP request logging
- **Socket.io 4.8** - Real-time bidirectional communication
- **Nodemailer 6.10** - Email sending
- **Multer 2.0** - File upload handling
- **Sharp 0.34** - Image processing
- **Node-cache 5.1** - In-memory caching
- **Express-validator 7.0** - Input validation
- **Express-rate-limit 7.5** - Rate limiting middleware
- **Compression 1.8** - Response compression

### AI & External APIs
- **OpenAI GPT-4** - Primary AI provider for trip planning
- **Anthropic Claude (SDK 0.65)** - Secondary AI provider
- **NPS Data API** - Official National Parks Service data
- **OpenWeather API** - Real-time weather data and forecasts
- **Google Analytics 4** - User behavior analytics
- **Nodemailer/Gmail** - Email delivery service

### Development & Testing
- **Vitest 2.1** - Fast unit testing framework with UI
- **Testing Library 16.3** - Component testing utilities
- **Playwright 1.49** - End-to-end testing automation
- **Jest 29.7** - Server-side testing framework
- **ESLint** - Code linting and style enforcement
- **MSW 2.6** - API mocking for tests
- **Supertest 7.0** - HTTP assertions

---

## 🔑 Required API Keys

### Essential APIs
1. **NPS Data API** (Required)
   - Get API Key: [NPS Developer Portal](https://www.nps.gov/subjects/developer/get-started.htm)
   - Free tier: 1000 requests/hour
   - Used for: Park data, events, alerts

2. **OpenAI API** (Required for AI features)
   - Get API Key: [OpenAI Platform](https://platform.openai.com/api-keys)
   - Pay-as-you-go pricing
   - Used for: Trip planning AI

3. **Anthropic Claude** (Optional - AI backup)
   - Get API Key: [Anthropic Console](https://console.anthropic.com/)
   - Pay-as-you-go pricing
   - Used for: Alternative AI provider

### Optional APIs
4. **OpenWeather API** (Optional)
   - Get API Key: [OpenWeather](https://openweathermap.org/api)
   - Free tier: 1000 calls/day
   - Used for: Weather data

5. **Google Analytics** (Optional)
   - Setup: [Analytics Console](https://analytics.google.com/)
   - Free
   - Used for: User analytics

---

## 📊 API Endpoints

### Authentication & User Management
```
POST   /api/auth/signup              # User registration
POST   /api/auth/login               # User login
POST   /api/auth/forgot-password     # Password reset request
POST   /api/auth/reset-password      # Password reset confirmation
GET    /api/auth/verify-email/:token # Email verification
GET    /api/auth/me                  # Get current user
PUT    /api/users/profile            # Update user profile
GET    /api/users/:id                # Get user by ID
```

### Parks & Data
```
GET    /api/parks                    # Get all parks with filtering
GET    /api/parks/:parkCode          # Get detailed park info
GET    /api/parks/:parkCode/events   # Get park events
GET    /api/parks/:parkCode/weather  # Get park weather
GET    /api/parks/search             # Search parks
POST   /api/parks/compare            # Compare multiple parks
```

### AI Services
```
POST   /api/ai/chat                  # AI chat endpoint
POST   /api/ai/plan-trip             # Generate trip plan
GET    /api/ai/conversations         # Get conversation history
PUT    /api/ai/conversations/:id     # Update conversation
DELETE /api/ai/conversations/:id     # Delete conversation
POST   /api/feedback                 # Submit AI feedback
```

### Trip Management
```
GET    /api/trips                    # Get user trips
POST   /api/trips                    # Create new trip
GET    /api/trips/:id                # Get trip details
PUT    /api/trips/:id                # Update trip
DELETE /api/trips/:id                # Delete trip
PUT    /api/trips/:id/archive        # Archive trip
PUT    /api/trips/:id/restore        # Restore archived trip
```

### Favorites & Collections
```
GET    /api/favorites                # Get user favorites
POST   /api/favorites                # Add to favorites
DELETE /api/favorites/:parkCode      # Remove from favorites
GET    /api/favorites/stats          # Get favorites stats
```

### Content Management
```
GET    /api/blogs                    # Get blog posts
GET    /api/blogs/:slug              # Get blog post
POST   /api/blogs                    # Create blog (admin)
PUT    /api/blogs/:id                # Update blog (admin)
DELETE /api/blogs/:id                # Delete blog (admin)
GET    /api/blogs/categories         # Get categories
```

### Reviews & Community
```
GET    /api/reviews                  # Get park reviews
POST   /api/reviews                  # Submit review
PUT    /api/reviews/:id              # Update review
DELETE /api/reviews/:id              # Delete review
GET    /api/testimonials             # Get testimonials
POST   /api/testimonials             # Submit testimonial
```

### Admin Endpoints
```
GET    /api/admin/dashboard          # Dashboard analytics
GET    /api/admin/users              # User management
GET    /api/admin/stats              # Platform statistics
GET    /api/admin/analytics          # Advanced analytics
POST   /api/admin/blog               # Blog management
PUT    /api/admin/testimonials/:id   # Testimonial moderation
```

### Health & Monitoring
```
GET    /health                       # API health check
GET    /api/health/db                # Database health
GET    /api/sitemap.xml              # SEO sitemap
```

---

## 🧪 Testing

### Test Coverage
- **Unit Tests**: Components, services, utilities
- **Integration Tests**: API endpoints and data flow
- **E2E Tests**: Complete user workflows
- **Current Coverage**: 85%+ across frontend and backend

### Running Tests

**Client Tests:**
```bash
cd client

# Run all tests
npm run test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

**Server Tests:**
```bash
cd server

# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

### Test Structure
```
tests/
├── unit/              # Unit tests
├── integration/       # Integration tests
├── e2e/              # End-to-end tests
├── mocks/            # Mock data and handlers
└── utils/            # Test utilities
```

---

## 🚀 Deployment

### Production Deployment (Vercel + Render)

**Frontend (Vercel):**
- Automatic deployments from `main` branch
- Serverless function support
- Global CDN distribution
- Environment variables configured in Vercel dashboard

**Backend (Render):**
- Deployed as a web service
- Automatic deployments from `main` branch
- Environment variables configured in Render dashboard
- MongoDB Atlas for production database

### Environment Variables (Production)

**Backend:**
```bash
NODE_ENV=production
PORT=5001
MONGODB_URI=your_production_mongodb_uri
JWT_SECRET=your_production_jwt_secret
NPS_API_KEY=your_nps_api_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENWEATHER_API_KEY=your_weather_api_key
EMAIL_USER=your_production_email
EMAIL_PASS=your_production_email_password
CLIENT_URL=https://www.nationalparksexplorerusa.com
```

**Frontend:**
```bash
VITE_API_URL=https://trailverse.onrender.com/api
REACT_APP_GA_TRACKING_ID=G-XXXXXXXXXX
VITE_APP_ENV=production
```

### Deployment Checklist
- [ ] Set all environment variables
- [ ] Configure MongoDB Atlas production cluster
- [ ] Set up domain DNS records
- [ ] Configure SSL certificates
- [ ] Enable security headers
- [ ] Set up monitoring and alerts
- [ ] Configure backup strategy
- [ ] Test API endpoints
- [ ] Verify email sending
- [ ] Test AI integration
- [ ] Check analytics tracking

---

## 📝 Available Scripts

### Root Scripts
```bash
npm run install:all      # Install all dependencies
npm run dev              # Start both frontend and backend
npm test                 # Run all tests
npm run test:coverage    # Run tests with coverage
```

### Client Scripts
```bash
npm run dev              # Start development server (Vite)
npm run build            # Build for production
npm run preview          # Preview production build
npm run test             # Run Vitest tests
npm run test:e2e         # Run Playwright E2E tests
npm run test:coverage    # Generate test coverage
```

### Server Scripts
```bash
npm run dev              # Start development server (Nodemon)
npm start                # Start production server
npm run seed             # Seed database with sample data
npm test                 # Run Jest tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate test coverage
```

---

## 🎨 Design System

### Brand Colors
- **Primary**: `#22c55e` (Forest Green) - Main brand color
- **Secondary**: `#0ea5e9` (Sky Blue) - Secondary actions
- **Accent**: `#f97316` (Orange) - Highlights and warnings
- **Success**: `#10b981` (Green) - Success states
- **Error**: `#ef4444` (Red) - Error states

### Typography
- **Headings**: Geist Sans (400-700)
- **Body**: Geist Sans (400-600)
- **Monospace**: Geist Mono (400-600)

### Design Principles
- **Mobile-First**: Responsive design starting from mobile
- **Accessibility**: WCAG 2.1 AA compliant
- **Performance**: Optimized for Core Web Vitals
- **Consistency**: Unified design system across all pages
- **Dark/Light Themes**: Full theme support with system preference

---

## 🔒 Security Features

- **Helmet.js** - Comprehensive security headers (CSP, XSS, etc.)
- **Rate Limiting** - API abuse prevention (100 req/15min)
- **CORS** - Whitelist-based cross-origin protection
- **JWT Authentication** - Secure token-based auth with expiration
- **Input Validation** - Express-validator on all endpoints
- **Password Hashing** - bcryptjs with 10 salt rounds
- **Email Verification** - Required for account activation
- **XSS Protection** - Content Security Policy
- **SQL Injection Protection** - Mongoose parameterized queries
- **File Upload Security** - Multer with file type validation
- **Environment Variables** - Sensitive data in .env files

---

## 📈 Performance Features

### Frontend Optimization
- **Code Splitting** - Lazy loading all routes
- **Image Optimization** - OptimizedImage component with lazy loading
- **Virtualized Lists** - Efficient rendering of large lists
- **Debouncing** - Input debouncing for API calls
- **TanStack Query** - Smart caching and data synchronization
- **Bundle Size** - Optimized with tree shaking
- **Web Vitals** - LCP < 2.5s, FID < 100ms, CLS < 0.1

### Backend Optimization
- **Multi-layer Caching**:
  - In-memory cache (node-cache)
  - Database query caching
  - CDN caching for static assets
- **Database Indexing** - Optimized queries
- **Compression** - Gzip compression for responses
- **Connection Pooling** - Efficient database connections
- **Rate Limiting** - Prevent API abuse

---

## 🌟 Unique Features

### AI Trip Planning
- **Dual AI Integration** - First platform with GPT-4 + Claude
- **Conversation Persistence** - Auto-save with debouncing
- **Feedback System** - Rate AI responses for improvement
- **Archive Management** - Organize trip conversations
- **Smart Recommendations** - Based on user history

### Comprehensive Park Data
- **Real-time Updates** - Live alerts and closures
- **Weather Integration** - Current + 5-day forecasts
- **Event Calendar** - Ranger programs and park events
- **Interactive Maps** - Leaflet with custom markers
- **Comparison Tools** - Side-by-side park analysis

### Community Features
- **Review System** - User reviews with images
- **Testimonials** - Community experiences
- **Blog Platform** - Expert content and guides
- **Social Sharing** - Share discoveries

---

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Guidelines
- Follow existing code style and conventions
- Write tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting
- Keep commits focused and descriptive

### Code Style
- Use ES6+ features
- Follow React best practices
- Use functional components and hooks
- Write meaningful comments for complex logic
- Keep functions small and focused

---

## 📞 Support & Contact

- **Website**: [nationalparksexplorerusa.com](https://www.nationalparksexplorerusa.com)
- **Email**: trailverseteam@gmail.com
- **Features**: [Explore All Features](https://www.nationalparksexplorerusa.com/features)
- **About**: [About the Creator](https://www.nationalparksexplorerusa.com/about)
- **GitHub Issues**: [Report a Bug](https://github.com/KrishnaSathvik/TrailVerse/issues)
- **Documentation**: Comprehensive guides in `/docs` folder

---

## 📄 License

© 2025 TrailVerse by Krishna Sathvik Mantripragada. All rights reserved.

This project is proprietary software. Unauthorized copying, modification, distribution, or use of this software, via any medium, is strictly prohibited without explicit permission from the author.

---

## 🙏 Acknowledgments

- **National Park Service** - For the comprehensive NPS Data API
- **OpenAI** - For GPT-4 API access
- **Anthropic** - For Claude API access
- **React Team** - For the amazing React library
- **Vite Team** - For the lightning-fast build tool
- **Open Source Community** - For all the incredible tools and libraries

---

## 📊 Project Stats

- **Lines of Code**: 50,000+
- **Components**: 100+
- **API Endpoints**: 50+
- **Test Coverage**: 85%+
- **Performance Score**: 95+ (Lighthouse)
- **Accessibility Score**: 100 (Lighthouse)
- **SEO Score**: 100 (Lighthouse)

---

**Ready to explore America's National Parks? Start your adventure with TrailVerse! 🏞️✨**

*Built with ❤️ by Krishna Sathvik Mantripragada - National Parks Enthusiast & Full-Stack Developer*

**Portfolio**: [Krishna's Portfolio](https://www.nationalparksexplorerusa.com/about)  
**Instagram**: [@astrobykrishna](https://instagram.com/astrobykrishna)  
**Unsplash**: [Astrophotography Portfolio](https://unsplash.com/@astrobykrishna)  
**Google Maps**: [Level 8 Local Guide](https://maps.app.goo.gl/V5vwTUzvBB19ZHM36) - 8,212 Reviews, 6,540 Photos
