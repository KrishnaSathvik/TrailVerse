import enhancedApi from './enhancedApi';
import { getAuthBearerToken } from './authService';
import { getApiBaseUrl } from '@/lib/apiBase';
import { createTransportEventNormalizer, CLIENT_EVENT } from '@/utils/transportEventNormalizer';
import { trailieV2NegotiationHeaders } from '@/lib/trailieTransport';

/** Prefer explicit systemPrompt; else peel legacy messages[0].role=system */
function getAiApiBaseUrl() {
  return getApiBaseUrl();
}

/**
 * WP10F-3 — ONE per-turn client normalizer serves BOTH dialects.
 *
 * Every raw SSE object (legacy or v2) is fed through
 * `createTransportEventNormalizer()` and the normalized `CLIENT_EVENT`s are
 * dispatched to the EXISTING React callbacks. There is no `if (isV2)` branch:
 * the normalizer splits the overloaded legacy `thinking` into the same
 * progress/evidence/display concepts a v2 stream carries as distinct events, so
 * the UI state machinery is unchanged and dialect-agnostic.
 *
 * A client that passes no `onEarlyEvent` behaves exactly as before, and a
 * legacy-only stream (the production default) reduces to the identical callback
 * sequence it always produced.
 */

/**
 * Translate one normalized client event into the existing streaming callbacks.
 * The callback SHAPES are preserved verbatim so no UI handler changes:
 *   - progress/evidence  → onThinking({ stage, refinementTarget }) / onThinking({ sources })
 *   - display_context    → onDisplayContext(...) — its OWN sink, so it never
 *                          resets thinking sources/copy (WP10F-2 parity)
 *   - content_delta      → onChunk(text)
 *   - content_reset      → onContentReset()
 *   - stream_finished    → onStreamEnd()   (legacy stream_end parity)
 *   - finalized          → onDone(payload)
 *   - itinerary/prose/response_started → onEarlyEvent({ type, ... }) verbatim
 */
function dispatchNormalizedEvent(ev, cb, marks) {
  switch (ev.kind) {
    case CLIENT_EVENT.RESPONSE_STARTED:
      cb.onEarlyEvent?.({ type: 'response_started', responseId: ev.responseId });
      break;
    case CLIENT_EVENT.DISPLAY_CONTEXT:
      cb.onDisplayContext?.({ parkName: ev.parkName, parkNames: ev.parkNames, parkImages: ev.parkImages });
      break;
    case CLIENT_EVENT.PROGRESS:
      cb.onThinking?.({ stage: ev.stage, refinementTarget: ev.refinementTarget ?? null });
      break;
    case CLIENT_EVENT.EVIDENCE:
      cb.onThinking?.({ sources: ev.sources });
      break;
    case CLIENT_EVENT.CONTENT_DELTA:
      cb.onChunk?.(ev.content);
      break;
    case CLIENT_EVENT.CONTENT_RESET:
      cb.onContentReset?.();
      break;
    case CLIENT_EVENT.ITINERARY_READY:
      cb.onEarlyEvent?.({ type: 'itinerary_ready', response: ev.response, canonicalPlan: ev.canonicalPlan });
      break;
    case CLIENT_EVENT.PROSE_READY:
      cb.onEarlyEvent?.({
        type: 'prose_ready',
        response: ev.response,
        canonicalPlan: ev.canonicalPlan,
        expectedPreviousRevision: ev.expectedPreviousRevision,
      });
      break;
    case CLIENT_EVENT.STREAM_FINISHED:
      marks.sawStreamEnd = true;
      cb.onStreamEnd?.();
      break;
    case CLIENT_EVENT.FINALIZED:
      marks.sawDone = true;
      cb.onDone?.(ev.payload);
      break;
    case CLIENT_EVENT.ERROR:
      cb.onError?.(ev.message);
      break;
    default:
      break;
  }
}

