import enhancedApi from './enhancedApi';

class AIService {
  async sendMessage(message, conversationId = null) {
    // AI conversations are not cached as they are real-time
    const response = await enhancedApi.post('/ai/chat', {
      message,
      conversationId
    }, {
      skipCache: true // Don't cache AI responses
    });
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
