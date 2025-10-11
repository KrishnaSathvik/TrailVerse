import api from './api';

class FeedbackService {
  // Submit feedback for an AI response
  async submitFeedback(feedbackData) {
    try {
      const response = await api.post('/ai/feedback', feedbackData);
      return response.data;
    } catch (error) {
      console.error('Error submitting feedback:', error);
      throw error;
    }
  }

  // Get feedback analytics for the current user
  async getFeedbackAnalytics(params = {}) {
    try {
      const queryParams = new URLSearchParams();
      if (params.parkCode) queryParams.append('parkCode', params.parkCode);
      if (params.aiProvider) queryParams.append('aiProvider', params.aiProvider);
      if (params.timeframe) queryParams.append('timeframe', params.timeframe);

      const response = await api.get(`/ai/feedback/analytics?${queryParams}`);
      return response.data;
    } catch (error) {
      console.error('Error getting feedback analytics:', error);
      throw error;
    }
  }

  // Get feedback patterns for AI learning
  async getFeedbackPatterns(limit = 50) {
    try {
      const response = await api.get(`/ai/feedback/patterns?limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('Error getting feedback patterns:', error);
      throw error;
    }
  }

  // Get poor performing responses (admin only)
  async getPoorPerformingResponses(threshold = 0.3) {
    try {
      const response = await api.get(`/ai/feedback/poor-performance?threshold=${threshold}`);
      return response.data;
    } catch (error) {
      console.error('Error getting poor performing responses:', error);
      throw error;
    }
  }

  // Delete feedback
  async deleteFeedback(feedbackId) {
    try {
      const response = await api.delete(`/ai/feedback/${feedbackId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting feedback:', error);
      throw error;
    }
  }

  // Helper method to prepare feedback data
  prepareFeedbackData({
    conversationId,
    messageId,
    feedback,
    userMessage,
    aiResponse,
    aiProvider,
    aiModel,
    parkCode,
    parkName,
    responseTime
  }) {
    return {
      conversationId,
      messageId,
      feedback, // 'up' or 'down'
      userMessage,
      aiResponse,
      aiProvider,
      aiModel,
      parkCode,
      parkName,
      responseTime
    };
  }
}

export default new FeedbackService();
