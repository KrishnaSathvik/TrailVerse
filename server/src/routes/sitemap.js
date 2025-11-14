const express = require('express');
const router = express.Router();
const npsService = require('../services/npsService');
const BlogPost = require('../models/BlogPost');

// @desc    Generate dynamic sitemap
// @route   GET /sitemap.xml
// @access  Public
router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = 'https://www.nationalparksexplorerusa.com';
    const today = new Date().toISOString().split('T')[0];

    // Static pages
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <url>
    <loc>${baseUrl}/explore</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${baseUrl}/map</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

  <url>
    <loc>${baseUrl}/compare</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>

  <url>
    <loc>${baseUrl}/plan-ai</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>

  <url>
    <loc>${baseUrl}/events</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>

  <url>
    <loc>${baseUrl}/blog</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
`;

    // Add all parks
    try {
      const parks = await npsService.getAllParks();
      const nationalParks = parks.filter(p => p.designation === 'National Park');
      
      nationalParks.forEach(park => {
        sitemap += `
  <url>
    <loc>${baseUrl}/parks/${park.parkCode}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
    ${park.images?.[0]?.url ? `
    <image:image>
      <image:loc>${park.images[0].url}</image:loc>
      <image:caption>${park.fullName}</image:caption>
    </image:image>` : ''}
  </url>`;
      });
    } catch (parkError) {
      console.error('Error fetching parks for sitemap:', parkError);
      // Continue without parks if there's an error
    }

    // Add blog posts
    try {
      const blogPosts = await BlogPost.find({ status: 'published' })
        .sort({ publishedAt: -1 })
        .limit(100);
      
      blogPosts.forEach(post => {
        const lastmod = post.updatedAt.toISOString().split('T')[0];
        
        // Ensure featured image URL is absolute
        let imageUrl = '';
        if (post.featuredImage) {
          if (post.featuredImage.startsWith('http://') || post.featuredImage.startsWith('https://')) {
            imageUrl = post.featuredImage;
          } else if (post.featuredImage.startsWith('/')) {
            imageUrl = `${baseUrl}${post.featuredImage}`;
          } else {
            imageUrl = `${baseUrl}/${post.featuredImage}`;
          }
        }
        
        sitemap += `
  <url>
    <loc>${baseUrl}/blog/${post.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
    ${imageUrl ? `
    <image:image>
      <image:loc>${imageUrl}</image:loc>
      <image:caption>${post.title}</image:caption>
    </image:image>` : ''}
  </url>`;
      });
    } catch (blogError) {
      console.error('Error fetching blog posts for sitemap:', blogError);
      // Continue without blog posts if there's an error
    }

    sitemap += '\n</urlset>';

    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).send('Error generating sitemap');
  }
});

module.exports = router;
