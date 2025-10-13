# TrailVerse - Client Application 🌲

> React + Vite frontend for TrailVerse - Your Universe of National Parks Exploration

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm run test

# Run tests with UI
npm run test:ui

# Run E2E tests
npm run test:e2e
```

## 🛠️ Tech Stack

### Core
- **React 18.3** - UI library with concurrent features
- **Vite 5.4** - Build tool and dev server
- **React Router 7.9** - Client-side routing
- **TanStack Query 5.90** - Server state management
- **Tailwind CSS 4.1** - Utility-first CSS

### Key Libraries
- **React Helmet Async 2.0** - SEO management
- **Google Maps JavaScript API** - Interactive maps with Places & Directions
- **Lucide React 0.544** - Icons (193 icons)
- **Axios 1.12** - HTTP client
- **React Markdown 10.1** - Markdown rendering
- **React GA4 2.1** - Analytics
- **Web Vitals 2.1** - Performance monitoring

### Testing
- **Vitest 2.1** - Unit testing
- **Testing Library 16.3** - Component testing
- **Playwright 1.49** - E2E testing
- **MSW 2.6** - API mocking

## 📁 Project Structure

```
src/
├── components/       # UI components (100+)
│   ├── ai-chat/     # AI chat interface
│   ├── blog/        # Blog components
│   ├── common/      # Shared components
│   ├── explore/     # Park exploration
│   ├── map/         # Interactive maps
│   ├── park-details/# Park detail views
│   ├── plan-ai/     # AI trip planning
│   ├── profile/     # User profile
│   ├── reviews/     # Review system
│   └── testimonials/# Testimonials
├── pages/           # Page components (33)
├── services/        # API services (32)
├── context/         # React contexts (3)
├── hooks/           # Custom hooks (15)
├── utils/           # Utility functions (10)
└── styles/          # Global styles
```

## ✨ Key Features

### 🤖 AI Trip Planning
- Dual AI providers (OpenAI GPT-4 + Anthropic Claude)
- Real-time conversation with streaming
- Auto-save with database sync
- Trip history with archive/restore
- Feedback system for AI responses

### 🗺️ Park Exploration
- Interactive maps with Google Maps JavaScript API
- Search-first design with Places Autocomplete
- Animated markers (drop + pulse effects)
- Nearby essentials (restaurants, lodging, gas)
- Route building with directions
- Advanced filtering and search
- Park comparison tool
- Real-time weather and alerts
- Virtualized lists for performance
- Embedded maps on park detail pages

### 📝 Blog Platform
- Rich text content with prose styling
- Related posts by category
- Comment system with likes
- Favorite blogs
- SEO optimization

### 👤 User Profiles
- Avatar selection (12+ options)
- Saved and visited parks
- Trip history management
- Email preferences
- Privacy settings

### 💬 Community
- Park reviews with images (up to 5)
- Testimonials
- Comments on blogs
- Social sharing
- Event calendar

## 🔧 Configuration

### Environment Variables

Create a `.env` file:

```bash
# API Configuration
VITE_API_URL=http://localhost:5001/api

# External APIs
REACT_APP_NPS_API_KEY=your_nps_api_key

# Analytics
REACT_APP_GA_TRACKING_ID=G-XXXXXXXXXX

# Application
REACT_APP_NAME=TrailVerse
REACT_APP_URL=http://localhost:3001

# Environment
VITE_APP_ENV=development
```

### Vite Configuration

The project uses Vite with:
- React plugin with Fast Refresh
- Path aliases (@components, @utils, etc.)
- Build optimizations
- Code splitting
- CSS preprocessing

## 📊 Performance

### Optimization Features
- Code splitting with React.lazy
- Image optimization with lazy loading
- Virtualized lists for large datasets
- Debounced search (300ms)
- TanStack Query caching (30min stale time)
- LocalStorage monitoring and cleanup
- Resource hints (preconnect, prefetch)

### Web Vitals Targets
- **LCP**: < 2.5s
- **FID**: < 100ms
- **CLS**: < 0.1

### Lighthouse Scores
- Performance: 95+
- Accessibility: 100
- SEO: 100
- Best Practices: 100

## 🧪 Testing

### Unit Tests
```bash
# Run all tests
npm run test

# Watch mode
npm run test -- --watch

# Coverage
npm run test -- --coverage

# UI mode
npm run test:ui
```

### E2E Tests
```bash
# Run E2E tests (headless)
npm run test:e2e

# Run E2E tests (headed)
npm run test:e2e:headed

# Debug mode
npx playwright test --debug
```

### Test Coverage
- Unit tests: 85%+
- Integration tests: 80%+
- E2E tests: Core user flows

## 🎨 Design System

### Colors
- Primary: Forest Green (#22c55e)
- Secondary: Sky Blue (#0ea5e9)
- Accent: Orange (#f97316)
- Success: Green (#10b981)
- Error: Red (#ef4444)

### Typography
- Font: Geist Sans
- Sizes: text-xs to text-4xl
- Line heights: 1.2 (headings), 1.5 (body)

### Themes
- Light mode
- Dark mode
- System preference

## 🔒 Security

- XSS protection with sanitization
- CSRF token validation
- Secure cookie handling
- Input validation
- Rate limiting awareness
- Content Security Policy

## 📦 Build & Deploy

### Development Build
```bash
npm run dev
# Runs on http://localhost:3001
```

### Production Build
```bash
npm run build
# Output: dist/ directory
```

### Preview Production Build
```bash
npm run preview
# Preview the production build locally
```

### Deployment (Vercel)
- Automatic deployments from `main` branch
- Environment variables configured in Vercel dashboard
- Global CDN distribution
- Serverless functions support

## 🚀 Recent Updates (October 2025)

- ✅ Google Maps integration (Places, Directions, animated markers)
- ✅ Embedded park maps with nearby services
- ✅ Enhanced blog system with related posts
- ✅ LocalStorage monitoring and cleanup
- ✅ Avatar selection system (12+ options)
- ✅ Email preferences management
- ✅ Privacy settings in profile
- ✅ Trip history with archive/restore
- ✅ Enhanced caching with smart prefetching
- ✅ Image optimization with WebP
- ✅ Performance improvements across the board
- ✅ Cost-optimized Google Maps caching

## 📚 Documentation

- **Main README**: `/README.md`
- **API Docs**: `/docs/`
- **Component Guides**: `/docs/COMPONENTS.md`
- **Testing Guide**: `/docs/TESTING.md`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Ensure tests pass
6. Submit a pull request

## 📞 Support

- **Email**: trailverseteam@gmail.com
- **Website**: [nationalparksexplorerusa.com](https://www.nationalparksexplorerusa.com)
- **Documentation**: `/docs` folder

---

**Built with ❤️ by Krishna Sathvik Mantripragada**

© 2025 TrailVerse. All rights reserved.
