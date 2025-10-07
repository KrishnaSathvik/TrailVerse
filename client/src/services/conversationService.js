import enhancedApi from './enhancedApi';

class ConversationService {
  // Get all conversations for user
  async getConversations(params = {}) {
    const result = await enhancedApi.get('/conversations', params, { 
      cacheType: 'conversations',
      ttl: 5 * 60 * 1000 // 5 minutes
    });
    return result.data;
  }

  // Get single conversation
  async getConversation(conversationId) {
    const result = await enhancedApi.get(`/conversations/${conversationId}`, {}, { 
      cacheType: 'conversations',
      ttl: 2 * 60 * 1000 // 2 minutes
    });
    return result.data.data;
  }

  // Create new conversation
  async createConversation(conversationData) {
    const response = await enhancedApi.post('/conversations', conversationData, {
      invalidateCache: ['conversations']
    });
    return response.data.data;
  }

  // Update conversation
  async updateConversation(conversationId, updateData) {
    const response = await enhancedApi.put(`/conversations/${conversationId}`, updateData, {
      invalidateCache: ['conversations']
    });
    return response.data.data;
  }

  // Add message to conversation
  async addMessage(conversationId, message) {
    const response = await enhancedApi.post(`/conversations/${conversationId}/messages`, message, {
      invalidateCache: ['conversations']
    });
    return response.data.data;
  }

  // Delete conversation
  async deleteConversation(conversationId) {
    await enhancedApi.delete(`/conversations/${conversationId}`, {
      invalidateCache: ['conversations']
    });
  }

  // Archive conversation
  async archiveConversation(conversationId) {
    await enhancedApi.put(`/conversations/${conversationId}/archive`, {}, {
      invalidateCache: ['conversations']
    });
  }

  // Restore conversation
  async restoreConversation(conversationId) {
    await enhancedApi.put(`/conversations/${conversationId}/restore`, {}, {
      invalidateCache: ['conversations']
    });
  }

  // Get conversation statistics
  async getConversationStats() {
    const result = await enhancedApi.get('/conversations/stats', {}, { 
      cacheType: 'conversations',
      ttl: 10 * 60 * 1000 // 10 minutes
    });
    return result.data.data;
  }

  // Clear conversation cache
  clearConversationCache() {
    enhancedApi.clearCacheByType('conversations');
  }

  // Helper method to create conversation with initial message
  async startConversation(initialMessage, options = {}) {
    const conversation = await this.createConversation({
      title: options.title || 'New Conversation',
      parkCode: options.parkCode,
      parkName: options.parkName,
      category: options.category || 'general',
      tags: options.tags || [],
      settings: options.settings || {}
    });

    if (initialMessage) {
      await this.addMessage(conversation._id, {
        role: 'user',
        content: initialMessage,
        metadata: options.messageMetadata || {}
      });
    }

    return conversation;
  }

  // Helper method to continue conversation with AI response
  async continueConversation(conversationId, userMessage, aiResponse, metadata = {}) {
    // Add user message
    await this.addMessage(conversationId, {
      role: 'user',
      content: userMessage,
      metadata: metadata.user || {}
    });

    // Add AI response
    await this.addMessage(conversationId, {
      role: 'assistant',
      content: aiResponse,
      metadata: metadata.assistant || {}
    });

    // Return updated conversation
    return await this.getConversation(conversationId);
  }
}

export default new ConversationService();
