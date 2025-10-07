import api from './api';

const testimonialService = {
  // Get testimonials
  getTestimonials: async (params = {}) => {
    const response = await api.get('/testimonials', { params });
    return response.data;
  },

  // Create testimonial
  createTestimonial: async (testimonialData) => {
    const response = await api.post('/testimonials', testimonialData);
    return response.data;
  },

  // Update testimonial
  updateTestimonial: async (testimonialId, testimonialData) => {
    const response = await api.put(`/testimonials/${testimonialId}`, testimonialData);
    return response.data;
  },

  // Delete testimonial
  deleteTestimonial: async (testimonialId) => {
    const response = await api.delete(`/testimonials/${testimonialId}`);
    return response.data;
  },

  // Approve testimonial (admin)
  approveTestimonial: async (testimonialId) => {
    const response = await api.put(`/testimonials/${testimonialId}/approve`);
    return response.data;
  },

  // Feature testimonial (admin)
  featureTestimonial: async (testimonialId, featured = true) => {
    const response = await api.put(`/testimonials/${testimonialId}/feature`, { featured });
    return response.data;
  }
};

export default testimonialService;
