# Blog Image Migration Guide

## Problem
Existing blog posts have featured images stored as base64 data URLs (`data:image/...`), which don't work for social media crawlers. Social media platforms need actual HTTP URLs to display images in previews.

## Solution
A migration script that:
1. Finds all blog posts with base64 featured images
2. Tries to extract image URLs from the blog content HTML
3. Falls back to default image if no image found in content
4. Updates the blog post with the proper URL

## Usage

### Option 1: Run Migration Script (Recommended)

**From the server directory:**

```bash
cd server
node scripts/fix-blog-images.js
```

**From the root directory:**

```bash
node server/scripts/fix-blog-images.js
```

### Options

**Dry Run (Test without making changes):**
```bash
node server/scripts/fix-blog-images.js --dry-run
```

This will show you what would be changed without actually updating the database.

**Use Default Image Only:**
```bash
node server/scripts/fix-blog-images.js --default-only
```

This will skip trying to extract images from content and directly set the default image for all posts with base64 images.

**Combine Options:**
```bash
node server/scripts/fix-blog-images.js --dry-run --default-only
```

## What the Script Does

1. **Connects to MongoDB** using `MONGODB_URI` from `.env`
2. **Finds all blog posts** with `featuredImage` starting with `data:image/`
3. **For each post:**
   - Checks if it already has a proper URL (skips if so)
   - Tries to extract first `<img>` tag from content HTML
   - Skips data URLs found in content
   - Normalizes relative URLs to absolute URLs
   - Falls back to default image if no valid image found
   - Updates the blog post in the database

## Example Output

```
🚀 Starting blog image migration...
   Mode: LIVE (will update database)
   Strategy: Extract from content, fallback to default
════════════════════════════════════════════════════════

📡 Connecting to database...
✅ Connected to database

🔍 Finding blog posts with base64 featured images...
✅ Found 5 blog post(s) with base64 featured images

📝 Processing: "Survive Thanksgiving Flights" (survive-thanksgiving-flights)
   Current featuredImage: data:image/webp;base64,UklGRnReBgBXRUJQVlA4IGheBgBQ2BSdASrQBzUFPm0wk0ckIqqvKDItc...
   ⚠️  No valid image found in content
   🔄 Using default image: https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg
   ✅ Updated successfully

📊 Migration Summary:
   Processed: 5
   Skipped: 0
   Errors: 0
   Total: 5

✅ Migration completed!
```

## Manual Fix Option

If you prefer to fix blog posts manually:

1. Go to Admin Dashboard → Blog Posts
2. Edit each blog post with base64 featured image
3. Upload a new featured image (it will now be uploaded properly)
4. Save the post

## After Migration

- ✅ All existing blog posts will have proper image URLs
- ✅ Social media previews will work correctly
- ✅ New blog posts are already fixed (they upload images properly)

## Troubleshooting

**Error: "Cannot find module '../src/models/BlogPost'"**
- Make sure you're running from the correct directory
- Try: `cd server && node scripts/fix-blog-images.js`

**Error: "MONGODB_URI not found"**
- Make sure you have a `.env` file in the `server` directory
- Check that `MONGODB_URI` is set correctly

**No posts found:**
- Great! All your blog posts already have proper image URLs
- No migration needed

## Default Image

The script uses this default image URL:
```
https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg
```

**Note:** This image file needs to exist in your `client/public/` folder and be accessible at that URL. If it doesn't exist, you'll need to:
1. Create an `og-image-trailverse.jpg` file (1200x630px recommended)
2. Place it in `client/public/og-image-trailverse.jpg`
3. Deploy to Vercel

## Safety

- The script is **safe** - it only updates the `featuredImage` field
- Use `--dry-run` first to see what will change
- The script preserves existing proper URLs (doesn't change them)
- Errors are logged but don't stop the migration

## Next Steps

After running the migration:
1. Test sharing a blog post on social media
2. Verify the image appears in the preview
3. Clear social media caches if needed:
   - Facebook: https://developers.facebook.com/tools/debug/
   - Twitter: https://cards-dev.twitter.com/validator
   - LinkedIn: https://www.linkedin.com/post-inspector/

