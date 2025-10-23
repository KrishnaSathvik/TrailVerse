import api from './api';

class DailyFeedService {
  async getDailyFeed(userId = null, forceRefresh = false) {
    console.log('🌐 Service: Making API call to /feed/daily');
    console.log(`👤 User ID: ${userId}`);
    console.log(`🔄 Force refresh: ${forceRefresh}`);
    
    const response = await api.get('/feed/daily', {
      skipCache: false, // Use smart caching
      params: {} // No refresh parameter
    });
    
    console.log('🌐 Service: API response received', response.data?.cached ? '(cached from DB)' : '(fresh from DB)');
    
    // Return the data object directly, not the wrapper
    if (response.data && response.data.success) {
      return response.data.data;
    }
    return response.data;
  }

  async getParkOfDay() {
    const response = await api.get('/feed/park-of-day');
    return response.data?.data;
  }

  async getNatureFact() {
    const response = await api.get('/feed/nature-fact');
    return response.data?.data?.fact;
  }


}

export default new DailyFeedService();
