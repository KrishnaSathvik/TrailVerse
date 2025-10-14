import enhancedApi from './enhancedApi';
import globalCacheManager from './globalCacheManager';

class ActivitiesApi {
  // Get all activities across all parks with optional filters
  async getAllActivities(filters = {}) {
    const { type, difficulty, duration, park, q, limit } = filters;
    
    const params = {};
    if (type) params.type = type;
    if (difficulty) params.difficulty = difficulty;
    if (duration) params.duration = duration;
    if (park) params.park = park;
    if (q) params.q = q;
    if (limit) params.limit = limit;
    
    // Create cache key based on filters
    const cacheKey = `activities-${JSON.stringify(params)}`;
    
    const result = await globalCacheManager.get(
      cacheKey,
      'activities',
      async () => {
        const result = await enhancedApi.get('/activities', params, { 
          cacheType: 'activities',
          ttl: 30 * 60 * 1000 // 30 minutes - activities don't change frequently
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Get activity by ID
  async getActivityById(activityId) {
    const result = await globalCacheManager.get(
      `activity-${activityId}`,
      'activity',
      async () => {
        const result = await enhancedApi.get(`/activities/${activityId}`, {}, { 
          cacheType: 'activity',
          ttl: 60 * 60 * 1000 // 1 hour
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Prefetch activity data for better UX
  async prefetchActivityData(activityId) {
    if (!activityId) return;
    
    try {
      await enhancedApi.prefetch(`/activities/${activityId}`, {}, 'activity');
    } catch (error) {
      // Silent fail - prefetch is optional
    }
  }
}

export default new ActivitiesApi();

