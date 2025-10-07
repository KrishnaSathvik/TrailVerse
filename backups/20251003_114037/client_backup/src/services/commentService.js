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

class CommentService {
  async getComments(blogId) {
    const response = await axios.get(`${API_URL}/blogs/${blogId}/comments`);
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
