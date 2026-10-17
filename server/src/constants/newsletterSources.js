'use strict';

const V1_NEWSLETTER_SOURCES = [
  'newsletter-page',
  'blog-footer',
  'blog-inline',
  'homepage',
  'trailie-result',
  'itinerary',
];

const HISTORICAL_NEWSLETTER_SOURCES = [
  'blog-post',
  'blog-listing',
  'blog-category',
];

const NEWSLETTER_SOURCES = [...V1_NEWSLETTER_SOURCES, ...HISTORICAL_NEWSLETTER_SOURCES];

function isValidNewsletterSource(source) {
  return NEWSLETTER_SOURCES.includes(source);
}

module.exports = {
  V1_NEWSLETTER_SOURCES,
  HISTORICAL_NEWSLETTER_SOURCES,
  NEWSLETTER_SOURCES,
  isValidNewsletterSource,
};
