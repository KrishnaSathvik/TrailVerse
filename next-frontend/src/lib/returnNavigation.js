import { BROWSE_HUB_PATH, BROWSE_HUB_TITLE } from '@/lib/browseHub';

/** Landing page return path — public marketing home at `/` (not logged-in `/home`). */
export const LANDING_RETURN_PATH = '/';

/** Build a return path from pathname + query string. */
export function buildReturnPath(pathname, search = '') {
  if (!pathname) return LANDING_RETURN_PATH;
  const qs = typeof search === 'string' ? search : String(search || '');
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Park detail URL with optional ?from= and ?tab=.
 * @param {string} slug Park slug
 * @param {string | null | undefined} fromPath Caller page to return to
 * @param {{ tab?: string }} [options]
 */
export function parkDetailHref(slug, fromPath, { tab } = {}) {
  if (!slug) return '/explore';
  const base = tab
    ? `/parks/${slug}?tab=${encodeURIComponent(tab)}`
    : `/parks/${slug}`;
  return fromPath ? hrefWithFrom(base, fromPath) : base;
}

/** Append ?from= so destination pages can link back to the caller. */
export function hrefWithFrom(href, fromPath) {
  if (!fromPath || !href) return href;
  const [path, existingQs] = href.split('?');
  const params = new URLSearchParams(existingQs || '');
  params.set('from', fromPath);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Sanitize ?from= paths — mirrors public/reports/report-back-nav.js */
export function sanitizeFromPath(from) {
  if (!from || typeof from !== 'string') return null;
  try {
    from = decodeURIComponent(from);
  } catch {
    return null;
  }
  if (!from.startsWith('/') || from.startsWith('//')) return null;
  if (from.startsWith('/reports/')) return null;
  return from;
}

const FROM_LABEL_BY_PREFIX = [
  ['/explore', 'Explore'],
  ['/discover', BROWSE_HUB_TITLE],
  ['/guides', 'All planning guides'],
  ['/itineraries', 'All sample itineraries'],
  ['/map', 'Map'],
  ['/compare', 'Compare'],
  ['/plan-ai', 'Trailie'],
  ['/blog', 'Blog'],
  ['/events', 'Events'],
  ['/home', 'Home'],
  ['/magazine', 'Magazine'],
  ['/features', 'Features'],
  ['/about', 'About'],
  ['/faq', 'FAQ'],
  ['/testimonials', 'Testimonials'],
  ['/newsletter', 'Newsletter'],
];

/** User-facing label for a return path (pathname + optional search). */
export function backLabelForPath(path) {
  if (!path || path === '/') return 'TrailVerse';
  const pathname = path.split('?')[0];
  const match = FROM_LABEL_BY_PREFIX.find(([prefix]) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (match) return match[1];
  if (pathname.startsWith('/parks/state/')) {
    return 'State parks';
  }
  if (pathname.startsWith('/parks/') && !pathname.startsWith('/parks/state/')) {
    return 'Back to park';
  }
  return 'TrailVerse';
}

/** Resolve back navigation from ?from= with safe fallbacks. */
export function resolveReturnNavigation(fromParam, { defaultHref, defaultLabel } = {}) {
  const from = sanitizeFromPath(fromParam);
  if (from) {
    return { backHref: from, backLabel: backLabelForPath(from) };
  }
  return {
    backHref: defaultHref ?? BROWSE_HUB_PATH,
    backLabel: defaultLabel ?? BROWSE_HUB_TITLE,
  };
}
