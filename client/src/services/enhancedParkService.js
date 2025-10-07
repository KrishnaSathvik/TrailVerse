import enhancedApi from './enhancedApi';
import globalCacheManager from './globalCacheManager';

class EnhancedParkService {
  // Get enhanced park data for a single park
  async getEnhancedParkData(parkCode) {
    const result = await globalCacheManager.get(
      `enhanced-park-${parkCode}`,
      'enhancedParks',
      async () => {
        const result = await enhancedApi.get(`/parks/${parkCode}/enhanced`, {}, { 
          cacheType: 'enhancedParks',
          ttl: 2 * 60 * 60 * 1000 // 2 hours
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Get park comparison data
  async getParkComparison(parkCodes) {
    const cacheKey = `comparison-${parkCodes.sort().join('-')}`;
    
    const result = await globalCacheManager.get(
      cacheKey,
      'comparisons',
      async () => {
        const result = await enhancedApi.post('/parks/compare', { parkCodes }, { 
          cacheType: 'comparisons',
          ttl: 30 * 60 * 1000 // 30 minutes
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Get park comparison summary
  async getParkComparisonSummary(parkCodes) {
    const cacheKey = `summary-${parkCodes.sort().join('-')}`;
    
    const result = await globalCacheManager.get(
      cacheKey,
      'comparisons',
      async () => {
        const result = await enhancedApi.post('/parks/compare/summary', { parkCodes }, { 
          cacheType: 'comparisons',
          ttl: 30 * 60 * 1000 // 30 minutes
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Get park weather data
  async getParkWeather(parkCode) {
    const result = await globalCacheManager.get(
      `weather-${parkCode}`,
      'weather',
      async () => {
        const result = await enhancedApi.get(`/parks/${parkCode}/weather`, {}, { 
          cacheType: 'weather',
          ttl: 15 * 60 * 1000 // 15 minutes
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Get park crowd level prediction
  async getParkCrowdLevel(parkCode, date = null) {
    const params = date ? { date: date.toISOString() } : {};
    const cacheKey = `crowd-${parkCode}-${date ? date.toDateString() : 'current'}`;
    
    const result = await globalCacheManager.get(
      cacheKey,
      'crowd',
      async () => {
        const result = await enhancedApi.get(`/parks/${parkCode}/crowd`, params, { 
          cacheType: 'crowd',
          ttl: 60 * 60 * 1000 // 1 hour
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Get best time to visit
  async getBestTimeToVisit(parkCode) {
    const result = await globalCacheManager.get(
      `best-time-${parkCode}`,
      'bestTime',
      async () => {
        const result = await enhancedApi.get(`/parks/${parkCode}/best-time`, {}, { 
          cacheType: 'bestTime',
          ttl: 24 * 60 * 60 * 1000 // 24 hours
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Get enhanced facilities data
  async getParkFacilities(parkCode) {
    const result = await globalCacheManager.get(
      `facilities-${parkCode}`,
      'facilities',
      async () => {
        const result = await enhancedApi.get(`/parks/${parkCode}/facilities`, {}, { 
          cacheType: 'facilities',
          ttl: 24 * 60 * 60 * 1000 // 24 hours
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Create park review
  async createParkReview(parkCode, reviewData) {
    const result = await enhancedApi.post(`/reviews/${parkCode}`, reviewData, {
      invalidateCache: ['reviews', 'enhancedParks']
    });
    return result.data;
  }

  // Get park reviews
  async getParkReviews(parkCode, options = {}) {
    const params = {
      page: options.page || 1,
      limit: options.limit || 10,
      sort: options.sort || 'newest',
      ...options
    };

    const result = await enhancedApi.get(`/reviews/${parkCode}`, params, { 
      cacheType: 'reviews',
      ttl: 5 * 60 * 1000 // 5 minutes
    });
    return result.data;
  }

  // Get park review statistics
  async getParkReviewStats(parkCode) {
    const result = await globalCacheManager.get(
      `review-stats-${parkCode}`,
      'reviewStats',
      async () => {
        const result = await enhancedApi.get(`/reviews/${parkCode}/stats`, {}, { 
          cacheType: 'reviewStats',
          ttl: 10 * 60 * 1000 // 10 minutes
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Vote on a review
  async voteOnReview(reviewId, isHelpful) {
    const result = await enhancedApi.post(`/reviews/${reviewId}/vote`, { isHelpful }, {
      invalidateCache: ['reviews']
    });
    return result.data;
  }

  // Get top rated parks
  async getTopRatedParks(limit = 10) {
    const result = await globalCacheManager.get(
      `top-rated-parks-${limit}`,
      'topRated',
      async () => {
        const result = await enhancedApi.get('/reviews/top-parks', { limit }, { 
          cacheType: 'topRated',
          ttl: 60 * 60 * 1000 // 1 hour
        });
        return result.data.data;
      }
    );
    return result.data;
  }

  // Get user's reviews
  async getUserReviews(options = {}) {
    const params = {
      page: options.page || 1,
      limit: options.limit || 10,
      ...options
    };

    const result = await enhancedApi.get('/reviews/user/my-reviews', params, { 
      cacheType: 'userReviews',
      ttl: 2 * 60 * 1000 // 2 minutes
    });
    return result.data;
  }

  // Update park review
  async updateParkReview(reviewId, reviewData) {
    const result = await enhancedApi.put(`/reviews/${reviewId}`, reviewData, {
      invalidateCache: ['reviews', 'userReviews', 'enhancedParks']
    });
    return result.data;
  }

  // Delete park review
  async deleteParkReview(reviewId) {
    const result = await enhancedApi.delete(`/reviews/${reviewId}`, {}, {
      invalidateCache: ['reviews', 'userReviews', 'enhancedParks']
    });
    return result.data;
  }

  // Batch fetch enhanced data for multiple parks
  async getBatchEnhancedData(parkCodes) {
    const promises = parkCodes.map(parkCode => 
      this.getEnhancedParkData(parkCode).catch(error => {
        console.error(`Error fetching enhanced data for ${parkCode}:`, error);
        return null;
      })
    );

    const results = await Promise.all(promises);
    return results.filter(result => result !== null);
  }

  // Prefetch park data for better UX
  async prefetchParkData(parkCode) {
    try {
      await Promise.all([
        enhancedApi.prefetch(`/parks/${parkCode}/enhanced`, {}, 'enhancedParks'),
        enhancedApi.prefetch(`/parks/${parkCode}/weather`, {}, 'weather'),
        enhancedApi.prefetch(`/parks/${parkCode}/crowd`, {}, 'crowd'),
        enhancedApi.prefetch(`/reviews/${parkCode}/stats`, {}, 'reviewStats')
      ]);
    } catch (error) {
      console.error(`Prefetch error for ${parkCode}:`, error);
    }
  }
}

export default new EnhancedParkService();
