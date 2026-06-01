import enhancedApi from './enhancedApi';
import globalCacheManager from './globalCacheManager';

const ALL_PARKS_CACHE_VERSION = 'v4';

class NPSApi {
  // Get all parks with pagination support
  async getAllParks(page = 1, limit = 12, fetchAll = false, nationalParksOnly = true, includeActivities = false) {
    const cacheKey = fetchAll
      ? `all-parks-${ALL_PARKS_CACHE_VERSION}-nationalOnly-${nationalParksOnly}-activities-${includeActivities}`
      : `parks-page-${page}-limit-${limit}-nationalOnly-${nationalParksOnly}`;
    
    const result = await globalCacheManager.get(
      cacheKey,
      'parks',
      async () => {
        const params = {};
        if (fetchAll) {
          params.all = 'true';
          if (includeActivities) {
            params.includeActivities = 'true';
          }
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
          ttl: 24 * 60 * 60 * 1000, // 24 hours
          // Skip enhancedApi's own caching for the all-parks request —
          // useParks.js already manages localStorage persistence via 
          // trailverse_all_parks, and globalCacheManager handles memory caching.
          // Without this, the same ~5MB payload gets stored 3x in localStorage.
          skipCache: fetchAll
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
          ttl: 10 * 60 * 1000 // 10 minutes
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

  // Places (What to See) with coordinates for /map
  async getMapPlaces() {
    const result = await globalCacheManager.get(
      'map-places-v1',
      'parks',
      async () => {
        const result = await enhancedApi.get('/parks/map/places', {}, {
          cacheType: 'parks',
          ttl: 7 * 24 * 60 * 60 * 1000,
        });
        return {
          data: result.data.data,
          total: result.data.count,
        };
      }
    );
    return result.data;
  }

  // Campgrounds with coordinates for /map
  async getMapCampgrounds() {
    const result = await globalCacheManager.get(
      'map-campgrounds-v1',
      'parks',
      async () => {
        const result = await enhancedApi.get('/parks/map/campgrounds', {}, {
          cacheType: 'parks',
          ttl: 7 * 24 * 60 * 60 * 1000,
        });
        return {
          data: result.data.data,
          total: result.data.count,
        };
      }
    );
    return result.data;
  }

  // Search parks (catalog: tokens + traits + matchReason)
  async searchParks(query, state, limit = 24) {
    const params = {};
    if (query) params.q = query;
    if (state) params.state = state;
    if (limit) params.limit = limit;

    const result = await enhancedApi.get('/parks/search', params, {
      cacheType: 'search',
      ttl: 2 * 60 * 1000, // 2 minutes
    });
    const body = result.data || {};
    return {
      parks: body.data || [],
      count: body.count ?? (body.data?.length || 0),
      searchId: body.searchId || null,
    };
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
