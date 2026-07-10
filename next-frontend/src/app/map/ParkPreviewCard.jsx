'use client';

import { ArrowRight, MapPin, Star, X } from '@components/icons';
import OptimizedImage from '@components/common/OptimizedImage';
import { htmlToPlainText } from '@/utils/htmlUtils';

export default function ParkPreviewCard({
  park,
  rating,
  onClose,
  onViewDetails,
  onCompare,
  compact = false,
  className = '',
}) {
  if (!park) return null;

  const primaryImage = park.images?.[0];
  const descriptionText = park.description
    ? htmlToPlainText(park.description).slice(0, 220)
    : '';

  if (compact) {
    return (
      <div
        className={`border-t shadow-[0_-10px_40px_-8px_rgba(0,0,0,0.28)] ${className}`}
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
        }}
      >
        <div className="flex items-center gap-3 px-4 pb-3 pt-3">
          {primaryImage ? (
            <OptimizedImage
              src={primaryImage.url}
              alt={primaryImage.altText || park.fullName}
              className="h-14 w-14 shrink-0 rounded-xl object-cover"
              loading="eager"
            />
          ) : (
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'var(--accent-green-light)', color: 'var(--accent-green)' }}
            >
              <MapPin className="h-5 w-5" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-snug">{park.fullName}</p>
            <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
              {park.states}
              {park.designation ? ` · ${park.designation}` : ''}
            </p>
            {rating?.totalReviews > 0 && (
              <div className="mt-1 inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                <Star className="h-3 w-3 text-yellow-400" weight="fill" />
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {rating.averageRating.toFixed(1)}
                </span>
                <span>({rating.totalReviews})</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border active:scale-95"
            style={{
              color: 'var(--text-primary)',
              borderColor: 'var(--border)',
              backgroundColor: 'var(--bg-tertiary)',
            }}
            aria-label="Close park card"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="flex gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={() => onViewDetails(park.parkCode)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition active:bg-emerald-700"
          >
            View Details
            <ArrowRight className="h-4 w-4" />
          </button>
          {onCompare && (
            <button
              type="button"
              onClick={() => onCompare(park.parkCode)}
              className="rounded-xl border px-4 py-2.5 text-sm font-semibold transition active:opacity-80"
              style={{
                color: 'var(--accent-green)',
                borderColor: 'var(--border)',
                backgroundColor: 'var(--bg-tertiary)',
              }}
            >
              Compare
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-[32px] border shadow-[0_30px_90px_-30px_rgba(15,23,42,0.7)] backdrop-blur-xl ${className}`}
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--surface)',
        color: 'var(--text-primary)',
      }}
    >
      <div
        className="sticky top-0 z-10 flex items-start justify-between px-5 pt-5 pb-2"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        <div
          className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{
            backgroundColor: 'var(--accent-green-light)',
            color: 'var(--accent-green)',
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
            backgroundColor: 'transparent',
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
            <Star className="h-4 w-4 text-yellow-400" weight="fill" />
            <span className="font-semibold">{rating.averageRating.toFixed(1)}</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              ({rating.totalReviews} {rating.totalReviews === 1 ? 'review' : 'reviews'})
            </span>
          </div>
        )}

        <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          {descriptionText || 'Explore this park to learn more about trails, experiences, and planning details.'}
        </p>

        <button
          type="button"
          onClick={() => onViewDetails(park.parkCode)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          View Park Details
          <ArrowRight className="h-4 w-4" />
        </button>

        {onCompare && (
          <button
            type="button"
            onClick={() => onCompare(park.parkCode)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] px-4 py-3 text-sm font-semibold transition border"
            style={{
              color: 'var(--accent-green)',
              borderColor: 'color-mix(in srgb, var(--accent-green) 40%, var(--border) 60%)',
              backgroundColor: 'transparent',
            }}
          >
            Compare Park
          </button>
        )}
      </div>
    </div>
  );
}
