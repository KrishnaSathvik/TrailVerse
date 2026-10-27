'use strict';

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Public "last modified" for a blog post (JSON-LD dateModified, OG modified_time,
 * sitemap lastmod). Uses the editorial contentUpdatedAt when it is a real date at
 * or after publication; otherwise the publication date. Never uses `updatedAt`,
 * which also moves for operational writes. Keep in sync with
 * next-frontend/src/lib/blogDates.js.
 * @returns {Date|null}
 */
function blogDateModified(post) {
  const published = validDate(post?.publishedAt);
  const edited = validDate(post?.contentUpdatedAt);
  if (edited && (!published || edited >= published)) return edited;
  return published;
}

module.exports = { blogDateModified };
