import React, { useState, useEffect, useRef } from 'react';
import { 
  Star, ThumbsUp, MoreVertical, Plus, MessageSquare, 
  Camera, X, Upload, AlertCircle, Loader2
} from 'lucide-react';
import reviewService from '../../services/reviewService';
import imageUploadService from '../../services/imageUploadService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const ReviewSection = ({ parkCode, parkName }) => {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [reviews, setReviews] = useState([]);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [newReview, setNewReview] = useState({
    rating: 5,
    title: '',
    content: '',
    visitDate: ''
  });

  // Image upload states
  const fileInputRef = useRef(null);
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageErrors, setImageErrors] = useState([]);
  const maxImages = 5;
  const maxFileSize = 10 * 1024 * 1024; // 10MB

  useEffect(() => {
    fetchReviews();
  }, [parkCode]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const response = await reviewService.getParkReviews(parkCode);
      setReviews(response.data || []);
      setAverageRating(response.averageRating || 0);
      setTotalReviews(response.total || 0);
    } catch (error) {
      console.error('Error fetching reviews:', error);
      showToast('Failed to load reviews', 'error');
    } finally {
      setLoading(false);
    }
  };

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
    if (!isAuthenticated) {
      showToast('Please login to submit a review', 'warning');
      return;
    }

    try {
      setUploadingImages(true);
      
      // Create review with images
      await reviewService.createReview(parkCode, {
        ...newReview,
        parkName
      }, selectedImages);
      
      showToast('Review submitted successfully!', 'success');
      setShowReviewForm(false);
      setNewReview({ rating: 5, title: '', content: '', visitDate: '' });
      setSelectedImages([]);
      setImagePreviews([]);
      setImageErrors([]);
      fetchReviews(); // Refresh reviews
    } catch (error) {
      console.error('Error submitting review:', error);
      showToast(
        error.message || 'Failed to submit review',
        'error'
      );
    } finally {
      setUploadingImages(false);
    }
  };

  const handleMarkHelpful = async (reviewId) => {
    if (!isAuthenticated) {
      showToast('Please login to mark reviews as helpful', 'warning');
      return;
    }

    try {
      await reviewService.markHelpful(reviewId);
      fetchReviews(); // Refresh reviews
    } catch (error) {
      console.error('Error marking review as helpful:', error);
      showToast('Failed to mark review as helpful', 'error');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl p-8 backdrop-blur text-center"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <div className="animate-pulse">
            <div className="h-16 bg-gray-300 rounded mb-4 mx-auto w-24"></div>
            <div className="flex justify-center gap-1 mb-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-6 w-6 bg-gray-300 rounded"></div>
              ))}
            </div>
            <div className="h-4 bg-gray-300 rounded w-32 mx-auto"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Rating Summary */}
      <div className="rounded-2xl p-8 backdrop-blur text-center"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}
      >
        <div className="text-6xl font-bold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {averageRating > 0 ? averageRating.toFixed(1) : '0.0'}
        </div>
        <div className="flex items-center justify-center gap-1 mb-2">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              className={`h-6 w-6 ${
                i < Math.floor(averageRating)
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-gray-400'
              }`}
            />
          ))}
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Based on {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
        </p>
      </div>

      {/* Add Review Button */}
      {isAuthenticated && (
        <div className="text-center">
          <button
            onClick={() => setShowReviewForm(!showReviewForm)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-forest-500 hover:bg-forest-600 text-white font-semibold transition"
          >
            <Plus className="h-4 w-4" />
            {showReviewForm ? 'Cancel' : 'Write a Review'}
          </button>
        </div>
      )}

      {/* Review Form */}
      {showReviewForm && (
        <div className="rounded-2xl p-6 backdrop-blur"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <h3 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Write a Review
          </h3>
          <form onSubmit={handleSubmitReview} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Rating
              </label>
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setNewReview({...newReview, rating: i + 1})}
                    className="p-1"
                  >
                    <Star
                      className={`h-6 w-6 ${
                        i < newReview.rating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-400'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Title
              </label>
              <input
                type="text"
                value={newReview.title}
                onChange={(e) => setNewReview({...newReview, title: e.target.value})}
                className="w-full px-4 py-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
                placeholder="Give your review a title"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Review
              </label>
              <textarea
                value={newReview.content}
                onChange={(e) => setNewReview({...newReview, content: e.target.value})}
                className="w-full px-4 py-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
                rows="4"
                placeholder="Share your experience..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Visit Date
              </label>
              <input
                type="date"
                value={newReview.visitDate}
                onChange={(e) => setNewReview({...newReview, visitDate: e.target.value})}
                className="w-full px-4 py-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
                required
              />
            </div>

            {/* Image Upload Section */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Photos ({selectedImages.length}/{maxImages})
              </label>
              
              {/* Upload Button */}
              <div 
                className="border-2 border-dashed rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleImageSelect(e.target.files)}
                  className="hidden"
                />
                <Camera className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {selectedImages.length >= maxImages 
                    ? 'Maximum images reached' 
                    : 'Click to upload photos or drag and drop'
                  }
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  PNG, JPG, GIF up to 10MB each
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

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={uploadingImages}
                className="px-6 py-2 rounded-full bg-forest-500 hover:bg-forest-600 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {uploadingImages ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    <span>Submit Review</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowReviewForm(false);
                  setSelectedImages([]);
                  setImagePreviews([]);
                  setImageErrors([]);
                }}
                disabled={uploadingImages}
                className="px-6 py-2 rounded-full disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reviews List */}
      {reviews.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <MessageSquare className="h-5 w-5" />
            Reviews ({totalReviews})
          </h3>
          {reviews.map(review => (
            <div
              key={review._id}
              className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex gap-3">
                  {review.user?.avatar ? (
                    <img
                      src={review.user.avatar}
                      alt={`${review.userName || 'User'}'s avatar`}
                      className="w-12 h-12 rounded-full object-cover border-2"
                      style={{ borderColor: 'var(--border)' }}
                      onError={(e) => {
                        // Fallback to initials if image fails to load
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div 
                    className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-white ${
                      review.user?.avatar ? 'hidden' : 'flex'
                    }`}
                    style={{ backgroundColor: 'var(--forest-500)' }}
                  >
                    {review.userName?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {review.userName || 'Anonymous'}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
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
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="p-1 rounded-lg hover:bg-white/5">
                  <MoreVertical className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                </button>
              </div>

              <h5 className="font-semibold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                {review.title}
              </h5>
              <p className="text-sm mb-4"
                style={{ color: 'var(--text-secondary)' }}
              >
                {review.content}
              </p>

              {/* Review Images */}
              {review.images && review.images.length > 0 && (
                <div className="mb-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {review.images.slice(0, 6).map((imageUrl, index) => (
                      <div key={index} className="relative group cursor-pointer">
                        <img
                          src={imageUrl}
                          alt={`Review image ${index + 1}`}
                          className="w-full h-20 object-cover rounded-lg border"
                          style={{ borderColor: 'var(--border)' }}
                          loading="lazy"
                        />
                        {index === 5 && review.images.length > 6 && (
                          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
                            <span className="text-white text-xs font-medium">
                              +{review.images.length - 6} more
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 text-sm">
                <button 
                  onClick={() => handleMarkHelpful(review._id)}
                  className="flex items-center gap-1 hover:text-forest-400 transition"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <ThumbsUp className="h-4 w-4" />
                  Helpful ({review.helpful?.length || 0})
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <MessageSquare className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            No reviews yet
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Be the first to share your experience!
          </p>
        </div>
      )}
    </div>
  );
};

export default ReviewSection;
