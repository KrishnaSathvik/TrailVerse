/**
 * Vercel Serverless Function for Prerendering
 * Detects social media crawlers and serves pre-rendered HTML with correct meta tags
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    'Snapchat', // Snapchat
    'SnapchatBot', // Snapchat bot
    'Snapchat/1.0', // Snapchat
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
    try {
      // Read and return the actual index.html file
      // The api folder is at client/api/, so index.html is at ../index.html
      const indexPath = join(__dirname, '..', 'index.html');
      const indexHtml = readFileSync(indexPath, 'utf-8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(indexHtml);
    } catch (error) {
      console.error('Error reading index.html:', error);
      // Fallback to simple HTML
      const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TrailVerse - Blog</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }
  }

  // If not a crawler, return the actual index.html file
  // This allows React Router to handle the routing client-side
  if (!isCrawler) {
    try {
      // Read and return the actual index.html file
      // The api folder is at client/api/, so index.html is at ../index.html
      const indexPath = join(__dirname, '..', 'index.html');
      const indexHtml = readFileSync(indexPath, 'utf-8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(indexHtml);
    } catch (error) {
      console.error('Error reading index.html:', error);
      // Fallback to simple HTML
      const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TrailVerse</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }
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
                        // Found a non-data URL image in content
                        if (contentImgUrl.startsWith('http://') || contentImgUrl.startsWith('https://')) {
                          imageUrl = contentImgUrl;
                        } else if (contentImgUrl.startsWith('/api/images/file/')) {
                          imageUrl = `https://trailverse.onrender.com${contentImgUrl}`;
                        } else if (contentImgUrl.startsWith('/')) {
                          imageUrl = `https://www.nationalparksexplorerusa.com${contentImgUrl}`;
                        } else {
                          imageUrl = `https://www.nationalparksexplorerusa.com/${contentImgUrl}`;
                        }
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
                } else if (post.featuredImage.startsWith('http://') || post.featuredImage.startsWith('https://')) {
                  // Already a full URL
                  imageUrl = post.featuredImage;
                } else if (post.featuredImage.startsWith('/api/images/file/')) {
                  // API image path - convert to full URL
                  imageUrl = `https://trailverse.onrender.com${post.featuredImage}`;
                } else if (post.featuredImage.startsWith('/')) {
                  // Relative path starting with /
                  imageUrl = `https://www.nationalparksexplorerusa.com${post.featuredImage}`;
                } else {
                  // Relative path without /
                  imageUrl = `https://www.nationalparksexplorerusa.com/${post.featuredImage}`;
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
              // Handle park image URL construction
              // Park images from NPS API can be objects with .url property or strings
              let imageUrl = 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg'; // Default
              
              if (park.images && park.images.length > 0) {
                // Get first image - could be object with .url or string
                const firstImage = park.images[0];
                const imageString = typeof firstImage === 'string' ? firstImage : (firstImage.url || firstImage.src || '');
                
                if (imageString) {
                  if (imageString.startsWith('http://') || imageString.startsWith('https://')) {
                    // Already a full URL (from NPS API)
                    imageUrl = imageString;
                  } else if (imageString.startsWith('/api/images/file/')) {
                    // API image path - convert to full URL
                    imageUrl = `https://trailverse.onrender.com${imageString}`;
                  } else if (imageString.startsWith('/')) {
                    // Relative path starting with /
                    imageUrl = `https://www.nationalparksexplorerusa.com${imageString}`;
                  } else {
                    // Relative path without /
                    imageUrl = `https://www.nationalparksexplorerusa.com/${imageString}`;
                  }
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
    
    <!-- Snapchat-specific tags -->
    <meta property="snapchat:sticker" content="${metaTags.image}" />
    
    <!-- Pinterest-specific tags -->
    <meta property="pinterest:media" content="${metaTags.image}" />
    <meta property="pinterest:description" content="${metaTags.description}" />
    
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

