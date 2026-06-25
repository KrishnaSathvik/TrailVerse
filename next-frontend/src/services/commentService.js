import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBase';
import { getAuthBearerToken, notifySessionExpiredIfNeeded } from './authService';

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = getAuthBearerToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    notifySessionExpiredIfNeeded(error);
    return Promise.reject(error);
  }
);

export function getCommentRequestErrorMessage(error, fallback = 'Something went wrong') {
  const status = error.response?.status;

  if (status === 401) {
    return error.response?.data?.error || 'Your session expired. Please sign in again.';
  }

  if (status === 429) {
    return (
      error.response?.data?.message ||
      error.response?.data?.error ||
      'Too many requests. Please wait a moment and try again.'
    );
  }

  return error.response?.data?.error || error.message || fallback;
}

class CommentService {
  async getComments(blogId) {
    const response = await api.get(`/blogs/${blogId}/comments`);
    return response.data.data;
  }

  async createComment(blogId, content) {
    const response = await api.post(`/blogs/${blogId}/comments`, { content });
    return response.data.data;
  }

  async deleteComment(commentId) {
    await api.delete(`/comments/${commentId}`);
  }

  async likeComment(commentId) {
    const response = await api.put(`/comments/${commentId}/like`);
    return response.data.data;
  }
}

export default new CommentService();
