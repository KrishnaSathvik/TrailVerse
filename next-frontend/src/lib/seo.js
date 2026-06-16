export const SITE_URL = 'https://www.nationalparksexplorerusa.com';

/** @param {string} path */
export function siteCanonical(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}

/**
 * @param {Record<string, string | string[] | undefined> | undefined | null} searchParams
 */
export function hasQueryParams(searchParams) {
  if (!searchParams || typeof searchParams !== 'object') return false;
  return Object.values(searchParams).some((value) => {
    if (Array.isArray(value)) {
      return value.some((entry) => entry != null && String(entry).trim() !== '');
    }
    return value != null && String(value).trim() !== '';
  });
}

/**
 * Canonical URL plus noindex for tracking/filter query variants (?state=, ?from=, ?tab=, etc.).
 * Google must be allowed to crawl these pages (not robots.txt-blocked) to read noindex.
 *
 * @param {string} canonicalPath
 * @param {Record<string, string | string[] | undefined> | undefined | null} searchParams
 * @returns {import('next').Metadata}
 */
export function canonicalPageMetadata(canonicalPath, searchParams) {
  const metadata = {
    alternates: { canonical: siteCanonical(canonicalPath) },
  };

  if (hasQueryParams(searchParams)) {
    metadata.robots = {
      index: false,
      follow: true,
      googleBot: { index: false, follow: true },
    };
  }

  return metadata;
}

/** @type {import('next').Metadata} */
export const privatePageRobots = {
  index: false,
  follow: false,
};

/** @type {import('next').Metadata['robots']} */
export const indexablePageRobots = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
  },
};

/**
 * @param {{ title: string; description?: string }} options
 * @returns {import('next').Metadata}
 */
export function privatePageMetadata({ title, description }) {
  return {
    title,
    ...(description ? { description } : {}),
    robots: privatePageRobots,
  };
}
