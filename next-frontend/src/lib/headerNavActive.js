/**
 * Route-aware active state for the shared Header nav.
 *
 * An item is active on its own path and on any nested route below it
 * (segment-aware, so `/map` never matches `/mapping`). A few items also own
 * sibling route families that users reach from them:
 *   - Explore owns park pages (/parks/[code], /parks/[code]/activity/[id],
 *     /parks/state/[s]) — the park breadcrumb is Home → Explore → State → Park.
 *
 * Pages that are not reachable from the header (footer-only pages such as
 * /about, /faq, /features, /guides, /itineraries) intentionally match nothing.
 */
const NAV_ROUTE_ALIASES = {
  '/explore': ['/parks'],
};

function matchesPathPrefix(pathname, base) {
  if (!pathname || !base) return false;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isNavPathActive(itemPath, pathname) {
  if (!itemPath || !pathname) return false;
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (itemPath === '/') return path === '/';
  if (matchesPathPrefix(path, itemPath)) return true;
  return (NAV_ROUTE_ALIASES[itemPath] || []).some((alias) => matchesPathPrefix(path, alias));
}
