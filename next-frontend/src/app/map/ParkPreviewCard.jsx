'use client';

import { ArrowRight, MapPin, Star, X } from '@components/icons';
import OptimizedImage from '@components/common/OptimizedImage';

export default function ParkPreviewCard({
  park,
  rating,
  onClose,
  onViewDetails,
  className = '',
}) {
  if (!park) return null;

  const primaryImage = park.images?.[0];

  return (
    <div
      className={`overflow-hidden rounded-[32px] border shadow-[0_30px_90px_-30px_rgba(15,23,42,0.7)] backdrop-blur-xl ${className}`}
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--surface)',
        color: 'var(--text-primary)'
      }}
    >
      <div className="flex items-start justify-between px-5 pt-5">
        <div
          className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{
            backgroundColor: 'var(--accent-green-light)',
            color: 'var(--accent-green)'
          }}
        >
          {park.designation || 'Park'}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 transition"
          style={{
            color: 'var(--text-secondary)',
            backgroundColor: 'transparent'
          }}
          aria-label="Close park card"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {primaryImage && (
        <div className="px-5 pt-4">
          <OptimizedImage
            src={primaryImage.url}
            alt={primaryImage.altText || park.fullName}
            className="h-52 w-full rounded-[24px] object-cover"
            loading="eager"
          />
        </div>
      )}

      <div className="space-y-4 px-5 pb-5 pt-4">
        <div>
          <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{park.fullName}</h2>
          <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span>{park.states}</span>
          </div>
        </div>

        {rating?.totalReviews > 0 && (
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm"
            style={{ backgroundColor: 'var(--surface-hover)' }}
          >
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            <span className="font-semibold">{rating.averageRating.toFixed(1)}</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              ({rating.totalReviews} {rating.totalReviews === 1 ? 'review' : 'reviews'})
            </span>
          </div>
        )}

        <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          {park.description || 'Explore this park to learn more about trails, experiences, and planning details.'}
        </p>

        <button
          type="button"
          onClick={() => onViewDetails(park.parkCode)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          View Park Details
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
