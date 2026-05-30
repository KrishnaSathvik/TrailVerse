'use client';

import { ArrowRight, MapPinCheck, X } from '@components/icons';
import OptimizedImage from '@components/common/OptimizedImage';
import { htmlToPlainText } from '@/utils/htmlUtils';

function mergePlace(mapPin, details) {
  if (!details) return mapPin;
  return {
    ...details,
    parkName: mapPin?.parkName || details.parkName,
    tags: mapPin?.tags?.length ? mapPin.tags : details.tags,
  };
}

export default function PlacePreviewCard({
  place,
  placeDetails = null,
  onClose,
  onViewPark,
  compact = false,
  className = '',
}) {
  if (!place) return null;

  const p = mergePlace(place, placeDetails);
  const primaryImage = p.images?.[0];
  const description = htmlToPlainText(p.listingDescription || p.bodyText || '')?.trim();
  const displayTags = Array.isArray(p.tags) ? p.tags.slice(0, 4) : [];

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
              alt={primaryImage.altText || p.title}
              className="h-14 w-14 shrink-0 rounded-xl object-cover"
              loading="eager"
            />
          ) : (
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'rgba(124, 58, 237, 0.15)', color: '#7c3aed' }}
            >
              <MapPinCheck className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-snug">{p.title}</p>
            <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
              {p.parkName}
            </p>
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
            aria-label="Close place card"
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
            onClick={() => onViewPark(place)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition active:bg-emerald-700"
          >
            What to See
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-[32px] border shadow-[0_30px_90px_-30px_rgba(15,23,42,0.7)] backdrop-blur-xl ${className}`}
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="flex items-start justify-between px-5 pt-5">
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ backgroundColor: 'rgba(124, 58, 237, 0.15)', color: '#7c3aed' }}
        >
          <MapPinCheck className="h-3.5 w-3.5" />
          What to See
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 transition"
          style={{ color: 'var(--text-secondary)', backgroundColor: 'transparent' }}
          aria-label="Close place card"
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
            alt={primaryImage.altText || p.title}
            className="h-52 w-full rounded-[24px] object-cover"
            loading="eager"
          />
        </div>
      )}

      <div className="space-y-4 px-5 pb-5 pt-4">
        <div>
          <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{p.title}</h2>
          <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <MapPinCheck className="h-4 w-4 flex-shrink-0" />
            <span>{p.parkName}</span>
          </div>
        </div>

        {displayTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {displayTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full px-2.5 py-1 text-xs"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  color: 'var(--text-secondary)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          {description || 'Scenic stops, overlooks, and landmarks from the park What to See guide.'}
        </p>

        <button
          type="button"
          onClick={() => onViewPark(place)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          View on Park Page
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
