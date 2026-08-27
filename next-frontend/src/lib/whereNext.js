import { parkToSlug } from '@/utils/parkSlug';

export const WHERE_NEXT_SESSION_KEY = 'trailverse_where_next_session';

export const FORBIDDEN_COVERAGE_COPY = [
  'unsupported',
  'not supported',
  "doesn't support",
  'does not support',
  "couldn't find",
  'could not find',
  'request this destination',
];

export const TRAVEL_WINDOWS = [
  { id: 'fall_2026', label: 'Fall 2026' },
  { id: 'winter_2026_27', label: 'Winter 2026–27' },
  { id: 'spring_2027', label: 'Spring 2027' },
  { id: 'summer_2027', label: 'Summer 2027' },
  { id: 'someday', label: 'Someday / not sure' },
];

export function containsForbiddenCoverageCopy(text) {
  const haystack = String(text || '').toLowerCase();
  return FORBIDDEN_COVERAGE_COPY.some((phrase) => haystack.includes(phrase));
}

export function getWhereNextSessionId() {
  if (typeof window === 'undefined') return null;
  let id = localStorage.getItem(WHERE_NEXT_SESSION_KEY);
  if (!id) {
    id = window.crypto?.randomUUID?.()
      || `wn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(WHERE_NEXT_SESSION_KEY, id);
  }
  return id;
}

export function resolveWhereNextSource(searchParams, referrer) {
  const src = typeof searchParams?.get === 'function'
    ? searchParams.get('src')
    : searchParams?.src;
  if (src && String(src).trim()) return String(src).trim().slice(0, 64);
  try {
    if (referrer) {
      const host = new URL(referrer).hostname.replace(/^www\./, '');
      return host.slice(0, 64) || null;
    }
  } catch {
    /* ignore invalid referrer */
  }
  return null;
}

export function travelWindowLabel(id) {
  return TRAVEL_WINDOWS.find((item) => item.id === id)?.label || null;
}

export function returningStep(pick) {
  if (!pick) return 'search';
  if (pick.travelWindow) return 'result';
  return 'when';
}

export function exploreParkHref(canonicalName) {
  if (!canonicalName) return null;
  return `/parks/${parkToSlug(canonicalName)}`;
}

export function trailieHref(parkCode, canonicalName) {
  if (!parkCode || !canonicalName) return null;
  const params = new URLSearchParams({
    park: parkCode,
    name: canonicalName,
  });
  return `/plan-ai?${params.toString()}`;
}

export function sanitizeWhereNextAnalytics(metadata = {}) {
  const blocked = new Set([
    'rawinput',
    'raw_input',
    'query',
    'destination',
    'displayname',
    'display_name',
    'canonicalname',
    'text',
  ]);
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (blocked.has(String(key).toLowerCase())) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export function landingCopy(volumeTier) {
  if (volumeTier === 'early' || !volumeTier) {
    return 'Help shape the first TrailVerse travel list.';
  }
  if (volumeTier === 'growing') {
    return 'Travelers are starting to share where they want to go next.';
  }
  return 'See where travelers want to go.';
}

export function resultRankCopy({ volumeTier, destinationCount, weeklyRank, matched }) {
  if (!matched) return 'Your destination is counted.';
  if (volumeTier === 'early') {
    const n = destinationCount > 0 ? destinationCount : 1;
    return `You're traveler #${n} to choose it`;
  }
  if (volumeTier === 'growing') {
    return 'This is one of the popular picks right now.';
  }
  if (weeklyRank) {
    return `#${weeklyRank} most wanted destination this week`;
  }
  return 'Trending with travelers';
}
