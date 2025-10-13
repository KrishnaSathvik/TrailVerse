import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import testimonialService from '../../services/testimonialService';
import { Star, Send, User, MapPin, Award } from '@components/icons';

const TestimonialForm = ({ onSuccess, onCancel }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    role: '',
    content: '',
    rating: 5,
    parkCode: '',
    parkName: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleRatingChange = (rating) => {
    setFormData(prev => ({
      ...prev,
      rating
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.content.trim()) {
      showToast('Please write your testimonial', 'error');
      return;
    }

    if (formData.content.length < 50) {
      showToast('Testimonial must be at least 50 characters long', 'error');
      return;
    }

    setLoading(true);
    try {
      await testimonialService.createTestimonial(formData);
      showToast('Testimonial submitted successfully! It will be reviewed before being published.', 'success');
      if (onSuccess) onSuccess();
    } catch (error) {
      showToast(error.response?.data?.error || 'Failed to submit testimonial', 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderStars = () => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => handleRatingChange(star)}
            className="transition-colors"
          >
            <Star
              className={`h-6 w-6 ${
                star <= formData.rating
                  ? 'text-yellow-400 fill-yellow-400'
                  : 'text-gray-300'
              }`}
            />
          </button>
        ))}
        <span className="ml-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {formData.rating}/5
        </span>
      </div>
    );
  };

  return (
    <div className="rounded-2xl p-8 backdrop-blur"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      <div className="flex items-center gap-2 mb-6">
        <Award className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
        <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Share Your Experience
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name and Role */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              <User className="h-4 w-4 inline mr-1" />
              Your Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 rounded-xl outline-none transition"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
              placeholder="Your full name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              <Award className="h-4 w-4 inline mr-1" />
              Your Role/Title
            </label>
            <input
              type="text"
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl outline-none transition"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
              placeholder="e.g., Outdoor Photographer, Hiking Enthusiast"
            />
          </div>
        </div>

        {/* Park Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              <MapPin className="h-4 w-4 inline mr-1" />
              Park Code (Optional)
            </label>
            <input
              type="text"
              name="parkCode"
              value={formData.parkCode}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl outline-none transition"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
              placeholder="e.g., yose, grca, yell"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Park Name (Optional)
            </label>
            <input
              type="text"
              name="parkName"
              value={formData.parkName}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl outline-none transition"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
              placeholder="e.g., Yosemite National Park"
            />
          </div>
        </div>

        {/* Rating */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            Rating *
          </label>
          {renderStars()}
        </div>

        {/* Testimonial Content */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            Your Testimonial *
          </label>
          <textarea
            name="content"
            value={formData.content}
            onChange={handleChange}
            required
            rows={6}
            maxLength={1000}
            className="w-full px-4 py-3 rounded-xl outline-none resize-none transition"
            style={{
              backgroundColor: 'var(--surface-hover)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)'
            }}
            placeholder="Share your experience with TrailVerse. How did it help you plan your National Parks adventure? What features did you find most useful? (Minimum 50 characters)"
          />
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Minimum 50 characters required
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {formData.content.length}/1000
            </p>
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex items-center gap-4 pt-4">
          <button
            type="submit"
            disabled={loading || formData.content.length < 50}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--accent-green)',
              color: 'white'
            }}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit Testimonial
              </>
            )}
          </button>
          
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 rounded-xl font-semibold transition"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              Cancel
            </button>
          )}
        </div>

        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <p>Your testimonial will be reviewed before being published. We appreciate your feedback!</p>
        </div>
      </form>
    </div>
  );
};

export default TestimonialForm;