export async function consumeAiSseStream(response, callbacks = {}) {
  const modelFirst = response.headers?.get?.('x-trailie-runtime') === 'model_first';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const normalizer = createTransportEventNormalizer();
  let buffer = '';
  const marks = { sawStreamEnd: false, sawDone: false };

  const handleLine = (line) => {
    if (!line.startsWith('data: ')) return;
    let parsed;
    try {
      parsed = JSON.parse(line.slice(6));
    } catch {
      return;
    }
    for (const ev of normalizer.normalize(parsed)) {
      dispatchNormalizedEvent(ev, callbacks, marks);
    }
    if (parsed.type === 'error' && (modelFirst || parsed.retryable === false)) {
      throw Object.assign(new Error(parsed.message || 'Trailie could not finish this response.'), {
        noAutomaticRetry: true, serverResolvedFailure: true, code: parsed.code, responseId: parsed.responseId,
      });
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        handleLine(line);
      }
    }

    if (buffer.startsWith('data: ')) {
      handleLine(buffer);
    }
    if (modelFirst && !marks.sawDone) throw new Error('Trailie disconnected before confirming the response.');
  } catch (error) {
    if (modelFirst) error.noAutomaticRetry = true;
    throw error;
  } finally {
    callbacks.onClose?.({ sawStreamEnd: marks.sawStreamEnd, sawDone: marks.sawDone });
  }
}

function resolveChatPayload(messages, systemPrompt) {
  if (systemPrompt) {
    return {
      systemPrompt,
      messages: messages.filter((m) => m.role !== 'system'),
    };
  }
  const systemIdx = messages.findIndex((m) => m.role === 'system');
  if (systemIdx === -1) {
    return { systemPrompt: undefined, messages };
  }
  return {
    systemPrompt: messages[systemIdx].content,
    messages: messages.filter((_, i) => i !== systemIdx),
  };
}

class AIService {
  /**
   * High-level: send full chat payload with system + history + params.
   */
  async chat({
    messages,               // [{role:'user'|'assistant', content:string}]
    systemPrompt,           // session context (trip form, personalization) — merged server-side with Trailie persona
    provider,               // 'claude' | 'openai' | ...
    model,                  // optional model override per provider
    temperature = 0.4,
    top_p = 0.9,
    max_tokens = 2000,
    conversationId = null,
    stream = false,
    signal,                 // AbortController.signal (optional)
    metadata                // optional: { parkFacts, userPrefs, aiContext, ... }
  }) {
    const resolved = resolveChatPayload(messages, systemPrompt);
    const body = {
      messages: resolved.messages,
      systemPrompt: resolved.systemPrompt,
      provider,
      model,
      temperature,
      top_p,
      max_tokens,
      conversationId,
      stream,
      metadata
    };

    const response = await enhancedApi.post(
      '/ai/chat',
      body,
      {
        skipCache: true,
        signal, // pass through to Axios/fetch in your enhancedApi
        timeout: 120000 // 2 min — AI requests need more time (fact fetching + generation)
      }
    );

    return response.data?.data;
  }

  /**
   * Anonymous chat - no authentication required
   */
  async chatAnonymous({
    messages,
    systemPrompt,
    provider,
    model,
    temperature = 0.4,
    top_p = 0.9,
    max_tokens = 2000,
    stream = false,
    signal,
    metadata,
    anonymousId,
    // Stage 14.8A.2 §5 — stable per-submission id so a retry or a second tab is
    // de-duplicated server-side instead of consuming a second guest turn.
    clientTurnId
  }) {
    const resolved = resolveChatPayload(messages, systemPrompt);
    const body = {
      messages: resolved.messages,
      systemPrompt: resolved.systemPrompt,
      provider,
      model,
      temperature,
      top_p,
      max_tokens,
      stream,
      metadata,
      anonymousId,
      clientTurnId
    };

    const response = await enhancedApi.post(
      '/ai/chat-anonymous',
      body,
      {
        skipCache: true,
        signal, // pass through to Axios/fetch in your enhancedApi
        timeout: 120000 // 2 min — AI requests need more time (fact fetching + generation)
      }
    );

    return response.data?.data;
  }

