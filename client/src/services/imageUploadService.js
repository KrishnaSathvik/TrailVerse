import enhancedApi from './enhancedApi';

class ImageUploadService {
  // Upload images
  async uploadImages(files, options = {}) {
    const formData = new FormData();
    
    // Add files to FormData
    Array.from(files).forEach(file => {
      formData.append('images', file);
    });
    
    // Add options
    if (options.category) formData.append('category', options.category);
    if (options.relatedId) formData.append('relatedId', options.relatedId);
    if (options.relatedType) formData.append('relatedType', options.relatedType);
    if (options.tags) formData.append('tags', options.tags);
    if (options.isPublic !== undefined) formData.append('isPublic', options.isPublic);

    const response = await enhancedApi.post('/images/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      invalidateCache: ['userImages']
    });

    return response.data;
  }

  // Get user's images
  async getUserImages(params = {}) {
    const result = await enhancedApi.get('/images', params, { 
      cacheType: 'userImages',
      ttl: 5 * 60 * 1000 // 5 minutes
    });
    return result.data;
  }

  // Get single image
  async getImage(imageId) {
    const result = await enhancedApi.get(`/images/${imageId}`, {}, { 
      cacheType: 'userImages',
      ttl: 10 * 60 * 1000 // 10 minutes
    });
    return result.data.data;
  }

  // Update image
  async updateImage(imageId, updateData) {
    const response = await enhancedApi.put(`/images/${imageId}`, updateData, {
      invalidateCache: ['userImages']
    });
    return response.data.data;
  }

  // Delete image
  async deleteImage(imageId) {
    await enhancedApi.delete(`/images/${imageId}`, {
      invalidateCache: ['userImages']
    });
  }

  // Get image statistics
  async getImageStats() {
    const result = await enhancedApi.get('/images/stats', {}, { 
      cacheType: 'userImages',
      ttl: 15 * 60 * 1000 // 15 minutes
    });
    return result.data.data;
  }

  // Get image URL
  getImageUrl(filename) {
    const baseUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5001/api');
    return `${baseUrl}/images/file/${filename}`;
  }

  // Extract relative path from full URL (e.g., extract "profile/image.jpg" from "http://localhost:5001/uploads/profile/image.jpg")
  extractRelativePath(url) {
    if (!url) return null;
    
    // If it's already a relative path without domain, return as is
    if (!url.startsWith('http')) return url;
    
    // Extract the path after /uploads/
    const uploadsIndex = url.indexOf('/uploads/');
    if (uploadsIndex !== -1) {
      return url.substring(uploadsIndex + '/uploads/'.length);
    }
    
    // If no /uploads/ found, try to extract just the filename
    return url.split('/').pop();
  }

  // Get thumbnail URL
  getThumbnailUrl(filenameOrUrl) {
    const baseUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5001/api');
    
    // Extract relative path if it's a full URL
    const relativePath = this.extractRelativePath(filenameOrUrl) || filenameOrUrl;
    
    // Replace extension with _thumb + extension
    const thumbnailPath = relativePath.replace(/(\.[^.]+)$/, '_thumb$1');
    return `${baseUrl}/images/file/${thumbnailPath}`;
  }

  // Helper method to validate image file
  validateImageFile(file) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG files are allowed.');
    }
    
    if (file.size > maxSize) {
      throw new Error('File size too large. Maximum size is 10MB.');
    }
    
    return true;
  }

  // Helper method to upload single image
  async uploadSingleImage(file, options = {}) {
    this.validateImageFile(file);
    const result = await this.uploadImages([file], options);
    return result.data[0];
  }

  // Helper method to upload profile picture
  async uploadProfilePicture(file) {
    return await this.uploadSingleImage(file, {
      category: 'profile',
      isPublic: false
    });
  }

  // Helper method to upload blog images
  async uploadBlogImages(files, blogId) {
    return await this.uploadImages(files, {
      category: 'blog',
      relatedId: blogId,
      relatedType: 'blog',
      isPublic: true
    });
  }

  // Helper method to upload review images
  async uploadReviewImages(files, reviewId) {
    return await this.uploadImages(files, {
      category: 'review',
      relatedId: reviewId,
      relatedType: 'review',
      isPublic: true
    });
  }

  // Clear image cache
  clearImageCache() {
    enhancedApi.clearCacheByType('userImages');
  }

  // Helper method to create image preview
  createImagePreview(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Helper method to resize image before upload
  async resizeImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        try {
          // Calculate new dimensions
          let { width, height } = img;
          
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width *= ratio;
            height *= ratio;
          }
          
          // Set canvas dimensions
          canvas.width = width;
          canvas.height = height;
          
          // Draw and compress
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) {
              // Clean up object URL
              URL.revokeObjectURL(img.src);
              resolve(blob);
            } else {
              reject(new Error('Failed to create image blob'));
            }
          }, file.type, quality);
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Failed to load image'));
      };
      
      img.src = URL.createObjectURL(file);
    });
  }
}

export default new ImageUploadService();
