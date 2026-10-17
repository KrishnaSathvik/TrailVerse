import { ApiError } from './errors';
import type { ApiEnvelope } from './types';

export type ApiClientConfig = {
  baseUrl: string;
  getToken?: () => string | null | Promise<string | null>;
  onUnauthorized?: () => void;
  clientHeader?: string;
  defaultTimeoutMs?: number;
};

export type RequestOptions = {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  timeoutMs?: number;
  skipAuth?: boolean;
};

function buildUrl(baseUrl: string, path: string, params?: RequestOptions['params']) {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${normalizedBase}${normalizedPath}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function parseErrorBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export function createApiClient(config: ApiClientConfig) {
  const {
    baseUrl,
    getToken,
    onUnauthorized,
    clientHeader = 'ios',
    defaultTimeoutMs = 30_000,
  } = config;

  async function request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { body, params, signal, timeoutMs = defaultTimeoutMs, skipAuth = false } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-TrailVerse-Client': clientHeader,
      };

      if (!skipAuth && getToken) {
        const token = await getToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
      }

      const response = await fetch(buildUrl(baseUrl, path, params), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await parseErrorBody(response);
        if (response.status === 401) {
          onUnauthorized?.();
        }
        const message =
          (errorData as { error?: string; message?: string })?.error ||
          (errorData as { error?: string; message?: string })?.message ||
          `Request failed with status ${response.status}`;
        throw new ApiError(message, response.status, errorData);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return (await response.text()) as T;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  function unwrap<T>(payload: ApiEnvelope<T> | T): T {
    if (!payload || typeof payload !== 'object') return payload as T;
    if (!('data' in payload)) return payload as T;

    const obj = payload as Record<string, unknown>;
    const metaKeys = ['total', 'page', 'pages', 'hasMore', 'count', 'searchId'];
    const hasMeta = metaKeys.some((k) => k in obj);

    if (hasMeta) {
      const { success: _s, message: _m, error: _e, ...rest } = obj;
      return rest as T;
    }

    return obj.data as T;
  }

  return {
    getBaseUrl: () => baseUrl,
    get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
      request<ApiEnvelope<T> | T>('GET', path, options).then(unwrap),
    post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
      request<ApiEnvelope<T> | T>('POST', path, { ...options, body }).then(unwrap),
    put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
      request<ApiEnvelope<T> | T>('PUT', path, { ...options, body }).then(unwrap),
    patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
      request<ApiEnvelope<T> | T>('PATCH', path, { ...options, body }).then(unwrap),
    delete: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
      request<ApiEnvelope<T> | T>('DELETE', path, options).then(unwrap),
    /** Raw fetch for SSE streams — caller handles response body */
    fetchRaw: (
      path: string,
      init: RequestInit & { skipAuth?: boolean; timeoutMs?: number } = {},
    ) => {
      const { skipAuth = false, timeoutMs = 120_000, ...fetchInit } = init;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-TrailVerse-Client': clientHeader,
        ...(fetchInit.headers as Record<string, string> | undefined),
      };

      return (async () => {
        if (!skipAuth && getToken) {
          const token = await getToken();
          if (token) headers.Authorization = `Bearer ${token}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const signal = fetchInit.signal;
        const onAbort = () => controller.abort();
        signal?.addEventListener('abort', onAbort);

        try {
          return await fetch(buildUrl(baseUrl, path), {
            ...fetchInit,
            headers,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
          signal?.removeEventListener('abort', onAbort);
        }
      })();
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
