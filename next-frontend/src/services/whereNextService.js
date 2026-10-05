import { getApiBaseUrl } from '@/lib/apiBase';

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${getApiBaseUrl()}/where-next${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.error || 'Unable to save destination');
  }
  return json.data;
}

export function submitWhereNextPick({ sessionId, rawInput, parkCode, source }) {
  return request('/pick', {
    method: 'POST',
    body: { sessionId, rawInput, parkCode: parkCode || undefined, source },
  });
}

export function patchWhereNextWindow({ sessionId, travelWindow }) {
  return request('/pick', {
    method: 'PATCH',
    body: { sessionId, travelWindow },
  });
}

export function fetchWhereNextMe(sessionId) {
  return request(`/me?sessionId=${encodeURIComponent(sessionId)}`);
}

export function fetchWhereNextStats() {
  return request('/stats');
}
