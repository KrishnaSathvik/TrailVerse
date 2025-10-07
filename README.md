# TrailVerse

> Your Universe of National Parks Exploration

**Live Site:** [www.nationalparksexplorerusa.com](https://www.nationalparksexplorerusa.com)

## About

TrailVerse is an AI-powered platform for exploring and planning trips to America's 63 National Parks. Built with passion by a Google Maps Level 8 contributor and National Parks enthusiast.

### Features

- 🤖 **AI Trip Planner** - Personalized itineraries powered by Claude and ChatGPT
- 🗺️ **Interactive Maps** - Explore parks with detailed mapping and trail information
- ⭐ **Community Reviews** - Read authentic experiences from fellow explorers
- 📅 **Events Calendar** - Discover ranger programs and special events
- ❤️ **Trip Planning Tools** - Save favorites, compare parks, and plan adventures
- 🌟 **Real-time Data** - Weather, events, and park conditions
- 📱 **Mobile Optimized** - Perfect experience on all devices

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Git

### Installation

1. **Clone and setup:**
   ```bash
   git clone <your-repo-url>
   cd npe-usa
   npm run install:all
   ```

2. **Start MongoDB:**
   ```bash
   brew services start mongodb-community@4.4
   ```

3. **Start development servers:**
   ```bash
   npm run dev
   ```

   This will start:
   - Backend API: http://localhost:5001
   - Frontend: http://localhost:3000

### Manual Start (Alternative)

**Backend:**
```bash
cd server
npm run dev
```

**Frontend (new terminal):**
```bash
cd client
npm start
```

## 📁 Project Structure

```
npe-usa/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── utils/         # Utility functions
│   │   └── App.jsx        # Main app component
│   ├── tailwind.config.js # Tailwind configuration
│   └── package.json
├── server/                 # Node.js/Express backend
│   ├── src/
│   │   ├── config/        # Database & app config
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Custom middleware
│   │   └── app.js         # Express app setup
│   ├── server.js          # Server entry point
│   └── package.json
├── package.json           # Root workspace config
└── README.md
```

## 🔧 Configuration

### Environment Variables

**Backend (`server/.env.development`):**
```bash
NODE_ENV=development
PORT=5001
MONGODB_URI=mongodb://localhost:27017/npe-usa
JWT_SECRET=your_super_secret_jwt_key_change_in_production
NPS_API_KEY=your_nps_api_key
OPENAI_API_KEY=sk-your_openai_api_key
EMAIL_USER=trailverseteam@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM_NAME=TrailVerse
ADMIN_EMAIL=trailverseteam@gmail.com
CLIENT_URL=http://localhost:3000
```

**Frontend (`client/.env.development`):**
```bash
REACT_APP_API_URL=http://localhost:5001/api
REACT_APP_NPS_API_KEY=your_nps_api_key_here
REACT_APP_GA_TRACKING_ID=G-XXXXXXXXXX
REACT_APP_NAME=TrailVerse
REACT_APP_URL=http://localhost:3000
```

## 🧪 Testing

### Health Check
```bash
curl http://localhost:5001/health
```

### API Endpoints
```bash
# Auth
curl -X POST http://localhost:5001/api/auth/signup
curl -X POST http://localhost:5001/api/auth/login

# Parks
curl http://localhost:5001/api/parks

# Other endpoints
curl http://localhost:5001/api/users
curl http://localhost:5001/api/blogs
curl http://localhost:5001/api/events
```

## 🛠️ Tech Stack

### Frontend
- **React 19** - Modern UI framework
- **Tailwind CSS** - Utility-first styling
- **React Router** - Client-side routing
- **TanStack Query** - Server state management
- **Framer Motion** - Smooth animations
- **React Hook Form** - Form validation
- **React Leaflet** - Interactive maps
- **Lucide React** - Beautiful icons

### Backend
- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **MongoDB** - NoSQL database
- **Mongoose** - ODM for MongoDB
- **JWT** - Secure authentication
- **Helmet** - Security headers
- **CORS** - Cross-origin requests
- **Morgan** - Request logging

### AI & APIs
- **OpenAI GPT** - AI trip planning
- **Anthropic Claude** - Advanced AI features
- **NPS API** - Official park data
- **Weather API** - Real-time conditions
- **Google Maps** - Location services

## 🔑 API Keys Needed

1. **NPS Data API**: https://www.nps.gov/subjects/developer/get-started.htm
2. **OpenAI API**: https://platform.openai.com/api-keys
3. **Anthropic Claude**: https://console.anthropic.com/
4. **Gmail App Password**: https://support.google.com/accounts/answer/185833
5. **Google Analytics**: https://analytics.google.com/
6. **Google Maps**: https://console.cloud.google.com/

## 🎨 Brand Guidelines

- **Primary Color**: #10b981 (Forest Green)
- **Secondary Color**: #059669 (Emerald)
- **Typography**: Geist + Bricolage Grotesque
- **Logo**: Modern compass with mountain trail elements
- **Tagline**: "Your Universe of National Parks Exploration"

## 📝 Available Scripts

```bash
# Root level
npm run dev              # Start both frontend and backend
npm run install:all      # Install all dependencies
npm run build           # Build frontend for production
npm start               # Start production server

# Frontend
cd client && npm start  # Start React dev server
cd client && npm build  # Build for production

# Backend
cd server && npm run dev # Start with nodemon
cd server && npm start   # Start production server
```

## 🎯 Current Status

✅ **Completed:**
- Complete TrailVerse rebranding
- Modern React frontend with Tailwind CSS
- Node.js/Express backend with MongoDB
- AI-powered trip planning integration
- Interactive maps and park data
- User authentication system
- Email templates and notifications
- SEO optimization
- Mobile-responsive design

🚀 **Live Features:**
- Explore all 63 National Parks
- AI trip planning with Claude & GPT
- Real-time events and weather data
- Community reviews and ratings
- Interactive maps and trail guides
- User profiles and favorites
- Blog system with expert content

---

## 📞 Contact

- **Website**: [nationalparksexplorerusa.com](https://www.nationalparksexplorerusa.com)
- **Email**: trailverseteam@gmail.com
- **Support**: trailverseteam@gmail.com
- **Twitter**: [@TrailVerse](https://twitter.com/TrailVerse)

## 📄 License

© 2025 TrailVerse. All rights reserved.

---

**Ready to explore America's National Parks? Start your adventure with TrailVerse! 🏞️✨**
