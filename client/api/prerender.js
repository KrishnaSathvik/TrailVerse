/**
 * Vercel Serverless Function for Prerendering
 * Detects social media crawlers and serves pre-rendered HTML with correct meta tags
 */

// Note: In Vercel serverless functions, we can't reliably read index.html
// So we'll use a fallback HTML that loads the React app

// Helper function to normalize image URLs for mobile apps
// Ensures all URLs are HTTPS and publicly accessible
const normalizeImageUrl = (url) => {
  if (!url || url.trim() === '') {
    return 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
  }
  
  // Skip data URLs - mobile apps can't use these
  if (url.startsWith('data:image/')) {
    return 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
  }
  
  // Convert HTTP to HTTPS (required for mobile apps)
  if (url.startsWith('http://')) {
    url = url.replace(/^http:\/\//i, 'https://');
  }
  
  // If already HTTPS, check if it's a trailverse.onrender.com URL
  // Convert to production domain for better accessibility
  if (url.startsWith('https://trailverse.onrender.com')) {
    // Convert Render.com URLs to production domain
    url = url.replace('https://trailverse.onrender.com', 'https://www.nationalparksexplorerusa.com');
  }
  
  // If already HTTPS with production domain, return as is
  if (url.startsWith('https://www.nationalparksexplorerusa.com')) {
    return url;
  }
  
  // If it's already a full HTTPS URL (from NPS API, etc.), return as is
  if (url.startsWith('https://')) {
    return url;
  }
  
  // Handle API image paths - use production domain (Vercel proxy will handle it)
  if (url.startsWith('/api/images/file/')) {
    return `https://www.nationalparksexplorerusa.com${url}`;
  }
  
  // Handle /uploads/ paths - use production domain
  if (url.startsWith('/uploads/')) {
    return `https://www.nationalparksexplorerusa.com${url}`;
  }
  
  // Handle relative paths
  if (url.startsWith('/')) {
    return `https://www.nationalparksexplorerusa.com${url}`;
  }
  
  // Handle relative paths without leading slash
  return `https://www.nationalparksexplorerusa.com/${url}`;
};

export default async function handler(req, res) {
  const userAgent = req.headers['user-agent'] || '';
  // Get pathname from request - in Vercel, req.url includes query string
  let pathname = req.url ? new URL(req.url, `https://${req.headers.host}`).pathname : (req.query.path || '/');
  
  // Remove trailing slash for consistency
  if (pathname !== '/' && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  // Check if it's a crawler - expanded list (including mobile apps)
  const crawlerPatterns = [
    'facebookexternalhit', // Facebook
    'Facebot', // Facebook
    'Twitterbot', // Twitter
    'LinkedInBot', // LinkedIn
    'WhatsApp', // WhatsApp (mobile)
    'WhatsApp/2', // WhatsApp mobile
    'Slackbot', // Slack
    'Slackbot-LinkExpanding', // Slack
    'SkypeUriPreview', // Skype
    'Applebot', // Apple
    'Pinterest', // Pinterest
    'Pinterestbot', // Pinterest bot
    'Pinterest/0.1', // Pinterest
    'Snapchat', // Snapchat (mobile)
    'SnapchatBot', // Snapchat bot
    'Snapchat/1.0', // Snapchat mobile
    'Discordbot', // Discord
    'TelegramBot', // Telegram
    'Viber', // Viber (mobile)
    'Googlebot', // Google (sometimes)
    'bingbot', // Bing
    'YandexBot', // Yandex
    'SemrushBot', // SEO tools
    'AhrefsBot', // SEO tools
    'Screaming Frog SEO Spider', // SEO tools
    'Redditbot', // Reddit
    'Tumblr', // Tumblr
    'Line', // Line messenger (mobile)
    'WeChat', // WeChat (mobile)
    'QQ', // QQ (mobile)
    'Baiduspider', // Baidu
    'Instagram', // Instagram (mobile)
    'LinkedInApp', // LinkedIn mobile app
    'FBAN', // Facebook mobile app
    'FBAV', // Facebook mobile app
    'FB_IAB', // Facebook mobile app
    'FB4A', // Facebook mobile app
    'FBAN/FBIOS', // Facebook iOS app
    'FBAN/FB4A', // Facebook Android app
    'Twitter', // Twitter mobile app
    'TwitterAndroid', // Twitter Android app
    'TwitteriOS', // Twitter iOS app
    'LinkedInApp', // LinkedIn mobile app
    'LinkedInIOS', // LinkedIn iOS app
    'LinkedInAndroid' // LinkedIn Android app
  ];

  const isCrawler = crawlerPatterns.some(pattern => 
    userAgent.toLowerCase().includes(pattern.toLowerCase())
  );

  // Log for debugging (remove in production if needed)
  console.log('Prerender function called:', {
    pathname,
    userAgent: userAgent.substring(0, 100), // Log first 100 chars
    isCrawler
  });

  // If the pathname is exactly /blog (not /blog/:slug), always serve index.html
  // This prevents the prerender function from interfering with the blog listing page
  if (pathname === '/blog') {
    // Return 404 so Vercel's catch-all rewrite will serve index.html
    return res.status(404).json({ error: 'Not found' });
  }

  // If not a crawler, return 404 so Vercel's catch-all rewrite will serve index.html
  // With the updated vercel.json, non-crawlers won't even reach this function
  // But we keep this check as a safety measure
  if (!isCrawler) {
    // Return 404 - Vercel's catch-all rewrite will serve index.html
    return res.status(404).json({ error: 'Not found' });
  }

  // Default meta tags
  let metaTags = {
    title: 'TrailVerse - Explore America\'s 470+ National Parks & Sites',
    description: 'Discover, plan, and explore America\'s 470+ National Parks, Monuments, Historic Sites, and more with AI-powered trip planning, interactive maps, events calendar, and expert travel guides.',
    image: 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg',
    url: `https://www.nationalparksexplorerusa.com${pathname}`,
    type: 'website'
  };

  // Fetch data from API based on URL
  const apiBaseUrl = process.env.API_URL || 'https://trailverse.onrender.com';

  try {
    // Handle blog post routes
    if (pathname.startsWith('/blog/') && pathname !== '/blog') {
      const slug = pathname.split('/blog/')[1]?.split('?')[0]?.split('#')[0]; // Remove query params and hash
      if (slug) {
        console.log(`Fetching blog post for slug: ${slug}`);
        try {
          const response = await fetch(`${apiBaseUrl}/api/blogs/${slug}`);
          console.log(`API response status: ${response.status}`);
          if (response.ok) {
            const result = await response.json();
            const post = result.data;
            console.log(`Blog post found: ${post?.title || 'No title'}`);
            
            if (post) {
              // Handle featured image URL construction - use helper function for mobile compatibility
              let imageUrl = 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg'; // Default
              
              if (post.featuredImage) {
                // Check if it's a data URL (base64) - social media crawlers can't use these
                if (post.featuredImage.startsWith('data:image/')) {
                  console.log('Featured image is a data URL (base64) - cannot use for social media');
                  // Try to extract image from content HTML as fallback
                  if (post.content) {
                    const imgMatch = post.content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
                    if (imgMatch && imgMatch[1]) {
                      const contentImgUrl = imgMatch[1];
                      if (!contentImgUrl.startsWith('data:image/')) {
                        // Found a non-data URL image in content - normalize for mobile apps
                        imageUrl = normalizeImageUrl(contentImgUrl);
                        console.log(`Using image from content: ${imageUrl}`);
                      } else {
                        console.log('Content image is also a data URL - using default');
                      }
                    } else {
                      console.log('No valid image found in content - using default');
                    }
                  } else {
                    console.log('No content available - using default image');
                  }
                } else {
                  // Normalize image URL for mobile apps (ensures HTTPS)
                  imageUrl = normalizeImageUrl(post.featuredImage);
                }
              }
              
              console.log(`Final featured image URL: ${imageUrl}`);
              console.log(`Original featuredImage format: ${post.featuredImage ? (post.featuredImage.substring(0, 50) + '...') : 'null'}`);
              
              metaTags = {
                title: `${post.title} | TrailVerse`,
                description: post.excerpt || (post.content ? post.content.substring(0, 200).replace(/<[^>]*>/g, '') : '') || metaTags.description,
                image: imageUrl,
                url: `https://www.nationalparksexplorerusa.com/blog/${post.slug}`,
                type: 'article',
                published: post.publishedAt,
                modified: post.updatedAt,
                author: post.author?.name || 'TrailVerse Team'
              };
              console.log(`Meta tags set for blog post: ${metaTags.title}`);
            }
          } else {
            console.error(`Failed to fetch blog post: ${response.status} ${response.statusText}`);
          }
        } catch (error) {
          console.error('Error fetching blog post:', error.message);
        }
      }
    }

    // Handle park detail routes
    if (pathname.startsWith('/parks/') && pathname !== '/parks') {
      const parkCode = pathname.split('/parks/')[1]?.split('?')[0]?.split('#')[0]; // Remove query params and hash
      if (parkCode) {
        console.log(`Fetching park for code: ${parkCode}`);
        try {
          const response = await fetch(`${apiBaseUrl}/api/parks/${parkCode}`);
          console.log(`API response status: ${response.status}`);
          if (response.ok) {
            const result = await response.json();
            const park = result.data;
            console.log(`Park found: ${park?.name || 'No name'}`);
            
            if (park) {
              // Handle park image URL construction - use helper function for mobile compatibility
              // Park images from NPS API can be objects with .url property or strings
              let imageUrl = 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg'; // Default
              
              if (park.images && park.images.length > 0) {
                // Get first image - could be object with .url or string
                const firstImage = park.images[0];
                const imageString = typeof firstImage === 'string' ? firstImage : (firstImage.url || firstImage.src || '');
                
                if (imageString) {
                  // Normalize image URL for mobile apps (ensures HTTPS)
                  imageUrl = normalizeImageUrl(imageString);
                }
              }
              
              console.log(`Park image URL: ${imageUrl}`);
              
              metaTags = {
                title: `${park.name} | TrailVerse`,
                description: park.description || `Explore ${park.name}, one of America's amazing National Parks. Discover park information, activities, weather, and plan your visit.`,
                image: imageUrl,
                url: `https://www.nationalparksexplorerusa.com/parks/${park.parkCode}`,
                type: 'website'
              };
              console.log(`Meta tags set for park: ${metaTags.title}`);
            }
          } else {
            console.error(`Failed to fetch park: ${response.status} ${response.statusText}`);
          }
        } catch (error) {
          console.error('Error fetching park:', error.message);
        }
      }
    }
  } catch (error) {
    console.error('Error in prerender function:', error);
  }

  // Helper function to escape HTML entities (for text content only, not URLs)
  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Escape meta tag text values to prevent HTML injection
  // URLs should NOT be escaped - browsers handle URL encoding automatically
  const safeTitle = escapeHtml(metaTags.title);
  const safeDescription = escapeHtml(metaTags.description);
  // Don't escape image URL or page URL - they need to remain valid URLs
  const safeImage = metaTags.image || 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
  const safeUrl = metaTags.url || 'https://www.nationalparksexplorerusa.com';

  // Generate HTML with meta tags
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="/" />
    
    <!-- Primary Meta Tags -->
    <title>${safeTitle}</title>
    <meta name="title" content="${safeTitle}" />
    <meta name="description" content="${safeDescription}" />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="${metaTags.type}" />
    <meta property="og:url" content="${safeUrl}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:secure_url" content="${safeImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:site_name" content="TrailVerse" />
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${safeUrl}" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${safeImage}" />
    <meta name="twitter:image:src" content="${safeImage}" />
    <meta name="twitter:site" content="@TrailVerse" />
    
    <!-- Mobile-specific tags -->
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    
    <!-- Snapchat-specific tags -->
    <meta property="snapchat:sticker" content="${safeImage}" />
    
    <!-- Pinterest-specific tags -->
    <meta property="pinterest:media" content="${safeImage}" />
    <meta property="pinterest:description" content="${safeDescription}" />
    
    <!-- WhatsApp-specific tags (uses Open Graph, but ensure HTTPS) -->
    <meta property="og:image:url" content="${safeImage}" />
    
    ${metaTags.type === 'article' ? `
    <!-- Article specific tags -->
    <meta property="article:published_time" content="${metaTags.published || ''}" />
    ${metaTags.modified ? `<meta property="article:modified_time" content="${escapeHtml(metaTags.modified)}" />` : ''}
    <meta property="article:author" content="${escapeHtml(metaTags.author || 'TrailVerse Team')}" />
    <meta property="article:section" content="Travel" />
    ` : ''}
    
    <!-- Canonical URL -->
    <link rel="canonical" href="${safeUrl}" />
    
    <!-- Redirect to actual page for JavaScript-enabled browsers -->
    <script>
      // Only redirect if not a crawler (crawlers won't execute this)
      if (typeof window !== 'undefined') {
        window.location.href = ${JSON.stringify(metaTags.url)};
      }
    </script>
  </head>
  <body>
    <noscript>
      <h1>${safeTitle}</h1>
      <p>${safeDescription}</p>
      <p><a href="${safeUrl}">Visit TrailVerse</a></p>
    </noscript>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

  // Log final meta tags for debugging
  console.log('Final meta tags:', {
    title: metaTags.title,
    description: metaTags.description.substring(0, 100),
    image: metaTags.image,
    url: metaTags.url
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('X-Robots-Tag', 'noindex'); // Don't index prerendered pages
  return res.status(200).send(html);
}

