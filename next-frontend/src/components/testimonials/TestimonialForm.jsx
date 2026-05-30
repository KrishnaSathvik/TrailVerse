import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import testimonialService from '../../services/testimonialService';
import { Star, Send, User } from '@components/icons';

const emptyFormState = (name = '') => ({
  name,
  content: '',
  rating: 5
});

const TestimonialForm = ({
  onSuccess,
  onCancel,
  resetOnSuccess = false,
  initialData = null,
  showHeading = false
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(() => {
    if (initialData) {
      return {
        name: initialData.name || '',
        content: initialData.content || '',
        rating: initialData.rating || 5
      };
    }
    return emptyFormState(user?.name || '');
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        content: initialData.content || '',
        rating: initialData.rating || 5
      });
      return;
    }
    if (user?.name) {
      setFormData((prev) => (prev.name ? prev : { ...prev, name: user.name }));
    }
  }, [user?.name, initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleRatingChange = (rating) => {
    setFormData((prev) => ({
      ...prev,
      rating
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showToast('Please enter your name', 'error');
      return;
    }

    if (!formData.content.trim()) {
      showToast('Please write your review', 'error');
      return;
    }

    if (formData.content.length < 50) {
      showToast('Review must be at least 50 characters', 'error');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: formData.name.trim(),
        content: formData.content.trim(),
        rating: formData.rating
      };

      if (initialData?._id) {
        await testimonialService.updateTestimonial(initialData._id, payload);
        showToast('Testimonial updated', 'success');
      } else {
        await testimonialService.createTestimonial(payload);
        showToast('Thanks! Your review will be checked before it goes live.', 'success');
      }

      if (resetOnSuccess) {
        setFormData(emptyFormState(user?.name || ''));
      }
      if (onSuccess) onSuccess();
    } catch (error) {
      showToast(error.response?.data?.error || 'Failed to submit testimonial', 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderStars = () => (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => handleRatingChange(star)}
          className="transition-colors"
          aria-label={`Rate ${star} out of 5`}
        >
          <Star
            weight={star <= formData.rating ? 'fill' : 'regular'}
            className={`h-6 w-6 ${
              star <= formData.rating ? 'text-yellow-400' : 'text-gray-300'
            }`}
          />
        </button>
      ))}
      <span className="ml-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {formData.rating}/5
      </span>
    </div>
  );

  return (
    <div
      className="rounded-2xl p-6 sm:p-8 backdrop-blur"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      {showHeading && (
        <h3 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
          Share your experience
        </h3>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            <User className="h-4 w-4 inline mr-1" />
            Name *
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
            placeholder="Your name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            Rating *
          </label>
          {renderStars()}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            Your review *
          </label>
          <textarea
            name="content"
            value={formData.content}
            onChange={handleChange}
            required
            rows={5}
            maxLength={1000}
            className="w-full px-4 py-3 rounded-xl outline-none resize-none transition"
            style={{
              backgroundColor: 'var(--surface-hover)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)'
            }}
            placeholder="How did TrailVerse help you plan or explore national parks? (at least 50 characters)"
          />
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              At least 50 characters
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {formData.content.length}/1000
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading || formData.content.length < 50 || !formData.name.trim()}
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
                {initialData?._id ? 'Save changes' : 'Submit review'}
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

        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Reviews are moderated before they appear on the site.
        </p>
      </form>
    </div>
  );
};

export default TestimonialForm;
