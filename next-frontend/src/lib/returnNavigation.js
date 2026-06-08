import { BROWSE_HUB_PATH, BROWSE_HUB_TITLE } from '@/lib/browseHub';

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
  ['/map', 'Map'],
  ['/compare', 'Compare'],
  ['/plan-ai', 'Trailie'],
  ['/blog', 'Blog'],
  ['/home', 'Home'],
];

/** User-facing label for a return path (pathname + optional search). */
export function backLabelForPath(path) {
  if (!path || path === '/') return 'Home';
  const pathname = path.split('?')[0];
  const match = FROM_LABEL_BY_PREFIX.find(([prefix]) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (match) return match[1];
  if (pathname.startsWith('/parks/')) return 'Park';
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
