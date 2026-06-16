/**
 * Parse internal park tab links for same-page navigation.
 * @param {string} href
 * @param {string} parkSlug
 * @returns {string | null} tab id, or null if not a same-park tab link
 */
export function parseParkTabHref(href, parkSlug) {
  if (!href || /^https?:\/\//i.test(href)) return null;
  const match = href.match(/^\/parks\/([^/?#]+)(?:\?([^#]*))?/);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]);
  if (slug !== parkSlug) return null;
  const params = new URLSearchParams(match[2] || '');
  const tab = params.get('tab');
  return tab || 'overview';
}

/** Tab ids that can be opened from ?tab= before lazy explore data finishes loading. */
export const PARK_CORE_TAB_IDS = new Set(['overview', 'alerts', 'permits', 'reviews']);
