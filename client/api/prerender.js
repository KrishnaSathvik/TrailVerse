/**
 * Vercel Serverless Function for Prerendering
 * Detects social media crawlers and serves pre-rendered HTML with correct meta tags
 */

// Note: In Vercel serverless functions, we can't reliably read index.html
// So we'll use a fallback HTML that loads the React app

// Helper function to escape HTML entities in meta tag content
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper function to normalize image URLs to absolute HTTPS URLs
function normalizeImageUrl(imageUrl, apiBaseUrl = 'https://trailverse.onrender.com', defaultImage = 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg', req = null) {
  // Detect if we're in development/local environment
  // Priority: 1) Request host, 2) Vercel environment, 3) Node environment
  let isDev = false;
  if (req && req.headers && req.headers.host) {
    const host = req.headers.host.toLowerCase();
    isDev = host.includes('localhost') || 
            host.includes('127.0.0.1') || 
            host.includes('192.168.') ||
            host.includes('.local');
  } else {
    // Check Vercel environment variables (more reliable than NODE_ENV in Vercel)
    const vercelEnv = process.env.VERCEL_ENV;
    if (vercelEnv === 'production') {
      isDev = false;
    } else if (vercelEnv === 'development' || vercelEnv === 'preview') {
      // Preview deployments should use production URLs for images
      isDev = false;
    } else {
      // No Vercel env or local development
      isDev = process.env.NODE_ENV === 'development' || 
              process.env.NODE_ENV === undefined;
    }
  }
  
  // Use localhost URLs in development
  const baseUrl = isDev ? 'http://localhost:3001' : 'https://www.nationalparksexplorerusa.com';
  const devApiUrl = 'http://localhost:5001';
  const actualApiUrl = isDev ? devApiUrl : apiBaseUrl;
  const actualDefaultImage = isDev ? `${baseUrl}/og-image-trailverse.jpg` : defaultImage;
  
  if (!imageUrl || imageUrl.trim() === '') {
    return actualDefaultImage;
  }
  
  // Skip data URLs (base64) - social media crawlers can't use these
  if (imageUrl.startsWith('data:image/')) {
    return actualDefaultImage;
  }
  
  // If image URL contains localhost and we're in production, extract the path and rebuild
  if (!isDev && imageUrl.includes('localhost')) {
    // Extract the path from localhost URL
    const localhostMatch = imageUrl.match(/localhost[:\d]*\/(.+)/);
    if (localhostMatch && localhostMatch[1]) {
      const path = localhostMatch[1];
      // If it's an /uploads/ path, convert to API endpoint
      if (path.startsWith('uploads/')) {
        const filePath = path.replace('uploads/', '');
        return `${actualApiUrl}/api/images/file/${filePath}`;
      }
      // If it's an API path, use it directly
      if (path.startsWith('api/images/file/')) {
        return `${actualApiUrl}/${path}`;
      }
    }
  }
  
  // If it's a full URL with /uploads/, convert to API endpoint
  if (imageUrl.includes('/uploads/')) {
    const filePath = imageUrl.split('/uploads/')[1];
    if (filePath) {
      return `${actualApiUrl}/api/images/file/${filePath}`;
    }
  }
  
  // Already a full HTTPS URL (and not /uploads/)
  if (imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  // Already a full HTTP URL (keep as-is in dev, convert to HTTPS in prod)
  if (imageUrl.startsWith('http://')) {
    if (isDev) {
      return imageUrl;
    }
    // In production, convert HTTP to HTTPS and replace localhost with production API
    let httpsUrl = imageUrl.replace(/^http:\/\//i, 'https://');
    if (httpsUrl.includes('localhost')) {
      // Replace localhost with production API URL
      httpsUrl = httpsUrl.replace(/https?:\/\/[^\/]+/, actualApiUrl);
    }
    return httpsUrl;
  }
  
  // Handle API image paths
  if (imageUrl.startsWith('/api/images/file/')) {
    return `${actualApiUrl}${imageUrl}`;
  }
  
  // Handle /uploads/ paths - convert to API endpoint
  if (imageUrl.startsWith('/uploads/')) {
    const filePath = imageUrl.replace('/uploads/', '');
    return `${actualApiUrl}/api/images/file/${filePath}`;
  }
  
  // Handle relative paths
  if (imageUrl.startsWith('/')) {
    return `${baseUrl}${imageUrl}`;
  }
  
  // Handle relative paths without leading slash
  return `${baseUrl}/${imageUrl}`;
}

export default async function handler(req, res) {
  const userAgent = req.headers['user-agent'] || '';
  // Get pathname from request - in Vercel, req.url includes query string
  let pathname = req.url ? new URL(req.url, `https://${req.headers.host}`).pathname : (req.query.path || '/');
  
  // Remove trailing slash for consistency
  if (pathname !== '/' && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  // Check if it's a crawler - expanded list
  const crawlerPatterns = [
    'facebookexternalhit', // Facebook
    'Facebot', // Facebook
    'Twitterbot', // Twitter
    'LinkedInBot', // LinkedIn
    'WhatsApp', // WhatsApp
    'Slackbot', // Slack
    'Slackbot-LinkExpanding', // Slack
    'SkypeUriPreview', // Skype
    'Applebot', // Apple
    'Pinterest', // Pinterest
    'Pinterestbot', // Pinterest bot
    'Pinterest/0.1', // Pinterest
    'SnapchatBot', // Snapchat bot (specific crawler)
    'Snapchat/1.0', // Snapchat crawler version
    'Discordbot', // Discord
    'TelegramBot', // Telegram
    'Viber', // Viber
    'Googlebot', // Google (sometimes)
    'bingbot', // Bing
    'YandexBot', // Yandex
    'SemrushBot', // SEO tools
    'AhrefsBot', // SEO tools
    'Screaming Frog SEO Spider', // SEO tools
    'Redditbot', // Reddit
    'Tumblr', // Tumblr
    'Line', // Line messenger
    'WeChat', // WeChat
    'QQ', // QQ
    'Baiduspider' // Baidu
  ];

  // Check if it's a crawler - but exclude real browsers
  // Snapchat's in-app browser might have "Snapchat" in user-agent, but it's not a crawler
  const isCrawler = crawlerPatterns.some(pattern => 
    userAgent.toLowerCase().includes(pattern.toLowerCase())
  ) && !userAgent.match(/(Mobile|Safari|Chrome|Firefox|Edge|Opera|Version)/i);
  
  // Additional check: if user-agent contains browser indicators, it's not a crawler
  const isRealBrowser = userAgent.match(/(Mobile|Safari|Chrome|Firefox|Edge|Opera|Version|Mozilla)/i) && 
                        !userAgent.match(/(bot|crawler|spider|scraper)/i);
  
  // If it's a real browser, don't treat it as a crawler
  const finalIsCrawler = isCrawler && !isRealBrowser;

  // Log for debugging (remove in production if needed)
  const isDev = req?.headers?.host?.toLowerCase().includes('localhost') || 
                req?.headers?.host?.toLowerCase().includes('127.0.0.1');
  console.log('Prerender function called:', {
    pathname,
    userAgent: userAgent.substring(0, 100), // Log first 100 chars
    isCrawler: finalIsCrawler,
    isRealBrowser,
    host: req?.headers?.host,
    isDev: isDev,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV
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
  if (!finalIsCrawler) {
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
              // Handle featured image URL construction
              let imageUrl = null;
              
              // First, try to use featured image if it's a valid URL (not data URL)
              if (post.featuredImage && !post.featuredImage.startsWith('data:image/')) {
                console.log(`Original featured image URL: ${post.featuredImage}`);
                imageUrl = normalizeImageUrl(post.featuredImage, apiBaseUrl, undefined, req);
                console.log(`Normalized featured image URL: ${imageUrl}`);
              }
              
              // If featured image is a data URL or not available, try to extract from content
              if (!imageUrl || post.featuredImage?.startsWith('data:image/')) {
                console.log('Featured image is a data URL or missing - trying to extract from content');
                  if (post.content) {
                  // Try multiple patterns to find images in content
                  const imgPatterns = [
                    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,  // Standard img tag
                    /<img[^>]+src=([^\s>]+)[^>]*>/gi,         // Without quotes
                    /background-image:\s*url\(["']?([^"')]+)["']?\)/gi,  // CSS background
                  ];
                  
                  let foundImage = false;
                  for (const pattern of imgPatterns) {
                    const matches = [...post.content.matchAll(pattern)];
                    for (const match of matches) {
                      if (match[1]) {
                        const contentImgUrl = match[1].trim();
                        // Skip data URLs and empty strings
                        if (contentImgUrl && !contentImgUrl.startsWith('data:image/') && contentImgUrl.length > 10) {
                          const normalized = normalizeImageUrl(contentImgUrl, apiBaseUrl, undefined, req);
                          // Only use if it's a valid URL
                          if (normalized && normalized.startsWith('http')) {
                            imageUrl = normalized;
                            foundImage = true;
                            console.log(`Found image in content: ${contentImgUrl} -> ${imageUrl}`);
                            break;
                          }
                        }
                      }
                    }
                    if (foundImage) break;
                  }
                  
                  if (!foundImage) {
                    console.log('No valid image found in content');
                  }
                } else {
                  console.log('No content available');
                }
              }
              
              // Final fallback to default image
              if (!imageUrl || !imageUrl.startsWith('http')) {
                console.warn(`Invalid or missing image URL, using default. Original: ${post.featuredImage ? (post.featuredImage.substring(0, 50) + '...') : 'null'}`);
                imageUrl = normalizeImageUrl(null, apiBaseUrl, undefined, req);
              }
              
              // Clean description - strip HTML tags and limit length
              let description = post.excerpt || '';
              if (!description && post.content) {
                description = post.content.replace(/<[^>]*>/g, '').substring(0, 200).trim();
              }
              if (!description) {
                description = metaTags.description;
              }
              
              // Handle author - can be string or object
              let author = 'TrailVerse Team';
              if (post.author) {
                if (typeof post.author === 'string') {
                  author = post.author;
                } else if (post.author.name) {
                  author = post.author.name;
                }
              }
              
              // Format dates for article meta tags
              const publishedTime = post.publishedAt ? (new Date(post.publishedAt).toISOString()) : '';
              const modifiedTime = post.updatedAt ? (new Date(post.updatedAt).toISOString()) : '';
              
              console.log(`Final featured image URL: ${imageUrl}`);
              console.log(`Original featuredImage format: ${post.featuredImage ? (post.featuredImage.substring(0, 50) + '...') : 'null'}`);
              
              metaTags = {
                title: `${post.title} | TrailVerse`,
                description: description,
                image: imageUrl,
                url: `https://www.nationalparksexplorerusa.com/blog/${post.slug}`,
                type: 'article',
                published: publishedTime,
                modified: modifiedTime,
                author: author
              };
              console.log(`Meta tags set for blog post: ${metaTags.title}`);
              console.log(`Meta tags image URL: ${metaTags.image}`);
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
              // Handle park image URL construction
              // Park images from NPS API can be objects with .url property or strings
              let imageUrl = 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg'; // Default
              
              if (park.images && park.images.length > 0) {
                // Get first image - could be object with .url or string
                const firstImage = park.images[0];
                const imageString = typeof firstImage === 'string' ? firstImage : (firstImage.url || firstImage.src || '');
                
                if (imageString) {
                  imageUrl = normalizeImageUrl(imageString, apiBaseUrl, undefined, req);
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

  // Ensure image URL is always set and valid
  if (!metaTags.image || !metaTags.image.startsWith('http')) {
    console.warn(`Invalid or missing image URL in metaTags, using default: ${metaTags.image}`);
    metaTags.image = 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
  }
  
  // Ensure image URL is HTTPS (required by most social media platforms)
  if (metaTags.image.startsWith('http://')) {
    metaTags.image = metaTags.image.replace(/^http:\/\//i, 'https://');
    console.log(`Converted HTTP to HTTPS: ${metaTags.image}`);
  }
  
  // Log final image URL for debugging
  console.log('Final image URL for meta tags:', metaTags.image);

  // Escape all meta tag content to prevent HTML injection and special character issues
  const escapedTitle = escapeHtml(metaTags.title);
  const escapedDescription = escapeHtml(metaTags.description);
  const escapedImage = escapeHtml(metaTags.image);
  const escapedUrl = escapeHtml(metaTags.url);
  const escapedAuthor = escapeHtml(metaTags.author || 'TrailVerse Team');
  const escapedPublished = escapeHtml(metaTags.published || '');
  const escapedModified = escapeHtml(metaTags.modified || '');

  // Generate HTML with meta tags
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="/" />
    
    <!-- Primary Meta Tags -->
    <title>${escapedTitle}</title>
    <meta name="title" content="${escapedTitle}" />
    <meta name="description" content="${escapedDescription}" />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="${metaTags.type}" />
    <meta property="og:url" content="${escapedUrl}" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:image" content="${escapedImage}" />
    <meta property="og:image:url" content="${escapedImage}" />
    <meta property="og:image:secure_url" content="${escapedImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:alt" content="${escapedTitle}" />
    <meta property="og:site_name" content="TrailVerse" />
    <meta property="og:locale" content="en_US" />
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${escapedUrl}" />
    <meta name="twitter:title" content="${escapedTitle}" />
    <meta name="twitter:description" content="${escapedDescription}" />
    <meta name="twitter:image" content="${escapedImage}" />
    <meta name="twitter:image:src" content="${escapedImage}" />
    <meta name="twitter:site" content="@TrailVerse" />
    
    <!-- Snapchat-specific tags -->
    <meta property="snapchat:sticker" content="${escapedImage}" />
    
    <!-- Pinterest-specific tags -->
    <meta property="pinterest:media" content="${escapedImage}" />
    <meta property="pinterest:description" content="${escapedDescription}" />
    
    ${metaTags.type === 'article' ? `
    <!-- Article specific tags -->
    ${escapedPublished ? `<meta property="article:published_time" content="${escapedPublished}" />` : ''}
    ${escapedModified ? `<meta property="article:modified_time" content="${escapedModified}" />` : ''}
    <meta property="article:author" content="${escapedAuthor}" />
    <meta property="article:section" content="Travel" />
    ` : ''}
    
    <!-- Canonical URL -->
    <link rel="canonical" href="${escapedUrl}" />
    
    <!-- For regular users: redirect to React app (crawlers won't execute this) -->
    <!-- This will redirect to the same pathname, triggering the catch-all rewrite to serve index.html -->
    <meta http-equiv="refresh" content="0;url=${pathname}" id="redirect-meta" />
    
    <!-- For crawlers: show content immediately -->
    <!-- For regular users: load the React app -->
    <style>
      body {
        margin: 0;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
        background: #fff;
      }
      .preview-content {
        max-width: 800px;
        margin: 0 auto;
      }
      .preview-content h1 {
        font-size: 2em;
        margin-bottom: 0.5em;
      }
      .preview-content p {
        line-height: 1.6;
        color: #666;
      }
      .preview-content img {
        max-width: 100%;
        height: auto;
        margin: 20px 0;
      }
      .preview-content a {
        color: #0070f3;
        text-decoration: none;
      }
      .preview-content a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <!-- Content for crawlers and no-JS users -->
    <div class="preview-content">
      <h1>${escapedTitle}</h1>
      <p>${escapedDescription}</p>
      <img src="${escapedImage}" alt="${escapedTitle}" />
      <p><a href="${escapedUrl}">Read full article →</a></p>
    </div>
    
    <!-- For JavaScript-enabled browsers: redirect to React app -->
    <!-- Crawlers will see the static content above and won't execute this -->
    <script>
      // If this is a regular user (not a crawler), redirect to the React app
      // This ensures they get the full React app experience
      if (typeof window !== 'undefined') {
        // Check if it's a real browser (not a crawler)
        const userAgent = navigator.userAgent;
        const isRealBrowser = /(Mobile|Safari|Chrome|Firefox|Edge|Opera|Version|Mozilla)/i.test(userAgent) && 
                              !/(bot|crawler|spider|scraper|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|SkypeUriPreview|Applebot|Pinterestbot|SnapchatBot|Discordbot|TelegramBot|Viber|Googlebot|bingbot|YandexBot|SemrushBot|AhrefsBot|Redditbot|Tumblr|Line|WeChat|QQ|Baiduspider)/i.test(userAgent);
        
        if (isRealBrowser) {
          // Regular user - redirect immediately to the actual URL
          // This will trigger the catch-all rewrite to serve index.html (React app)
          window.location.replace(window.location.pathname + window.location.search);
        } else {
          // Crawler - remove the redirect meta tag so it doesn't redirect
          const redirectMeta = document.getElementById('redirect-meta');
          if (redirectMeta) {
            redirectMeta.remove();
          }
        }
      }
    </script>
    <noscript>
      <!-- For no-JS users: show a link to the actual page -->
      <p><a href="${escapedUrl}">Continue to article →</a></p>
    </noscript>
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

