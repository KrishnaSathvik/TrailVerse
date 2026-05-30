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

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (publicUrl === '/api' && appUrl) {
    return `${appUrl.replace(/\/$/, '')}/api`;
  }

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
