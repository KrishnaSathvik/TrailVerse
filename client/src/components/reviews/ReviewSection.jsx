import React, { useState } from 'react';
import { Plus, MessageSquare, Star, ThumbsUp } from '@components/icons';
import { useAuth } from '../../context/AuthContext';
import { useAnalytics } from '../../hooks/useAnalytics';
import ReviewFormWithImages from './ReviewFormWithImages';
import ReviewImages from './ReviewImages';

const ReviewSection = ({ parkCode, parkName, reviews = [] }) => {
  const { user, isAuthenticated } = useAuth();
  const { trackUserAction } = useAnalytics();
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [editingReview, setEditingReview] = useState(null);

  // Calculate average rating
  const averageRating = reviews.length > 0 
    ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
    : 0;

  // Get user's review
  const userReview = user ? reviews.find(review => review.user._id === user.id) : null;

  const handleWriteReview = () => {
    if (!isAuthenticated) {
      trackUserAction('review_form_login_required', { parkCode });
      // Redirect to login or show login modal
      return;
    }

    trackUserAction('review_form_open', { parkCode });
    setShowReviewForm(true);
  };

  const handleEditReview = (review) => {
    trackUserAction('review_form_edit', { 
      parkCode, 
      reviewId: review._id 
    });
    setEditingReview(review);
    setShowReviewForm(true);
  };

  const handleReviewSubmitted = (review) => {
    setShowReviewForm(false);
    setEditingReview(null);
    trackUserAction('review_form_submit_success', { 
      parkCode, 
      reviewId: review._id,
      hasImages: review.images && review.images.length > 0
    });
    
    // Refresh reviews or update local state
    window.location.reload(); // Simple refresh - you might want to update state instead
  };

  const handleCancelReview = () => {
    setShowReviewForm(false);
    setEditingReview(null);
    trackUserAction('review_form_cancel', { parkCode });
  };

  const handleImageClick = (reviewId, imageIndex) => {
    trackUserAction('review_image_click', {
      parkCode,
      reviewId,
      imageIndex
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <MessageSquare className="h-5 w-5 mr-2" />
              Reviews
            </h3>
            <div className="flex items-center mt-1">
              <div className="flex items-center">
                <Star className="h-4 w-4 text-yellow-400 fill-current" />
                <span className="ml-1 text-sm font-medium text-gray-900">
                  {averageRating}
                </span>
              </div>
              <span className="ml-2 text-sm text-gray-500">
                ({reviews.length} review{reviews.length !== 1 ? 's' : ''})
              </span>
            </div>
          </div>

          {/* Write Review Button */}
          {isAuthenticated && !userReview && (
            <button
              onClick={handleWriteReview}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Write Review
            </button>
          )}
        </div>
      </div>

      {/* Review Form */}
      {showReviewForm && (
        <div className="p-6 border-b border-gray-200">
          <ReviewFormWithImages
            parkCode={parkCode}
            parkName={parkName}
            onReviewCreated={handleReviewSubmitted}
            onCancel={handleCancelReview}
            existingReview={editingReview}
          />
        </div>
      )}

      {/* Reviews List */}
      <div className="divide-y divide-gray-200">
        {reviews.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No reviews yet. Be the first to share your experience!</p>
            {isAuthenticated && (
              <button
                onClick={handleWriteReview}
                className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                <Plus className="h-4 w-4 mr-2" />
                Write First Review
              </button>
            )}
          </div>
        ) : (
          reviews.map((review) => (
            <div key={review._id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* User Info */}
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="flex-shrink-0">
                      {review.user.avatar ? (
                        <img
                          src={review.user.avatar}
                          alt={review.userName}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-600">
                            {review.userName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {review.userName}
                      </p>
                      <div className="flex items-center">
                        <div className="flex items-center">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-4 w-4 ${
                                star <= review.rating
                                  ? 'text-yellow-400 fill-current'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="ml-2 text-xs text-gray-500">
                          {new Date(review.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Review Content */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      {review.title}
                    </h4>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {review.content}
                    </p>
                  </div>

                  {/* Review Images */}
                  {review.images && review.images.length > 0 && (
                    <div className="mb-4">
                      <ReviewImages
                        images={review.images}
                        reviewId={review._id}
                        parkCode={parkCode}
                      />
                    </div>
                  )}

                  {/* Review Actions */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={() => {
                          // Handle helpful action
                          trackUserAction('review_helpful_click', {
                            reviewId: review._id,
                            parkCode
                          });
                        }}
                        className="flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        <ThumbsUp className="h-4 w-4 mr-1" />
                        Helpful ({review.helpful?.length || 0})
                      </button>
                    </div>

                    {/* Edit Button (for review owner) */}
                    {user && user.id === review.user._id && (
                      <button
                        onClick={() => handleEditReview(review)}
                        className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ReviewSection;
