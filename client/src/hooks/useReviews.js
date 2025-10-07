import { useState, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import { useAnalytics } from './useAnalytics';
import reviewService from '../services/reviewService';
import imageUploadService from '../services/imageUploadService';

export const useReviews = () => {
  const { showToast } = useToast();
  const { trackUserAction, trackReviewCreate } = useAnalytics();
  const [isLoading, setIsLoading] = useState(false);

  // Create review with images
  const createReview = useCallback(async (parkCode, reviewData, images = []) => {
    setIsLoading(true);
    try {
      const result = await reviewService.createReview(parkCode, reviewData, images);
      
      // Track analytics
      trackReviewCreate(parkCode, result._id);
      trackUserAction('review_create', {
        parkCode,
        hasImages: images.length > 0,
        imageCount: images.length,
        rating: reviewData.rating
      });

      showToast('Review submitted successfully!', 'success');
      return result;
    } catch (error) {
      console.error('Error creating review:', error);
      showToast(
        error.message || 'Failed to submit review. Please try again.',
        'error'
      );
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [showToast, trackUserAction, trackReviewCreate]);

  // Update review with new images
  const updateReview = useCallback(async (reviewId, reviewData, newImages = []) => {
    setIsLoading(true);
    try {
      const result = await reviewService.updateReview(reviewId, reviewData, newImages);
      
      // Track analytics
      trackUserAction('review_update', {
        reviewId,
        hasNewImages: newImages.length > 0,
        newImageCount: newImages.length,
        rating: reviewData.rating
      });

      showToast('Review updated successfully!', 'success');
      return result;
    } catch (error) {
      console.error('Error updating review:', error);
      showToast(
        error.message || 'Failed to update review. Please try again.',
        'error'
      );
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [showToast, trackUserAction]);

  // Delete review
  const deleteReview = useCallback(async (reviewId) => {
    setIsLoading(true);
    try {
      await reviewService.deleteReview(reviewId);
      
      // Track analytics
      trackUserAction('review_delete', { reviewId });

      showToast('Review deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting review:', error);
      showToast(
        error.message || 'Failed to delete review. Please try again.',
        'error'
      );
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [showToast, trackUserAction]);

  // Mark review as helpful
  const markHelpful = useCallback(async (reviewId) => {
    try {
      const result = await reviewService.markHelpful(reviewId);
      
      // Track analytics
      trackUserAction('review_helpful', { reviewId });

      showToast('Thanks for your feedback!', 'success');
      return result;
    } catch (error) {
      console.error('Error marking review helpful:', error);
      showToast(
        error.message || 'Failed to mark review as helpful.',
        'error'
      );
      throw error;
    }
  }, [showToast, trackUserAction]);

  // Upload review images separately (for preview/validation)
  const uploadReviewImages = useCallback(async (images, reviewId = null) => {
    try {
      const result = await imageUploadService.uploadReviewImages(images, reviewId);
      
      // Track analytics
      trackUserAction('review_image_upload', {
        imageCount: images.length,
        reviewId
      });

      return result;
    } catch (error) {
      console.error('Error uploading review images:', error);
      throw error;
    }
  }, [trackUserAction]);

  // Validate image files
  const validateImages = useCallback((files, maxImages = 5, maxSize = 10 * 1024 * 1024) => {
    const errors = [];
    const validFiles = [];

    Array.from(files).forEach((file, index) => {
      // Check file type
      if (!file.type.startsWith('image/')) {
        errors.push(`File ${index + 1}: Only image files are allowed`);
        return;
      }

      // Check file size
      if (file.size > maxSize) {
        errors.push(`File ${index + 1}: File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`);
        return;
      }

      // Check total image count
      if (validFiles.length >= maxImages) {
        errors.push(`Maximum ${maxImages} images allowed`);
        return;
      }

      validFiles.push(file);
    });

    return { validFiles, errors };
  }, []);

  // Get image previews
  const getImagePreviews = useCallback(async (files) => {
    const previews = [];
    
    for (const file of files) {
      try {
        const preview = await imageUploadService.createImagePreview(file);
        previews.push({
          file,
          preview,
          id: Date.now() + Math.random()
        });
      } catch (error) {
        console.error('Error creating preview:', error);
      }
    }

    return previews;
  }, []);

  // Resize images before upload
  const resizeImages = useCallback(async (files, maxWidth = 1920, maxHeight = 1080, quality = 0.8) => {
    const resizedFiles = [];
    
    for (const file of files) {
      try {
        const resizedFile = await imageUploadService.resizeImage(file, maxWidth, maxHeight, quality);
        resizedFiles.push(resizedFile);
      } catch (error) {
        console.error('Error resizing image:', error);
        // Fallback to original file
        resizedFiles.push(file);
      }
    }

    return resizedFiles;
  }, []);

  return {
    isLoading,
    createReview,
    updateReview,
    deleteReview,
    markHelpful,
    uploadReviewImages,
    validateImages,
    getImagePreviews,
    resizeImages
  };
};

export default useReviews;
