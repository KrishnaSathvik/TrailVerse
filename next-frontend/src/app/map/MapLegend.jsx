'use client';

import {
  getCampgroundMarkerColors,
  getParkMarkerColors,
  getPlaceMarkerColors,
} from '@/lib/parkMapBasemap';

export default function MapLegend({
  isDark,
  showPlaces,
  onTogglePlaces,
  placeCount,
  showCampgrounds,
  onToggleCampgrounds,
  campgroundCount,
  compact = false,
  className = '',
}) {
  const parkColors = getParkMarkerColors(isDark);
  const placeColors = getPlaceMarkerColors(isDark);
  const campgroundColors = getCampgroundMarkerColors(isDark);

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-full border mx-auto w-fit ${className} ${
        compact ? 'px-3 py-1 text-[11px]' : 'px-4 py-1.5 text-xs'
      }`}
      style={{
        backgroundColor: compact ? 'var(--bg-secondary)' : 'color-mix(in srgb, var(--bg-secondary) 92%, transparent)',
        borderColor: 'var(--border)',
        color: 'var(--text-secondary)',
      }}
    >
      <span className="flex items-center gap-1.5">
        <span
          className={`inline-block rounded-full ${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'}`}
          style={{ backgroundColor: parkColors.nationalPark }}
        />
        National Parks
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className={`inline-block rounded-full ${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'}`}
          style={{ backgroundColor: parkColors.otherSite }}
        />
        Other NPS Sites
      </span>
      <button
        type="button"
        onClick={onTogglePlaces}
        className="flex items-center gap-1.5 transition active:opacity-80"
        style={{
          color: showPlaces ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
        aria-pressed={showPlaces}
        aria-label={showPlaces ? 'Hide What to See on map' : 'Show What to See on map'}
      >
        <span
          className={`inline-block rounded-full ${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'}`}
          style={{
            backgroundColor: placeColors.default,
            opacity: showPlaces ? 1 : 0.35,
          }}
        />
        What to See
        {typeof placeCount === 'number' && placeCount > 0 && (
          <span className="tabular-nums opacity-80">({placeCount})</span>
        )}
      </button>
      <button
        type="button"
        onClick={onToggleCampgrounds}
        className="flex items-center gap-1.5 transition active:opacity-80"
        style={{
          color: showCampgrounds ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
        aria-pressed={showCampgrounds}
        aria-label={showCampgrounds ? 'Hide campgrounds on map' : 'Show campgrounds on map'}
      >
        <span
          className={`inline-block rounded-full ${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'}`}
          style={{
            backgroundColor: campgroundColors.default,
            opacity: showCampgrounds ? 1 : 0.35,
          }}
        />
        Campgrounds
        {typeof campgroundCount === 'number' && campgroundCount > 0 && (
          <span className="tabular-nums opacity-80">({campgroundCount})</span>
        )}
      </button>
    </div>
  );
}
