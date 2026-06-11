import enhancedApi from '@/services/enhancedApi';
import { tripHistoryService } from '@/services/tripHistoryService';
import { ANONYMOUS_SESSION_MAX_AGE_MS } from '@/lib/anonymousChatLimits';

const ANONYMOUS_SESSION_KEY = 'anonymousSession';

function readExistingSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ANONYMOUS_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Bind a guest resume link to this browser, then open /plan-ai with full chat restored.
 */
export async function seedGuestSessionFromLink(anonymousId) {
  if (!anonymousId) {
    return { ok: false, error: 'Missing session id' };
  }

  const response = await enhancedApi.get(
    `/ai/session-status/${encodeURIComponent(anonymousId)}`,
    {},
    { skipCache: true }
  );
  const data = response.data || response;

  if (!data || data.error || !Array.isArray(data.messages) || data.messages.length === 0) {
    return { ok: false, error: 'This guest chat was not found or has expired.' };
  }

  const existing = readExistingSession();
  const sameSession = existing?.anonymousId === anonymousId;
  const sessionTimestamp =
    sameSession && existing?.timestamp
      ? existing.timestamp
      : data.lastActivity
        ? new Date(data.lastActivity).getTime()
        : Date.now();

  if (Date.now() - sessionTimestamp >= ANONYMOUS_SESSION_MAX_AGE_MS) {
    return { ok: false, error: 'This guest chat has expired. Start a new conversation on Trailie.' };
  }

  localStorage.setItem(
    ANONYMOUS_SESSION_KEY,
    JSON.stringify({
      anonymousId,
      messageCount: data.messageCount ?? 0,
      canSendMore: data.canSendMore ?? false,
      parkName: data.parkName || '',
      formData: data.formData || {},
      timestamp: sessionTimestamp,
      avatarUrl: sameSession ? existing?.avatarUrl : undefined,
    })
  );

  tripHistoryService.saveTempChatState({
    currentTripId: null,
    messages: tripHistoryService.normalizeStoredMessages(
      data.messages.map((msg, index) => ({
        ...msg,
        id: `restored-${index}-${msg.timestamp || Date.now()}`,
      }))
    ),
    plan: null,
    provider: 'auto',
  });

  return { ok: true, data };
}
