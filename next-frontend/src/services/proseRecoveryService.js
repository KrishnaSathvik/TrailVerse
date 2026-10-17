import { getApiBaseUrl } from '@/lib/apiBase';
import { getAuthBearerToken } from './authService';
import { consumeAiSseStream } from './aiService';
import { createEarlyRevisionCoordinator } from '@/utils/earlyRevisionCoordinator';
import {
  RECOVERY_MESSAGE,
  seedCoordinatorForRecovery,
  resolveRecoveryFailure,
} from '@/utils/proseRecoveryClient';

/**
 * Stage 14.5 — drive an explicit prose-recovery request.
 *
 * There is no second state machine: the Stage 14.3 coordinator is seeded at
 * `itinerary_visible` with the already-durable revision 1, so revision 2 is
 * persisted before prose is revealed, recovery `chunk` frames are suppressed,
 * and a matching `done` reconciles without a third write.
 */
export async function runProseRecoveryStream({
  tripId,
  message,
  plan,
  onRevealProse,
  onPlan,
  persistRevision2,
  fetchImpl = typeof fetch === 'function' ? fetch : null,
}) {
  const coordinator = createEarlyRevisionCoordinator({
    // Revision 1 is already durable; these must never fire.
    persistRevision1: async () => ({ ok: false }),
    persistRevision2: async (effect) => persistRevision2(effect),
    persistTerminal: async () => ({ ok: false }),
    legacyTerminal: () => {},
    initialTripId: tripId,
    view: {
      revealProse: (effect) => {
        onPlan?.(effect.canonicalPlan);
        onRevealProse?.(effect);
      },
    },
  });
  seedCoordinatorForRecovery(coordinator, { message, plan, tripId });

  const token = typeof window !== 'undefined' ? getAuthBearerToken() : null;
  const response = await fetchImpl(
    `${getApiBaseUrl()}/trips/${tripId}/response/${message.responseId}/prose`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  );

  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    // Bounded copy only — the server's message is deliberately discarded.
    const failure = resolveRecoveryFailure({ status: response.status, error: body?.error });
    return { ok: false, notice: failure.message, retryable: failure.retryable };
  }

  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json')) {
    // Already complete — nothing to stream, nothing to persist.
    return { ok: true, alreadyComplete: true };
  }

  await consumeAiSseStream(response, {
    onEarlyEvent: (event) => coordinator.handleEvent(event),
    onDone: (event) => coordinator.handleEvent({
      ...event,
      type: 'done',
      canonicalPlan: event.canonicalPlan || event.itineraryData || event.itinerary || null,
    }),
    // Recovery replays prose as chunks too; the coordinator suppresses them.
    onChunk: () => coordinator.shouldRenderLegacyChunk(),
    onStreamEnd: () => coordinator.shouldFinalizeLegacyStream(),
    onError: () => {},
  });
  await coordinator.drain();

  const state = coordinator.getState();
  if (!state.proseVisible) {
    return { ok: false, notice: RECOVERY_MESSAGE.FAILED, retryable: true };
  }
  return { ok: true, metrics: coordinator.getMetrics() };
}
