import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL;

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
    const response = await axios.get(`${API_URL}/parks/${parkCode}/reviews`);
    return response.data;
  }

  async createReview(parkCode, reviewData) {
    const response = await api.post(`/parks/${parkCode}/reviews`, reviewData);
    return response.data.data;
  }

  async updateReview(reviewId, reviewData) {
    const response = await api.put(`/reviews/${reviewId}`, reviewData);
    return response.data.data;
  }

  async deleteReview(reviewId) {
    await api.delete(`/reviews/${reviewId}`);
  }

  async markHelpful(reviewId) {
    const response = await api.put(`/reviews/${reviewId}/helpful`);
    return response.data.data;
  }

  async getAllParkRatings() {
    const response = await axios.get(`${API_URL}/reviews/ratings`);
    return response.data.data;
  }
}

export default new ReviewService();
