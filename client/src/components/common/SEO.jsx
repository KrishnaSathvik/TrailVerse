import React from 'react';
import { Helmet } from 'react-helmet-async';

const SEO = ({
  title = 'TrailVerse - Explore America\'s 470+ National Parks & Sites',
  description = 'Discover, plan, and explore America\'s 470+ National Parks, Monuments, Historic Sites, and more with AI-powered trip planning, interactive maps, events calendar, and expert travel guides.',
  keywords = 'national parks, USA parks, national park guide, park explorer, visit national parks, yellowstone, yosemite, grand canyon, park planning, hiking trails',
  image = 'https://www.nationalparksexplorerusa.com/og-image.jpg',
  url = 'https://www.nationalparksexplorerusa.com',
  type = 'website',
  author = 'TrailVerse Team',
  published,
  modified,
  noindex = false,
  canonical,
  additionalStructuredData
}) => {
  const siteTitle = 'TrailVerse';
  const fullTitle = title.includes(siteTitle) ? title : `${title} | ${siteTitle}`;
  
  // Convert relative image URL to absolute URL for social sharing
  // Always use production URL for images to ensure they're accessible to crawlers
  const getAbsoluteImageUrl = (imgUrl) => {
    if (!imgUrl || imgUrl.trim() === '') {
      // Return default production image if no image provided
      return 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
    }
    
    // If already absolute URL, return as is
    if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
      return imgUrl;
    }
    
    // If data URL, can't use for social media - return default
    if (imgUrl.startsWith('data:')) {
      return 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
    }
    
    // Always use production base URL for images (not localhost)
    // This ensures crawlers can access the images when fetching Open Graph tags
    const productionBaseUrl = 'https://www.nationalparksexplorerusa.com';
    
    // Handle protocol-relative URLs (//example.com/image.jpg)
    if (imgUrl.startsWith('//')) {
      return `https:${imgUrl}`;
    }
    
    // Handle relative URLs - always convert to production URL
    if (imgUrl.startsWith('/')) {
      return `${productionBaseUrl}${imgUrl}`;
    }
    
    // Handle relative paths without leading slash
    return `${productionBaseUrl}/${imgUrl}`;
  };
  
  // Ensure image URL is absolute for social media
  const absoluteImageUrl = getAbsoluteImageUrl(image);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'TrailVerse',
    alternateName: 'National Parks Explorer USA',
    url: 'https://www.nationalparksexplorerusa.com',
    description,
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://www.nationalparksexplorerusa.com/explore?q={search_term_string}',
      'query-input': 'required name=search_term_string'
    }
  };

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="author" content={author} />
      
      {/* Canonical URL */}
      {canonical && <link rel="canonical" href={canonical} />}
      {!canonical && <link rel="canonical" href={url} />}

      {/* Robots */}
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph / Facebook - Use data-* attributes to ensure React Helmet overrides */}
      <meta property="og:type" content={type} data-rh="true" />
      <meta property="og:url" content={url} data-rh="true" />
      <meta property="og:title" content={fullTitle} data-rh="true" />
      <meta property="og:description" content={description} data-rh="true" />
      <meta property="og:image" content={absoluteImageUrl} data-rh="true" />
      <meta property="og:image:width" content="1200" data-rh="true" />
      <meta property="og:image:height" content="630" data-rh="true" />
      <meta property="og:image:type" content="image/jpeg" data-rh="true" />
      <meta property="og:site_name" content="TrailVerse" data-rh="true" />
      <meta property="og:locale" content="en_US" data-rh="true" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" data-rh="true" />
      <meta name="twitter:url" content={url} data-rh="true" />
      <meta name="twitter:title" content={fullTitle} data-rh="true" />
      <meta name="twitter:description" content={description} data-rh="true" />
      <meta name="twitter:image" content={absoluteImageUrl} data-rh="true" />
      <meta name="twitter:creator" content="@TrailVerse" data-rh="true" />
      <meta name="twitter:site" content="@TrailVerse" data-rh="true" />

      {/* Article specific tags */}
      {type === 'article' && published && (
        <>
          <meta property="article:published_time" content={published} />
          {modified && <meta property="article:modified_time" content={modified} />}
          <meta property="article:author" content={author} />
          <meta property="article:section" content="Travel" />
        </>
      )}

      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
      
      {/* Additional Structured Data */}
      {additionalStructuredData && (
        Array.isArray(additionalStructuredData) ? (
          additionalStructuredData.map((schema, index) => (
            <script key={index} type="application/ld+json">
              {JSON.stringify(schema)}
            </script>
          ))
        ) : (
          <script type="application/ld+json">
            {JSON.stringify(additionalStructuredData)}
          </script>
        )
      )}

      {/* Additional Meta Tags */}
      <meta name="theme-color" content="#10b981" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="language" content="English" />
    </Helmet>
  );
};

export default SEO;
