# TrailVerse 🌲

> Your Universe of National Parks Exploration - AI-Powered Trip Planning & Discovery Platform

**Live Site:** [www.nationalparksexplorerusa.com](https://www.nationalparksexplorerusa.com)

[![Built with React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://reactjs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.1-47A248?logo=mongodb)](https://www.mongodb.com/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-4.1-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)

---

## 🏞️ About TrailVerse

TrailVerse is the **ultimate AI-powered platform** for exploring and planning trips to America's 470+ National Parks, Monuments, Historic Sites, and protected areas. Built with cutting-edge technologies, it combines advanced AI integration, comprehensive park data, vibrant community features, and expert content - all in one seamless experience.

### 🎯 What Makes TrailVerse Unique

- **Dual AI Integration** - First platform offering both OpenAI GPT-4 and Anthropic Claude for trip planning
- **Real-time Conversation Persistence** - Auto-save with version conflict resolution and database synchronization
- **Comprehensive Park Data** - Official NPS API integration with real-time updates
- **Advanced Caching System** - Multi-layer caching with smart prefetching and TanStack Query
- **Community-Driven** - Reviews with image uploads, testimonials, and shared experiences
- **Performance First** - Optimized for speed with lazy loading, code splitting, and 95+ Lighthouse score
- **Enhanced Blog Platform** - Rich blog with related posts, comments, likes, and image optimization
- **Smart Profile Management** - Comprehensive user profiles with avatar selection, visited parks tracking, and favorites
- **LocalStorage Monitoring** - Automatic cleanup and monitoring to prevent quota issues

---

## ✨ Key Features

### 🤖 AI-Powered Trip Planning
- **Dual AI Providers**: Seamless integration with OpenAI GPT-4 and Anthropic Claude
- **Conversational Interface**: Multi-turn chat with context awareness and streaming responses
- **Smart Auto-Save**: Real-time conversation persistence with debouncing and database sync
- **Feedback System**: Rate AI responses (thumbs up/down) for continuous improvement
- **Trip Archive Management**: Archive and restore previous trip conversations with auto-tab switching
- **Token Management**: Daily usage limits and tracking to prevent API abuse
- **Personalized Recommendations**: AI suggestions based on user preferences, visited parks, and season
- **Provider Switching**: Seamlessly switch between AI providers mid-conversation
- **Trip History**: View all past trip plans with filters for active and archived trips
- **Unique Parks Counter**: Track the number of unique parks discussed across all trips

### 🗺️ Park Exploration & Discovery
- **All 470+ Park Units**: Complete database with official NPS API integration covering National Parks, Monuments, Historic Sites, and more
- **Interactive Maps**: Google Maps JavaScript API with platform-specific features:
  - **All Devices**: Park markers with click details, search functionality, zoom controls
  - **Desktop Only**: Google Places (nearby restaurants, lodging, gas stations), Route planning with directions, Distance calculations
  - **Mobile**: Smooth map browsing with park markers and search
  - Animated park markers with drop + pulse animations
  - Embedded maps on park detail pages
  - Static map fallback for offline/errors
- **Advanced Filtering**: Filter by state, activities, features, amenities, and difficulty
- **Park Comparison**: Side-by-side comparison of multiple parks with detailed metrics
- **Detailed Park Pages**: Comprehensive information including:
  - Activities and experiences
  - Real-time alerts and closures
  - Current weather conditions and 5-day forecasts
  - User reviews with images (up to 5 per review)
  - Park events and ranger programs
  - Photo galleries and virtual tours
  - Quick info cards with essential details
- **Smart Search**: Fuzzy search with autocomplete and suggestions
- **Virtualized Lists**: Efficient rendering of large park lists
- **Enhanced Park Service**: Optimized caching and batch processing for park data

### 🎯 User Management & Personalization
- **Secure Authentication**: JWT-based auth with email verification and password reset
- **Email Verification**: Required email confirmation for account security
- **User Profiles**: Customizable profiles with:
  - Avatar selection (1000+ unique combinations from 26 visual styles and 40+ color themes)
  - Random avatar generator with travel-themed designs
  - Custom photo upload option
  - Bio and personal information
  - Park visit tracking with dates and memories
  - Favorites collections for parks, blogs, and events
  - Profile editing with real-time updates
- **Saved Parks**: Bookmark parks with personal notes and visit dates
- **Visited Parks Tracking**: Record parks you've visited with dates and memories
- **Trip History Management**: Comprehensive record of past and planned trips
- **Favorites System**: Save parks, blogs, events, and reviews with organized tabs
- **Archive System**: Archive completed trips with one-click restore
- **Email Preferences**: Manage blog post notifications and email subscriptions
- **Privacy & Security**: 
  - Change password functionality
  - Account deletion with confirmation
  - Secure data handling

### 📝 Content Management System
- **Rich Blog Platform**: Admin-managed blog with advanced features:
  - TinyMCE rich text editor with media upload
  - Featured images with Sharp.js optimization
  - Related posts by category with smart suggestions
  - Reading time calculation
  - Like and favorite functionality
  - Comment system with nested replies
  - Author attribution and timestamps
- **Content Categories**: 
  - Trip Planning
  - Park Guides
  - Wildlife & Nature
  - Photography
  - Hiking & Trails
  - Camping & Gear
  - History & Culture
  - Conservation
  - Tips & News
- **SEO Optimization**: Automatic meta tags, structured data, and sitemap generation
- **Image Handling**: Secure upload with Sharp.js optimization, WebP conversion, and responsive sizes
- **Content Scheduling**: Publish and schedule blog posts with draft management
- **Blog Prose Styling**: Custom typography and styling for rich content display

### 💬 Community Features
- **Park Reviews**: User-generated reviews with:
  - Star ratings (1-5)
  - Written reviews with rich text
  - Image uploads (up to 5 per review) with preview
  - Edit/delete own reviews
  - Helpful voting system
  - Review statistics and filtering
- **Testimonials Management**: Community experiences with:
  - Admin moderation and approval
  - User testimonial submissions
  - Display on homepage and testimonials page
- **Comment System**: Blog post engagement with:
  - Nested replies support
  - Like functionality
  - Edit and delete options
  - Real-time comment counts
- **Events Calendar**: 
  - Park events and ranger programs from NPS API
  - Filter by park, date, and category
  - Save events to profile
  - Event details with descriptions and times
- **Social Sharing**: Share parks, blogs, and experiences on social media
- **User Avatars**: 1000+ avatar combinations (26 visual styles × 40+ color themes) with random generator or custom upload

### 🔧 Advanced Features
- **Real-time Weather**: Current conditions and 5-day forecasts for all parks via OpenWeather API
- **Google Maps Integration**:
  - Interactive maps with Google Maps JavaScript API
  - Search-first design with Places Autocomplete
  - Animated markers with drop and pulse effects
  - Nearby essentials (restaurants, lodging, gas stations)
  - Place details with photos, ratings, and hours
  - Route building with distance and duration
  - Directions and navigation
  - Cost-optimized with aggressive caching (3-day place details, 30-day photos)
- **Performance Monitoring**: 
  - Web Vitals tracking (LCP, FID, CLS)
  - Performance metrics dashboard in admin panel
  - Error tracking and reporting
  - Client-side performance monitor
- **Google Analytics 4**: 
  - Custom event tracking
  - User behavior analysis
  - Conversion tracking
  - Page view analytics
- **Professional Email System** (Resend):
  - Welcome emails with branded templates
  - Email verification with secure tokens
  - Password reset with time-limited links
  - Blog post notifications with rich HTML
  - Admin notifications for new user signups
  - Unsubscribe functionality
  - Email tracking with tags and categories
  - Handlebars templating system
  - Automatic retry and delivery optimization
- **WebSocket Support**: Real-time features and live updates (Socket.io)
- **Multi-layer Caching**: 
  - Browser cache (localStorage/sessionStorage)
  - TanStack Query cache with optimized settings
  - Service worker cache (PWA-ready)
  - Backend node-cache for API responses
  - Enhanced caching service with batch processing
- **Rate Limiting**: Smart throttling to prevent API abuse (100 req/15min)
- **Security Headers**: Comprehensive security with Helmet.js and CSP
- **Cookie Consent**: GDPR-compliant cookie management with user preferences
- **Theme System**: Light, Dark, and System preference themes with smooth transitions
- **Responsive Design**: Mobile-first approach with all breakpoints (sm, md, lg, xl, 2xl)
- **Accessibility**: WCAG 2.1 AA compliant with screen reader support
- **Error Boundaries**: Graceful error handling with fallback UI
- **Loading States**: Skeleton screens and optimistic updates
- **LocalStorage Monitor**: Automatic monitoring and cleanup to prevent quota issues
- **Smart Prefetching**: Intelligent prefetching of park data for faster navigation

### 🛡️ Admin Dashboard
- **Analytics Dashboard**: Platform-wide statistics and insights
- **User Management**: View and manage user accounts with user details
- **Blog Management**: 
  - Create, edit, and delete blog posts
  - Rich text editor with media upload
  - Draft and publish functionality
  - Featured image management
- **Testimonials Management**: Approve, edit, or reject testimonials
- **Performance Monitoring**: 
  - Real-time performance metrics
  - Web Vitals tracking
  - Error logs and debugging
- **Settings Management**: Configure platform settings and preferences
- **Content Moderation**: Review and moderate user-generated content
- **Secure Admin Authentication**: Separate admin login with role-based access

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 20+** (LTS recommended)
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
   # Install frontend dependencies
   cd next-frontend
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
   
   # Email Configuration (Resend)
   RESEND_API_KEY=re_your_resend_api_key
   EMAIL_FROM_NAME=TrailVerse
   EMAIL_FROM_ADDRESS=noreply@yourdomain.com
   SUPPORT_EMAIL=support@yourdomain.com
   ADMIN_EMAIL=your_admin_email@gmail.com
   
   # Google Maps API
   GMAPS_SERVER_KEY=your_server_api_key_ip_restricted
   
   # Client URL
   CLIENT_URL=http://localhost:3000
   ```

   **Frontend (`next-frontend/.env.local`):**
   ```bash
   # API Configuration
   NEXT_PUBLIC_API_URL=http://localhost:5001/api

   # External APIs
   NEXT_PUBLIC_NPS_API_KEY=your_nps_api_key_here

   # Google Maps API
   NEXT_PUBLIC_GMAPS_WEB_KEY=your_web_api_key_referrer_restricted

   # Analytics
   NEXT_PUBLIC_GA_TRACKING_ID=G-XXXXXXXXXX

   # Application
   NEXT_PUBLIC_APP_NAME=TrailVerse
   NEXT_PUBLIC_APP_URL=http://localhost:3000

   # Environment
   NEXT_PUBLIC_APP_ENV=development
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
   cd next-frontend
   npm run dev
   ```
   Frontend will start at: **http://localhost:3000**

5. **Access the application:**
   - **Frontend**: http://localhost:3000
   - **Backend API**: http://localhost:5001/api
   - **API Health Check**: http://localhost:5001/health

---

## 📁 Project Structure

```
TrailVerse/
├── next-frontend/                # Next.js frontend
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
│   │   │   │   ├── LikeFavorite.jsx
│   │   │   │   └── RelatedPosts.jsx
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
│   │   │   │   ├── InteractiveMap.jsx
│   │   │   │   ├── MobileMap.jsx
│   │   │   │   ├── ParkMap.jsx
│   │   │   │   ├── MapErrorBoundary.jsx
│   │   │   │   └── StaticMapFallback.jsx
│   │   │   ├── park-details/    # Park detail views
│   │   │   │   ├── ParkHero.jsx
│   │   │   │   ├── ParkTabs.jsx
│   │   │   │   ├── QuickInfoCard.jsx
│   │   │   │   ├── AlertBanner.jsx
│   │   │   │   ├── WeatherWidget.jsx
│   │   │   │   └── ReviewSection.jsx
│   │   │   ├── plan-ai/         # AI trip planning
│   │   │   │   ├── TripPlannerChat.jsx
│   │   │   │   └── TripForm.jsx
│   │   │   ├── profile/         # User profile
│   │   │   │   ├── AvatarSelector.jsx
│   │   │   │   ├── SavedParks.jsx
│   │   │   │   ├── VisitedParks.jsx
│   │   │   │   ├── SavedEvents.jsx
│   │   │   │   ├── FavoriteBlogs.jsx
│   │   │   │   ├── TripHistoryList.jsx
│   │   │   │   ├── TripSummaryCard.jsx
│   │   │   │   ├── UserReviews.jsx
│   │   │   │   └── UserTestimonials.jsx
│   │   │   ├── reviews/         # Review system
│   │   │   │   ├── ReviewFormWithImages.jsx
│   │   │   │   ├── ReviewSection.jsx
│   │   │   │   └── ReviewCard.jsx
│   │   │   ├── testimonials/    # Testimonials
│   │   │   │   ├── TestimonialCard.jsx
│   │   │   │   └── TestimonialForm.jsx
│   │   │   └── park-details/    # Park detail components
│   │   │       └── EmbeddedParkMap.jsx
│   │   ├── pages/               # Page components
│   │   │   ├── LandingPage.jsx
│   │   │   ├── FeaturesPage.jsx
│   │   │   ├── ExploreParksPage.jsx
│   │   │   ├── ParkDetailPage.jsx
│   │   │   ├── MapPage.jsx
│   │   │   ├── MapPageWrapper.jsx (responsive map)
│   │   │   ├── MobileMapPage.jsx
│   │   │   ├── ComparePage.jsx
│   │   │   ├── PlanAIPage.jsx
│   │   │   ├── EventsPage.jsx
│   │   │   ├── BlogPage.jsx
│   │   │   ├── BlogPostPage.jsx
│   │   │   ├── ProfilePage.jsx
│   │   │   ├── TestimonialsPage.jsx
│   │   │   ├── TestParkPage.jsx
│   │   │   ├── AboutPage.jsx
│   │   │   ├── FAQPage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   ├── SignupPage.jsx
│   │   │   ├── ForgotPasswordPage.jsx
│   │   │   ├── ResetPasswordPage.jsx
│   │   │   ├── VerifyEmailPage.jsx
│   │   │   ├── UnsubscribePage.jsx
│   │   │   ├── PrivacyPage.jsx
│   │   │   ├── TermsPage.jsx
│   │   │   ├── NotFoundPage.jsx
│   │   │   └── admin/           # Admin pages
│   │   │       ├── AdminDashboard.jsx
│   │   │       ├── AdminLoginPage.jsx
│   │   │       ├── AdminUsersPage.jsx
│   │   │       ├── AdminPerformancePage.jsx
│   │   │       ├── AdminSettingsPage.jsx
│   │   │       ├── CreateBlogPage.jsx
│   │   │       └── EditBlogPage.jsx
│   │   ├── services/            # API services (32 services)
│   │   │   ├── enhancedApi.js   # Enhanced API with caching
│   │   │   ├── aiService.js
│   │   │   ├── authService.js
│   │   │   ├── tripService.js
│   │   │   ├── tripHistoryService.js
│   │   │   ├── blogService.js
│   │   │   ├── reviewService.js
│   │   │   ├── favoriteService.js
│   │   │   ├── cacheService.js
│   │   │   ├── globalCacheManager.js
│   │   │   ├── analyticsService.js
│   │   │   ├── commentService.js
│   │   │   ├── conversationService.js
│   │   │   ├── enhancedParkService.js
│   │   │   ├── eventService.js
│   │   │   ├── feedbackService.js
│   │   │   ├── imageUploadService.js
│   │   │   ├── npsApi.js
│   │   │   ├── performanceMonitor.js
│   │   │   ├── savedEventsService.js
│   │   │   ├── smartPrefetchService.js
│   │   │   ├── statsService.js
│   │   │   ├── testimonialService.js
│   │   │   ├── userService.js
│   │   │   ├── weatherService.ts
│   │   │   ├── websocketService.js
│   │   │   ├── googlePlacesService.js
│   │   │   └── batchService.js
│   │   ├── lib/                 # Utility libraries
│   │   │   ├── loadMaps.js      # Google Maps loader
│   │   │   └── pins.js          # Animated pin builder
│   │   ├── context/             # React contexts
│   │   │   ├── AuthContext.jsx
│   │   │   ├── ToastContext.jsx
│   │   │   └── ThemeContext.jsx
│   │   ├── hooks/               # Custom hooks (15 hooks)
│   │   │   ├── useTrips.js
│   │   │   ├── useParks.js
│   │   │   ├── useEnhancedParks.js
│   │   │   ├── useFavorites.js
│   │   │   ├── useReviews.js
│   │   │   ├── useUserReviews.js
│   │   │   ├── useParkRatings.js
│   │   │   ├── useVisitedParks.js
│   │   │   ├── useSavedEvents.js
│   │   │   ├── useEvents.js
│   │   │   ├── useDebounce.js
│   │   │   ├── useWebSocket.js
│   │   │   ├── useThemeClasses.js
│   │   │   ├── useAnalytics.js
│   │   │   ├── useSmartPrefetch.js
│   │   │   └── useResourceHints.js
│   │   ├── utils/               # Utility functions (10 utils)
│   │   │   ├── analytics.js
│   │   │   ├── cacheUtils.js
│   │   │   ├── validation.js
│   │   │   ├── avatarGenerator.js
│   │   │   ├── dateUtils.js
│   │   │   ├── formatters.js
│   │   │   ├── imageUtils.js
│   │   │   ├── localStorageMonitor.js
│   │   │   ├── parkUtils.js
│   │   │   └── urlUtils.js
│   │   └── styles/              # Global styles
│   │       ├── index.css
│   │       ├── themes.css
│   │       └── blog-prose.css
│   ├── public/                  # Static assets
│   │   ├── images/
│   │   ├── favicon files
│   │   ├── manifest.json
│   │   ├── robots.txt
│   │   ├── sitemap.xml
│   │   └── 12 background images
│   ├── tests/                   # Test files
│   │   └── e2e/                 # E2E tests (Playwright)
│   ├── vitest.config.mjs        # Vitest configuration
│   ├── playwright.config.js     # Playwright configuration
│   └── package.json
│
├── server/                      # Node.js backend (Express)
│   ├── src/
│   │   ├── config/              # Configuration
│   │   │   ├── database.js
│   │   │   └── validateEnv.js
│   │   ├── controllers/         # Route controllers (19 controllers)
│   │   │   ├── authController.js
│   │   │   ├── aiController.js
│   │   │   ├── tripController.js
│   │   │   ├── parkController.js
│   │   │   ├── enhancedParkController.js
│   │   │   ├── blogController.js
│   │   │   ├── reviewController.js
│   │   │   ├── favoriteController.js
│   │   │   ├── adminController.js
│   │   │   ├── analyticsController.js
│   │   │   ├── aiAnalyticsController.js
│   │   │   ├── commentController.js
│   │   │   ├── conversationController.js
│   │   │   ├── eventController.js
│   │   │   ├── feedbackController.js
│   │   │   ├── imageUploadController.js
│   │   │   ├── statsController.js
│   │   │   ├── testimonialController.js
│   │   │   └── userController.js
│   │   ├── middleware/          # Custom middleware (5 middleware)
│   │   │   ├── auth.js          # Authentication
│   │   │   ├── cache.js         # Caching
│   │   │   ├── tokenLimits.js   # Rate limiting
│   │   │   ├── analytics.js     # Analytics tracking
│   │   │   └── errorHandler.js  # Error handling
│   │   ├── models/              # MongoDB models (13 models)
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
│   │   │   ├── Analytics.js
│   │   │   ├── EmailPreference.js
│   │   │   └── SavedEvent.js
│   │   ├── routes/              # API routes (23 routes)
│   │   │   ├── auth.js
│   │   │   ├── ai.js
│   │   │   ├── trips.js
│   │   │   ├── parks.js
│   │   │   ├── enhancedParks.js
│   │   │   ├── blogs.js
│   │   │   ├── reviews.js
│   │   │   ├── favorites.js
│   │   │   ├── admin.js
│   │   │   ├── health.js
│   │   │   ├── sitemap.js
│   │   │   ├── comments.js
│   │   │   ├── conversations.js
│   │   │   ├── events.js
│   │   │   ├── feedback.js
│   │   │   ├── images.js
│   │   │   ├── stats.js
│   │   │   ├── testimonials.js
│   │   │   ├── users.js
│   │   │   ├── userRoutes.js
│   │   │   ├── emailRoutes.js
│   │   │   ├── analytics.js
│   │   │   └── gmaps.js (Google Maps proxy endpoints)
│   │   ├── services/            # Business logic (14 services)
│   │   │   ├── openaiService.js
│   │   │   ├── claudeService.js
│   │   │   ├── npsService.js
│   │   │   ├── emailService.js
│   │   │   ├── resendEmailService.js (Resend integration)
│   │   │   ├── schedulerService.js
│   │   │   ├── websocketService.js
│   │   │   ├── factsService.js
│   │   │   ├── aiService.js
│   │   │   ├── analyticsService.js
│   │   │   ├── blogService.js
│   │   │   ├── imageService.js
│   │   │   ├── tripService.js
│   │   │   └── weatherService.js
│   │   └── utils/               # Server utilities
│   │       └── generateToken.js
│   ├── templates/               # Email templates (8 templates)
│   │   └── emails/
│   │       ├── welcome.html
│   │       ├── passwordReset.html
│   │       ├── blogNotification.html
│   │       ├── verifyEmail.html
│   │       ├── unsubscribe.html
│   │       ├── tripReminder.html
│   │       ├── newsletter.html
│   │       └── base.html
│   ├── scripts/                 # Database scripts (8 scripts)
│   │   ├── seed.js
│   │   ├── makeAdmin.js
│   │   ├── migrate.js
│   │   ├── migrate-reviews.js
│   │   ├── migrate-email-preferences.js
│   │   ├── setup-email-system.js
│   │   ├── backup.js
│   │   ├── restore.js
│   │   └── db-manager.js
│   ├── tests/                   # Test files
│   │   ├── unit/
│   │   └── integration/
│   ├── jest.config.js           # Jest configuration
│   ├── server.js                # Entry point
│   └── package.json
│
├── docs/                        # Documentation (160+ files)
│   ├── CLEANUP_COMPLETED.md
│   ├── UNUSED_FILES_ANALYSIS.md
│   ├── PROJECT_CLEANUP_REPORT.md
│   ├── DATABASE_MANAGEMENT.md
│   ├── MAPS_FINAL_STATUS.txt
│   ├── REVIEW_IMAGE_UPLOAD_GUIDE.md
│   └── [157+ more documentation files]
│
├── scripts/                     # Project scripts
│   ├── rebrand-to-trailverse.sh
│   └── remove-console-logs.js
│
├── .gitignore
├── package.json                 # Root package.json
├── setup.sh
├── CLEANUP_SUMMARY.md
└── README.md                    # This file
```

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 16** - App Router frontend with SSR, routing, and bundling
- **React 19** - UI library for interactive components
- **Tailwind CSS 4.1** - Utility-first CSS framework with custom design system
- **TanStack Query 5.95** - Server state management, caching, and synchronization
- **Socket.io Client 4.8** - Real-time WebSocket communication for live sync
- **Phosphor Icons 2.1** - Icon library used by the Next frontend
- **Axios 1.14** - Promise-based HTTP client with interceptors
- **React GA4 3.0** - Google Analytics 4 integration
- **React Markdown 10.1** - Markdown rendering for blog content

### Backend
- **Node.js 20+** - JavaScript runtime with ES modules
- **Express.js 4.18** - Fast, unopinionated web framework
- **MongoDB 8.1** - NoSQL document database
- **Mongoose 8.1** - Elegant MongoDB ODM with schemas
- **JWT 9.0** - JSON Web Tokens for authentication
- **bcryptjs 2.4** - Password hashing with salt rounds
- **Helmet 7.1** - Security headers middleware
- **CORS 2.8** - Cross-origin resource sharing
- **Morgan 1.10** - HTTP request logging
- **Socket.io 4.8** - Real-time bidirectional communication
- **Nodemailer 6.10** - Email sending with templates
- **Multer 2.0** - File upload handling
- **Sharp 0.34** - Image processing and optimization
- **Node-cache 5.1** - In-memory caching
- **Express-validator 7.0** - Input validation and sanitization
- **Express-rate-limit 7.5** - Rate limiting middleware
- **Compression 1.8** - Response compression (gzip)

### AI & External APIs
- **OpenAI GPT-4** - Primary AI provider for trip planning
- **Anthropic Claude (SDK 0.65)** - Secondary AI provider with streaming
- **NPS Data API** - Official National Parks Service data
- **OpenWeather API** - Real-time weather data and forecasts
- **Google Analytics 4** - User behavior analytics
- **Resend 6.1** - Professional email service with templates and tracking
- **Google Maps JavaScript API** - Interactive maps with Places API integration
- **Google Places API** - Nearby restaurants, lodging, and gas stations
- **Google Directions API** - Route building and navigation

### Development & Testing
- **Vitest 3.2** - Fast unit testing framework for the Next frontend
- **Testing Library 16.3** - Component testing utilities
- **Playwright 1.58** - End-to-end testing automation
- **Jest 29.7** - Server-side testing framework
- **ESLint** - Code linting and style enforcement
- **MSW 2.6** - API mocking for tests
- **Supertest 7.0** - HTTP assertions
- **MongoDB Memory Server 10.1** - In-memory MongoDB for testing

---

## 🔑 Required API Keys

### Essential APIs
1. **NPS Data API** (Required)
   - Get API Key: [NPS Developer Portal](https://www.nps.gov/subjects/developer/get-started.htm)
   - Free tier: 1000 requests/hour
   - Used for: Park data, events, alerts, ranger programs

2. **OpenAI API** (Required for AI features)
   - Get API Key: [OpenAI Platform](https://platform.openai.com/api-keys)
   - Pay-as-you-go pricing
   - Used for: GPT-4 trip planning AI

3. **Anthropic Claude** (Optional - AI backup)
   - Get API Key: [Anthropic Console](https://console.anthropic.com/)
   - Pay-as-you-go pricing
   - Used for: Alternative AI provider with streaming

### Optional APIs
4. **OpenWeather API** (Optional)
   - Get API Key: [OpenWeather](https://openweathermap.org/api)
   - Free tier: 1000 calls/day
   - Used for: Weather data and forecasts

5. **Google Analytics** (Optional)
   - Setup: [Analytics Console](https://analytics.google.com/)
   - Free
   - Used for: User analytics and behavior tracking

6. **Resend Email API** (Required for emails)
   - Get API Key: [Resend Console](https://resend.com/)
   - Free tier: 100 emails/day (3,000/month)
   - Used for: Transactional emails and notifications

7. **Google Maps APIs** (Required for maps)
   - Setup: [Google Cloud Console](https://console.cloud.google.com/)
   - APIs needed: Maps JavaScript, Places, Directions
   - Cost: Free tier includes $200 monthly credit
   - Used for: Interactive maps and nearby places

---

## 📊 API Endpoints

### Authentication & User Management
```
POST   /api/auth/signup              # User registration with email verification
POST   /api/auth/login               # User login with JWT
POST   /api/auth/forgot-password     # Password reset request
POST   /api/auth/reset-password      # Password reset confirmation
GET    /api/auth/verify-email/:token # Email verification
GET    /api/auth/me                  # Get current user profile
PUT    /api/users/profile            # Update user profile
PUT    /api/users/avatar             # Update user avatar
PUT    /api/users/password           # Change password
DELETE /api/users/account            # Delete account
GET    /api/users/:id                # Get user by ID
GET    /api/users/stats              # Get user statistics
```

### Parks & Data
```
GET    /api/parks                    # Get all parks with filtering
GET    /api/parks/:parkCode          # Get detailed park info
GET    /api/parks/:parkCode/events   # Get park events
GET    /api/parks/:parkCode/weather  # Get park weather
GET    /api/parks/search             # Search parks
POST   /api/parks/compare            # Compare multiple parks
GET    /api/enhanced-parks           # Enhanced park data with caching
GET    /api/enhanced-parks/:parkCode # Enhanced park details
POST   /api/enhanced-parks/batch     # Batch park data requests
```

### AI Services
```
POST   /api/ai/chat                  # AI chat endpoint with streaming
POST   /api/ai/plan-trip             # Generate trip plan
GET    /api/ai/conversations         # Get conversation history
GET    /api/ai/conversations/:id     # Get specific conversation
PUT    /api/ai/conversations/:id     # Update conversation
DELETE /api/ai/conversations/:id     # Delete conversation
POST   /api/feedback                 # Submit AI feedback
GET    /api/ai/analytics             # AI usage analytics
```

### Trip Management
```
GET    /api/trips                    # Get user trips (active and archived)
POST   /api/trips                    # Create new trip
GET    /api/trips/:id                # Get trip details
PUT    /api/trips/:id                # Update trip
DELETE /api/trips/:id                # Delete trip
PUT    /api/trips/:id/archive        # Archive trip
PUT    /api/trips/:id/restore        # Restore archived trip
GET    /api/trips/stats              # Get trip statistics
```

### Favorites & Collections
```
GET    /api/favorites                # Get user favorites
POST   /api/favorites                # Add to favorites (parks, blogs, events)
DELETE /api/favorites/:id            # Remove from favorites
GET    /api/favorites/parks          # Get favorite parks
GET    /api/favorites/blogs          # Get favorite blogs
GET    /api/favorites/events         # Get favorite events
GET    /api/favorites/stats          # Get favorites statistics
```

### Content Management
```
GET    /api/blogs                    # Get blog posts with pagination
GET    /api/blogs/:slug              # Get blog post by slug
POST   /api/blogs                    # Create blog (admin)
PUT    /api/blogs/:id                # Update blog (admin)
DELETE /api/blogs/:id                # Delete blog (admin)
GET    /api/blogs/categories         # Get categories
POST   /api/blogs/:id/like           # Like blog post
POST   /api/blogs/:id/favorite       # Favorite blog post
GET    /api/blogs/:id/related        # Get related posts
```

### Reviews & Community
```
GET    /api/reviews                  # Get park reviews
GET    /api/reviews/park/:parkCode   # Get reviews for specific park
POST   /api/reviews                  # Submit review with images
PUT    /api/reviews/:id              # Update review
DELETE /api/reviews/:id              # Delete review
GET    /api/reviews/user             # Get user reviews
POST   /api/reviews/:id/helpful      # Mark review helpful
POST   /api/reviews/:id/images       # Upload review images
```

### Comments
```
GET    /api/comments/:postId         # Get comments for post
POST   /api/comments                 # Create comment
PUT    /api/comments/:id             # Update comment
DELETE /api/comments/:id             # Delete comment
POST   /api/comments/:id/like        # Like comment
POST   /api/comments/:id/reply       # Reply to comment
```

### Events
```
GET    /api/events                   # Get park events
GET    /api/events/:eventId          # Get event details
POST   /api/events/save              # Save event to profile
DELETE /api/events/save/:eventId     # Remove saved event
GET    /api/events/saved             # Get user saved events
```

### Testimonials
```
GET    /api/testimonials             # Get approved testimonials
POST   /api/testimonials             # Submit testimonial
PUT    /api/testimonials/:id         # Update testimonial (admin)
DELETE /api/testimonials/:id         # Delete testimonial (admin)
```

### Admin Endpoints
```
GET    /api/admin/dashboard          # Dashboard analytics
GET    /api/admin/users              # User management
GET    /api/admin/users/:id          # Get user details
PUT    /api/admin/users/:id          # Update user (admin)
DELETE /api/admin/users/:id          # Delete user (admin)
GET    /api/admin/stats              # Platform statistics
GET    /api/admin/analytics          # Advanced analytics
POST   /api/admin/blog               # Blog management
PUT    /api/admin/testimonials/:id   # Testimonial moderation
GET    /api/admin/performance        # Performance metrics
```

### Email Management
```
POST   /api/email/preferences        # Update email preferences
GET    /api/email/preferences        # Get email preferences
POST   /api/email/unsubscribe        # Unsubscribe from emails
POST   /api/email/subscribe          # Subscribe to emails
```

### Health & Monitoring
```
GET    /health                       # API health check
GET    /api/health/db                # Database health
GET    /api/sitemap.xml              # SEO sitemap
GET    /api/stats                    # Platform statistics
```

---

## 🧪 Testing

### Test Coverage
- **Unit Tests**: Components, services, utilities
- **Integration Tests**: API endpoints and data flow
- **E2E Tests**: Complete user workflows
- **Current Coverage**: 85%+ across frontend and backend

### Running Tests

**Frontend Tests:**
```bash
cd next-frontend

# Run all tests
npm run test

# Run in watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e

# Run E2E tests headed
npm run test:e2e:headed
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
├── unit/              # Unit tests for components and services
├── integration/       # Integration tests for API endpoints
├── e2e/              # End-to-end tests with Playwright
├── mocks/            # Mock data and MSW handlers
└── utils/            # Test utilities and helpers
```

---

## 🚀 Deployment

### Production Deployment (Vercel + Render)

**Frontend (Vercel):**
- Automatic deployments from `main` branch
- Serverless function support
- Global CDN distribution
- Environment variables configured in Vercel dashboard
- Custom domain with SSL

**Backend (Render):**
- Deployed as a web service
- Automatic deployments from `main` branch
- Environment variables configured in Render dashboard
- MongoDB Atlas for production database
- Auto-scaling and health checks

### Environment Variables (Production)

**Backend:**
```bash
NODE_ENV=production
PORT=5001
MONGODB_URI=your_production_mongodb_uri
JWT_SECRET=your_production_jwt_secret
UPLOADS_DIR=/var/data/trailverse-uploads
NPS_API_KEY=your_nps_api_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENWEATHER_API_KEY=your_weather_api_key
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM_NAME=TrailVerse
EMAIL_FROM_ADDRESS=noreply@nationalparksexplorerusa.com
ADMIN_EMAIL=admin@nationalparksexplorerusa.com
GMAPS_SERVER_KEY=your_production_server_key
CLIENT_URL=https://www.nationalparksexplorerusa.com
```

For production image uploads, `UPLOADS_DIR` should point to a persistent disk mount. If uploads stay on the app container filesystem, deploys or instance replacement can leave database URLs pointing at files that no longer exist.

**Frontend:**
```bash
NEXT_PUBLIC_API_URL=https://trailverse.onrender.com/api
NEXT_PUBLIC_GA_TRACKING_ID=G-XXXXXXXXXX
NEXT_PUBLIC_GMAPS_WEB_KEY=your_production_web_key
NEXT_PUBLIC_APP_ENV=production
```

### Deployment Checklist
- [x] Set all environment variables
- [x] Configure MongoDB Atlas production cluster
- [x] Set up domain DNS records
- [x] Configure SSL certificates
- [x] Enable security headers
- [x] Set up monitoring and alerts
- [x] Configure backup strategy
- [x] Test API endpoints
- [x] Verify email sending
- [x] Test AI integration
- [x] Check analytics tracking
- [x] Optimize build for production
- [x] Enable compression
- [x] Configure CDN

---

## 📝 Available Scripts

### Root Scripts
```bash
npm run dev               # Start frontend and backend together
npm run dev:frontend      # Start Next.js frontend
npm run dev:backend       # Start backend
npm run start             # Start Next.js production server
npm run build             # Build frontend for production
npm run build:ci          # Build with CI environment
npm test                  # Run frontend unit tests
npm run e2e               # Run E2E tests
npm run e2e:headed        # Run E2E tests headed
npm run lint              # Lint code
```

### Frontend Scripts
```bash
npm run dev               # Start development server (Next.js)
npm run build             # Build for production
npm run start             # Start production build
npm run test              # Run Vitest tests with coverage
npm run test:watch        # Run Vitest in watch mode
npm run test:e2e          # Run Playwright E2E tests
```

### Server Scripts
```bash
npm run dev               # Start development server (Nodemon)
npm start                 # Start production server
npm run seed              # Seed database with sample data
npm test                  # Run Jest tests
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Generate test coverage
npm run test:email        # Test email system
npm run setup:email       # Setup email system
npm run preview:email     # Preview blog email
npm run migrate:email     # Migrate email preferences
```

---

## 🎨 Design System

### Brand Colors
- **Primary**: `#22c55e` (Forest Green) - Main brand color for actions
- **Secondary**: `#0ea5e9` (Sky Blue) - Secondary actions and links
- **Accent**: `#f97316` (Orange) - Highlights and warnings
- **Success**: `#10b981` (Green) - Success states and confirmations
- **Error**: `#ef4444` (Red) - Error states and alerts
- **Warning**: `#f59e0b` (Amber) - Warning messages
- **Info**: `#3b82f6` (Blue) - Informational messages

### Typography
- **Headings**: Geist Sans (400-700)
- **Body**: Geist Sans (400-600)
- **Monospace**: Geist Mono (400-600)
- **Line Height**: 1.5 for body, 1.2 for headings
- **Font Sizes**: Responsive scale from text-xs to text-4xl

### Design Principles
- **Mobile-First**: Responsive design starting from mobile (320px)
- **Accessibility**: WCAG 2.1 AA compliant with proper contrast
- **Performance**: Optimized for Core Web Vitals (LCP < 2.5s, FID < 100ms, CLS < 0.1)
- **Consistency**: Unified design system across all pages
- **Dark/Light Themes**: Full theme support with system preference detection
- **Smooth Transitions**: 300ms transitions for interactive elements
- **Loading States**: Skeleton screens and loading indicators

---

## 🔒 Security Features

- **Helmet.js** - Comprehensive security headers (CSP, XSS, HSTS, etc.)
- **Rate Limiting** - API abuse prevention (100 req/15min per IP)
- **CORS** - Whitelist-based cross-origin protection
- **JWT Authentication** - Secure token-based auth with 30-day expiration
- **Input Validation** - Express-validator on all endpoints
- **Password Hashing** - bcryptjs with 10 salt rounds
- **Email Verification** - Required for account activation
- **XSS Protection** - Content Security Policy and sanitization
- **SQL Injection Protection** - Mongoose parameterized queries
- **File Upload Security** - Multer with file type and size validation
- **Environment Variables** - Sensitive data in .env files (not committed)
- **HTTPS Only** - Force HTTPS in production
- **Secure Cookies** - HttpOnly and Secure flags on cookies
- **CSRF Protection** - Token-based CSRF prevention

---

## 📈 Performance Features

### Frontend Optimization
- **Code Splitting** - Lazy loading all routes with React.lazy
- **Image Optimization** - OptimizedImage component with lazy loading and WebP
- **Virtualized Lists** - Efficient rendering of large park lists
- **Debouncing** - Input debouncing for search and API calls (300ms)
- **TanStack Query** - Smart caching with 30-minute stale time
- **Bundle Size** - Optimized with tree shaking and minification
- **Web Vitals** - LCP < 2.5s, FID < 100ms, CLS < 0.1
- **Resource Hints** - Preconnect and prefetch for critical resources
- **Service Worker** - PWA-ready with offline support (optional)
- **LocalStorage Monitor** - Automatic cleanup to prevent quota issues

### Backend Optimization
- **Multi-layer Caching**:
  - In-memory cache (node-cache) for API responses
  - Database query caching with TTL
  - CDN caching for static assets
  - Enhanced caching service with batch processing
- **Database Indexing** - Optimized queries with MongoDB indexes
- **Compression** - Gzip compression for all responses
- **Connection Pooling** - Efficient database connections
- **Rate Limiting** - Prevent API abuse and reduce server load
- **Batch Processing** - Batch requests for enhanced park data

---

## 🌟 Unique Features

### AI Trip Planning
- **Dual AI Integration** - First platform with GPT-4 + Claude
- **Conversation Persistence** - Auto-save with database synchronization
- **Feedback System** - Rate AI responses for continuous improvement
- **Archive Management** - Organize trip conversations with tabs
- **Smart Recommendations** - Based on user history and preferences
- **Streaming Responses** - Real-time AI responses for better UX
- **Provider Switching** - Switch AI providers mid-conversation
- **Trip Statistics** - Track unique parks and total conversations

### Comprehensive Park Data
- **Real-time Updates** - Live alerts and closures from NPS API
- **Weather Integration** - Current + 5-day forecasts for all parks
- **Event Calendar** - Ranger programs and park events
- **Interactive Maps** - Google Maps with custom markers and search (Places/Directions on desktop)
- **Comparison Tools** - Side-by-side comparison of up to 4 parks with detailed metrics
- **Activity Details** - Comprehensive activity information pages with deep-dive content
- **Enhanced Park Service** - Optimized caching and batch processing

### Community Features
- **Review System** - User reviews with up to 5 images per review
- **Testimonials** - Community experiences with admin moderation
- **Blog Platform** - Expert content with rich text, related posts, and comments
- **Comment System** - Nested replies, likes, and threaded discussions on blog posts
- **Social Sharing** - Share discoveries on social media
- **Avatar System** - 1000+ avatar combinations (26 styles × 40+ themes) with random generator or custom upload
- **Real-Time Sync** - WebSocket-powered instant sync across all devices

### Recent Improvements (October 2025)
- **Google Maps Integration** - Complete replacement with Google Maps JavaScript API, Places API, and Directions API
- **Resend Email Service** - Professional email delivery with templates, tracking, and tags
- **Project Cleanup** - Removed 29 MB of unused files and organized 160 docs
- **Enhanced Blog** - Related posts, comments, likes, and favorites
- **LocalStorage Monitor** - Automatic monitoring and cleanup
- **Profile Enhancements** - Avatar selector, email preferences, privacy settings
- **Image Optimization** - Sharp.js processing with WebP conversion
- **Enhanced Caching** - Global cache manager with smart prefetching
- **Trip History** - Comprehensive trip management with archive/restore
- **Database Sync** - All trips now stored in database (no localStorage)
- **Embedded Park Maps** - Interactive maps on park detail pages with nearby services

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
- Use meaningful commit messages

### Code Style
- Use ES6+ features (arrow functions, destructuring, etc.)
- Follow React best practices (hooks, functional components)
- Use functional components and hooks
- Write meaningful comments for complex logic
- Keep functions small and focused (< 50 lines)
- Use TypeScript for new files when possible

---

## 📞 Support & Contact

- **Website**: [nationalparksexplorerusa.com](https://www.nationalparksexplorerusa.com)
- **Email**: trailverseteam@gmail.com
- **Features**: [Explore All Features](https://www.nationalparksexplorerusa.com/features)
- **About**: [About the Creator](https://www.nationalparksexplorerusa.com/about)
- **GitHub Issues**: [Report a Bug](https://github.com/KrishnaSathvik/TrailVerse/issues)
- **Documentation**: Comprehensive guides in `/docs` folder (160+ docs)

---

## 📄 License

© 2025 TrailVerse by Krishna Sathvik Mantripragada. All rights reserved.

This project is proprietary software. Unauthorized copying, modification, distribution, or use of this software, via any medium, is strictly prohibited without explicit permission from the author.

---

## 🙏 Acknowledgments

- **National Park Service** - For the comprehensive NPS Data API
- **OpenAI** - For GPT-4 API access and excellent documentation
- **Anthropic** - For Claude API access and streaming support
- **React Team** - For the amazing React library and ecosystem
- **Next.js Team** - For the App Router framework
- **TanStack** - For the excellent Query library
- **Tailwind CSS** - For the utility-first CSS framework
- **Open Source Community** - For all the incredible tools and libraries

---

## 📊 Project Stats

- **Lines of Code**: 50,000+
- **Components**: 74+ React components
- **Pages**: 33 pages (including admin pages)
- **Services**: 32 frontend services + 14 backend services
- **API Routes**: 23 route files
- **API Endpoints**: 80+ REST endpoints
- **Custom Hooks**: 18 custom React hooks
- **Test Coverage**: 85%+
- **Performance Score**: 95+ (Lighthouse)
- **Accessibility Score**: 100 (Lighthouse)
- **SEO Score**: 100 (Lighthouse)
- **Best Practices**: 100 (Lighthouse)
- **Avatar Combinations**: 1000+ unique options
- **Documentation Files**: 164 comprehensive docs

---

## 📚 Recent Updates

### October 2025
- ✅ **Google Maps Integration** - Complete map system with Places API, Directions, and animated markers (desktop-specific features)
- ✅ **Resend Email Service** - Professional email delivery with branded templates and tracking
- ✅ **Embedded Park Maps** - Interactive Google Maps on park detail pages with nearby services
- ✅ **Project Cleanup** - Removed 29 MB of unused files and organized 160 documentation files
- ✅ **Enhanced Blog System** - Added related posts, comment system with nested replies, likes, and favorites
- ✅ **Profile Improvements** - 1000+ avatar combinations (26 styles × 40+ themes), email preferences, privacy settings, review management
- ✅ **LocalStorage Monitor** - Automatic monitoring and cleanup to prevent quota issues
- ✅ **Image Optimization** - Sharp.js processing with WebP conversion for all uploads (up to 5 per review)
- ✅ **Enhanced Caching** - Global cache manager with smart prefetching and batch processing
- ✅ **Trip History** - Comprehensive trip management with active/archived tabs and restore functionality
- ✅ **Database Synchronization** - All trips now stored in database (removed localStorage dependency)
- ✅ **Performance Optimization** - Improved Lighthouse scores across all metrics
- ✅ **Security Updates** - Enhanced Helmet.js configuration and rate limiting
- ✅ **Cost Optimization** - Aggressive caching for Google Maps API (3-day place details, 30-day photos)
- ✅ **Page Redesigns** - FAQ page (5 categories, 17 questions), Privacy (818→280 lines), Terms (658→260 lines)
- ✅ **Features Page Update** - Consolidated 10→5 categories, removed repetition, added platform-specific badges
- ✅ **About Page Update** - Updated with complete feature descriptions, accurate tech stack, 1000+ avatars mention
- ✅ **Real-Time WebSocket Sync** - Instant synchronization across all devices for favorites, reviews, and trip plans

---

**Ready to explore America's National Parks? Start your adventure with TrailVerse! 🏞️✨**

*Built with ❤️ by Krishna Sathvik Mantripragada - National Parks Enthusiast & Full-Stack Developer*

**Portfolio**: [Krishna's Portfolio](https://www.nationalparksexplorerusa.com/about)  
**Instagram**: [@astrobykrishna](https://instagram.com/astrobykrishna)  
**Unsplash**: [Astrophotography Portfolio](https://unsplash.com/@astrobykrishna)  
**Google Maps**: [Level 8 Local Guide](https://maps.app.goo.gl/V5vwTUzvBB19ZHM36) - 8,212 Reviews, 6,540 Photos
