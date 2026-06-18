import React, { memo } from 'react';

function ParkPhotoGrid({ photos, onOpenLightbox, showViewAllCount }) {
  if (!photos?.length) return null;

  const gridClass =
    photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <>
      <div className={`mt-3 grid ${gridClass} gap-1.5 rounded-xl overflow-hidden`}>
        {photos.map((img, idx) => (
          <div
            key={img.url || `park-${idx}`}
            className={`relative aspect-[4/3] overflow-hidden group/img cursor-pointer${
              photos.length === 3 && idx === 2 ? ' col-span-2 max-h-40' : ''
            }`}
            style={{ backgroundColor: 'var(--surface-hover)' }}
            onClick={() => onOpenLightbox(idx)}
            role="button"
            tabIndex={0}
            aria-label={`View photo: ${img.altText || img.title || 'Park photo'}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOpenLightbox(idx);
            }}
          >
            <img
              src={img.url}
              alt={img.altText || img.title || 'Park photo'}
              className="w-full h-full object-cover"
              loading="eager"
              decoding="async"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/og-image-trailverse.jpg';
              }}
            />
          </div>
        ))}
      </div>
      {showViewAllCount > 4 ? (
        <button
          type="button"
          onClick={() => onOpenLightbox(0)}
          className="mt-2 text-xs font-medium transition-colors"
          style={{ color: 'var(--accent-green)' }}
        >
          View all {showViewAllCount} photos
        </button>
      ) : null}
    </>
  );
}

export default memo(ParkPhotoGrid);
