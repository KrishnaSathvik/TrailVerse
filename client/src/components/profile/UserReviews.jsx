import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Calendar, Edit2, Trash2, MessageSquare } from 'lucide-react';
import { useUserReviews } from '../../hooks/useUserReviews';
import { useToast } from '../../context/ToastContext';

const UserReviews = () => {
  const { data, isLoading, error } = useUserReviews();
  const { showToast } = useToast();

  const handleEditReview = (_reviewId) => {
    // TODO: Implement edit functionality
    showToast('Edit functionality coming soon!', 'info');
  };

  const handleDeleteReview = async (_reviewId) => {
    // TODO: Implement delete functionality
    showToast('Delete functionality coming soon!', 'info');
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
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Link
                  to={`/parks/${review.park.parkCode}`}
                  className="text-lg font-semibold hover:text-forest-400 transition"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {review.park.parkName}
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
                  <span>Visited {formatDate(review.visitDate)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>Posted {formatDate(review.createdAt)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleEditReview(review._id)}
                className="p-2 rounded-lg hover:bg-white/5 transition"
                style={{ color: 'var(--text-tertiary)' }}
                title="Edit review"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDeleteReview(review._id)}
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
            {review.content}
          </p>

          {review.helpful && review.helpful.length > 0 && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                <span className="font-medium">{review.helpful.length} people found this helpful</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default UserReviews;
