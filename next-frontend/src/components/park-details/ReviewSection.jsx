import React, { useState, useEffect, useRef } from 'react';
import {
  Star, ThumbsUp, MoreVertical, Plus, MessageSquare,
  Camera, X, Upload, AlertCircle, Edit, Trash2
} from '@components/icons';
import Spinner from '../common/Spinner';
import { useQueryClient } from '@tanstack/react-query';
import PhotoLightbox from '../common/PhotoLightbox';
import ParkTabSpinner from './ParkTabSpinner';
import reviewService from '../../services/reviewService';
import imageUploadService from '../../services/imageUploadService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { getBestAvatar } from '../../utils/avatarGenerator';
import { logEvent, logReviewCreate } from '../../utils/analytics';
import ParkTabEmptyState from './ParkTabEmptyState';

const TAB_CARD_STYLE = {
  backgroundColor: 'var(--surface-hover)',
  borderWidth: '1px',
  borderColor: 'var(--border)',
};

const FORM_CARD_STYLE = {
  ...TAB_CARD_STYLE,
  borderLeftWidth: '4px',
  borderLeftColor: 'var(--accent-green)',
};

const INPUT_STYLE = {
  backgroundColor: 'var(--surface)',
  borderWidth: '1px',
  borderColor: 'var(--border)',
  color: 'var(--text-primary)',
};

const INPUT_CLASS =
  'w-full px-4 py-3 rounded-xl outline-none transition focus:ring-2 focus:ring-emerald-500/25';

function ReviewStarPicker({
  value,
  hoverValue = 0,
  onChange,
  onHover,
  onLeave,
  starClass = 'h-7 w-7',
}) {
  const display = hoverValue || value;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {[...Array(5)].map((_, i) => {
        const isActive = i < display;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i + 1)}
            onMouseEnter={() => onHover?.(i + 1)}
            onMouseLeave={() => onLeave?.()}
            className="p-0.5 transition-transform hover:scale-110"
            aria-label={`Rate ${i + 1} out of 5`}
          >
            <Star
              className={`${starClass} transition-all`}
              weight={isActive ? 'fill' : 'regular'}
              style={{ color: isActive ? '#facc15' : 'var(--text-tertiary)' }}
            />
          </button>
        );
      })}
      <span className="ml-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {display} out of 5 stars
      </span>
    </div>
  );
}

