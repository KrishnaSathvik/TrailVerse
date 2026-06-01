const LOCAL_API = 'http://127.0.0.1:5001/api';
const PRODUCTION_API = 'https://trailverse.onrender.com/api';

function normalizeApiUrl(url) {
  if (!url) return url;
  return url.endsWith('/api') ? url : `${url.replace(/\/$/, '')}/api`;
}

function serverSideApiUrl() {
  if (process.env.API_URL) {
    return normalizeApiUrl(process.env.API_URL);
  }

  const publicUrl = process.env.NEXT_PUBLIC_API_URL;
  if (publicUrl?.startsWith('http')) {
    return normalizeApiUrl(publicUrl);
  }

  // Relative `/api` only works in the browser (Next rewrites). Server components and
  // static generation must call the backend directly — self-fetch via VERCEL_URL
  // often fails at build time and caches empty ISR payloads (e.g. intent Top matches).
  return process.env.NODE_ENV === 'production' ? PRODUCTION_API : LOCAL_API;
}

function clientSideApiUrl() {
  const publicUrl = process.env.NEXT_PUBLIC_API_URL;
  if (publicUrl === '/api' || !publicUrl) {
    return '/api';
  }
  return normalizeApiUrl(publicUrl);
}

/** API root ending in `/api` — safe for server components and browser fetch. */
export function getApiBaseUrl() {
  const configuredUrl =
    typeof window === 'undefined' ? serverSideApiUrl() : clientSideApiUrl();

  return normalizeApiUrl(configuredUrl);
}
