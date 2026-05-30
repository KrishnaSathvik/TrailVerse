'use client';

import { ArrowRight, DollarSign, MapPin, Tent, X } from '@components/icons';
import OptimizedImage from '@components/common/OptimizedImage';
import { htmlToPlainText } from '@/utils/htmlUtils';

function mergeCampground(mapPin, details) {
  if (!details) return mapPin;
  return {
    ...details,
    parkName: mapPin?.parkName || details.parkName,
    reservationUrl: mapPin?.reservationUrl || details.reservationUrl,
  };
}

export default function CampgroundPreviewCard({
  campground,
  campgroundDetails = null,
  onClose,
  onViewPark,
  compact = false,
  className = '',
}) {
  if (!campground) return null;

  const cg = mergeCampground(campground, campgroundDetails);
  const primaryImage = cg.images?.[0];
  const description = cg.description ? htmlToPlainText(cg.description) : '';
  const nightlyFee = cg.fees?.[0]?.cost;
  const totalSites = cg.campsites?.totalSites;

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
              alt={primaryImage.altText || cg.name}
              className="h-14 w-14 shrink-0 rounded-xl object-cover"
              loading="eager"
            />
          ) : (
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', color: '#d97706' }}
            >
              <Tent className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-snug">{cg.name}</p>
            <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
              {cg.parkName}
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
            aria-label="Close campground card"
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
            onClick={() => onViewPark(campground)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition active:bg-emerald-700"
          >
            Park Camping Info
            <ArrowRight className="h-4 w-4" />
          </button>
          {cg.reservationUrl && (
            <a
              href={cg.reservationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border px-4 py-2.5 text-sm font-semibold transition active:opacity-80"
              style={{
                color: 'var(--accent-green)',
                borderColor: 'var(--border)',
                backgroundColor: 'var(--bg-tertiary)',
              }}
            >
              Reserve
            </a>
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
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="flex items-start justify-between px-5 pt-5">
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', color: '#d97706' }}
        >
          <Tent className="h-3.5 w-3.5" />
          Campground
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 transition"
          style={{ color: 'var(--text-secondary)', backgroundColor: 'transparent' }}
          aria-label="Close campground card"
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
            alt={primaryImage.altText || cg.name}
            className="h-52 w-full rounded-[24px] object-cover"
            loading="eager"
          />
        </div>
      )}

      <div className="space-y-4 px-5 pb-5 pt-4">
        <div>
          <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{cg.name}</h2>
          <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span>{cg.parkName}</span>
          </div>
        </div>

        {(totalSites || nightlyFee) && (
          <div className="flex flex-wrap gap-2">
            {totalSites && (
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--surface-hover)' }}
              >
                <Tent className="h-4 w-4" style={{ color: '#d97706' }} />
                <span className="font-semibold">{totalSites}</span>
                <span style={{ color: 'var(--text-secondary)' }}>sites</span>
              </div>
            )}
            {nightlyFee && (
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--surface-hover)' }}
              >
                <DollarSign className="h-4 w-4" style={{ color: '#d97706' }} />
                <span className="font-semibold">${nightlyFee}</span>
                <span style={{ color: 'var(--text-secondary)' }}>/night</span>
              </div>
            )}
          </div>
        )}

        <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          {description || 'View campsite details, fees, and reservation info on the park camping tab.'}
        </p>

        <button
          type="button"
          onClick={() => onViewPark(campground)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          View Camping on Park Page
          <ArrowRight className="h-4 w-4" />
        </button>

        {cg.reservationUrl && (
          <a
            href={cg.reservationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] border px-4 py-3 text-sm font-semibold transition"
            style={{
              color: 'var(--accent-green)',
              borderColor: 'color-mix(in srgb, var(--accent-green) 40%, var(--border) 60%)',
              backgroundColor: 'transparent',
            }}
          >
            Reserve on Recreation.gov
          </a>
        )}
      </div>
    </div>
  );
}
