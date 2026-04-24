import enhancedApi from './enhancedApi';
import { getStoredToken } from './authService';

class AIService {
  /**
   * High-level: send full chat payload with system + history + params.
   */
  async chat({
    messages,               // [{role:'system'|'user'|'assistant', content:string}]
    provider,               // 'claude' | 'openai' | ...
    model,                  // optional model override per provider
    temperature = 0.4,
    top_p = 0.9,
    max_tokens = 2000,
    conversationId = null,
    stream = false,
    signal,                 // AbortController.signal (optional)
    metadata                // optional: { parkFacts, userPrefs, ... }
  }) {
    const body = {
      messages,
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
    messages,               // [{role:'system'|'user'|'assistant', content:string}]
    provider,               // 'claude' | 'openai' | ...
    model,                  // optional model override per provider
    temperature = 0.4,
    top_p = 0.9,
    max_tokens = 2000,
    stream = false,
    signal,                 // AbortController.signal (optional)
    metadata,               // optional: { parkCode, parkName, lat, lon, formData }
    anonymousId             // optional: existing anonymousId from localStorage
  }) {
    const body = {
      messages,
      provider,
      model,
      temperature,
      top_p,
      max_tokens,
      stream,
      metadata,
      anonymousId           // Send anonymousId if available
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
    const API_URL =
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://trailverse.onrender.com/api'
        : 'http://localhost:5001/api');
    const token = typeof window !== 'undefined' ? getStoredToken() : null;

    const response = await fetch(`${API_URL}/ai/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        messages,
        provider,
        temperature,
        top_p,
        maxTokens: max_tokens,
        conversationId,
        metadata
      }),
      signal
    });

    if (!response.ok) {
      const errBody = await response.text();
      let parsed;
      try { parsed = JSON.parse(errBody); } catch { parsed = null; }
      const err = new Error(parsed?.error || errBody || `Stream request failed with status ${response.status}`);
      err.response = { status: response.status, data: parsed || { error: errBody } };
      throw err;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let parsed;
        try {
          parsed = JSON.parse(line.slice(6));
        } catch (e) {
          continue; // skip parse errors on partial chunks
        }
        if (parsed.type === 'thinking') onThinking?.(parsed);
        if (parsed.type === 'chunk') onChunk?.(parsed.content);
        if (parsed.type === 'done') onDone?.(parsed);
        if (parsed.type === 'error') onError?.(parsed.message);
      }
    }

    // Process any remaining buffer
    if (buffer.startsWith('data: ')) {
      let parsed;
      try {
        parsed = JSON.parse(buffer.slice(6));
      } catch (e) { /* skip incomplete */ }
      if (parsed) {
        if (parsed.type === 'thinking') onThinking?.(parsed);
        if (parsed.type === 'chunk') onChunk?.(parsed.content);
        if (parsed.type === 'done') onDone?.(parsed);
        if (parsed.type === 'error') onError?.(parsed.message);
      }
    }
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