function ReviewFormField({ label, children, optional = false }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
        {label}
        {optional && (
          <span className="font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>
            (optional)
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function ReviewImageUpload({
  fileInputRef,
  selectedCount,
  maxImages,
  maxFileSize,
  imageErrors,
  imagePreviews,
  onSelect,
  onRemove,
}) {
  return (
    <ReviewFormField label={`Photos (${selectedCount}/${maxImages})`}>
      <div
        className="border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer hover:border-emerald-500/40"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => onSelect(e.target.files)}
          className="hidden"
        />
        <Camera className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {selectedCount >= maxImages
            ? 'Maximum images reached'
            : 'Click to upload photos or drag and drop'}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          PNG, JPG, GIF up to {maxFileSize / (1024 * 1024)}MB each
        </p>
      </div>

      {imageErrors.length > 0 && (
        <div
          className="mt-3 p-3 rounded-xl"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            borderWidth: '1px',
            borderColor: 'rgba(239, 68, 68, 0.25)',
          }}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm text-red-600 dark:text-red-400">
              {imageErrors.map((error, index) => (
                <p key={index}>{error}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {imagePreviews.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {imagePreviews.map((preview, index) => (
            <div key={preview.id} className="relative group">
              <img
                src={preview.preview}
                alt={`Preview ${index + 1}`}
                className="w-full h-24 object-cover rounded-xl border"
                style={{ borderColor: 'var(--border)' }}
              />
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                aria-label="Remove image"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ReviewFormField>
  );
}

function ReviewFormActions({ uploading, submitLabel, onCancel, disabled = false }) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      <button
        type="submit"
        disabled={uploading || disabled}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
      >
        {uploading ? (
          <>
            <Spinner size={16} />
            <span>Uploading...</span>
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            <span>{submitLabel}</span>
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={uploading}
        className="px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        Cancel
      </button>
    </div>
  );
}

const ReviewSection = ({
  parkCode,
  parkName,
  prefetchedReviews = null,
  onCountChange,
  initialOpenForm = false,
  onFormOpened,
  onReviewSubmitted,
}) => {
  const { isAuthenticated, user, showLoginPrompt } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { subscribe, unsubscribe, subscribeToReviews } = useWebSocket();
  const [reviews, setReviews] = useState([]);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showReviewForm, setShowReviewForm] = useState(initialOpenForm);
  const [newReview, setNewReview] = useState({
    rating: 5,
    title: '',
    comment: '',
    visitYear: new Date().getFullYear(),
    userName: ''
  });
  const [hoveredRating, setHoveredRating] = useState(0);
  
  // Edit/Delete states
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [editedReview, setEditedReview] = useState({
    rating: 5,
    title: '',
    comment: '',
    visitYear: new Date().getFullYear()
  });
  const [editHoveredRating, setEditHoveredRating] = useState(0);

  // Image upload states
  const fileInputRef = useRef(null);
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageErrors, setImageErrors] = useState([]);
  const maxImages = 5;
  const maxFileSize = 10 * 1024 * 1024; // 10MB

  // Lightbox state for review images
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const openLightbox = (images, index) => {
    const formatted = images.map((img, i) => ({
      url: typeof img === 'string' ? img : (img.url || img),
      altText: typeof img === 'string' ? `Review image ${i + 1}` : (img.caption || `Review image ${i + 1}`)
    }));
    setLightboxImages(formatted);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const applyReviewPayload = (response) => {
    const list = response?.list ?? response?.data ?? [];
    setReviews(list);
    if (response?.stats) {
      setAverageRating(response.stats.averageRating || 0);
      setTotalReviews(response.stats.totalReviews || 0);
    } else {
      setAverageRating(response?.averageRating || 0);
      setTotalReviews(
        response?.count
        ?? response?.total
        ?? response?.pagination?.totalReviews
        ?? list.length
      );
    }
  };

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const response = await reviewService.getParkReviews(parkCode);
      applyReviewPayload({
        list: response.data || [],
        stats: response.stats,
        averageRating: response.averageRating,
        total: response.total,
        pagination: response.pagination,
      });
    } catch (error) {
      console.error('Error fetching reviews:', error);
      showToast('Failed to load reviews', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (prefetchedReviews != null) {
      applyReviewPayload(prefetchedReviews);
      setLoading(false);
      return;
    }
    fetchReviews();
  }, [parkCode, prefetchedReviews]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialOpenForm) return;
    setShowReviewForm(true);
    onFormOpened?.();
  }, [initialOpenForm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync review count back to parent tab badge
  useEffect(() => {
    if (onCountChange) onCountChange(totalReviews);
  }, [totalReviews, onCountChange]);

  // Setup WebSocket real-time sync for reviews
  useEffect(() => {
    if (!parkCode) return;

    // Subscribe to reviews channel
    subscribeToReviews();

    // Handle review added from another device/tab
    const handleReviewAdded = (review) => {
      console.log('[Real-Time] Review added:', review);
      if (review.parkCode === parkCode) {
        setReviews(prev => {
          // Avoid duplicates
          if (prev.some(r => r._id === review._id)) return prev;
          return [review, ...prev];
        });
        setTotalReviews(prev => prev + 1);
        // Recalculate average rating
        setAverageRating(prev => {
          const total = reviews.reduce((sum, r) => sum + r.rating, review.rating);
          return total / (reviews.length + 1);
        });
      }
    };

    // Handle review updated from another device/tab
    const handleReviewUpdated = (review) => {
      console.log('[Real-Time] Review updated:', review);
      if (review.parkCode === parkCode) {
        setReviews(prev => prev.map(r => r._id === review._id ? review : r));
        // Recalculate average rating
        const updatedReviews = reviews.map(r => r._id === review._id ? review : r);
        const total = updatedReviews.reduce((sum, r) => sum + r.rating, 0);
        setAverageRating(updatedReviews.length > 0 ? total / updatedReviews.length : 0);
      }
    };

    // Subscribe to WebSocket events
    subscribe('reviewAdded', handleReviewAdded);
    subscribe('reviewUpdated', handleReviewUpdated);

    // Cleanup
    return () => {
      unsubscribe('reviewAdded', handleReviewAdded);
      unsubscribe('reviewUpdated', handleReviewUpdated);
    };
  }, [parkCode, reviews.length, subscribe, unsubscribe, subscribeToReviews]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuId && !event.target.closest('.relative')) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  // Handle image selection
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
  };

  // Remove image
  const removeImage = (index) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();

    try {
      setUploadingImages(true);
      
      // Create review with images
      await reviewService.createReview(parkCode, {
        ...newReview
      }, selectedImages);
      
      showToast('Review submitted successfully!', 'success');
      logReviewCreate(parkCode, null, selectedImages.length > 0);
      setShowReviewForm(false);
      setNewReview({ rating: 5, title: '', comment: '', visitYear: new Date().getFullYear(), userName: '' });
      setSelectedImages([]);
      setImagePreviews([]);
      setImageErrors([]);
      onReviewSubmitted?.();
      fetchReviews(); // Refresh reviews
      
      // Invalidate parkRatings cache so explore page shows updated ratings
      queryClient.invalidateQueries(['parkRatings']);
      queryClient.refetchQueries(['parkRatings']);
    } catch (error) {
      console.error('Error submitting review:', error);
      const serverMessage = error.response?.data?.error || error.response?.data?.details;
      showToast(
        serverMessage || error.message || 'Failed to submit review',
        'error'
      );
    } finally {
      setUploadingImages(false);
    }
  };

  const handleMarkHelpful = async (reviewId) => {
    if (!isAuthenticated) {
      showLoginPrompt('Log in to rate reviews as helpful');
      return;
    }

    try {
      const userIdToCheck = user?.id || user?._id;
      const review = reviews.find(r => r._id === reviewId);
      const hasVoted = review?.helpfulUsers?.some(id => id === userIdToCheck || id.toString() === userIdToCheck);
      
      console.log('[ReviewSection] Toggling helpful vote for review:', reviewId, 'hasVoted:', hasVoted);
      
      // Optimistic update
      setReviews(prevReviews => 
        prevReviews.map(r => {
          if (r._id === reviewId) {
            if (hasVoted) {
              // Remove vote
              return { 
                ...r, 
                helpfulVotes: Math.max(0, (r.helpfulVotes || 0) - 1),
                helpfulUsers: (r.helpfulUsers || []).filter(id => 
                  id !== userIdToCheck && id.toString() !== userIdToCheck
                )
              };
            } else {
              // Add vote
              return { 
                ...r, 
                helpfulVotes: (r.helpfulVotes || 0) + 1,
                helpfulUsers: [...(r.helpfulUsers || []), userIdToCheck]
              };
            }
          }
          return r;
        })
      );
      
      // Make API call
      const result = await reviewService.markHelpful(reviewId);
      console.log('[ReviewSection] Vote result:', result);
      
      if (result.action === 'added') {
        logEvent('Review', 'mark_helpful', parkCode);
        showToast('Marked as helpful!', 'success');
      } else if (result.action === 'removed') {
        logEvent('Review', 'unmark_helpful', parkCode);
        showToast('Vote removed', 'success');
      }
      
      // Refresh to get server data and sync
      setTimeout(() => fetchReviews(), 500);
    } catch (error) {
      console.error('Error toggling helpful vote:', error);
      showToast('Failed to update vote', 'error');
      // Rollback on error
      fetchReviews();
    }
  };

  const handleEditClick = (review) => {
    setEditingReviewId(review._id);
    setEditedReview({
      rating: review.rating,
      title: review.title,
      comment: review.comment || review.content,
      visitYear: review.visitYear || new Date().getFullYear()
    });
    setOpenMenuId(null);
  };

  const handleCancelEdit = () => {
    setEditingReviewId(null);
    setEditedReview({
      rating: 5,
      title: '',
      comment: '',
      visitYear: new Date().getFullYear()
    });
    setEditHoveredRating(0);
    setSelectedImages([]);
    setImagePreviews([]);
    setImageErrors([]);
  };

  const handleUpdateReview = async (reviewId) => {
    try {
      setUploadingImages(true);
      
      // Update review with new images
      await reviewService.updateReview(reviewId, editedReview, selectedImages);
      
      showToast('Review updated successfully!', 'success');
      setEditingReviewId(null);
      setSelectedImages([]);
      setImagePreviews([]);
      setImageErrors([]);
      fetchReviews();
      
      // Invalidate parkRatings cache so explore page shows updated ratings
      queryClient.invalidateQueries(['parkRatings']);
      queryClient.refetchQueries(['parkRatings']);
    } catch (error) {
      console.error('Error updating review:', error);
      showToast(error.message || 'Failed to update review', 'error');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm('Are you sure you want to delete this review?')) {
      return;
    }

    try {
      await reviewService.deleteReview(reviewId);
      logEvent('Review', 'delete', parkCode);
      showToast('Review deleted successfully!', 'success');
      setOpenMenuId(null);
      fetchReviews();
      
      // Invalidate parkRatings cache so explore page shows updated ratings
      queryClient.invalidateQueries(['parkRatings']);
      queryClient.refetchQueries(['parkRatings']);
    } catch (error) {
      console.error('Error deleting review:', error);
      showToast('Failed to delete review', 'error');
    }
  };

  const isReviewOwner = (review) => {
    if (!user) return false;
    const reviewUserId = review.userId?._id || review.userId?.id || review.userId;
    const currentUserId = user._id || user.id;
    return reviewUserId === currentUserId;
  };

  const resetNewReviewForm = () => {
    setShowReviewForm(false);
    setSelectedImages([]);
    setImagePreviews([]);
    setImageErrors([]);
    setNewReview({
      rating: 5,
      title: '',
      comment: '',
      visitYear: new Date().getFullYear(),
      userName: '',
    });
  };

  const visitYearOptions = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  if (loading) {
    return <ParkTabSpinner />;
  }

  return (
    <div>
      <h2
        className="text-2xl font-bold mb-6 flex items-center gap-2"
        style={{ color: 'var(--text-primary)' }}
      >
        <MessageSquare className="h-6 w-6" />
        Reviews
        {totalReviews > 0 && (
          <span className="text-base font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>
            ({totalReviews})
          </span>
        )}
      </h2>

      <div
        className="rounded-xl p-5 sm:p-6 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        style={TAB_CARD_STYLE}
      >
        <div className="flex items-center gap-4">
          <div
            className="text-4xl sm:text-5xl font-bold tabular-nums leading-none"
            style={{ color: 'var(--text-primary)' }}
          >
            {averageRating > 0 ? averageRating.toFixed(1) : '0.0'}
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className="h-5 w-5"
                  weight={i < Math.floor(averageRating) ? 'fill' : 'regular'}
                  style={{
                    color: i < Math.floor(averageRating) ? '#facc15' : 'var(--text-tertiary)',
                  }}
                />
              ))}
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Based on {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
            </p>
          </div>
        </div>

        {!showReviewForm && (
          <button
            type="button"
            onClick={() => setShowReviewForm(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition shrink-0"
            style={{
              backgroundColor: 'var(--accent-green)',
              color: 'white',
            }}
          >
            <Plus className="h-4 w-4" />
            Write a Review
          </button>
        )}
      </div>

      {showReviewForm && (
        <div className="rounded-xl overflow-hidden mb-6" style={FORM_CARD_STYLE}>
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>
              Write a Review
            </h3>
            <form onSubmit={handleSubmitReview} className="space-y-5">
              <ReviewFormField label="Rating">
                <ReviewStarPicker
                  value={newReview.rating}
                  hoverValue={hoveredRating}
                  onChange={(rating) => setNewReview({ ...newReview, rating })}
                  onHover={setHoveredRating}
                  onLeave={() => setHoveredRating(0)}
                />
              </ReviewFormField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {!isAuthenticated && (
                  <ReviewFormField label="Name" optional>
                    <input
                      type="text"
                      value={newReview.userName || ''}
                      onChange={(e) => setNewReview({ ...newReview, userName: e.target.value })}
                      className={INPUT_CLASS}
                      style={INPUT_STYLE}
                      placeholder="Guest Explorer"
                      maxLength="50"
                    />
                  </ReviewFormField>
                )}

                <ReviewFormField label="Visit Year">
                  <select
                    value={newReview.visitYear}
                    onChange={(e) => setNewReview({ ...newReview, visitYear: parseInt(e.target.value, 10) })}
                    className={INPUT_CLASS}
                    style={INPUT_STYLE}
                    required
                  >
                    {visitYearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </ReviewFormField>
              </div>

              <ReviewFormField label="Title">
                <input
                  type="text"
                  value={newReview.title}
                  onChange={(e) => setNewReview({ ...newReview, title: e.target.value })}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                  placeholder="Give your review a title (5-100 characters)"
                  required
                  minLength="5"
                  maxLength="100"
                />
              </ReviewFormField>

              <ReviewFormField label="Review">
                <textarea
                  value={newReview.comment}
                  onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                  className={`${INPUT_CLASS} resize-none`}
                  style={INPUT_STYLE}
                  rows="5"
                  placeholder="Share your experience... (minimum 10 characters)"
                  required
                  minLength="10"
                  maxLength="2000"
                />
                <p className="text-xs mt-2 text-right" style={{ color: 'var(--text-tertiary)' }}>
                  {newReview.comment.length}/2000
                </p>
              </ReviewFormField>

              {isAuthenticated && (
                <ReviewImageUpload
                  fileInputRef={fileInputRef}
                  selectedCount={selectedImages.length}
                  maxImages={maxImages}
                  maxFileSize={maxFileSize}
                  imageErrors={imageErrors}
                  imagePreviews={imagePreviews}
                  onSelect={handleImageSelect}
                  onRemove={removeImage}
                />
              )}

              <ReviewFormActions
                uploading={uploadingImages}
                submitLabel="Submit Review"
                onCancel={resetNewReviewForm}
              />
            </form>
          </div>
        </div>
      )}

      {reviews.length > 0 ? (
        <div className="space-y-4">
          {reviews.map(review => (
            <div
              key={review._id}
              className="rounded-xl overflow-hidden"
              style={TAB_CARD_STYLE}
            >
              <div className="p-6">
              {editingReviewId === review._id ? (
                <div className="space-y-5">
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Edit Review
                  </h3>

                  <ReviewFormField label="Rating">
                    <ReviewStarPicker
                      value={editedReview.rating}
                      hoverValue={editHoveredRating}
                      onChange={(rating) => setEditedReview({ ...editedReview, rating })}
                      onHover={setEditHoveredRating}
                      onLeave={() => setEditHoveredRating(0)}
                    />
                  </ReviewFormField>

                  <ReviewFormField label="Title">
                    <input
                      type="text"
                      value={editedReview.title}
                      onChange={(e) => setEditedReview({ ...editedReview, title: e.target.value })}
                      className={INPUT_CLASS}
                      style={INPUT_STYLE}
                      required
                    />
                  </ReviewFormField>

                  <ReviewFormField label="Review">
                    <textarea
                      value={editedReview.comment}
                      onChange={(e) => setEditedReview({ ...editedReview, comment: e.target.value })}
                      className={`${INPUT_CLASS} resize-none`}
                      style={INPUT_STYLE}
                      rows="5"
                      required
                    />
                  </ReviewFormField>

                  <ReviewFormField label="Visit Year">
                    <select
                      value={editedReview.visitYear}
                      onChange={(e) => setEditedReview({ ...editedReview, visitYear: parseInt(e.target.value, 10) })}
                      className={INPUT_CLASS}
                      style={INPUT_STYLE}
                    >
                      {visitYearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </ReviewFormField>

                  <ReviewImageUpload
                    fileInputRef={fileInputRef}
                    selectedCount={selectedImages.length}
                    maxImages={maxImages}
                    maxFileSize={maxFileSize}
                    imageErrors={imageErrors}
                    imagePreviews={imagePreviews}
                    onSelect={handleImageSelect}
                    onRemove={removeImage}
                  />

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateReview(review._id)}
                      disabled={uploadingImages}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50"
                      style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                    >
                      {uploadingImages ? (
                        <>
                          <Spinner size={16} />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          <span>Update Review</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={uploadingImages}
                      className="px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex gap-3 min-w-0">
                      <img
                        src={review.userId?.avatar || getBestAvatar(review.userId || { userName: review.userName }, {}, 'travel')}
                        alt={`${review.userName || review.userId?.name || 'User'}'s avatar`}
                        className="w-11 h-11 rounded-full object-cover border-2 shrink-0"
                        style={{ borderColor: 'var(--border)' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                      <div
                        className="w-11 h-11 rounded-full items-center justify-center font-semibold text-white hidden shrink-0"
                        style={{ backgroundColor: 'var(--accent-green)' }}
                      >
                        {review.userName?.charAt(0)?.toUpperCase() || review.userId?.name?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {review.userName || review.userId?.name || 'Anonymous'}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <div className="flex items-center gap-0.5">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className="h-4 w-4"
                                weight={i < review.rating ? 'fill' : 'regular'}
                                style={{
                                  color: i < review.rating ? '#facc15' : 'var(--text-tertiary)',
                                }}
                              />
                            ))}
                          </div>
                          {review.visitYear && (
                            <span
                              className="text-xs px-2.5 py-1 rounded-full"
                              style={{
                                backgroundColor: 'var(--surface-elevated)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              Visited {review.visitYear}
                            </span>
                          )}
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {new Date(review.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isReviewOwner(review) && (
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(openMenuId === review._id ? null : review._id)}
                          className="p-1.5 rounded-lg transition"
                          style={{ color: 'var(--text-tertiary)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {openMenuId === review._id && (
                          <div
                            className="absolute right-0 mt-2 w-48 rounded-xl shadow-2xl z-50 overflow-hidden border"
                            style={{
                              backgroundColor: 'var(--bg-tertiary)',
                              borderColor: 'var(--border-hover)',
                              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3), 0 4px 10px rgba(0, 0, 0, 0.2)',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleEditClick(review)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-200 group"
                              style={{
                                color: 'var(--text-primary)',
                                borderBottom: '1px solid var(--border)',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-hover)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
                            >
                              <Edit className="h-4 w-4 group-hover:text-emerald-500 transition-colors" />
                              <span className="font-medium group-hover:text-emerald-500 transition-colors">Edit Review</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteReview(review._id)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-200 group"
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-hover)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500 group-hover:text-red-600 transition-colors" />
                              <span className="font-medium text-red-500 group-hover:text-red-600 transition-colors">Delete Review</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <h5 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    {review.title}
                  </h5>
                  <p className="text-sm mb-4 whitespace-pre-line leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {review.comment || review.content}
                  </p>
                </>
              )}

              {/* Review Images - only show when not editing */}
              {editingReviewId !== review._id && review.photos && review.photos.length > 0 && (
                <div className="mb-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {review.photos.map((photo, index) => (
                      <button
                        key={index}
                        className="aspect-video rounded-xl overflow-hidden group"
                        onClick={() => openLightbox(review.photos, index)}
                      >
                        <img
                          src={photo.url || photo}
                          alt={photo.caption || `Review image ${index + 1}`}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {editingReviewId !== review._id && review.images && review.images.length > 0 && !review.photos && (
                <div className="mb-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {review.images.map((imageUrl, index) => (
                      <button
                        key={index}
                        className="aspect-video rounded-xl overflow-hidden group"
                        onClick={() => openLightbox(review.images, index)}
                      >
                        <img
                          src={imageUrl}
                          alt={`Review image ${index + 1}`}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Helpful button - only show when not editing */}
              {editingReviewId !== review._id && (() => {
                const userIdToCheck = user?.id || user?._id;
                const hasUserVoted = review.helpfulUsers?.some(id =>
                  id === userIdToCheck || id.toString() === userIdToCheck
                );

                return (
                  <div className="flex items-center gap-4 text-sm pt-1">
                    <button
                      type="button"
                      onClick={() => handleMarkHelpful(review._id)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        color: hasUserVoted ? 'var(--accent-green)' : 'var(--text-secondary)',
                        backgroundColor: hasUserVoted ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface)',
                        borderWidth: '1px',
                        borderColor: hasUserVoted ? 'rgba(16, 185, 129, 0.35)' : 'var(--border)',
                      }}
                    >
                      <ThumbsUp className="h-4 w-4" weight={hasUserVoted ? 'fill' : 'regular'} />
                      <span>{hasUserVoted ? 'Helpful' : 'Mark Helpful'} ({review.helpfulVotes || 0})</span>
                    </button>
                  </div>
                );
              })()}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !showReviewForm && (
          <ParkTabEmptyState message="No reviews yet. Be the first to share your experience." />
        )
      )}

      {/* Review Image Lightbox */}
      {lightboxOpen && lightboxImages.length > 0 && (
        <PhotoLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
};

export default ReviewSection;
