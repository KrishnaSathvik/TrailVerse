# TrailVerse 🌲

> Your Universe of National Parks Exploration

**Live Site:** [www.nationalparksexplorerusa.com](https://www.nationalparksexplorerusa.com)

## 🏞️ About TrailVerse

TrailVerse is a comprehensive AI-powered platform for exploring and planning trips to America's 63 National Parks. Built with modern web technologies and featuring advanced AI integration, it provides users with personalized trip planning, real-time park data, community features, and expert content.

## ✨ Key Features

### 🤖 AI-Powered Trip Planning
- **Dual AI Providers**: Integration with both OpenAI GPT-4 and Anthropic Claude
- **Conversational Planning**: Multi-turn chat interface for detailed trip planning
- **Personalized Recommendations**: AI suggestions based on user preferences, season, and interests
- **Token Management**: Daily usage limits and tracking for AI features
- **Streaming Responses**: Real-time AI responses for better user experience

### 🗺️ Park Exploration & Discovery
- **All 63 National Parks**: Comprehensive database with official NPS API integration
- **Interactive Maps**: Leaflet-powered maps with park locations and details
- **Advanced Filtering**: Filter parks by state, activities, features, and amenities
- **Park Comparison**: Side-by-side comparison of multiple parks
- **Detailed Park Pages**: Rich information including activities, alerts, weather, and reviews

### 🎯 User Management & Personalization
- **Secure Authentication**: JWT-based auth with email verification
- **User Profiles**: Customizable profiles with avatars and preferences
- **Saved Parks**: Bookmark and track visited parks
- **Trip History**: Record and manage past and planned trips
- **Favorites System**: Save parks, blogs, and events

### 📝 Content Management
- **Rich Blog System**: Admin-managed blog with categories and tags
- **Rich Text Editor**: TinyMCE integration for content creation
- **Content Categories**: Hiking, Photography, Wildlife, Travel Tips, Park Guides, Camping, History, Conservation
- **SEO Optimization**: Meta tags, structured data, and sitemap generation
- **Image Upload**: Secure image handling with optimization

### 💬 Community Features
- **Reviews & Ratings**: User-generated park reviews with image uploads
- **Testimonials**: Community testimonials and experiences
- **Comments System**: Blog post commenting and engagement
- **Events Calendar**: Park events and ranger programs
- **Social Sharing**: Share parks, blogs, and experiences

### 🔧 Advanced Features
- **Real-time Weather**: Current conditions and forecasts for parks
- **Performance Monitoring**: Application performance tracking
- **Analytics Integration**: Google Analytics 4 implementation
- **Email Notifications**: Automated emails for blog updates and account actions
- **WebSocket Support**: Real-time features and live updates
- **Caching System**: Multi-layer caching for optimal performance
- **Rate Limiting**: API protection and abuse prevention

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+**
- **MongoDB** (local or Atlas)
- **Git**
- **API Keys** (see configuration section)

### Installation

1. **Clone and setup:**
   ```bash
   git clone https://github.com/KrishnaSathvik/TrailVerse.git
   cd TrailVerse
   npm run install:all
   ```

2. **Environment Configuration:**
   
   **Backend (`server/.env`):**
   ```bash
   NODE_ENV=development
   PORT=5001
   MONGODB_URI=mongodb://localhost:27017/trailverse
   JWT_SECRET=your_super_secret_jwt_key_change_in_production
   NPS_API_KEY=your_nps_api_key
   OPENAI_API_KEY=sk-your_openai_api_key
   ANTHROPIC_API_KEY=your_anthropic_api_key
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password
   EMAIL_FROM_NAME=TrailVerse
   ADMIN_EMAIL=your_admin_email@gmail.com
   CLIENT_URL=http://localhost:3000
   ```

   **Frontend (`client/.env`):**
   ```bash
   REACT_APP_API_URL=http://localhost:5001/api
   REACT_APP_NPS_API_KEY=your_nps_api_key_here
   REACT_APP_GA_TRACKING_ID=G-XXXXXXXXXX
   REACT_APP_NAME=TrailVerse
   REACT_APP_URL=http://localhost:3000
   ```

3. **Start development servers:**
   ```bash
   npm run dev
   ```

   This starts:
   - **Backend API**: http://localhost:5001
   - **Frontend**: http://localhost:3000
   - **API Documentation**: http://localhost:5001/api-docs

## 📁 Project Structure

```
TrailVerse/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── ai-chat/      # AI chat interface
│   │   │   ├── blog/         # Blog components
│   │   │   ├── common/       # Shared components
│   │   │   ├── explore/      # Park exploration
│   │   │   ├── map/          # Interactive maps
│   │   │   ├── park-details/ # Park detail views
│   │   │   ├── plan-ai/      # AI trip planning
│   │   │   ├── profile/      # User profile
│   │   │   └── reviews/      # Review system
│   │   ├── pages/            # Page components
│   │   │   ├── admin/        # Admin dashboard
│   │   │   └── ...           # All app pages
│   │   ├── services/         # API services
│   │   ├── context/          # React contexts
│   │   ├── hooks/            # Custom hooks
│   │   ├── utils/            # Utility functions
│   │   └── styles/           # Styling
│   ├── public/               # Static assets
│   └── tests/                # Test files
├── server/                   # Node.js backend
│   ├── src/
│   │   ├── config/           # Configuration
│   │   ├── controllers/      # Route controllers
│   │   ├── middleware/       # Custom middleware
│   │   ├── models/           # MongoDB models
│   │   ├── routes/           # API routes
│   │   ├── services/         # Business logic
│   │   └── utils/            # Server utilities
│   ├── templates/            # Email templates
│   └── scripts/              # Database scripts
├── vercel.json              # Deployment configuration
└── package.json             # Root workspace config
```

## 🛠️ Tech Stack

### Frontend
- **React 19** - Latest React with concurrent features
- **Tailwind CSS 4** - Utility-first styling with latest features
- **React Router 7** - Client-side routing
- **TanStack Query** - Server state management and caching
- **Framer Motion** - Smooth animations and transitions
- **React Hook Form + Yup** - Form handling and validation
- **React Leaflet** - Interactive maps
- **TinyMCE** - Rich text editing
- **Lucide React** - Beautiful icon library

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **MongoDB + Mongoose** - Database and ODM
- **JWT** - Secure authentication
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **Morgan** - HTTP request logging
- **Socket.io** - Real-time communication

### AI & External APIs
- **OpenAI GPT-4** - Primary AI provider
- **Anthropic Claude** - Secondary AI provider
- **NPS Data API** - Official park information
- **Weather API** - Real-time weather data
- **Google Analytics 4** - User analytics
- **Mailgun** - Email delivery service

### Development & Testing
- **Vitest** - Unit testing framework
- **Testing Library** - Component testing
- **Playwright** - End-to-end testing
- **Jest** - Server-side testing
- **ESLint** - Code linting
- **Prettier** - Code formatting

## 🔑 Required API Keys

1. **NPS Data API**: [Get API Key](https://www.nps.gov/subjects/developer/get-started.htm)
2. **OpenAI API**: [Get API Key](https://platform.openai.com/api-keys)
3. **Anthropic Claude**: [Get API Key](https://console.anthropic.com/)
4. **Mailgun**: [Email Service](https://www.mailgun.com/)
5. **Google Analytics**: [Analytics Setup](https://analytics.google.com/)

## 📊 API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/forgot-password` - Password reset
- `GET /api/auth/verify-email/:token` - Email verification

### Parks & Data
- `GET /api/parks` - Get all parks
- `GET /api/parks/:parkCode` - Get park details
- `GET /api/parks/:parkCode/events` - Get park events
- `GET /api/parks/:parkCode/weather` - Get park weather

### AI Services
- `POST /api/ai/chat` - AI chat endpoint
- `POST /api/ai/plan-trip` - Generate trip plan
- `GET /api/ai/conversations` - Get user conversations

### User Management
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `POST /api/favorites` - Save park as favorite
- `GET /api/favorites` - Get user favorites

### Content Management
- `GET /api/blogs` - Get blog posts
- `POST /api/blogs` - Create blog post (admin)
- `GET /api/reviews` - Get park reviews
- `POST /api/reviews` - Submit review

### Admin Features
- `GET /api/admin/dashboard` - Admin dashboard data
- `GET /api/admin/users` - User management
- `POST /api/admin/blog` - Create/edit blog posts

## 🧪 Testing

### Run Tests
```bash
# All tests
npm run test

# Client tests only
npm run test:client

# Server tests only
npm run test:server

# End-to-end tests
npm run test:e2e

# Test coverage
npm run test:coverage
```

### Health Checks
```bash
# API health
curl http://localhost:5001/health

# Database connection
curl http://localhost:5001/api/health/db
```

## 🚀 Deployment

### Vercel Deployment
The application is configured for Vercel deployment with:
- **Serverless Functions** for the backend API
- **Static Build** for the React frontend
- **Environment Variables** for production configuration
- **Custom Headers** for security and performance

### Production Environment Variables
```bash
NODE_ENV=production
MONGODB_URI=your_production_mongodb_uri
JWT_SECRET=your_production_jwt_secret
NPS_API_KEY=your_nps_api_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
CLIENT_URL=https://www.nationalparksexplorerusa.com
```

## 📝 Available Scripts

```bash
# Development
npm run dev              # Start both frontend and backend
npm run dev:client       # Start frontend only
npm run dev:server       # Start backend only

# Production
npm run build           # Build frontend for production
npm start               # Start production server

# Installation
npm run install:all     # Install all dependencies
npm run install:client  # Install client dependencies
npm run install:server  # Install server dependencies

# Testing
npm run test            # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Generate test coverage

# Database
npm run seed            # Seed database with sample data
```

## 🎨 Design System

### Brand Colors
- **Primary**: #10b981 (Forest Green)
- **Secondary**: #059669 (Emerald)
- **Accent**: #f59e0b (Amber)
- **Neutral**: #6b7280 (Gray)

### Typography
- **Headings**: Bricolage Grotesque
- **Body**: Geist Sans
- **Monospace**: JetBrains Mono

### Components
- **Responsive Design**: Mobile-first approach
- **Dark/Light Theme**: System preference detection
- **Accessibility**: WCAG 2.1 AA compliant
- **Performance**: Optimized images and lazy loading

## 🔒 Security Features

- **Helmet.js** - Security headers
- **Rate Limiting** - API abuse prevention
- **CORS** - Cross-origin protection
- **JWT Authentication** - Secure token-based auth
- **Input Validation** - Express-validator integration
- **Password Hashing** - bcryptjs encryption
- **Email Verification** - Account security
- **Content Security Policy** - XSS protection

## 📈 Performance Features

- **Multi-layer Caching** - Redis and in-memory caching
- **Image Optimization** - Sharp.js processing
- **Code Splitting** - Lazy loading components
- **Bundle Optimization** - Webpack optimization
- **CDN Integration** - Static asset delivery
- **Database Indexing** - Optimized queries
- **Compression** - Gzip compression

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support & Contact

- **Website**: [nationalparksexplorerusa.com](https://www.nationalparksexplorerusa.com)
- **Email**: trailverseteam@gmail.com
- **Documentation**: [API Docs](https://www.nationalparksexplorerusa.com/api-docs)
- **Issues**: [GitHub Issues](https://github.com/KrishnaSathvik/TrailVerse/issues)

## 📄 License

© 2025 TrailVerse. All rights reserved.

---

**Ready to explore America's National Parks? Start your adventure with TrailVerse! 🏞️✨**

*Built with ❤️ for National Parks enthusiasts*# GitHub Integration Test
# Updated Tue Oct  7 11:31:56 CDT 2025
# Trigger new deployment with correct API URL Tue Oct  7 13:56:03 CDT 2025
