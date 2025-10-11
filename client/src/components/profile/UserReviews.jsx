import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Calendar, Edit2, Trash2, MessageSquare, Save, X, Upload, AlertCircle, Loader2 } from 'lucide-react';
import { useUserReviews } from '../../hooks/useUserReviews';
import { useToast } from '../../context/ToastContext';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import reviewService from '../../services/reviewService';
import imageUploadService from '../../services/imageUploadService';

const UserReviews = () => {
  const { data, isLoading, error, refetch } = useUserReviews();
  const { showToast } = useToast();
  
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [deletingReview, setDeletingReview] = useState(null);
  const [editingData, setEditingData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [imageErrors, setImageErrors] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  const maxImages = 5;
  const maxFileSize = 10 * 1024 * 1024; // 10MB

  const handleEditReview = (review) => {
    setEditingReviewId(review._id);
    setEditingData({
      rating: review.rating,
      title: review.title,
      comment: review.comment || review.content || '',
      visitYear: review.visitYear || new Date().getFullYear()
    });
    setSelectedImages([]);
    setImagePreviews([]);
    setImageErrors([]);
  };

  const handleCancelEdit = () => {
    setEditingReviewId(null);
    setEditingData({});
    setSelectedImages([]);
    setImagePreviews([]);
    setImageErrors([]);
  };

  const handleInputChange = (field, value) => {
    setEditingData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleImageSelect = async (files, reviewId) => {
    const fileInput = files.target.files;
    const fileArray = Array.from(fileInput);
    const validFiles = [];
    const errors = [];

    // Validate files
    fileArray.forEach((file, index) => {
      if (!file.type.startsWith('image/')) {
        errors.push(`File ${index + 1}: Only image files are allowed`);
        return;
      }

      if (file.size > maxFileSize) {
        errors.push(`File ${index + 1}: File size must be less than 10MB`);
        return;
      }

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
  };

  const removeImage = (index) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async (reviewId) => {
    if (!editingData.title?.trim() || !editingData.comment?.trim()) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      setUploadingImages(true);
      
      await reviewService.editReview(reviewId, editingData, selectedImages);
      
      showToast('Review updated successfully!', 'success');
      refetch(); // Refresh the reviews list
      handleCancelEdit();
    } catch (error) {
      console.error('Error updating review:', error);
      showToast(
        error.message || 'Failed to update review',
        'error'
      );
    } finally {
      setIsSubmitting(false);
      setUploadingImages(false);
    }
  };

  const handleDeleteReview = (review) => {
    setDeletingReview(review);
  };

  const handleDeleteSuccess = () => {
    refetch(); // Refresh the reviews list
    setDeletingReview(null);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="h-4 bg-gray-300 rounded mb-3 w-3/4"></div>
              <div className="h-3 bg-gray-300 rounded mb-2 w-1/2"></div>
              <div className="h-3 bg-gray-300 rounded mb-4 w-full"></div>
              <div className="h-3 bg-gray-300 rounded w-2/3"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <MessageSquare className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Error loading reviews
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Unable to load your reviews. Please try again later.
        </p>
      </div>
    );
  }

  const reviews = data?.data || [];

  if (reviews.length === 0) {
    return (
      <div className="text-center py-12">
        <MessageSquare className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          No reviews yet
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          You haven&apos;t written any reviews yet. Visit a park and share your experience!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          My Reviews ({reviews.length})
        </h2>
      </div>

      {reviews.map((review) => (
        <div
          key={review._id}
          className="rounded-2xl p-6 backdrop-blur"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          {editingReviewId === review._id ? (
            // Edit Mode
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/parks/${review.parkCode}`}
                    className="text-lg font-semibold hover:text-forest-400 transition"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {review.parkName || `Park ${review.parkCode}`}
                  </Link>
                  <span className="text-sm px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Editing
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSaveEdit(review._id)}
                    disabled={isSubmitting || uploadingImages}
                    className="p-2 rounded-lg hover:bg-green-500/20 transition disabled:opacity-50"
                    style={{ color: 'var(--forest-500)' }}
                    title="Save changes"
                  >
                    <Save className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={isSubmitting || uploadingImages}
                    className="p-2 rounded-lg hover:bg-gray-500/20 transition disabled:opacity-50"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Cancel editing"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Rating */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Rating
                </label>
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleInputChange('rating', i + 1)}
                      className="p-1"
                    >
                      <Star
                        className={`h-6 w-6 ${
                          i < editingData.rating
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-400'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Title
                </label>
                <input
                  type="text"
                  value={editingData.title || ''}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                  placeholder="Give your review a title (5-100 characters)"
                  minLength="5"
                  maxLength="100"
                />
              </div>

              {/* Comment */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Review
                </label>
                <textarea
                  value={editingData.comment || ''}
                  onChange={(e) => handleInputChange('comment', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                  rows="4"
                  placeholder="Share your experience... (minimum 10 characters)"
                  minLength="10"
                  maxLength="2000"
                />
              </div>

              {/* Visit Year */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Visit Year
                </label>
                <select
                  value={editingData.visitYear || new Date().getFullYear()}
                  onChange={(e) => handleInputChange('visitYear', parseInt(e.target.value))}
                  className="w-full px-4 py-2 rounded-lg"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                >
                  {Array.from({ length: 10 }, (_, i) => {
                    const year = new Date().getFullYear() - i;
                    return (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Add Photos ({selectedImages.length}/{maxImages})
                </label>
                
                <div 
                  className="border-2 border-dashed rounded-lg p-4 text-center hover:border-gray-400 transition-colors cursor-pointer"
                  style={{ borderColor: 'var(--border)' }}
                  onClick={() => document.getElementById(`image-input-${review._id}`)?.click()}
                >
                  <input
                    id={`image-input-${review._id}`}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => handleImageSelect(e, review._id)}
                    className="hidden"
                  />
                  <Upload className="h-6 w-6 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {selectedImages.length >= maxImages 
                      ? 'Maximum images reached' 
                      : 'Click to upload photos'
                    }
                  </p>
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
                          className="w-full h-24 object-cover rounded-lg border"
                          style={{ borderColor: 'var(--border)' }}
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

              {/* Submit Status */}
              {(isSubmitting || uploadingImages) && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{uploadingImages ? 'Uploading images...' : 'Saving changes...'}</span>
                </div>
              )}
            </div>
          ) : (
            // View Mode
            <>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Link
                      to={`/parks/${review.parkCode}`}
                      className="text-lg font-semibold hover:text-forest-400 transition"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {review.parkName || `Park ${review.parkCode}`}
                    </Link>
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`h-4 w-4 ${
                            i < review.rating
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-400'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>Visited {review.visitYear || 'Unknown Year'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>Posted {formatDate(review.createdAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEditReview(review)}
                    className="p-2 rounded-lg hover:bg-white/5 transition"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Edit review"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteReview(review)}
                    className="p-2 rounded-lg hover:bg-red-500/20 transition"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Delete review"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                {review.title}
              </h3>
              
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {review.comment || review.content}
              </p>

              {review.helpful && review.helpful.length > 0 && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    <span className="font-medium">{review.helpful.length} people found this helpful</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        review={deletingReview}
        isOpen={!!deletingReview}
        onClose={() => setDeletingReview(null)}
        onSuccess={handleDeleteSuccess}
      />
    </div>
  );
};

export default UserReviews;
