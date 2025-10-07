import React from 'react';
import { Helmet } from 'react-helmet-async';

const SEO = ({
  title = 'TrailVerse - Explore America\'s 63 National Parks',
  description = 'Discover, plan, and explore America\'s 63 National Parks with AI-powered trip planning, interactive maps, events calendar, and expert travel guides.',
  keywords = 'national parks, USA parks, national park guide, park explorer, visit national parks, yellowstone, yosemite, grand canyon, park planning, hiking trails',
  image = 'https://www.nationalparksexplorerusa.com/og-image.jpg',
  url = 'https://www.nationalparksexplorerusa.com',
  type = 'website',
  author = 'TrailVerse Team',
  published,
  modified,
  noindex = false,
  canonical
}) => {
  const siteTitle = 'TrailVerse';
  const fullTitle = title.includes(siteTitle) ? title : `${title} | ${siteTitle}`;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'TrailVerse - TrailVerse',
    alternateName: 'National Parks Explorer',
    url: 'https://www.nationalparksexplorerusa.com',
    description: description,
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

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content="TrailVerse" />
      <meta property="og:locale" content="en_US" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:creator" content="@npeusa" />
      <meta name="twitter:site" content="@npeusa" />

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

      {/* Additional Meta Tags */}
      <meta name="theme-color" content="#059669" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="language" content="English" />
    </Helmet>
  );
};

export default SEO;
