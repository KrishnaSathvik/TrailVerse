import React, { useState } from 'react';
import { Star, ThumbsUp, Flag, MoreVertical } from 'lucide-react';

const ReviewSection = ({ parkCode }) => {
  const [reviews] = useState([
    {
      id: 1,
      author: {
        name: 'Sarah Johnson',
        avatar: 'https://i.pravatar.cc/150?img=1',
        verified: true
      },
      rating: 5,
      date: '2025-09-15',
      title: 'Absolutely breathtaking!',
      content: 'One of the most beautiful places I\'ve ever visited. The trails are well-maintained and the views are incredible. Highly recommend the sunrise hike!',
      helpful: 24,
      photos: []
    },
    {
      id: 2,
      author: {
        name: 'Michael Chen',
        avatar: 'https://i.pravatar.cc/150?img=2',
        verified: true
      },
      rating: 4,
      date: '2025-09-10',
      title: 'Great park, can get crowded',
      content: 'Beautiful scenery and lots to do. Just be prepared for crowds during peak season. Arrive early to get parking!',
      helpful: 18,
      photos: []
    }
  ]);

  const averageRating = 4.8;
  const totalReviews = reviews.length;

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
          {averageRating}
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
          Based on {totalReviews} reviews
        </p>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {reviews.map(review => (
          <div
            key={review.id}
            className="rounded-2xl p-6 backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex gap-3">
                <img
                  src={review.author.avatar}
                  alt={review.author.name}
                  className="w-12 h-12 rounded-full"
                />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {review.author.name}
                    </h4>
                    {review.author.verified && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-semibold">
                        Verified
                      </span>
                    )}
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
                      {new Date(review.date).toLocaleDateString()}
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

            <div className="flex items-center gap-4 text-sm">
              <button className="flex items-center gap-1 hover:text-forest-400 transition"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <ThumbsUp className="h-4 w-4" />
                Helpful ({review.helpful})
              </button>
              <button className="flex items-center gap-1 hover:text-red-400 transition"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <Flag className="h-4 w-4" />
                Report
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReviewSection;
