const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { isCrawler } = require('../middleware/crawlerDetection');
const BlogPost = require('../models/BlogPost');
const npsService = require('../services/npsService');

/**
 * Generate pre-rendered HTML with dynamic meta tags for crawlers
 */
const generatePrerenderedHTML = async (req, res, next) => {
  try {
    // Skip API routes - they should work normally
    if (req.path.startsWith('/api/')) {
      return next();
    }

    // Check if it's a crawler
    if (!isCrawler(req)) {
      return next(); // Not a crawler, continue to normal React app
    }

    const pathname = req.path;
    let metaTags = {
      title: 'TrailVerse - Explore America\'s 470+ National Parks & Sites',
      description: 'Discover, plan, and explore America\'s 470+ National Parks, Monuments, Historic Sites, and more with AI-powered trip planning, interactive maps, events calendar, and expert travel guides.',
      image: 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg',
      url: `https://www.nationalparksexplorerusa.com${pathname}`,
      type: 'website'
    };

    // Handle blog post routes
    if (pathname.startsWith('/blog/') && pathname !== '/blog') {
      const slug = pathname.split('/blog/')[1];
      if (slug) {
        try {
          const post = await BlogPost.findOne({ slug }).lean();
          if (post) {
            const imageUrl = post.featuredImage 
              ? (post.featuredImage.startsWith('http') 
                  ? post.featuredImage 
                  : `https://www.nationalparksexplorerusa.com${post.featuredImage.startsWith('/') ? post.featuredImage : '/' + post.featuredImage}`)
              : 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
            
            metaTags = {
              title: `${post.title} | TrailVerse`,
              description: post.excerpt || post.content?.substring(0, 200) || metaTags.description,
              image: imageUrl,
              url: `https://www.nationalparksexplorerusa.com/blog/${post.slug}`,
              type: 'article',
              published: post.publishedAt?.toISOString(),
              modified: post.updatedAt?.toISOString(),
              author: post.author?.name || 'TrailVerse Team'
            };
          }
        } catch (error) {
          console.error('Error fetching blog post for prerender:', error);
        }
      }
    }

    // Handle park detail routes
    if (pathname.startsWith('/parks/') && pathname !== '/parks') {
      const parkCode = pathname.split('/parks/')[1];
      if (parkCode) {
        try {
          const park = await npsService.getParkByCode(parkCode);
          if (park) {
            const imageUrl = park.images && park.images.length > 0
              ? (park.images[0].startsWith('http')
                  ? park.images[0]
                  : `https://www.nationalparksexplorerusa.com${park.images[0].startsWith('/') ? park.images[0] : '/' + park.images[0]}`)
              : 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
            
            metaTags = {
              title: `${park.name} | TrailVerse`,
              description: park.description || `Explore ${park.name}, one of America's amazing National Parks. Discover park information, activities, weather, and plan your visit.`,
              image: imageUrl,
              url: `https://www.nationalparksexplorerusa.com/parks/${park.parkCode}`,
              type: 'website'
            };
          }
        } catch (error) {
          console.error('Error fetching park for prerender:', error);
        }
      }
    }

    // Generate HTML with meta tags
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="/" />
    
    <!-- Primary Meta Tags -->
    <title>${metaTags.title}</title>
    <meta name="title" content="${metaTags.title}" />
    <meta name="description" content="${metaTags.description}" />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="${metaTags.type}" />
    <meta property="og:url" content="${metaTags.url}" />
    <meta property="og:title" content="${metaTags.title}" />
    <meta property="og:description" content="${metaTags.description}" />
    <meta property="og:image" content="${metaTags.image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="TrailVerse" />
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${metaTags.url}" />
    <meta name="twitter:title" content="${metaTags.title}" />
    <meta name="twitter:description" content="${metaTags.description}" />
    <meta name="twitter:image" content="${metaTags.image}" />
    <meta name="twitter:site" content="@TrailVerse" />
    
    ${metaTags.type === 'article' ? `
    <!-- Article specific tags -->
    <meta property="article:published_time" content="${metaTags.published || ''}" />
    ${metaTags.modified ? `<meta property="article:modified_time" content="${metaTags.modified}" />` : ''}
    <meta property="article:author" content="${metaTags.author || 'TrailVerse Team'}" />
    <meta property="article:section" content="Travel" />
    ` : ''}
    
    <!-- Canonical URL -->
    <link rel="canonical" href="${metaTags.url}" />
    
    <!-- Redirect to actual page for JavaScript-enabled browsers -->
    <script>
      // Only redirect if not a crawler (crawlers won't execute this)
      if (typeof window !== 'undefined') {
        window.location.href = '${metaTags.url}';
      }
    </script>
  </head>
  <body>
    <noscript>
      <h1>${metaTags.title}</h1>
      <p>${metaTags.description}</p>
      <p><a href="${metaTags.url}">Visit TrailVerse</a></p>
    </noscript>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Error generating prerendered HTML:', error);
    next(); // Fall back to normal React app
  }
};

// Apply prerender middleware to all routes
router.get('*', generatePrerenderedHTML);

module.exports = router;

