import api from './api';

class DailyFeedService {
  async getDailyFeed() {
    const response = await api.get('/feed/daily', {
      cacheType: 'dailyFeed',
      timeout: 30000, // Should be instant (pre-generated), but allow 30s for on-demand fallback
    });

    if (response.data && response.data.success) {
      return response.data.data;
    }
    return response.data;
  }

  async getParkOfDay() {
    const response = await api.get('/feed/park-of-day');
    return response.data?.data;
  }

  async getNatureFact(parkCode, name) {
    const params = {};
    if (parkCode) params.parkCode = parkCode;
    if (name) params.name = name;
    const response = await api.get('/feed/nature-fact', { params });
    return response.data?.data?.fact;
  }
}

export default new DailyFeedService();
