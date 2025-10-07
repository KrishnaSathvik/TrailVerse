import enhancedApi from './enhancedApi';
import globalCacheManager from './globalCacheManager';

class NPSApi {
  // Get all parks
  async getAllParks() {
    const result = await globalCacheManager.get(
      'all-parks',
      'parks',
      async () => {
        const result = await enhancedApi.get('/parks', {}, { 
          cacheType: 'parks',
          ttl: 24 * 60 * 60 * 1000 // 24 hours
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Get park by code
  async getParkByCode(parkCode) {
    const result = await globalCacheManager.get(
      `park-${parkCode}`,
      'parks',
      async () => {
        const result = await enhancedApi.get(`/parks/${parkCode}`, {}, { 
          cacheType: 'parks',
          ttl: 12 * 60 * 60 * 1000 // 12 hours
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Get park with full details
  async getParkDetails(parkCode) {
    const result = await globalCacheManager.get(
      `park-details-${parkCode}`,
      'parkDetails',
      async () => {
        const result = await enhancedApi.get(`/parks/${parkCode}/details`, {}, { 
          cacheType: 'parkDetails',
          ttl: 12 * 60 * 60 * 1000 // 12 hours
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Get park alerts
  async getParkAlerts(parkCode) {
    const result = await globalCacheManager.get(
      `park-alerts-${parkCode}`,
      'parkAlerts',
      async () => {
        const result = await enhancedApi.get(`/parks/${parkCode}/alerts`, {}, { 
          cacheType: 'parkAlerts',
          ttl: 5 * 60 * 1000 // 5 minutes - alerts change frequently
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Search parks
  async searchParks(query, state) {
    const params = {};
    if (query) params.q = query;
    if (state) params.state = state;
    
    const result = await enhancedApi.get('/parks/search', params, { 
      cacheType: 'search',
      ttl: 2 * 60 * 1000 // 2 minutes
    });
    return result.data.data;
  }

  // Prefetch park data for better UX
  async prefetchParkData(parkCode) {
    if (!parkCode) return;
    
    try {
      await Promise.all([
        enhancedApi.prefetch(`/parks/${parkCode}`, {}, 'parks'),
        enhancedApi.prefetch(`/parks/${parkCode}/details`, {}, 'parkDetails')
      ]);
    } catch (error) {
      // Silent fail - prefetch is optional
    }
  }
}

export default new NPSApi();
