import enhancedApi from './enhancedApi';

class TestimonialService {
  /**
   * Get testimonials with optional filters
   * @param {Object} params - Query parameters
   * @param {boolean} params.approved - Filter by approval status
   * @param {boolean} params.featured - Filter by featured status
   * @param {string} params.parkCode - Filter by park code
   * @param {number} params.limit - Number of testimonials to return
   * @param {number} params.page - Page number for pagination
   */
  async getTestimonials(params = {}) {
    const result = await enhancedApi.get('/testimonials', params, {
      cacheType: 'testimonials',
      ttl: 5 * 60 * 1000 // 5 minutes
    });
    return result.data;
  }

  /**
   * Get all testimonials for admin (including unapproved)
   * @param {Object} params - Query parameters
   */
  async getAllTestimonials(params = {}) {
    const result = await enhancedApi.get('/testimonials', params, {
      cacheType: 'adminTestimonials',
      ttl: 2 * 60 * 1000 // 2 minutes - shorter cache for admin
    });
    return result.data;
  }

  /**
   * Get testimonials by approval status
   * @param {boolean} approved - Approval status
   * @param {Object} additionalParams - Additional query parameters
   */
  async getTestimonialsByStatus(approved, additionalParams = {}) {
    const params = { approved, ...additionalParams };
    return this.getTestimonials(params);
  }

  /**
   * Get pending testimonials (unapproved)
   * @param {Object} params - Additional query parameters
   */
  async getPendingTestimonials(params = {}) {
    return this.getTestimonialsByStatus(false, params);
  }

  /**
   * Get approved testimonials
   * @param {Object} params - Additional query parameters
   */
  async getApprovedTestimonials(params = {}) {
    return this.getTestimonialsByStatus(true, params);
  }

  /**
   * Get featured testimonials
   * @param {Object} params - Additional query parameters
   */
  async getFeaturedTestimonials(params = {}) {
    return this.getTestimonials({ featured: true, ...params });
  }

  /**
   * Create a new testimonial
   * @param {Object} testimonialData - Testimonial data
   */
  async createTestimonial(testimonialData) {
    const response = await enhancedApi.post('/testimonials', testimonialData, {
      invalidateCache: ['testimonials', 'adminTestimonials']
    });
    return response.data;
  }

  /**
   * Update a testimonial
   * @param {string} id - Testimonial ID
   * @param {Object} updateData - Data to update
   */
  async updateTestimonial(id, updateData) {
    const response = await enhancedApi.put(`/testimonials/${id}`, updateData, {
      invalidateCache: ['testimonials', 'adminTestimonials']
    });
    return response.data;
  }

  /**
   * Delete a testimonial
   * @param {string} id - Testimonial ID
   */
  async deleteTestimonial(id) {
    await enhancedApi.delete(`/testimonials/${id}`, {
      invalidateCache: ['testimonials', 'adminTestimonials']
    });
  }

  /**
   * Approve a testimonial (Admin only)
   * @param {string} id - Testimonial ID
   */
  async approveTestimonial(id) {
    const response = await enhancedApi.put(`/testimonials/${id}/approve`, {}, {
      invalidateCache: ['testimonials', 'adminTestimonials']
    });
    return response.data;
  }

  /**
   * Feature/unfeature a testimonial (Admin only)
   * @param {string} id - Testimonial ID
   * @param {boolean} featured - Whether to feature or unfeature
   */
  async featureTestimonial(id, featured) {
    const response = await enhancedApi.put(`/testimonials/${id}/feature`, { featured }, {
      invalidateCache: ['testimonials', 'adminTestimonials']
    });
    return response.data;
  }

  /**
   * Get testimonials statistics for admin dashboard
   */
  async getTestimonialsStats() {
    try {
      const [pending, approved, featured] = await Promise.all([
        this.getPendingTestimonials({ limit: 1 }),
        this.getApprovedTestimonials({ limit: 1 }),
        this.getFeaturedTestimonials({ limit: 1 })
      ]);

      return {
        total: (pending.count || 0) + (approved.count || 0),
        pending: pending.count || 0,
        approved: approved.count || 0,
        featured: featured.count || 0
      };
    } catch (error) {
      console.error('Error fetching testimonials stats:', error);
      return {
        total: 0,
        pending: 0,
        approved: 0,
        featured: 0
      };
    }
  }

  /**
   * Search testimonials
   * @param {string} query - Search query
   * @param {Object} filters - Additional filters
   */
  async searchTestimonials(query, filters = {}) {
    const params = {
      search: query,
      ...filters
    };
    return this.getTestimonials(params);
  }

  /**
   * Get testimonials by park
   * @param {string} parkCode - Park code
   * @param {Object} params - Additional parameters
   */
  async getTestimonialsByPark(parkCode, params = {}) {
    return this.getTestimonials({ parkCode, ...params });
  }

  /**
   * Get recent testimonials
   * @param {number} limit - Number of recent testimonials
   */
  async getRecentTestimonials(limit = 10) {
    return this.getApprovedTestimonials({ 
      limit, 
      sort: 'newest' 
    });
  }
}

export default new TestimonialService();