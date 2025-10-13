# Backend Integration Setup Guide

This guide will help you set up the complete backend system with real database integration, replacing all mock data.

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Git

## Step 1: Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

## Step 2: Configure Environment Variables

### Server Environment Variables

Create `server/.env`:

```env
# Server Configuration
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://localhost:27017/nomadiq
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/nomadiq

# JWT Secret (generate a strong secret)
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long

# AI APIs
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
OPENAI_API_KEY=sk-xxxxx

# NPS API
NPS_API_KEY=your-nps-api-key

# Email Service (optional)
EMAIL_USER=trailverseteam@gmail.com
EMAIL_PASS=your-gmail-app-password
EMAIL_FROM_NAME=TrailVerse
FROM_EMAIL=trailverseteam@gmail.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Client Environment Variables

Create `client/.env`:

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_NPS_API_KEY=your-nps-api-key
```

## Step 3: Start MongoDB

### Local MongoDB (Recommended for Development)

```bash
# macOS
brew install mongodb-community
brew services start mongodb-community

# Ubuntu/Debian
sudo apt install mongodb
sudo systemctl start mongodb

# Windows
# Download and install MongoDB Community Server
# Start MongoDB service
```

### MongoDB Atlas (Recommended for Production)

1. Create account at [MongoDB Atlas](https://cloud.mongodb.com)
2. Create new cluster (free tier available)
3. Get connection string
4. Add to `.env` file

## Step 4: Seed Database

```bash
cd server
npm run seed
```

This creates:
- Admin user (trailverseteam@gmail.com / Admin123!)
- Sample users (sarah@example.com, mike@example.com, emily@example.com / password123)
- Blog posts
- Events
- Testimonials
- Sample trips and reviews

## Step 5: Start Development Servers

### Terminal 1 - Backend
```bash
cd server
npm run dev
```

### Terminal 2 - Frontend
```bash
cd client
npm start
```

## Step 6: Verify Setup

1. **Backend Health Check**: http://localhost:5000/health
2. **Frontend**: http://localhost:3000
3. **Test Authentication**: Try logging in with admin credentials
4. **Test Features**: Create a trip, add favorites, write reviews

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user

### Trips
- `GET /api/trips/user/:userId` - Get user trips
- `POST /api/trips` - Create trip
- `PUT /api/trips/:id` - Update trip
- `DELETE /api/trips/:id` - Delete trip

### Favorites
- `GET /api/favorites/user/:userId` - Get user favorites
- `POST /api/favorites` - Add favorite
- `DELETE /api/favorites/:parkCode` - Remove favorite

### Events
- `GET /api/events` - Get all events
- `POST /api/events/:id/register` - Register for event
- `GET /api/events/user/:userId` - Get user events

### Blog
- `GET /api/blogs` - Get blog posts
- `GET /api/blogs/:slug` - Get single post
- `POST /api/blogs` - Create post (admin)

### Stats
- `GET /api/stats/site` - Get site statistics
- `GET /api/stats/parks` - Get park statistics

## Testing Checklist

### ✅ Authentication Testing
- [ ] User can register with valid email/password
- [ ] Duplicate email registration shows error
- [ ] User can login with correct credentials
- [ ] Wrong password shows error
- [ ] Token persists after page refresh
- [ ] Logout clears token and redirects

### ✅ Trip Planning Testing
- [ ] AI chat works with real API
- [ ] Trips save to database
- [ ] Trip history loads correctly
- [ ] Trips can be edited
- [ ] Trips can be deleted

### ✅ Favorites Testing
- [ ] Save park works
- [ ] Favorites persist in database
- [ ] Favorites show in profile
- [ ] Remove favorite works

### ✅ Blog Testing
- [ ] Blog posts load from database
- [ ] Categories filter works
- [ ] Search works
- [ ] Admin can create posts
- [ ] Admin can edit posts

### ✅ Events Testing
- [ ] Events load from database
- [ ] Event registration works
- [ ] Calendar view shows events correctly

## Common Issues

### MongoDB Connection Error
```bash
# Ensure MongoDB is running
brew services start mongodb-community  # macOS
sudo systemctl start mongodb          # Linux

# Check connection string in .env
MONGODB_URI=mongodb://localhost:27017/nomadiq
```

### JWT Token Errors
```bash
# Generate a strong JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### CORS Errors
```bash
# Ensure CLIENT_URL matches frontend URL
CLIENT_URL=http://localhost:3000
```

### API Key Errors
- Verify all API keys are correct
- Check .env files exist in both client and server
- Ensure API keys have proper permissions

## Production Deployment

### Environment Variables for Production
```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/nomadiq
JWT_SECRET=production-jwt-secret-64-characters-long
CLIENT_URL=https://your-domain.com
```

### Security Checklist
- [ ] Strong JWT secret
- [ ] MongoDB Atlas with IP whitelist
- [ ] Rate limiting enabled
- [ ] CORS configured correctly
- [ ] API keys secured
- [ ] Error logging configured

## Database Schema

### User Model
- Basic user info (name, email, password)
- Role-based access (user, admin)
- Email verification
- Password reset tokens
- Saved parks array

### TripPlan Model
- User association
- Park information
- Form data (dates, group size, etc.)
- Conversation history
- Generated plan
- Status tracking

### Event Model
- Event details (title, description, date)
- Park association
- Registration management
- Capacity limits
- Categories and pricing

### Favorite Model
- User-park association
- Visit status tracking
- Personal notes and ratings
- Tags for organization

### BlogPost Model
- Content management
- Author association
- Categories and tags
- Publication status
- View tracking

### Testimonial Model
- User testimonials
- Approval workflow
- Featured testimonials
- Rating system

## Support

If you encounter any issues:

1. Check the console logs for error messages
2. Verify all environment variables are set correctly
3. Ensure MongoDB is running and accessible
4. Check that all API keys are valid and have proper permissions

For additional help, refer to the individual service documentation or create an issue in the repository.
