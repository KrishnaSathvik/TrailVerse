# Testing Meta Tags for Social Media Sharing

This guide explains how to test if blog posts will display correctly when shared on social media platforms (Facebook, Twitter, WhatsApp, etc.).

## Quick Test Methods

### Method 1: Visual Test Page (Easiest)

1. **Start your development servers:**
   ```bash
   # Terminal 1: Start API server
   cd server
   npm run dev
   # Server runs on http://localhost:5001
   
   # Terminal 2: Start client
   cd client
   npm run dev
   # Client runs on http://localhost:3001
   ```

2. **Open the test page:**
   - Navigate to: `http://localhost:3001/test-meta-tags.html`
   - Enter a blog post slug (e.g., `best-national-parks-thanksgiving`)
   - Click "Test Meta Tags"
   - You'll see:
     - A preview card showing how it will look when shared
     - The actual image (if available)
     - All meta tags that will be generated

### Method 2: Command Line Test Script

1. **Run the test script:**
   ```bash
   cd client
   node test-prerender.js <blog-slug>
   ```
   
   Example:
   ```bash
   node test-prerender.js best-national-parks-thanksgiving
   ```

2. **What it does:**
   - Fetches the blog post from your API
   - Generates meta tags (same logic as prerender.js)
   - Tests if the image URL is accessible
   - Creates an HTML file with the meta tags
   - Shows you all the generated meta tags

3. **Output:**
   - Console output with all meta tags
   - A file `test-prerender-output-<slug>.html` you can open in a browser

### Method 3: Test with Social Media Debuggers

After deploying to a public URL (or using ngrok for local testing):

1. **Facebook Sharing Debugger:**
   - Go to: https://developers.facebook.com/tools/debug/
   - Enter your blog post URL
   - Click "Scrape Again"
   - Check if the preview shows correctly

2. **Twitter Card Validator:**
   - Go to: https://cards-dev.twitter.com/validator
   - Enter your blog post URL
   - Check the preview

3. **LinkedIn Post Inspector:**
   - Go to: https://www.linkedin.com/post-inspector/
   - Enter your blog post URL

## What to Check

### ✅ Good Signs:
- Image displays correctly in the preview
- Title shows the blog post title (not homepage title)
- Description shows the excerpt
- URL is correct

### ❌ Problems to Fix:

1. **No Image Showing:**
   - Check if `featuredImage` is a data URL (base64)
   - Run the migration script: `node server/scripts/fix-blog-images.js`
   - Or ensure new blog posts upload images properly

2. **Wrong Image:**
   - Check the image URL in the meta tags
   - Verify the image is accessible (try opening the URL directly)
   - Check if the image URL is absolute (starts with `http://` or `https://`)

3. **Wrong Title/Description:**
   - Check if the blog post has `title` and `excerpt` fields
   - Verify the API is returning the correct data

## Testing in Development

The `normalizeImageUrl` function automatically detects if you're in development mode and uses `localhost` URLs instead of production URLs. This allows you to test locally.

### Development Mode Detection:
- Checks if `req.headers.host` includes `localhost` or `127.0.0.1`
- Checks `process.env.NODE_ENV === 'development'`
- Checks `process.env.VERCEL_ENV === 'development'`

### Local Testing with ngrok (Optional):

If you want to test with real social media crawlers locally:

1. **Install ngrok:**
   ```bash
   npm install -g ngrok
   ```

2. **Start your servers** (as above)

3. **Expose localhost:**
   ```bash
   ngrok http 3001
   ```

4. **Use the ngrok URL** in social media debuggers:
   - Example: `https://abc123.ngrok.io/blog/your-post-slug`

## Common Issues

### Issue: Image is a data URL (base64)
**Solution:** Run the migration script to fix existing posts:
```bash
cd server
node scripts/fix-blog-images.js
```

### Issue: Image URL returns 404
**Solution:** 
- Check if the image file exists
- Verify the image path is correct
- Check if the API endpoint `/api/images/file/...` is working

### Issue: Meta tags show homepage content
**Solution:**
- Verify the prerender function is being called
- Check Vercel logs to see if crawlers are detected
- Ensure `vercel.json` has the correct rewrite rules

## Files Created

1. **`client/public/test-meta-tags.html`** - Visual test page
2. **`client/test-prerender.js`** - Command line test script
3. **Updated `client/api/prerender.js`** - Now supports dev mode

## Next Steps

1. Test locally using Method 1 or 2
2. Fix any issues found
3. Deploy to staging/production
4. Test with real social media debuggers (Method 3)
5. Verify images show correctly when actually shared

