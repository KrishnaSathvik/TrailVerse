import enhancedApi from './enhancedApi';
import { getAuthBearerToken } from './authService';
import { getApiBaseUrl } from '@/lib/apiBase';

/** Prefer explicit systemPrompt; else peel legacy messages[0].role=system */
function getAiApiBaseUrl() {
  return getApiBaseUrl();
}

async function consumeAiSseStream(response, { onChunk, onDone, onError, onThinking } = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleLine = (line) => {
    if (!line.startsWith('data: ')) return;
    let parsed;
    try {
      parsed = JSON.parse(line.slice(6));
    } catch {
      return;
    }
    if (parsed.type === 'thinking') onThinking?.(parsed);
    if (parsed.type === 'chunk') onChunk?.(parsed.content);
    if (parsed.type === 'done') onDone?.(parsed);
    if (parsed.type === 'error') onError?.(parsed.message);
  };

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
    anonymousId
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
      anonymousId
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
    onDone,
    onError,
    onThinking
  }) {
    const resolved = resolveChatPayload(messages, systemPrompt);
    const token = typeof window !== 'undefined' ? getAuthBearerToken() : null;

    const response = await fetch(`${getAiApiBaseUrl()}/ai/chat-stream`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      err.response = { status: response.status, data: parsed || { error: errBody } };
      throw err;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      onDone?.(json.data || json);
      return;
    }

    await consumeAiSseStream(response, { onChunk, onDone, onError, onThinking });
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
    onChunk,
    onDone,
    onError,
    onThinking,
  }) {
    const resolved = resolveChatPayload(messages, systemPrompt);

    const response = await fetch(`${getAiApiBaseUrl()}/ai/chat-anonymous-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      err.response = { status: response.status, data: parsed || { error: errBody } };
      throw err;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      onDone?.(json.data || json);
      return;
    }

    await consumeAiSseStream(response, { onChunk, onDone, onError, onThinking });
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
