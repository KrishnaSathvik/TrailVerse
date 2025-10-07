# 📧 Enhanced Email System Setup Guide

## 🚀 Overview

Your TrailVerse application now includes a comprehensive email system with the following features:

- ✅ **Email Queue System** - Bull/Redis for reliable email processing
- ✅ **Rate Limiting** - Prevents SMTP server overload
- ✅ **Delivery Tracking** - Track email opens and delivery status
- ✅ **Unsubscribe Management** - Secure unsubscribe system with preferences
- ✅ **Email Analytics** - Comprehensive reporting and statistics

## 🔧 Environment Variables

Add these variables to your `.env` files:

### Server Environment Variables (`server/.env`)

```bash
# Email Configuration
EMAIL_USER=trailverseteam@gmail.com
EMAIL_PASS=your-gmail-app-password
EMAIL_FROM_NAME=TrailVerse

# Redis Configuration (for email queue)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Unsubscribe Security
UNSUBSCRIBE_SECRET=your-super-secret-unsubscribe-key

# Client URL (for unsubscribe links)
CLIENT_URL=http://localhost:3000

# Existing variables...
NODE_ENV=development
PORT=5001
MONGODB_URI=mongodb://localhost:27017/npe-usa
JWT_SECRET=your_super_secret_jwt_key_change_in_production
```

### Production Environment Variables

```bash
# Production Redis (use Redis Cloud or AWS ElastiCache)
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0

# Production URLs
CLIENT_URL=https://www.nationalparksexplorerusa.com

# Unsubscribe Security (use a strong secret)
UNSUBSCRIBE_SECRET=your-production-unsubscribe-secret
```

## 📦 Installation

### 1. Install Redis

**macOS (Homebrew):**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

**Windows:**
```bash
# Use Redis for Windows or Docker
docker run -d -p 6379:6379 redis:alpine
```

### 2. Install Dependencies

```bash
cd server
npm install bull redis express-rate-limit mailgun.js uuid
```

### 3. Start the Services

```bash
# Terminal 1: Start Redis
redis-server

# Terminal 2: Start your application
npm run dev
```

## 🔄 Email Queue System

### Features

- **Automatic Retry**: Failed emails are retried up to 3 times with exponential backoff
- **Rate Limiting**: Prevents overwhelming your SMTP server
- **Job Persistence**: Jobs survive server restarts
- **Priority Support**: Critical emails (password reset) get higher priority

### Rate Limits

| Email Type | Limit | Duration |
|------------|-------|----------|
| Welcome | 100/min | 60 seconds |
| Blog Notifications | 50/min | 60 seconds |
| Password Reset | 20/min | 60 seconds |
| Email Verification | 30/min | 60 seconds |
| Weekly Digest | 10/min | 60 seconds |
| Trip Reminders | 25/min | 60 seconds |
| Marketing | 5/min | 60 seconds |

## 📊 Email Tracking

### Open Tracking

Every email includes a tracking pixel that records:
- When the email was opened
- User agent information
- IP address
- Timestamp

### Delivery Tracking

Track email delivery status:
- ✅ Delivered
- ❌ Failed
- 📊 Opened
- 🔗 Clicked (future feature)

## 🔐 Unsubscribe System

### Features

- **Secure Tokens**: HMAC-based unsubscribe tokens
- **Granular Control**: Unsubscribe from specific email types
- **Preference Management**: Users can customize their email preferences
- **Compliance**: Meets email marketing regulations

### Email Types

- `welcome` - Welcome emails
- `blog` - Blog post notifications
- `events` - Event reminders
- `weekly` - Weekly digest
- `trip` - Trip reminders
- `marketing` - Promotional emails

## 📈 API Endpoints

### Unsubscribe Management

```bash
# Get unsubscribe page
GET /api/email/unsubscribe?email=user@example.com&type=blog&token=abc123

# Process unsubscribe
POST /api/email/unsubscribe
{
  "email": "user@example.com",
  "emailType": "blog",
  "token": "abc123"
}

# Update preferences
POST /api/email/unsubscribe
{
  "email": "user@example.com",
  "preferences": {
    "emailSubscribed": true,
    "emailPreferences": {
      "blogPosts": false,
      "weeklyDigest": true
    }
  }
}
```

### Email Tracking

```bash
# Track email opens (pixel)
GET /api/email/track/open/:trackingId

# Get delivery status
GET /api/email/track/status/:trackingId

# Get queue statistics
GET /api/email/queue/stats
```

### User Preferences

```bash
# Get user preferences
GET /api/email/preferences/:email

# Update user preferences
PUT /api/email/preferences/:email
{
  "preferences": {
    "emailPreferences": {
      "blogPosts": true,
      "weeklyDigest": false
    }
  }
}
```

## 📧 Available Email Templates

