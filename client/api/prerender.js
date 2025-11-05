/**
 * Vercel Serverless Function for Prerendering
 * Detects social media crawlers and serves pre-rendered HTML with correct meta tags
 */

export default async function handler(req, res) {
  const userAgent = req.headers['user-agent'] || '';
  // Get pathname from request - in Vercel, req.url includes query string
  const pathname = req.url ? new URL(req.url, `https://${req.headers.host}`).pathname : (req.query.path || '/');

  // Check if it's a crawler
  const crawlerPatterns = [
    'facebookexternalhit',
    'Facebot',
    'Twitterbot',
    'LinkedInBot',
    'WhatsApp',
    'Slackbot',
    'SkypeUriPreview',
    'Applebot',
    'Pinterest',
    'Discordbot',
    'TelegramBot',
    'Viber'
  ];

  const isCrawler = crawlerPatterns.some(pattern => 
    userAgent.toLowerCase().includes(pattern.toLowerCase())
  );

  // If not a crawler, bypass this function
  // Return early so Vercel can continue with normal routing
  // Note: This means the rewrite should only apply to crawlers
  // For non-crawlers, we'll return a 404 so Vercel falls back to index.html
  if (!isCrawler) {
    // Return 404 so Vercel falls back to the next rewrite (index.html)
    return res.status(404).end();
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
      const slug = pathname.split('/blog/')[1];
      if (slug) {
        try {
          const response = await fetch(`${apiBaseUrl}/api/blogs/${slug}`);
          if (response.ok) {
            const result = await response.json();
            const post = result.data;
            
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
                published: post.publishedAt,
                modified: post.updatedAt,
                author: post.author?.name || 'TrailVerse Team'
              };
            }
          }
        } catch (error) {
          console.error('Error fetching blog post:', error);
        }
      }
    }

    // Handle park detail routes
    if (pathname.startsWith('/parks/') && pathname !== '/parks') {
      const parkCode = pathname.split('/parks/')[1];
      if (parkCode) {
        try {
          const response = await fetch(`${apiBaseUrl}/api/parks/${parkCode}`);
          if (response.ok) {
            const result = await response.json();
            const park = result.data;
            
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
          }
        } catch (error) {
          console.error('Error fetching park:', error);
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
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(html);
}

