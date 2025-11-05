const express = require('express');
const router = express.Router();
const BlogPost = require('../models/BlogPost');
const npsService = require('../services/npsService');

/**
 * @desc    Get meta tags for a specific URL
 * @route   GET /api/meta-tags
 * @access  Public
 * @query   url - The URL to get meta tags for
 */
const getMetaTags = async (req, res, next) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL parameter is required'
      });
    }

    // Parse URL to get pathname
    let pathname;
    try {
      const urlObj = new URL(url);
      pathname = urlObj.pathname;
    } catch (error) {
      // If URL parsing fails, try to extract pathname manually
      pathname = url.replace(/^https?:\/\/[^\/]+/, '') || '/';
    }

    let metaTags = {
      title: 'TrailVerse - Explore America\'s 470+ National Parks & Sites',
      description: 'Discover, plan, and explore America\'s 470+ National Parks, Monuments, Historic Sites, and more with AI-powered trip planning, interactive maps, events calendar, and expert travel guides.',
      image: 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg',
      url: url,
      type: 'website',
      og: {
        type: 'website',
        url: url,
        title: 'TrailVerse - Explore America\'s 470+ National Parks & Sites',
        description: 'Discover, plan, and explore America\'s 470+ National Parks, Monuments, Historic Sites, and more with AI-powered trip planning, interactive maps, events calendar, and expert travel guides.',
        image: 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg',
        site_name: 'TrailVerse'
      },
      twitter: {
        card: 'summary_large_image',
        url: url,
        title: 'TrailVerse - Explore America\'s 470+ National Parks & Sites',
        description: 'Discover, plan, and explore America\'s 470+ National Parks, Monuments, Historic Sites, and more with AI-powered trip planning, interactive maps, events calendar, and expert travel guides.',
        image: 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg',
        site: '@TrailVerse'
      }
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
              url: url,
              type: 'article',
              published: post.publishedAt?.toISOString(),
              modified: post.updatedAt?.toISOString(),
              author: post.author?.name || 'TrailVerse Team',
              og: {
                type: 'article',
                url: url,
                title: `${post.title} | TrailVerse`,
                description: post.excerpt || post.content?.substring(0, 200) || metaTags.description,
                image: imageUrl,
                site_name: 'TrailVerse',
                published_time: post.publishedAt?.toISOString(),
                modified_time: post.updatedAt?.toISOString(),
                author: post.author?.name || 'TrailVerse Team',
                section: 'Travel'
              },
              twitter: {
                card: 'summary_large_image',
                url: url,
                title: `${post.title} | TrailVerse`,
                description: post.excerpt || post.content?.substring(0, 200) || metaTags.description,
                image: imageUrl,
                site: '@TrailVerse'
              }
            };
          }
        } catch (error) {
          console.error('Error fetching blog post for meta tags:', error);
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
              url: url,
              type: 'website',
              og: {
                type: 'website',
                url: url,
                title: `${park.name} | TrailVerse`,
                description: park.description || `Explore ${park.name}, one of America's amazing National Parks. Discover park information, activities, weather, and plan your visit.`,
                image: imageUrl,
                site_name: 'TrailVerse'
              },
              twitter: {
                card: 'summary_large_image',
                url: url,
                title: `${park.name} | TrailVerse`,
                description: park.description || `Explore ${park.name}, one of America's amazing National Parks. Discover park information, activities, weather, and plan your visit.`,
                image: imageUrl,
                site: '@TrailVerse'
              }
            };
          }
        } catch (error) {
          console.error('Error fetching park for meta tags:', error);
        }
      }
    }

    res.status(200).json({
      success: true,
      data: metaTags
    });
  } catch (error) {
    next(error);
  }
};

router.get('/', getMetaTags);

module.exports = router;

