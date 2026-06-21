"use client";

import React, { useState, useEffect } from 'react';
import { Star, ChevronLeft, ChevronRight } from '@components/icons';
import testimonialService from '../../services/testimonialService';
import { useToast } from '../../context/ToastContext';
import { handleApiError } from '../../utils/errorHandler';
import {
  TESTIMONIALS_SECTION_TITLE,
  TESTIMONIALS_SECTION_SUBTITLE
} from './testimonialsCopy';
import { LANDING_SECTION, LANDING_SECTION_HEADER_MB } from '@/lib/landingLayout';
import TestimonialBadge from './TestimonialBadge';

function TestimonialAttribution({ testimonial }) {
  if (testimonial.sourceUrl) {
    return (
      <a
        href={testimonial.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium underline-offset-2 hover:underline"
        style={{ color: 'var(--primary)' }}
      >
        {testimonial.sourceLabel || 'Read article'}
      </a>
    );
  }

  if (testimonial.role && testimonial.role !== 'Park Explorer') {
    return (
      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {testimonial.role}
      </p>
    );
  }

  return null;
}

function TestimonialCard({ testimonial, renderStars, className = '' }) {
  return (
    <div
      className={`flex h-full flex-col rounded-2xl p-5 sm:p-6 backdrop-blur ${className}`}
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
      }}
    >
      <div className="mb-4 shrink-0">{renderStars(testimonial.rating)}</div>

      <p
        className="mb-5 flex-1 text-sm sm:text-[0.9375rem] leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        &quot;{testimonial.content}&quot;
      </p>

      <div className="mt-auto shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-400 to-purple-500">
            {testimonial.avatar ? (
              <img
                src={testimonial.avatar}
                alt={testimonial.name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="text-sm font-semibold text-white">
                {testimonial.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {testimonial.name}
            </h4>
            <TestimonialAttribution testimonial={testimonial} />
          </div>
        </div>

        <TestimonialBadge testimonial={testimonial} />
      </div>
    </div>
  );
}

function TestimonialSlide({ testimonial, renderStars }) {
  return (
    <div className="min-w-full flex-[0_0_100%]">
      <TestimonialCard
        testimonial={testimonial}
        renderStars={renderStars}
        className="w-full"
      />
    </div>
  );
}

function TestimonialCarouselNav({ count, currentIndex, onPrev, onNext, onSelect, prevLabel = 'Previous', nextLabel = 'Next', dotLabel = (index) => `Go to slide ${index + 1}` }) {
  if (count <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-center gap-4 sm:mt-6">
      <button
        type="button"
        onClick={onPrev}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full backdrop-blur transition"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
        aria-label={prevLabel}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2">
        {Array.from({ length: count }, (_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            className={`h-2 rounded-full transition ${
              index === currentIndex ? 'w-6' : 'w-2'
            }`}
            style={{
              backgroundColor:
                index === currentIndex ? 'var(--accent-green)' : 'var(--border)',
            }}
            aria-label={dotLabel(index)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onNext}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full backdrop-blur transition"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
        aria-label={nextLabel}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

const DESKTOP_BATCH_SIZE = 3;

const TestimonialsSection = ({
  featured = false,
  limit = 6,
  showTitle = true,
  refreshTrigger = 0,
  searchTerm = '',
  showEmptyMessage = false,
  initialTestimonials,
}) => {
  const { showToast } = useToast();
  const hasServerData = initialTestimonials !== undefined;
  const [testimonials, setTestimonials] = useState(initialTestimonials ?? []);
  const [loading, setLoading] = useState(!hasServerData);
  const [mobileIndex, setMobileIndex] = useState(0);
  const [desktopPage, setDesktopPage] = useState(0);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleTestimonials = normalizedSearch
    ? testimonials.filter((t) => {
        const haystack = [t.name, t.role, t.content, t.parkName, t.parkCode]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : testimonials;

  useEffect(() => {
    if (initialTestimonials !== undefined) {
      setTestimonials(initialTestimonials);
      setLoading(false);
    }
  }, [initialTestimonials]);

  useEffect(() => {
    if (hasServerData) return;
    loadTestimonials();
  }, [featured, limit, refreshTrigger, hasServerData]);

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


  useEffect(() => {
    setMobileIndex(0);
    setDesktopPage(0);
  }, [normalizedSearch, testimonials.length]);

  const desktopPageCount = Math.ceil(visibleTestimonials.length / DESKTOP_BATCH_SIZE);
  const desktopBatch = visibleTestimonials.slice(
    desktopPage * DESKTOP_BATCH_SIZE,
    desktopPage * DESKTOP_BATCH_SIZE + DESKTOP_BATCH_SIZE
  );
  const useMobileStack = visibleTestimonials.length <= 3;

  const nextMobile = () => {
    setMobileIndex((prev) => (prev + 1) % visibleTestimonials.length);
  };

  const prevMobile = () => {
    setMobileIndex((prev) => (prev - 1 + visibleTestimonials.length) % visibleTestimonials.length);
  };

  const nextDesktopPage = () => {
    setDesktopPage((prev) => (prev + 1) % desktopPageCount);
  };

  const prevDesktopPage = () => {
    setDesktopPage((prev) => (prev - 1 + desktopPageCount) % desktopPageCount);
  };

  const renderStars = (rating) => {
    const value = Number(rating) || 0;
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            weight={star <= value ? 'fill' : 'regular'}
            className={`h-4 w-4 ${
              star <= value ? 'text-yellow-400' : 'text-gray-300'
            }`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={LANDING_SECTION}>
        <div className="max-w-[92rem] mx-auto">
          {showTitle && (
            <div className={`text-center ${LANDING_SECTION_HEADER_MB}`}>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                {TESTIMONIALS_SECTION_TITLE}
              </h2>
              <p className="text-base sm:text-lg max-w-2xl mx-auto px-1" style={{ color: 'var(--text-secondary)' }}>
                {TESTIMONIALS_SECTION_SUBTITLE}
              </p>
            </div>
          )}
          <div className="hidden md:grid md:grid-cols-3 gap-8">
            {[...Array(DESKTOP_BATCH_SIZE)].map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="mb-4 h-4 w-24 rounded bg-gray-300" />
                <div className="mb-4 h-4 rounded bg-gray-300" />
                <div className="mb-4 h-4 rounded bg-gray-300" />
                <div className="mb-6 h-4 w-3/4 rounded bg-gray-300" />
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-gray-300" />
                  <div className="h-4 w-24 rounded bg-gray-300" />
                </div>
              </div>
            ))}
          </div>
          <div className="md:hidden flex flex-col gap-4">
            <div
              className="animate-pulse rounded-2xl p-5 sm:p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
              }}
            >
              <div className="mb-4 h-4 w-24 rounded bg-gray-300" />
              <div className="mb-4 h-4 rounded bg-gray-300" />
              <div className="mb-4 h-4 rounded bg-gray-300" />
              <div className="mb-6 h-4 w-3/4 rounded bg-gray-300" />
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-gray-300" />
                <div className="h-4 w-24 rounded bg-gray-300" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (testimonials.length === 0) {
    if (!showEmptyMessage) {
      return null;
    }
    return (
      <div className="py-8">
        <div className="max-w-[92rem] mx-auto">
          <p className="text-center text-base" style={{ color: 'var(--text-secondary)' }}>
            No published testimonials yet. Be the first to share your experience below.
          </p>
        </div>
      </div>
    );
  }

  if (visibleTestimonials.length === 0) {
    return (
      <div className="py-8">
        <div className="max-w-[92rem] mx-auto">
          <p className="text-center text-base" style={{ color: 'var(--text-secondary)' }}>
            No testimonials match your search.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={LANDING_SECTION} id="testimonials">
      <div className="max-w-[92rem] mx-auto">
        {showTitle && (
          <div className={`text-center ${LANDING_SECTION_HEADER_MB}`}>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              {TESTIMONIALS_SECTION_TITLE}
            </h2>
            <p className="text-base sm:text-lg max-w-2xl mx-auto px-1" style={{ color: 'var(--text-secondary)' }}>
              {TESTIMONIALS_SECTION_SUBTITLE}
            </p>
          </div>
        )}

        {/* Desktop — 3-card grid; carousel when more than 3 */}
        <div className="hidden md:block">
          <div className="grid grid-cols-3 items-stretch gap-8">
            {desktopBatch.map((testimonial) => (
              <TestimonialCard
                key={testimonial._id}
                testimonial={testimonial}
                renderStars={renderStars}
                className="h-full"
              />
            ))}
          </div>

          <TestimonialCarouselNav
            count={desktopPageCount}
            currentIndex={desktopPage}
            onPrev={prevDesktopPage}
            onNext={nextDesktopPage}
            onSelect={setDesktopPage}
            prevLabel="Previous testimonials"
            nextLabel="Next testimonials"
            dotLabel={(index) => `Go to testimonial page ${index + 1}`}
          />
        </div>

        {/* Mobile — stack up to 3; carousel when more */}
        <div className="md:hidden">
          {useMobileStack ? (
            <div className="flex flex-col gap-4">
              {visibleTestimonials.map((testimonial) => (
                <TestimonialCard
                  key={testimonial._id}
                  testimonial={testimonial}
                  renderStars={renderStars}
                />
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-hidden w-full">
                <div
                  className="flex w-full transition-transform duration-300 ease-in-out"
                  style={{ transform: `translateX(-${mobileIndex * 100}%)` }}
                >
                  {visibleTestimonials.map((testimonial) => (
                    <TestimonialSlide
                      key={testimonial._id}
                      testimonial={testimonial}
                      renderStars={renderStars}
                    />
                  ))}
                </div>
              </div>

              <TestimonialCarouselNav
                count={visibleTestimonials.length}
                currentIndex={mobileIndex}
                onPrev={prevMobile}
                onNext={nextMobile}
                onSelect={setMobileIndex}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestimonialsSection;
