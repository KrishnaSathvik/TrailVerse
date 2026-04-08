import enhancedApi from './enhancedApi';

class BlogService {
  async getAllPosts(params = {}) {
    const result = await enhancedApi.get('/blogs', params, { 
      cacheType: 'blogPosts',
      ttl: 5 * 60 * 1000 // 5 minutes - reduced for faster updates
    });
    return result.data;
  }

  async getFeaturedPosts(limit = 3) {
    const params = { limit, page: 1, featured: true };
    const result = await enhancedApi.get('/blogs', params, { 
      cacheType: 'blogPosts',
      ttl: 5 * 60 * 1000 // 5 minutes - reduced for faster updates
    });
    return result.data;
  }

  async getPopularPosts(limit = 5) {
    const params = { limit, page: 1, sortBy: 'views' };
    const result = await enhancedApi.get('/blogs', params, { 
      cacheType: 'blogPosts',
      ttl: 5 * 60 * 1000 // 5 minutes - reduced for faster updates
    });
    return result.data;
  }

  async getPostBySlug(slug) {
    const result = await enhancedApi.get(`/blogs/${slug}`, {}, { 
      cacheType: 'blogPosts',
      ttl: 24 * 60 * 60 * 1000 // 24 hours (1 day)
    });
    return result.data.data;
  }

  async getPostById(id) {
    const result = await enhancedApi.get(`/blogs/id/${id}`, {}, { 
      cacheType: 'blogPosts',
      ttl: 5 * 60 * 1000 // 5 minutes - shorter cache for admin editing
    });
    return result.data.data;
  }

  async createPost(postData) {
    const response = await enhancedApi.post('/blogs', postData, {
      invalidateCache: ['blogPosts']
    });
    return response.data.data;
  }

  async updatePost(id, postData) {
    const response = await enhancedApi.put(`/blogs/${id}`, postData, {
      invalidateCache: ['blogPosts']
    });
    return response.data.data;
  }

  async deletePost(id) {
    await enhancedApi.delete(`/blogs/${id}`, {
      invalidateCache: ['blogPosts']
    });
  }

  async getBlogCategories() {
    const result = await enhancedApi.get('/blogs/categories', {}, { 
      cacheType: 'blogPosts',
      ttl: 60 * 60 * 1000 // 1 hour - categories change infrequently
    });
    return result.data;
  }

  async getBlogTags() {
    const result = await enhancedApi.get('/blogs/tags', {}, { 
      cacheType: 'blogPosts',
      ttl: 60 * 60 * 1000 // 1 hour - tags change less frequently
    });
    return result.data.data;
  }

  // Prefetch blog data for better UX
  async prefetchBlogData() {
    try {
      await Promise.all([
        enhancedApi.prefetch('/blogs', { limit: 10, page: 1 }, 'blogPosts'),
        enhancedApi.prefetch('/blogs/categories', {}, 'blogPosts'),
        enhancedApi.prefetch('/blogs/tags', {}, 'blogPosts')
      ]);
    } catch (error) {
      // Silent fail - prefetch is optional
    }
  }

  // Clear blog cache
  clearBlogCache() {
    enhancedApi.clearCacheByType('blogPosts');
  }

