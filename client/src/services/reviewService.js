import axios from 'axios';
import imageUploadService from './imageUploadService';

const API_URL = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

class ReviewService {
  async getParkReviews(parkCode) {
    const response = await api.get(`/reviews/${parkCode}`);
    return response.data;
  }

  async createReview(parkCode, reviewData, images = []) {
    let uploadedImages = [];
    
    // Upload images if provided
    if (images && images.length > 0) {
      try {
        const uploadResult = await imageUploadService.uploadReviewImages(images, null);
        uploadedImages = uploadResult.data || uploadResult;
      } catch (error) {
        console.error('Error uploading review images:', error);
        throw new Error('Failed to upload images. Please try again.');
      }
    }

    // Add image URLs to review data in the format expected by ParkReview model
    const reviewWithImages = {
      ...reviewData,
      photos: uploadedImages.map(img => ({
        url: img.url,
        caption: ''
      }))
    };

    const response = await api.post(`/reviews/${parkCode}`, reviewWithImages, {
      invalidateCache: ['reviews'] // Clear reviews cache
    });
    return response.data.data;
  }

  async updateReview(reviewId, reviewData, newImages = []) {
    let uploadedImages = [];
    
    // Upload new images if provided
    if (newImages && newImages.length > 0) {
      try {
        const uploadResult = await imageUploadService.uploadReviewImages(newImages, reviewId);
        uploadedImages = uploadResult.data || uploadResult;
      } catch (error) {
        console.error('Error uploading review images:', error);
        throw new Error('Failed to upload images. Please try again.');
      }
    }

    // Merge with existing images
    const updatedReviewData = {
      ...reviewData,
      images: [
        ...(reviewData.existingImages || []),
        ...uploadedImages.map(img => img.url)
      ]
    };

    const response = await api.put(`/reviews/${reviewId}`, updatedReviewData, {
      invalidateCache: ['reviews'] // Clear reviews cache
    });
    return response.data.data;
  }

  async deleteReview(reviewId) {
    await api.delete(`/reviews/${reviewId}`, {
      invalidateCache: ['reviews'] // Clear reviews cache
    });
  }

  async markHelpful(reviewId) {
    const response = await api.post(`/reviews/${reviewId}/vote`, { 
      isHelpful: true // Backend expects isHelpful boolean
    }, {
      invalidateCache: ['reviews'] // Clear reviews cache so vote counts update
    });
    return response.data.data;
  }

  async getUserReviews() {
    const response = await api.get(`/reviews/user/my-reviews`, {
      cacheType: 'reviews', // Use reviews cache type
      skipCache: false
    });
    return response.data;
  }

  async editReview(reviewId, reviewData, newImages = []) {
    let uploadedImages = [];
    
    // Upload new images if provided
    if (newImages && newImages.length > 0) {
      try {
        const uploadResult = await imageUploadService.uploadReviewImages(newImages, reviewId);
        uploadedImages = uploadResult.data || uploadResult;
      } catch (error) {
        console.error('Error uploading review images:', error);
        throw new Error('Failed to upload images. Please try again.');
      }
    }

    // Add image URLs to review data in the format expected by ParkReview model
    const reviewWithImages = {
      ...reviewData,
      photos: uploadedImages.map(img => ({
        url: img.url,
        caption: ''
      }))
    };

    const response = await api.put(`/reviews/${reviewId}`, reviewWithImages, {
      invalidateCache: ['reviews'] // Clear reviews cache
    });
    return response.data.data;
  }

  async deleteReview(reviewId) {
    const response = await api.delete(`/reviews/${reviewId}`, {
      invalidateCache: ['reviews'] // Clear reviews cache
    });
    return response.data;
  }

  async getAllParkRatings() {
    const response = await api.get(`/reviews/ratings`);
    return response.data.data;
  }
}

export default new ReviewService();
