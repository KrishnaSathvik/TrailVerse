import enhancedApi from './enhancedApi';

class BlogService {
  async getAllPosts(params = {}) {
    const result = await enhancedApi.get('/blogs', params, { 
      cacheType: 'blogPosts',
      ttl: 30 * 60 * 1000 // 30 minutes
    });
    return result.data;
  }

  async getFeaturedPosts(limit = 3) {
    const params = { limit, page: 1, featured: true };
    const result = await enhancedApi.get('/blogs', params, { 
      cacheType: 'blogPosts',
      ttl: 30 * 60 * 1000 // 30 minutes
    });
    return result.data;
  }

  async getPopularPosts(limit = 5) {
    const params = { limit, page: 1, sortBy: 'views' };
    const result = await enhancedApi.get('/blogs', params, { 
      cacheType: 'blogPosts',
      ttl: 30 * 60 * 1000 // 30 minutes
    });
    return result.data;
  }

  async getPostBySlug(slug) {
    const result = await enhancedApi.get(`/blogs/${slug}`, {}, { 
      cacheType: 'blogPosts',
      ttl: 30 * 60 * 1000 // 30 minutes
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
      ttl: 60 * 60 * 1000 // 1 hour - categories change less frequently
    });
    return result.data.data;
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
}

export default new BlogService();