  /**
   * Streaming chat — uses SSE via fetch + ReadableStream.
   * Calls onChunk for each text fragment, onDone when complete, onError on failure.
   */
  async chatStream({
    messages,
    systemPrompt,
    provider,
    temperature = 0.4,
    top_p = 0.9,
    max_tokens = 2000,
    conversationId = null,
    signal,
    metadata,
    onChunk,
    onContentReset,
    onStreamEnd,
    onDone,
    onError,
    onThinking,
    onClose,
    // Stage 14.3 — authenticated streaming only. The anonymous stream never
    // emits early events and is deliberately left untouched.
    onEarlyEvent,
    // WP10F-2/3 — first-class v2 presentation updates (park imagery). Legacy
    // display folds here too, split out of the overloaded `thinking` event.
    onDisplayContext,
  }) {
    const resolved = resolveChatPayload(messages, systemPrompt);
    const token = typeof window !== 'undefined' ? getAuthBearerToken() : null;

    const response = await fetch(`${getAiApiBaseUrl()}/ai/chat-stream`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // WP10F-3 — v2 negotiation, dual-gated: the header is sent only when the
        // client flag is on; the server still independently checks its own switch.
        ...trailieV2NegotiationHeaders(),
      },
      body: JSON.stringify({
        messages: resolved.messages,
        systemPrompt: resolved.systemPrompt,
        provider,
        temperature,
        top_p,
        maxTokens: max_tokens,
        conversationId,
        metadata,
      }),
      signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(errBody);
      } catch {
        parsed = null;
      }
      const err = new Error(parsed?.error || errBody || `Stream request failed with status ${response.status}`);
      err.noAutomaticRetry = response.headers.get('x-trailie-runtime') === 'model_first';
      err.response = { status: response.status, data: parsed || { error: errBody } };
      throw err;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      onDone?.(json.data || json);
      return;
    }

    await consumeAiSseStream(response, { onChunk, onContentReset, onStreamEnd, onDone, onError, onThinking, onClose, onEarlyEvent, onDisplayContext });
  }

  /**
   * Anonymous streaming chat — SSE, no auth. Falls back to JSON for conversion/limit responses.
   */
  async chatAnonymousStream({
    messages,
    systemPrompt,
    provider,
    model,
    temperature = 0.4,
    top_p = 0.9,
    max_tokens = 8000,
    signal,
    metadata,
    anonymousId,
    // Stage 14.8A.2 §5 — stable per-submission id (see chatAnonymous).
    clientTurnId,
    onChunk,
    onContentReset,
    onStreamEnd,
    onDone,
    onError,
    onThinking,
    onClose,
    // WP10F-3 — the anonymous stream shares the same normalizer; display context
    // rides its own callback here too. No early events / no authenticated semantics.
    onDisplayContext,
  }) {
    const resolved = resolveChatPayload(messages, systemPrompt);

    const response = await fetch(`${getAiApiBaseUrl()}/ai/chat-anonymous-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // WP10F-3 — v2 negotiation, dual-gated (client flag + server switch).
        ...trailieV2NegotiationHeaders(),
      },
      body: JSON.stringify({
        messages: resolved.messages,
        systemPrompt: resolved.systemPrompt,
        provider,
        model,
        temperature,
        top_p,
        maxTokens: max_tokens,
        metadata,
        anonymousId,
        clientTurnId,
      }),
      signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(errBody);
      } catch {
        parsed = null;
      }
      const err = new Error(parsed?.error || errBody || `Anonymous stream failed with status ${response.status}`);
      err.noAutomaticRetry = response.headers.get('x-trailie-runtime') === 'model_first';
      err.response = { status: response.status, data: parsed || { error: errBody } };
      throw err;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      onDone?.(json.data || json);
      return;
    }

    await consumeAiSseStream(response, { onChunk, onContentReset, onStreamEnd, onDone, onError, onThinking, onClose, onDisplayContext });
  }

  /**
   * Back-compat: simple single-turn ask (kept for convenience).
   * Not recommended for planning—use chat() instead.
   */
  async sendMessage(message, conversationId = null) {
    const response = await enhancedApi.post(
      '/ai/chat',
      { message, conversationId },
      { skipCache: true }
    );
    return response.data.data;
  }

  async getConversations() {
    // Cache conversations for a short time
    const result = await enhancedApi.get('/ai/conversations', {}, { 
      cacheType: 'aiConversations',
      ttl: 2 * 60 * 1000 // 2 minutes - short cache for conversations list
    });
    return result.data.data;
  }

  async getConversation(id) {
    // Cache individual conversations for a short time
    const result = await enhancedApi.get(`/ai/conversations/${id}`, {}, { 
      cacheType: 'aiConversations',
      ttl: 2 * 60 * 1000 // 2 minutes
    });
    return result.data.data;
  }

  async deleteConversation(id) {
    await enhancedApi.delete(`/ai/conversations/${id}`, {
      invalidateCache: ['aiConversations']
    });
  }

  async updateConversationTitle(id, title) {
    const response = await enhancedApi.put(`/ai/conversations/${id}`, { title }, {
      invalidateCache: ['aiConversations']
    });
    return response.data.data;
  }

  // Clear AI conversation cache when user logs out
  clearConversationCache() {
    enhancedApi.clearCacheByType('aiConversations');
  }
}

export default new AIService();
