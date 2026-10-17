import { createApiClient, type ApiClientConfig } from './client';
import { createAuthApi } from './auth';
import { createParksApi } from './parks';
import { createCompareApi } from './compare';
import { createAiApi } from './ai';
import { createTripsApi } from './trips';
import { createUserApi } from './user';
import { createDiscoverApi } from './discover';
import { createEventsApi } from './events';
import { createBlogApi } from './blog';

export { ApiError, isApiError } from './errors';
export { createApiClient, type ApiClient, type ApiClientConfig } from './client';
export { consumeAiSseStream, resolveChatPayload } from './sse';
export {
  parkToSlug,
  slugToParkCode,
  findCorrectSlug,
  resolveParkIdentifier,
} from './parkSlug';
export * from './types';

export const DEFAULT_API_BASE_URL = 'https://trailverse.onrender.com/api';
export const DEV_API_BASE_URL = 'http://127.0.0.1:5001/api';

export function resolveApiBaseUrl(explicit?: string): string {
  if (explicit) return explicit.replace(/\/$/, '');
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  }
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return DEFAULT_API_BASE_URL;
  }
  return DEV_API_BASE_URL;
}

export function createTrailVerseApi(config: ApiClientConfig) {
  const client = createApiClient(config);

  return {
    client,
    auth: createAuthApi(client),
    parks: createParksApi(client),
    compare: createCompareApi(client),
    ai: createAiApi(client),
    trips: createTripsApi(client),
    user: createUserApi(client),
    discover: createDiscoverApi(client),
    events: createEventsApi(client),
    blog: createBlogApi(client),
  };
}

export type TrailVerseApi = ReturnType<typeof createTrailVerseApi>;
