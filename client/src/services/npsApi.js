import enhancedApi from './enhancedApi';
import globalCacheManager from './globalCacheManager';

class NPSApi {
  // Get all parks with pagination support
  async getAllParks(page = 1, limit = 12, fetchAll = false, nationalParksOnly = true) {
    const cacheKey = fetchAll ? 'all-parks' : `parks-page-${page}-limit-${limit}-nationalOnly-${nationalParksOnly}`;
    
    const result = await globalCacheManager.get(
      cacheKey,
      'parks',
      async () => {
        const params = {};
        if (fetchAll) {
          params.all = 'true';
        } else {
          params.page = page;
          params.limit = limit;
        }
        
        // Add national parks only filter
        if (nationalParksOnly) {
          params.nationalParksOnly = 'true';
        }
        
        const result = await enhancedApi.get('/parks', params, { 
          cacheType: 'parks',
          ttl: 24 * 60 * 60 * 1000 // 24 hours
        });
        
        // Return the full response with pagination metadata
        return {
          data: result.data.data,
          total: result.data.total,
          page: result.data.page,
          pages: result.data.pages,
          hasMore: result.data.hasMore
        };
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
          ttl: 24 * 60 * 60 * 1000 // 24 hours (1 day)
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
          ttl: 24 * 60 * 60 * 1000 // 24 hours (1 day)
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
