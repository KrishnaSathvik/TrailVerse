import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import TestimonialsSection from '../components/testimonials/TestimonialsSection';
import TestimonialForm from '../components/testimonials/TestimonialForm';
import { Plus, Search, Award, Star } from 'lucide-react';

const TestimonialsPage = () => {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all'); // all, featured, recent
  const [searchTerm, setSearchTerm] = useState('');

  const filters = [
    { id: 'all', label: 'All Testimonials', icon: Star },
    { id: 'featured', label: 'Featured', icon: Award },
    { id: 'recent', label: 'Recent', icon: '🕒' }
  ];

  const handleSubmitSuccess = () => {
    setShowForm(false);
    showToast('Testimonial submitted successfully! It will be reviewed before being published.', 'success');
  };

  const handleFormCancel = () => {
    setShowForm(false);
  };

  if (showForm) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <div className="pt-20 pb-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Share Your Experience
                </h1>
                <p className="text-lg mt-2" style={{ color: 'var(--text-secondary)' }}>
                  Help other explorers by sharing your TrailVerse story
                </p>
              </div>
              <button
                onClick={handleFormCancel}
                className="text-sm" style={{ color: 'var(--text-secondary)' }}
              >
                ← Back to Testimonials
              </button>
            </div>
            <TestimonialForm
              onSuccess={handleSubmitSuccess}
              onCancel={handleFormCancel}
            />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      
      {/* Hero Section */}
      <section className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Community Testimonials
            </h1>
            <p className="text-xl max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Real experiences from fellow National Parks explorers. See how TrailVerse has helped others 
              plan their perfect adventures and discover hidden gems.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
            <div className="text-center p-6 rounded-2xl backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="text-3xl font-bold mb-2" style={{ color: 'var(--primary)' }}>
                4.9
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Average Rating
              </div>
            </div>
            <div className="text-center p-6 rounded-2xl backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="text-3xl font-bold mb-2" style={{ color: 'var(--primary)' }}>
                500+
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Happy Explorers
              </div>
            </div>
            <div className="text-center p-6 rounded-2xl backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="text-3xl font-bold mb-2" style={{ color: 'var(--primary)' }}>
                63
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Parks Covered
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4" 
                  style={{ color: 'var(--text-tertiary)' }} 
                />
                <input
                  type="text"
                  placeholder="Search testimonials..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 rounded-xl outline-none transition"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                {filters.map((filterOption) => {
                  const Icon = filterOption.icon;
                  return (
                    <button
                      key={filterOption.id}
                      onClick={() => setFilter(filterOption.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
                        filter === filterOption.id
                          ? 'text-white'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                      style={{
                        backgroundColor: filter === filterOption.id ? 'var(--primary)' : 'var(--surface)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)',
                        color: filter === filterOption.id ? 'white' : 'var(--text-secondary)'
                      }}
                    >
                      {typeof Icon === 'string' ? (
                        <span>{Icon}</span>
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                      {filterOption.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit Button */}
            {isAuthenticated ? (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'white'
                }}
              >
                <Plus className="h-4 w-4" />
                Share Your Experience
              </button>
            ) : (
              <div className="text-center">
                <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Want to share your experience?
                </p>
                <button
                  onClick={() => window.location.href = '/login'}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition"
                  style={{
                    backgroundColor: 'var(--primary)',
                    color: 'white'
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Login to Share
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <TestimonialsSection 
        featured={filter === 'featured'} 
        limit={filter === 'all' ? 20 : 12} 
        showTitle={false}
      />

      {/* Call to Action */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="rounded-3xl p-12 backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <Award className="h-16 w-16 mx-auto mb-6" style={{ color: 'var(--primary)' }} />
            <h2 className="text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Share Your Story
            </h2>
            <p className="text-lg mb-8" style={{ color: 'var(--text-secondary)' }}>
              Your experience can help other explorers discover amazing National Parks adventures. 
              Share how TrailVerse helped you plan your perfect trip.
            </p>
            {isAuthenticated ? (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold transition"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'white'
                }}
              >
                <Plus className="h-5 w-5" />
                Submit Your Testimonial
              </button>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={() => window.location.href = '/signup'}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold transition mr-4"
                  style={{
                    backgroundColor: 'var(--primary)',
                    color: 'white'
                  }}
                >
                  <Plus className="h-5 w-5" />
                  Join TrailVerse
                </button>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Already have an account? <button 
                    onClick={() => window.location.href = '/login'}
                    className="underline hover:no-underline"
                    style={{ color: 'var(--primary)' }}
                  >
                    Sign in here
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default TestimonialsPage;
