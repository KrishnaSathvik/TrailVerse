# Social Media Preview Fix - Solution Guide

## Problem
When sharing blog posts or park detail pages on social media (Facebook, Twitter, WhatsApp, etc.), the preview shows the homepage metadata instead of the specific page's content.

## Root Cause
Your app is a **Client-Side React App (SPA)**. Social media crawlers (bots) don't execute JavaScript - they only read the initial HTML. When they fetch a URL like `/blog/my-post` or `/parks/yellowstone`, they get the static `index.html` file which has homepage meta tags hardcoded.

## Solutions Implemented

### Solution 1: Server-Side Prerendering (Node.js Server)
If your server serves the React app, we've added a prerender route that:
- Detects social media crawlers (Facebook, Twitter, WhatsApp, etc.)
- Fetches blog post or park data from the database
- Returns pre-rendered HTML with correct meta tags
- For regular users, serves the normal React app

**Files Created:**
- `server/src/middleware/crawlerDetection.js` - Detects crawlers
- `server/src/routes/prerender.js` - Generates pre-rendered HTML
- `server/src/routes/metaTags.js` - API endpoint for meta tags

**Note:** This only works if your Node.js server serves the React app. If you're using Vercel/Netlify/static hosting, use Solution 2 or 3.

---

### Solution 2: Vercel Serverless Functions (If using Vercel)

If you're deployed on Vercel, create a serverless function:

**File: `api/prerender.js`**
```javascript
export default async function handler(req, res) {
  const userAgent = req.headers['user-agent'] || '';
  const isCrawler = userAgent.includes('facebookexternalhit') || 
                    userAgent.includes('Twitterbot') || 
                    userAgent.includes('WhatsApp');
  
  if (!isCrawler) {
    // Not a crawler, serve normal React app
    return res.redirect(302, req.url);
  }
  
  // Fetch data based on URL and return pre-rendered HTML
  // Similar to server/src/routes/prerender.js
}
```

Then update `vercel.json`:
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/prerender"
    }
  ]
}
```

---

### Solution 3: Use a Prerendering Service

**Option A: Prerender.io (Recommended)**
1. Sign up at https://prerender.io
2. Add to your `vercel.json`:
```json
{
  "prerender": {
    "crawlerUserAgents": [
      "facebookexternalhit",
      "Twitterbot",
      "LinkedInBot",
      "WhatsApp"
    ],
    "prerenderServiceUrl": "https://service.prerender.io"
  }
}
```

**Option B: Netlify Prerendering**
If using Netlify, add `netlify.toml`:
```toml
[[plugins]]
package = "@netlify/plugin-prerender"
```

---

### Solution 4: Dynamic Meta Tags via API (Client-Side Fallback)

We've created an API endpoint `/api/meta-tags?url=...` that returns meta tags for any URL.

**Usage:**
```javascript
fetch(`/api/meta-tags?url=${encodeURIComponent(window.location.href)}`)
  .then(res => res.json())
  .then(data => {
    // Use meta tags data
  });
```

**Note:** This doesn't help with crawlers (they don't execute JS), but can be useful for client-side updates.

---

## Testing Your Fix

### Test with Facebook Debugger
1. Go to https://developers.facebook.com/tools/debug/
2. Enter your blog post URL: `https://www.nationalparksexplorerusa.com/blog/your-post`
3. Click "Scrape Again"
4. Check if it shows the correct title, description, and image

### Test with Twitter Card Validator
1. Go to https://cards-dev.twitter.com/validator
2. Enter your blog post URL
3. Check if the preview is correct

### Test with WhatsApp
1. Share a blog post link in WhatsApp
2. Check if the preview shows correct content

---

## Recommended Solution Based on Your Setup

**If using Vercel:**
- Use Solution 2 (Serverless Functions) or Solution 3A (Prerender.io)

**If using Netlify:**
- Use Solution 3B (Netlify Prerendering)

**If using your own Node.js server:**
- Solution 1 (Server-Side Prerendering) should work

**If using static hosting:**
- Use Solution 3A (Prerender.io) or similar service

---

## Additional Improvements

1. **Add Cache Headers** - Cache prerendered HTML for crawlers
2. **Monitor Crawler Requests** - Log which crawlers are visiting
3. **Fallback Handling** - Ensure regular users still get the React app
4. **Image Optimization** - Ensure OG images are properly sized (1200x630px)

---

## Files Modified/Created

1. ✅ `server/src/middleware/crawlerDetection.js` - New
2. ✅ `server/src/routes/prerender.js` - New  
3. ✅ `server/src/routes/metaTags.js` - New
4. ✅ `server/src/app.js` - Updated to include new routes

---

## Next Steps

1. **Determine your deployment setup** (Vercel, Netlify, custom server, etc.)
2. **Choose the appropriate solution** from above
3. **Test with Facebook/Twitter debuggers**
4. **Monitor crawler requests** in your server logs
5. **Clear social media cache** after deploying fixes

---

## Troubleshooting

**Issue:** Still showing homepage meta tags
- **Fix:** Clear Facebook/Twitter cache using their debugger tools
- **Fix:** Ensure crawler detection is working (check server logs)
- **Fix:** Verify database queries are working for blog/park data

**Issue:** Regular users seeing prerendered HTML
- **Fix:** Ensure crawler detection is working correctly
- **Fix:** Check that `next()` is called for non-crawlers

**Issue:** API routes not working
- **Fix:** Ensure API routes are excluded from prerender (already done)

