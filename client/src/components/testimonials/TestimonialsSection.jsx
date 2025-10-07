import React, { useState, useEffect } from 'react';
import { Star, Quote, MapPin, Award, ChevronLeft, ChevronRight } from 'lucide-react';
import testimonialService from '../../services/testimonialService';
import { useToast } from '../../context/ToastContext';
import { handleApiError } from '../../utils/errorHandler';

const TestimonialsSection = ({ featured = false, limit = 6, showTitle = true }) => {
  const { showToast } = useToast();
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    loadTestimonials();
  }, [featured, limit]);

  const loadTestimonials = async () => {
    try {
      setLoading(true);
      const params = {
        approved: true,
        limit
      };
      
      if (featured) {
        params.featured = true;
      }

      const response = await testimonialService.getTestimonials(params);
      setTestimonials(response.data || []);
    } catch (error) {
      handleApiError(
        error,
        showToast,
        () => {
          // Fallback callback - no fake testimonials, just empty array
          setTestimonials([]);
        },
        false // Don't show toast for network errors
      );
    } finally {
      setLoading(false);
    }
  };


  const nextTestimonial = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
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

  if (loading) {
    return (
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {showTitle && (
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                What Our Community Says
              </h2>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                Real experiences from fellow National Parks explorers
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(limit)].map((_, index) => (
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
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 bg-gray-300 rounded-full"></div>
                  <div className="h-4 bg-gray-300 rounded w-24"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (testimonials.length === 0) {
    // Don't show testimonials section if there are no real testimonials
    return null;
  }

  return (
    <div className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {showTitle && (
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              What Our Community Says
            </h2>
            <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
              Real experiences from fellow National Parks explorers
            </p>
          </div>
        )}

        {/* Desktop Grid Layout */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial, _index) => (
            <div
              key={testimonial._id}
              className="rounded-2xl p-6 backdrop-blur hover:-translate-y-1 transition-all duration-300"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              {/* Quote Icon */}
              <Quote className="h-8 w-8 mb-4" style={{ color: 'var(--primary)' }} />
              
              {/* Rating */}
              <div className="mb-4">
                {renderStars(testimonial.rating)}
              </div>

              {/* Content */}
              <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                &quot;{testimonial.content}&quot;
              </p>

              {/* Author Info */}
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                  {testimonial.avatar ? (
                    <img
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-white font-semibold text-sm">
                      {testimonial.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {testimonial.name}
                  </h4>
                  {testimonial.role && (
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {testimonial.role}
                    </p>
                  )}
                  {testimonial.parkName && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" style={{ color: 'var(--text-tertiary)' }} />
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {testimonial.parkName}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Featured Badge */}
              {testimonial.featured && (
                <div className="mt-3 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs"
                  style={{
                    backgroundColor: 'var(--primary)',
                    color: 'white'
                  }}
                >
                  <Award className="h-3 w-3" />
                  Featured
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Mobile Carousel Layout */}
        <div className="md:hidden">
          <div className="relative">
            <div className="overflow-hidden rounded-2xl"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div
                className="flex transition-transform duration-300 ease-in-out"
                style={{ transform: `translateX(-${currentIndex * 100}%)` }}
              >
                {testimonials.map((testimonial) => (
                  <div key={testimonial._id} className="w-full flex-shrink-0 p-6">
                    <Quote className="h-8 w-8 mb-4" style={{ color: 'var(--primary)' }} />
                    
                    <div className="mb-4">
                      {renderStars(testimonial.rating)}
                    </div>

                    <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      &quot;{testimonial.content}&quot;
                    </p>

                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                        {testimonial.avatar ? (
                          <img
                            src={testimonial.avatar}
                            alt={testimonial.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-white font-semibold text-sm">
                            {testimonial.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                          {testimonial.name}
                        </h4>
                        {testimonial.role && (
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {testimonial.role}
                          </p>
                        )}
                        {testimonial.parkName && (
                          <div className="flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" style={{ color: 'var(--text-tertiary)' }} />
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              {testimonial.parkName}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {testimonial.featured && (
                      <div className="mt-3 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs"
                        style={{
                          backgroundColor: 'var(--primary)',
                          color: 'white'
                        }}
                      >
                        <Award className="h-3 w-3" />
                        Featured
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation Arrows */}
            {testimonials.length > 1 && (
              <>
                <button
                  onClick={prevTestimonial}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full backdrop-blur transition"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={nextTestimonial}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full backdrop-blur transition"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}

            {/* Dots Indicator */}
            {testimonials.length > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                {testimonials.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentIndex(index)}
                    className={`w-2 h-2 rounded-full transition ${
                      index === currentIndex
                        ? 'bg-forest-500'
                        : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestimonialsSection;
