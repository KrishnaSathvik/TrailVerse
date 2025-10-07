import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ReviewSection from '../components/reviews/ReviewSection';
import useReviews from '../hooks/useReviews';

const ReviewWithImagesExample = () => {
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const { createReview, updateReview, deleteReview } = useReviews();

  // Example park data
  const parkData = {
    parkCode: 'acad',
    parkName: 'Acadia National Park'
  };

  // Example reviews data (in real app, this would come from API)
  const [reviews, setReviews] = useState([
    {
      _id: '1',
      title: 'Beautiful fall colors!',
      content: 'Visited in October and the fall foliage was absolutely stunning. The hiking trails offer amazing views of the coastline.',
      rating: 5,
      images: [
        'https://example.com/fall-colors-1.jpg',
        'https://example.com/fall-colors-2.jpg'
      ],
      userName: 'John Doe',
      user: { _id: 'user1', avatar: null },
      helpful: ['user2', 'user3'],
      createdAt: '2024-10-15T10:30:00Z',
      visitDate: '2024-10-10'
    },
    {
      _id: '2',
      title: 'Great for families',
      content: 'Perfect park for families with kids. Lots of easy trails and beautiful scenery. The visitor center was very informative.',
      rating: 4,
      images: [
        'https://example.com/family-trip-1.jpg'
      ],
      userName: 'Jane Smith',
      user: { _id: 'user2', avatar: 'https://example.com/avatar2.jpg' },
      helpful: ['user1'],
      createdAt: '2024-09-20T14:15:00Z',
      visitDate: '2024-09-15'
    }
  ]);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Park Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {parkData.parkName}
          </h1>
          <p className="text-gray-600">
            Share your experience and help other visitors plan their trip
          </p>
        </div>

        {/* Reviews Section */}
        <ReviewSection
          parkCode={parkData.parkCode}
          parkName={parkData.parkName}
          reviews={reviews}
        />

        {/* Usage Instructions */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-4">
            How Image Upload Works in Reviews:
          </h3>
          <div className="space-y-3 text-sm text-blue-800">
            <div className="flex items-start space-x-2">
              <span className="font-medium">1.</span>
              <span>Users can select up to 5 images when writing a review</span>
            </div>
            <div className="flex items-start space-x-2">
              <span className="font-medium">2.</span>
              <span>Images are automatically resized and optimized for web display</span>
            </div>
            <div className="flex items-start space-x-2">
              <span className="font-medium">3.</span>
              <span>Images are uploaded to the server and stored with metadata</span>
            </div>
            <div className="flex items-start space-x-2">
              <span className="font-medium">4.</span>
              <span>Review images are displayed in a responsive grid with lightbox view</span>
            </div>
            <div className="flex items-start space-x-2">
              <span className="font-medium">5.</span>
              <span>Users can download images and view them in full resolution</span>
            </div>
          </div>
        </div>

        {/* Technical Details */}
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Technical Implementation:
          </h3>
          <div className="space-y-2 text-sm text-gray-700">
            <p><strong>Frontend:</strong> React components with drag-and-drop file selection</p>
            <p><strong>Backend:</strong> Multer for file uploads, Sharp for image processing</p>
            <p><strong>Storage:</strong> Local file system with organized folder structure</p>
            <p><strong>Database:</strong> MongoDB with image metadata and relationships</p>
            <p><strong>Features:</strong> Thumbnail generation, validation, analytics tracking</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReviewWithImagesExample;
