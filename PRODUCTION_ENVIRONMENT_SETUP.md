# Production Environment Setup for TrailVerse

## Required Environment Variables for Vercel Deployment

Set these environment variables in your Vercel dashboard:

### Server Configuration
```
NODE_ENV=production
CLIENT_URL=https://www.nationalparksexplorerusa.com
WEBSITE_URL=https://www.nationalparksexplorerusa.com
```

### Database
```
MONGODB_URI=your_production_mongodb_uri_here
```

### Security
```
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long-change-this-in-production
```

### AI APIs
```
ANTHROPIC_API_KEY=your-anthropic-key-here
OPENAI_API_KEY=your-openai-key-here
```

### External APIs
```
OPENWEATHER_API_KEY=your-openweather-api-key
NPS_API_KEY=your-nps-api-key
```

### Email Configuration
```
EMAIL_SERVICE=gmail
EMAIL_USER=trailverseteam@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM_NAME=TrailVerse
ADMIN_EMAIL=trailverseteam@gmail.com
SUPPORT_EMAIL=trailverseteam@gmail.com
```

### Rate Limiting
```
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_AUTH_MAX=50
```

## Domain Configuration

### Primary Domain
- **Production**: `https://www.nationalparksexplorerusa.com`
- **Redirect Domain**: `trailverse.dev` → `https://www.nationalparksexplorerusa.com`

### Vercel Configuration
The `vercel.json` has been updated to include:
- Domain redirects from `trailverse.dev` to `nationalparksexplorerusa.com`
- Production environment variables
- Proper routing configuration

## Deployment Checklist

1. ✅ Set all environment variables in Vercel dashboard
2. ✅ Configure custom domains in Vercel
3. ✅ Update DNS records for both domains
4. ✅ Test API endpoints after deployment
5. ✅ Verify email functionality
6. ✅ Test authentication flows
7. ✅ Check SEO and sitemap generation