  async getParkGuides(parkCode, parkName = '') {
    const nameLower = parkName.replace(/\s+national\s+park$/i, '').toLowerCase().replace(/[^a-z]/g, '');
    const nameWords = parkName.replace(/\s+national\s+park$/i, '').toLowerCase().trim();
    const tags = [parkCode.toLowerCase(), nameLower, nameLower + 'nationalpark'].filter(Boolean);
    const uniqueTags = [...new Set(tags)];

    const cacheOpts = { cacheType: 'blogPosts', ttl: 60 * 60 * 1000 };

    // Check if a post is specifically about this park (not a generic multi-park article)
    const isParkSpecific = (post) => {
      if (!post) return false;
      const title = (post.title || '').toLowerCase();
      const excerpt = (post.excerpt || '').toLowerCase();
      const parkLower = nameWords.toLowerCase();
      // Post title or excerpt should contain the park name to be considered park-specific
      return title.includes(parkLower) || excerpt.includes(parkLower);
    };

    // Fast path: search by park name (single API call, no category filter)
    const findBySearch = async () => {
      if (!nameWords) return null;
      try {
        const result = await enhancedApi.get('/blogs', { search: nameWords, limit: 5, page: 1 }, cacheOpts);
        const posts = result.data?.data || [];
        // Only return posts that are specifically about this park
        return posts.filter(isParkSpecific);
      } catch { return []; }
    };

    // Slow path: try each tag with specific category (only used as fallback)
    const findByTag = async (categories) => {
      for (const tag of uniqueTags) {
        try {
          const result = await enhancedApi.get('/blogs', { tag, limit: 1, page: 1 }, cacheOpts);
          const post = result.data?.data?.[0];
          // Only accept posts in the expected categories — no fallback to any category
          if (post && categories.includes(post.category)) return post;
        } catch { /* continue */ }
      }
      return null;
    };

    try {
      // Step 1: Fast search by park name (1 API call, filtered to park-specific posts)
      const searchResults = await findBySearch();

      let guide = null;
      let astro = null;

      if (searchResults && searchResults.length > 0) {
        astro = searchResults.find(p => p.category === 'Astrophotography') || null;
        guide = searchResults.find(p => p.category !== 'Astrophotography') || null;
      }

      // Step 2: If search didn't find results, try tag matching (strict category match only)
      if (!guide) {
        guide = await findByTag(['Park Guides', 'Travel Tips', 'Hiking', 'Camping', 'Travel Blogs', 'Seasonal Guides', 'National Parks']);
      }
      if (!astro) {
        astro = await findByTag(['Astrophotography']);
      }

      return { guide, astro };
    } catch {
      return { guide: null, astro: null };
    }
  }

  async toggleLike(postId) {
    const response = await enhancedApi.post(`/blogs/${postId}/like`, {}, {
      invalidateCache: ['blogPosts']
    });
    return response.data.data;
  }

  async toggleFavorite(postId) {
    const response = await enhancedApi.post(`/blogs/${postId}/favorite`, {}, {
      invalidateCache: ['blogPosts']
    });
    return response.data.data;
  }

  async getFavoritedPosts(params = {}) {
    const result = await enhancedApi.get('/blogs/favorites', params, { 
      cacheType: 'blogPosts',
      ttl: 5 * 60 * 1000 // 5 minutes
    });
    return result.data;
  }

  async getRelatedPosts(currentPostId, category, tags = [], limit = 3) {
    try {
      // First try to fetch posts with the same category and tags
      const params = {
        limit: limit + 1, // Get one extra to exclude current post
        page: 1,
        category: category
      };

      const result = await enhancedApi.get('/blogs', params, { 
        cacheType: 'blogPosts',
        ttl: 24 * 60 * 60 * 1000 // 24 hours (1 day)
      });

      // Filter out current post and limit to desired count
      let relatedPosts = (result.data.data || [])
        .filter(post => post._id !== currentPostId)
        .slice(0, limit);

      // If we don't have enough posts, fetch more without category filter
      if (relatedPosts.length < limit) {
        const additionalParams = {
          limit: limit * 2,
          page: 1
        };

        const additionalResult = await enhancedApi.get('/blogs', additionalParams, { 
          cacheType: 'blogPosts',
          ttl: 30 * 60 * 1000
        });

        const additionalPosts = (additionalResult.data.data || [])
          .filter(post => 
            post._id !== currentPostId && 
            !relatedPosts.find(rp => rp._id === post._id)
          )
          .slice(0, limit - relatedPosts.length);

        relatedPosts = [...relatedPosts, ...additionalPosts];
      }

      return relatedPosts;
    } catch (error) {
      console.error('Error fetching related posts:', error);
      return [];
    }
  }

  async getScheduledPosts() {
    const result = await enhancedApi.get('/blogs/scheduled', {}, { 
      cacheType: 'blogPosts',
      ttl: 5 * 60 * 1000 // 5 minutes - scheduled posts change frequently
    });
    return result.data;
  }

  async getAllPostsIncludingScheduled() {
    const result = await enhancedApi.get('/blogs', { status: 'scheduled', limit: 100 }, { 
      cacheType: 'blogPosts',
      ttl: 5 * 60 * 1000 // 5 minutes
    });
    return result.data;
  }
}

export default new BlogService();
