import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import testimonialService from '../../services/testimonialService';
import TestimonialForm from '../testimonials/TestimonialForm';
import { 
  Star, Edit, Trash2, Award, MapPin, 
  Clock, CheckCircle
} from 'lucide-react';

const UserTestimonials = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTestimonial, setEditingTestimonial] = useState(null);

  useEffect(() => {
    loadUserTestimonials();
    
    // Listen for custom event to open testimonial form from ProfilePage
    const handleOpenForm = () => {
      setShowForm(true);
    };
    
    window.addEventListener('openTestimonialForm', handleOpenForm);
    
    return () => {
      window.removeEventListener('openTestimonialForm', handleOpenForm);
    };
  }, []);

  const loadUserTestimonials = async () => {
    try {
      setLoading(true);
      // Get all testimonials for the current user
      const response = await testimonialService.getTestimonials({ 
        user: user?.id,
        limit: 50 
      });
      setTestimonials(response.data || []);
    } catch (error) {
      console.error('Error loading user testimonials:', error);
      showToast('Failed to load your testimonials', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTestimonial = async (testimonialId) => {
    if (!window.confirm('Are you sure you want to delete this testimonial?')) {
      return;
    }

    try {
      await testimonialService.deleteTestimonial(testimonialId);
      setTestimonials(testimonials.filter(t => t._id !== testimonialId));
      showToast('Testimonial deleted successfully', 'success');
    } catch (error) {
      showToast('Failed to delete testimonial', 'error');
    }
  };

  const handleEditTestimonial = (testimonial) => {
    setEditingTestimonial(testimonial);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingTestimonial(null);
    loadUserTestimonials();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingTestimonial(null);
  };

  const renderStars = (rating) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating
                ? 'text-yellow-400 fill-yellow-400'
                : 'text-gray-300'
            }`}
          />
        ))}
      </div>
    );
  };

  const getStatusBadge = (testimonial) => {
    if (testimonial.approved) {
      return (
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3" />
          Published
        </div>
      );
    } else {
      return (
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
          <Clock className="h-3 w-3" />
          Pending Review
        </div>
      );
    }
  };

  return (
    <div className="space-y-6">

      {/* Testimonial Form - Show inline when adding/editing */}
      {showForm && (
        <div className="rounded-2xl p-6 backdrop-blur"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {editingTestimonial ? 'Edit Testimonial' : 'Submit New Testimonial'}
            </h4>
            <button
              onClick={handleFormCancel}
              className="text-sm font-medium transition"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
          </div>
          <TestimonialForm
            onSuccess={handleFormSuccess}
            onCancel={handleFormCancel}
            initialData={editingTestimonial}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="rounded-2xl p-6 backdrop-blur animate-pulse"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="h-4 bg-gray-300 rounded mb-4"></div>
              <div className="h-4 bg-gray-300 rounded mb-4"></div>
              <div className="h-4 bg-gray-300 rounded w-3/4 mb-6"></div>
              <div className="flex items-center justify-between">
                <div className="h-4 bg-gray-300 rounded w-24"></div>
                <div className="h-6 bg-gray-300 rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      ) : testimonials.length === 0 ? (
        <div className="text-center py-12 rounded-2xl backdrop-blur"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <Award className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <h4 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            No Testimonials Yet
          </h4>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Use the &quot;Submit Testimonial&quot; button above to share your National Parks experience with the community
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial._id}
              className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                    {testimonial.avatar ? (
                      <img
                        src={testimonial.avatar}
                        alt={testimonial.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-white font-semibold text-sm">
                        {testimonial.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {testimonial.name}
                    </h4>
                    {testimonial.role && (
                      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                        {testimonial.role}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(testimonial)}
                  {testimonial.featured && (
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs"
                      style={{
                        backgroundColor: 'var(--accent-green)',
                        color: 'white'
                      }}
                    >
                      <Award className="h-3 w-3" />
                      Featured
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-4">
                {renderStars(testimonial.rating)}
              </div>

              <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                &quot;{testimonial.content}&quot;
              </p>

              {testimonial.parkName && (
                <div className="flex items-center gap-1 mb-4">
                  <MapPin className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    {testimonial.parkName}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Submitted {new Date(testimonial.submittedAt).toLocaleDateString()}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEditTestimonial(testimonial)}
                    className="p-2 rounded-lg transition"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      color: 'var(--text-secondary)'
                    }}
                    title="Edit testimonial"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTestimonial(testimonial._id)}
                    className="p-2 rounded-lg transition hover:bg-red-50 hover:text-red-600"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      color: 'var(--text-secondary)'
                    }}
                    title="Delete testimonial"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UserTestimonials;