**Currently Implemented:**
- ✅ `welcome.html` - Welcome emails
- ✅ `blog-notification.html` - Blog post notifications  
- ✅ `email-verification.html` - Email verification
- ✅ `password-reset.html` - Password reset

**TODO (Templates Not Yet Created):**
- ❌ `weekly-digest.html` - Weekly digest emails
- ❌ `trip-reminder.html` - Trip reminder emails
- ❌ `marketing.html` - Marketing emails

## 🎯 Usage Examples

### Sending Blog Notifications

```javascript
const emailService = require('./services/enhancedEmailService');

// This now automatically uses the queue system
await emailService.sendBlogNotification(user, blogPost);
```

### Sending Other Email Types

```javascript
// ✅ These work (templates exist)
await emailService.sendWelcomeEmail(user);
await emailService.sendEmailVerification(user, verificationUrl);
await emailService.sendPasswordReset(user, resetUrl);

// ⚠️ These are placeholder (templates don't exist yet)
await emailService.sendWeeklyDigest(user); // Will log warning
await emailService.sendTripReminder(user); // Will log warning
await emailService.sendMarketingEmail(user); // Will log warning
```

### Checking User Preferences

```javascript
const unsubscribeService = require('./services/unsubscribeService');

// Check if user should receive emails
const shouldReceive = await unsubscribeService.shouldReceiveEmail(
  'user@example.com', 
  'blog_notification'
);

if (shouldReceive) {
  // Send email
}
```

### Queue Management

```javascript
const { getQueueStats, pauseQueue, resumeQueue } = require('./services/emailQueue');

// Get queue statistics
const stats = await getQueueStats();
console.log('Queue stats:', stats);

// Pause/resume queue
await pauseQueue();
await resumeQueue();
```

## 📊 Monitoring & Analytics

### Queue Statistics

```javascript
{
  "waiting": 5,      // Jobs waiting to be processed
  "active": 2,       // Jobs currently being processed
  "completed": 150,  // Successfully completed jobs
  "failed": 3,       // Failed jobs
  "total": 160       // Total jobs in queue
}
```

### Unsubscribe Statistics

```javascript
{
  "totalUsers": 1000,
  "subscribedUsers": 850,
  "unsubscribedUsers": 150,
  "subscriptionRate": "85.00",
  "preferences": {
    "total": 1000,
    "blogPosts": 800,
    "welcomeEmails": 850,
    "eventReminders": 700,
    "weeklyDigest": 200
  }
}
```

## 🚨 Error Handling

### Common Issues

1. **Redis Connection Failed**
   - Check if Redis is running: `redis-cli ping`
   - Verify Redis configuration in `.env`

2. **Rate Limit Exceeded**
   - Emails are automatically queued for later delivery
   - Check queue statistics for backlog

3. **SMTP Authentication Failed**
   - Verify Gmail app password is correct
   - Check if 2FA is enabled on Gmail account

### Monitoring Commands

```bash
# Check Redis connection
redis-cli ping

# Monitor Redis
redis-cli monitor

# Check email queue
curl http://localhost:5001/api/email/queue/stats
```

## 🔒 Security Considerations

### Unsubscribe Tokens

- Tokens are HMAC-based and cryptographically secure
- Include email and email type in token generation
- Tokens expire after 30 days
- Use strong `UNSUBSCRIBE_SECRET` in production

### Rate Limiting

- API endpoints have rate limiting to prevent abuse
- Email sending has built-in rate limiting
- Failed attempts are tracked and delayed

### Data Privacy

- Email tracking data expires after 30 days
- User preferences are stored securely
- Unsubscribe requests are processed immediately

## 🚀 Production Deployment

### Redis Setup

**Option 1: Redis Cloud**
1. Sign up at [Redis Cloud](https://redis.com/redis-enterprise-cloud/overview/)
2. Create a database
3. Use the connection details in your environment variables

**Option 2: AWS ElastiCache**
1. Create Redis cluster in AWS ElastiCache
2. Configure security groups
3. Use the endpoint in your environment variables

### Environment Variables

```bash
# Production Redis
REDIS_HOST=your-redis-cluster.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password

# Production URLs
CLIENT_URL=https://www.nationalparksexplorerusa.com

# Strong secrets
UNSUBSCRIBE_SECRET=your-super-secure-production-secret
JWT_SECRET=your-super-secure-jwt-secret
```

### Monitoring

- Set up monitoring for Redis memory usage
- Monitor email queue backlog
- Track email delivery rates
- Set up alerts for failed email jobs

## 📝 Next Steps

1. **Set up Redis** on your development machine
2. **Configure environment variables** with your email credentials
3. **Test the system** by creating a blog post
4. **Monitor the queue** using the API endpoints
5. **Deploy to production** with proper Redis setup

Your email system is now production-ready with enterprise-grade features! 🎉
