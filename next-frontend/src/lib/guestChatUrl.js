/** Canonical production origin — used only when not in a browser (SSR) */
const DEFAULT_SITE_ORIGIN = 'https://www.nationalparksexplorerusa.com';

export function getSiteOrigin() {
  // In the browser the link always matches the site the user is on:
  // nationalparksexplorerusa.com in prod, 127.0.0.1:3000 only in local dev.
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_ORIGIN;
}

/** Public read-only URL for an anonymous guest chat session */
export function buildGuestChatUrl(anonymousId) {
  if (!anonymousId) return null;
  return `${getSiteOrigin()}/plan-ai/guest/${encodeURIComponent(anonymousId)}`;
}
