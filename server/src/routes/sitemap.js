const express = require('express');
const router = express.Router();
const { getNpsService } = require('../services/npsService');
const BlogPost = require('../models/BlogPost');
const { blogDateModified } = require('../utils/blogDates');

// @desc    Generate dynamic sitemap
// @route   GET /sitemap.xml
// @access  Public
router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = 'https://www.nationalparksexplorerusa.com';
    // No request-time lastmod: static hubs and park pages omit <lastmod> rather
    // than claiming they changed today. /blog uses its newest post's date.
    const toDay = (date) => date.toISOString().split('T')[0];
    let blogEntries = '';
    let blogHubLastmod = null;

    // Static pages
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <url>
    <loc>${baseUrl}/explore</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${baseUrl}/map</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

  <url>
    <loc>${baseUrl}/compare</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>

  <url>
    <loc>${baseUrl}/plan-ai</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>

  <url>
    <loc>${baseUrl}/events</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>

  <url>
    <loc>${baseUrl}/blog</loc>__BLOG_HUB_LASTMOD__
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
`;

    // Add all parks
    try {
      const parks = await getNpsService().getAllParks();
      const nationalParks = parks.filter(p => p.designation === 'National Park');
      
      nationalParks.forEach(park => {
        sitemap += `
  <url>
    <loc>${baseUrl}/parks/${park.parkCode}</loc>
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
        const modified = blogDateModified(post);
        if (modified && (!blogHubLastmod || modified > blogHubLastmod)) blogHubLastmod = modified;
        const lastmodTag = modified ? `
    <lastmod>${toDay(modified)}</lastmod>` : '';
        
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
        
        blogEntries += `
  <url>
    <loc>${baseUrl}/blog/${post.slug}</loc>${lastmodTag}
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

    sitemap += blogEntries;
    sitemap = sitemap.replace(
      '__BLOG_HUB_LASTMOD__',
      blogHubLastmod ? `
    <lastmod>${toDay(blogHubLastmod)}</lastmod>` : ''
    );
    sitemap += '\n</urlset>';

    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).send('Error generating sitemap');
  }
});

module.exports = router;
