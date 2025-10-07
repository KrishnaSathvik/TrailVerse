import enhancedApi from './enhancedApi';

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
        signal // pass through to Axios/fetch in your enhancedApi
      }
    );

    return response.data?.data;
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
