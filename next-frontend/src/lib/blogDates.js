/**
 * Editorial freshness for blog posts (JSON-LD dateModified, sitemap lastmod).
 *
 * `updatedAt` is a Mongoose record timestamp that historically moved on every
 * page view, so it is never used here. `contentUpdatedAt` is set by the API only
 * for genuine post-publication editorial edits; otherwise the publication date
 * is the honest modification date. Keep in sync with server/src/utils/blogDates.js.
 */

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * @param {{ publishedAt?: string | Date | null, contentUpdatedAt?: string | Date | null } | null | undefined} post
 * @returns {Date | null}
 */
export function blogDateModified(post) {
  const published = validDate(post?.publishedAt);
  const edited = validDate(post?.contentUpdatedAt);
  if (edited && (!published || edited >= published)) return edited;
  return published;
}

/**
 * ISO string for JSON-LD; falls back to the raw publishedAt value when no
 * parseable date exists (preserves previous output instead of inventing one).
 */
export function blogDateModifiedIso(post) {
  const date = blogDateModified(post);
  return date ? date.toISOString() : post?.publishedAt || undefined;
}

/**
 * Most recent editorial date across posts — a justified lastmod for /blog,
 * whose hub content changes only when posts are published or edited.
 * @returns {Date | null}
 */
export function latestBlogDateModified(posts) {
  if (!Array.isArray(posts)) return null;
  let latest = null;
  for (const post of posts) {
    const date = blogDateModified(post);
    if (date && (!latest || date > latest)) latest = date;
  }
  return latest;
}

/**
 * Sitemap entries for blog posts; lastModified is the editorial date and is
 * omitted (not invented) when a post has no parseable date.
 * @param {unknown} posts
 * @param {string} baseUrl
 * @returns {import('next').MetadataRoute.Sitemap}
 */
export function blogSitemapEntries(posts, baseUrl) {
  if (!Array.isArray(posts)) return [];
  return posts
    .filter((post) => post && typeof post.slug === 'string' && post.slug)
    .map((post) => {
      const lastModified = blogDateModified(post);
      return {
        url: `${baseUrl}/blog/${post.slug}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: /** @type {const} */ ('weekly'),
        priority: 0.7,
      };
    });
}
