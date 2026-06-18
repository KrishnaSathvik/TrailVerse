import React, { memo } from 'react';
import { filterParkChatImages } from '@/utils/parkChatImages';

function ParkPhotoGrid({ photos, onOpenLightbox, showViewAllCount }) {
  const usablePhotos = filterParkChatImages(photos);
  if (!usablePhotos.length) return null;

  const gridClass = usablePhotos.length === 1 ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <>
      <div className={`mt-3 grid ${gridClass} gap-1.5 rounded-xl overflow-hidden`}>
        {usablePhotos.map((img, idx) => (
          <div
            key={img.url || `park-${idx}`}
            className={`relative aspect-[4/3] overflow-hidden cursor-pointer${
              usablePhotos.length === 3 && idx === 2 ? ' col-span-2 max-h-40' : ''
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
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.target.onerror = null;
                e.target.closest('[role="button"]')?.remove();
              }}
            />
          </div>
        ))}
      </div>
      {showViewAllCount > usablePhotos.length ? (
        <button
          type="button"
          onClick={() => onOpenLightbox(0)}
          className="mt-2 text-xs font-medium transition-colors"
          style={{ color: 'var(--accent-green)' }}
        >
          View all {usablePhotos.length} photos
        </button>
      ) : null}
    </>
  );
}

export default memo(ParkPhotoGrid);
