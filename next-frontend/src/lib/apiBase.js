export function getApiBaseUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    'http://127.0.0.1:5001/api';

  return configuredUrl.endsWith('/api') ? configuredUrl : `${configuredUrl}/api`;
}
