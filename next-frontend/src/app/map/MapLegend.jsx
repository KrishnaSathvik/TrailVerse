'use client';

import {
  getCampgroundMarkerColors,
  getParkMarkerColors,
  getPlaceMarkerColors,
} from '@/lib/parkMapBasemap';

function LegendDot({ color, compact, dimmed = false }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'}`}
      style={{ backgroundColor: color, opacity: dimmed ? 0.35 : 1 }}
    />
  );
}

function FilterChip({
  compact,
  active,
  onClick,
  ariaLabel,
  color,
  label,
  count,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border whitespace-nowrap transition',
        'active:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-green)]',
        compact ? 'min-h-8 px-2.5 py-1 text-[11px]' : 'min-h-9 px-3 py-1.5 text-xs',
      ].join(' ')}
      style={{
        borderColor: 'var(--border)',
        backgroundColor: active ? 'var(--surface-hover)' : 'var(--bg-primary)',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
      aria-pressed={active}
      aria-label={ariaLabel}
    >
      <LegendDot color={color} compact={compact} dimmed={!active} />
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className="tabular-nums opacity-80">({count})</span>
      )}
    </button>
  );
}

export default function MapLegend({
  isDark,
  showNationalParks = true,
  onToggleNationalParks,
  showOtherSites = true,
  onToggleOtherSites,
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
      className={`mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border ${className} ${
        compact ? 'px-2 py-1.5' : 'px-2.5 py-2'
      }`}
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border)',
        color: 'var(--text-secondary)',
      }}
      role="group"
      aria-label="Map filters"
    >
      <FilterChip
        compact={compact}
        active={showNationalParks}
        onClick={onToggleNationalParks}
        ariaLabel={showNationalParks ? 'Hide national parks on map' : 'Show national parks on map'}
        color={parkColors.nationalPark}
        label="National Parks"
      />
      <FilterChip
        compact={compact}
        active={showOtherSites}
        onClick={onToggleOtherSites}
        ariaLabel={showOtherSites ? 'Hide other NPS sites on map' : 'Show other NPS sites on map'}
        color={parkColors.otherSite}
        label="Other NPS Sites"
      />
      <FilterChip
        compact={compact}
        active={showPlaces}
        onClick={onTogglePlaces}
        ariaLabel={showPlaces ? 'Hide What to See on map' : 'Show What to See on map'}
        color={placeColors.default}
        label="What to See"
        count={placeCount}
      />
      <FilterChip
        compact={compact}
        active={showCampgrounds}
        onClick={onToggleCampgrounds}
        ariaLabel={showCampgrounds ? 'Hide campgrounds on map' : 'Show campgrounds on map'}
        color={campgroundColors.default}
        label="Campgrounds"
        count={campgroundCount}
      />
    </div>
  );
}
