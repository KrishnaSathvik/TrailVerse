import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { resolveParkIdentifier } from '@trailverse/api';

const WEB_HOSTS = new Set([
  'www.nationalparksexplorerusa.com',
  'nationalparksexplorerusa.com',
]);

export type DeepLinkRoute =
  | { screen: 'park'; slug: string; tab?: string }
  | { screen: 'trailie'; park?: string; name?: string }
  | { screen: 'compare'; parks: string[] }
  | { screen: 'explore' }
  | { screen: 'map' }
  | { screen: 'discover'; dimension?: string; slug?: string }
  | { screen: 'intent'; path: string };

/** Intent + guides paths opened via Universal Links (v1.2 native screens TBD). */
const INTENT_STYLE_PATHS = new Set([
  '/parks-for-couples',
  '/parks-for-photography',
  '/ocean-national-parks',
  '/fall-color-parks',
  '/quiet-national-parks',
  '/dark-sky-parks',
  '/parks-for-families',
  '/parks-for-first-timers',
  '/dog-friendly-parks',
  '/winter-national-parks',
  '/accessible-national-parks',
  '/wildlife-national-parks',
]);

export function parseDeepLink(url: string): DeepLinkRoute | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    const fallback = Linking.parse(url);
    if (!fallback.path) return null;
    parsed = new URL(`https://www.nationalparksexplorerusa.com/${fallback.path}`);
    if (fallback.queryParams) {
      for (const [key, value] of Object.entries(fallback.queryParams)) {
        if (typeof value === 'string') parsed.searchParams.set(key, value);
      }
    }
  }

  if (parsed.protocol !== 'trailverse:' && !WEB_HOSTS.has(parsed.hostname)) {
    return null;
  }

  const path = parsed.pathname.replace(/\/$/, '') || '/';
  const segments = path.split('/').filter(Boolean);

  if (segments[0] === 'parks' && segments[1]) {
    const tab = parsed.searchParams.get('tab') || undefined;
    return { screen: 'park', slug: segments[1], tab };
  }

  if (segments[0] === 'plan-ai') {
    return {
      screen: 'trailie',
      park: parsed.searchParams.get('park') || undefined,
      name: parsed.searchParams.get('name') || undefined,
    };
  }

  if (segments[0] === 'compare') {
    const parksParam = parsed.searchParams.get('parks') || '';
    const parks = parksParam
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    return { screen: 'compare', parks };
  }

  if (segments[0] === 'explore' || path === '/') {
    return { screen: 'explore' };
  }

  if (segments[0] === 'map') {
    return { screen: 'map' };
  }

  if (segments[0] === 'discover' && segments[1] && segments[2]) {
    return { screen: 'discover', dimension: segments[1], slug: segments[2] };
  }

  if (INTENT_STYLE_PATHS.has(path) || path.startsWith('/guides')) {
    return { screen: 'intent', path };
  }

  return null;
}

export function navigateDeepLink(route: DeepLinkRoute) {
  switch (route.screen) {
    case 'park':
      router.push({
        pathname: '/park/[slug]',
        params: { slug: route.slug, tab: route.tab || 'overview' },
      });
      break;
    case 'trailie':
      router.push({
        pathname: '/(tabs)/trailie',
        params: { park: route.park, name: route.name },
      });
      break;
    case 'compare':
      router.push({
        pathname: '/compare',
        params: { parks: route.parks.join(',') },
      });
      break;
    case 'explore':
      router.push('/(tabs)/explore');
      break;
    case 'map':
      router.push('/(tabs)/map');
      break;
    case 'discover':
      // v1.1 stub — discover detail not built yet
      router.push('/(tabs)/explore');
      break;
    case 'intent':
      // v1.2 — open explore until native intent screens ship
      router.push('/(tabs)/explore');
      break;
    default:
      break;
  }
}

export function parkCodeFromSlugOrCode(identifier: string): string | null {
  return resolveParkIdentifier(identifier).parkCode;
}

export function buildAppleMapsUrl(lat: number, lng: number, label?: string) {
  const q = label ? encodeURIComponent(label) : `${lat},${lng}`;
  return `https://maps.apple.com/?ll=${lat},${lng}&q=${q}`;
}
