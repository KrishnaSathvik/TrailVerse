import React, { useState, useRef } from 'react';
import { 
  Star, Camera, X, Upload, AlertCircle, 
  Loader2, Image as ImageIcon, Trash2 
} from '@components/icons';
import { useToast } from '../../context/ToastContext';
import { useAnalytics } from '../../hooks/useAnalytics';
import reviewService from '../../services/reviewService';
import imageUploadService from '../../services/imageUploadService';

const ReviewFormWithImages = ({ 
  parkCode, 
  parkName, 
  onReviewCreated, 
  onCancel,
  existingReview = null 
}) => {
  const { showToast } = useToast();
  const { trackUserAction, trackImageUpload } = useAnalytics();
  
  const fileInputRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rating, setRating] = useState(existingReview?.rating || 0);
  const [title, setTitle] = useState(existingReview?.title || '');
  const [content, setContent] = useState(existingReview?.content || '');
  const [visitDate, setVisitDate] = useState(
    existingReview?.visitDate ? new Date(existingReview.visitDate).toISOString().split('T')[0] : ''
  );
  
  // Image states
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageErrors, setImageErrors] = useState([]);

  const maxImages = 5;
  const maxFileSize = 10 * 1024 * 1024; // 10MB

  // Handle file selection
  const handleImageSelect = async (files) => {
    const fileArray = Array.from(files);
    const validFiles = [];
    const errors = [];

    // Validate files
    fileArray.forEach((file, index) => {
      // Check file type
      if (!file.type.startsWith('image/')) {
        errors.push(`File ${index + 1}: Only image files are allowed`);
        return;
      }

      // Check file size
      if (file.size > maxFileSize) {
        errors.push(`File ${index + 1}: File size must be less than 10MB`);
        return;
      }

      // Check total image count
      if (selectedImages.length + validFiles.length >= maxImages) {
        errors.push(`Maximum ${maxImages} images allowed`);
        return;
      }

      validFiles.push(file);
    });

    if (errors.length > 0) {
      setImageErrors(errors);
      showToast('Some images could not be added', 'error');
      return;
    }

    setImageErrors([]);

    // Create previews
    const newPreviews = [];
    for (const file of validFiles) {
      try {
        const preview = await imageUploadService.createImagePreview(file);
        newPreviews.push({
          file,
          preview,
          id: Date.now() + Math.random()
        });
      } catch (error) {
        console.error('Error creating preview:', error);
      }
    }

    setSelectedImages(prev => [...prev, ...validFiles]);
    setImagePreviews(prev => [...prev, ...newPreviews]);

    // Track image selection
    trackUserAction('review_image_select', {
      parkCode,
      imageCount: validFiles.length
    });
  };

  // Remove image
  const removeImage = (index) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
    
    trackUserAction('review_image_remove', {
      parkCode,
      remainingImages: selectedImages.length - 1
    });
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!rating || !title || !content) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const reviewData = {
        title,
        content,
        rating,
        visitDate: visitDate || new Date().toISOString().split('T')[0]
      };

      let result;
      if (existingReview) {
        // Update existing review
        result = await reviewService.updateReview(
          existingReview._id,
          {
            ...reviewData,
            existingImages: existingReview.images || []
          },
          selectedImages
        );
      } else {
        // Create new review
        result = await reviewService.createReview(parkCode, reviewData, selectedImages);
      }

      // Track successful submission
      trackUserAction('review_submit', {
        parkCode,
        hasImages: selectedImages.length > 0,
        imageCount: selectedImages.length,
        rating,
        isUpdate: !!existingReview
      });

      if (selectedImages.length > 0) {
        trackImageUpload(selectedImages.length, 'review');
      }

      showToast(
        existingReview ? 'Review updated successfully!' : 'Review submitted successfully!',
        'success'
      );

      onReviewCreated(result);
    } catch (error) {
      console.error('Error submitting review:', error);
      showToast(
        error.message || 'Failed to submit review. Please try again.',
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-gray-900">
          {existingReview ? 'Edit Review' : 'Write a Review'}
        </h3>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        )}
      </div>

      {parkName && (
        <div className="mb-4">
          <p className="text-sm text-gray-600">Reviewing: <span className="font-medium">{parkName}</span></p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Rating */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rating <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center space-x-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="focus:outline-none transition-colors"
              >
                <Star
                  className={`h-8 w-8 ${
                    star <= rating
                      ? 'text-yellow-400 fill-current'
                      : 'text-gray-300 hover:text-yellow-300'
                  }`}
                />
              </button>
            ))}
            <span className="ml-2 text-sm text-gray-600">
              {rating > 0 && `${rating} star${rating !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Review Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Summarize your experience"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            maxLength={100}
            required
          />
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Review <span className="text-red-500">*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Tell others about your experience..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            maxLength={1000}
            required
          />
          <p className="text-xs text-gray-500 mt-1">{content.length}/1000 characters</p>
        </div>

        {/* Visit Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Visit Date
          </label>
          <input
            type="date"
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Photos ({selectedImages.length}/{maxImages})
          </label>
          
          {/* Upload Button */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleImageSelect(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={selectedImages.length >= maxImages || isSubmitting}
              className="flex flex-col items-center space-y-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Camera className="h-8 w-8" />
              <span className="text-sm">
                {selectedImages.length >= maxImages 
                  ? 'Maximum images reached' 
                  : 'Click to upload photos or drag and drop'
                }
              </span>
              <span className="text-xs text-gray-500">
                PNG, JPG, GIF up to 10MB each
              </span>
            </button>
          </div>

          {/* Image Errors */}
          {imageErrors.length > 0 && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700">
                  {imageErrors.map((error, index) => (
                    <p key={index}>{error}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Image Previews */}
          {imagePreviews.length > 0 && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
              {imagePreviews.map((preview, index) => (
                <div key={preview.id} className="relative group">
                  <img
                    src={preview.preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-24 object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !rating || !title || !content}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{existingReview ? 'Updating...' : 'Submitting...'}</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                <span>{existingReview ? 'Update Review' : 'Submit Review'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ReviewFormWithImages;
