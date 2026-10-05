'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ItineraryMapView from '@/components/itinerary/ItineraryMapView';
import { findMapStopById } from '@/lib/itineraryMapStops';
import { formatDurationMinutes, formatTime12 } from '@/utils/sharedTripFormat';
import { X, MapPin, AlertCircle, Info } from '@/components/icons';
import { trackCustomEvent } from '@/utils/analytics';
import { getMapsRuntimeStatus, MAPS_RUNTIME_TRAVELER_MESSAGE, subscribeMapsRuntimeStatus } from '@/lib/mapsRuntimeStatus';

const PHONE_SHEET_QUERY = '(max-width: 639px)';
const PREVIEW_BOTTOM_BREATHING_PX = 24;
const DEFAULT_TRAILIE_FIT_PADDING = { top: 48, right: 56, bottom: 80, left: 24 };

const REQUIREMENT_STYLE = {
  action_required: { Icon: AlertCircle, bg: 'rgba(217,119,6,0.09)', border: 'rgba(217,119,6,0.28)', title: '#b45309', icon: '#d97706' },
  condition_check: { Icon: Info, bg: 'rgba(59,130,246,0.07)', border: 'rgba(59,130,246,0.22)', title: 'var(--text-primary)', icon: '#3b82f6' },
};

function isPhoneSheetViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(PHONE_SHEET_QUERY).matches;
}

function usePhoneMapSheet() {
  const [isPhoneSheet, setIsPhoneSheet] = useState(isPhoneSheetViewport);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(PHONE_SHEET_QUERY);
    const update = () => setIsPhoneSheet(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return isPhoneSheet;
}

function StopRequirement({ stop }) {
  const list = (stop.requirements || []).filter(
    (r) => r?.category === 'action_required' || r?.category === 'condition_check'
  );
  if (!list.length) return null;
  return (
    <div className="mt-1.5 space-y-1 sm:mt-2 sm:space-y-1.5">
      {list.map((requirement) => {
        const style = REQUIREMENT_STYLE[requirement.category] || REQUIREMENT_STYLE.condition_check;
        const { Icon } = style;
        return (
          <div
            key={requirement.id}
            className="flex min-w-0 items-start gap-1.5 rounded-lg px-1.5 py-1 sm:px-2 sm:py-1.5"
            style={{ backgroundColor: style.bg, border: `1px solid ${style.border}` }}
          >
            <Icon className="mt-0.5 h-3 w-3 shrink-0" style={{ color: style.icon }} />
            <div className="min-w-0">
              <p className="line-clamp-2 text-[11px] font-semibold leading-snug sm:line-clamp-none" style={{ color: style.title }}>
                {requirement.title}
              </p>
              {requirement.requirement ? (
                <p className="mt-0.5 hidden text-[11px] leading-relaxed sm:block" style={{ color: 'var(--text-secondary)' }}>
                  {requirement.requirement}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StopPreviewCard({ stop, dayNumber, onViewInItinerary, onClose, cardRef }) {
  if (!stop) return null;
  const time = stop.timeWindow || formatTime12(stop.startTime);
  const duration = formatDurationMinutes(stop.duration);
  const meta = [`Day ${dayNumber}`, time, duration, stop.difficulty].filter(Boolean).join(' · ');
  const note = stop.why || stop.note;

  return (
    <div
      ref={cardRef}
      data-testid="stop-preview-card"
      className="pointer-events-auto absolute bottom-2 left-2 right-14 z-10 min-w-0 max-h-[11.5rem] overflow-hidden rounded-xl px-2.5 py-2 shadow-lg sm:bottom-4 sm:left-4 sm:right-auto sm:w-80 sm:max-h-none sm:overflow-visible sm:px-3 sm:py-3"
      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            style={{ backgroundColor: 'var(--accent-green)', color: '#fff' }}
          >
            {stop.pinNumber}
          </span>
          <div className="min-w-0">
            <h4 className="break-words text-sm font-semibold leading-snug sm:truncate" style={{ color: 'var(--text-primary)' }}>
              {stop.name}
            </h4>
            {meta ? (
              <p className="mt-0.5 truncate text-[11px] font-medium" style={{ color: 'var(--accent-green-dark)' }}>
                {meta}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close stop preview"
          className="shrink-0 rounded-full p-1 transition-colors hover:bg-[var(--surface-hover)]"
        >
          <X className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
        </button>
      </div>
      {note ? (
        <p className="mt-1.5 line-clamp-2 min-w-0 text-xs leading-snug sm:mt-2 sm:line-clamp-none sm:leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {note}
        </p>
      ) : null}
      <StopRequirement stop={stop} />
      {onViewInItinerary ? (
        <button
          type="button"
          onClick={() => onViewInItinerary(stop.id)}
          className="mt-1.5 text-xs font-semibold sm:mt-2.5"
          style={{ color: 'var(--accent-green-dark)' }}
        >
          View in itinerary →
        </button>
      ) : null}
    </div>
  );
}

/**
 * The one primary trip map surface. Revealed via a "View trip map" (or
 * per-day / per-stop) affordance — never an always-on split pane.
 *
 * `mapModel` is a pure, fresh-computed view of the canonical accepted plan
 * (see itineraryMapStops.js). This component holds no plan/pin state of its
 * own beyond ephemeral UI state (active day tab, selected pin) — when the
 * plan changes (a refinement), the parent recomputes `mapModel` and this
 * component's pins update automatically because they are read straight from
 * it every render.
 */
export default function TripMapSheet({
  open,
  plan,
  mapModel,
  initialDayId = 'all',
  initialFocusStopId = null,
  onClose,
  onViewInItinerary,
}) {
  const [activeDayId, setActiveDayId] = useState(initialDayId);
  const [selectedStopId, setSelectedStopId] = useState(initialFocusStopId);
  const isPhoneSheet = usePhoneMapSheet();
  const previewRef = useRef(null);
  const [previewHeight, setPreviewHeight] = useState(0);
  const [mapsRuntime, setMapsRuntime] = useState(() => getMapsRuntimeStatus());

  // Re-seed from launch context every time the sheet opens (e.g. opened
  // again from a different day's card) — never carried over stale.
  useEffect(() => {
    if (!open) return;
    setActiveDayId(initialDayId || 'all');
    setSelectedStopId(initialFocusStopId || null);
    trackCustomEvent('trip_map_opened', {
      surface: 'plan_ai_itinerary',
      mappableCount: mapModel?.mappableCount ?? 0,
      mappedCount: mapModel?.mappedCount ?? 0,
      coveragePercent: mapModel?.coveragePercent ?? null,
      dayCount: mapModel?.days?.length ?? 0,
      initialDayId: initialDayId || 'all',
    });
    // mapModel intentionally excluded: it is a fresh object every render, and
    // this should fire once per open, not once per parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDayId, initialFocusStopId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    // Rendered via a portal (see below) so this is a real top-level overlay,
    // but it still shares the page's scroll — lock body scroll while open,
    // same pattern as PhotoLightbox.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    setMapsRuntime(getMapsRuntimeStatus());
    return subscribeMapsRuntimeStatus(setMapsRuntime);
  }, [open]);

  const { stop: selectedStop } = useMemo(
    () => findMapStopById(mapModel, selectedStopId),
    [mapModel, selectedStopId]
  );

  useLayoutEffect(() => {
    if (!selectedStop) {
      setPreviewHeight(0);
      return undefined;
    }
    const node = previewRef.current;
    if (!node) return undefined;
    const update = () => setPreviewHeight(Math.round(node.getBoundingClientRect().height));
    update();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [selectedStop]);

  const trailieFitPadding = useMemo(() => {
    if (!isPhoneSheet) return null;
    const bottom = selectedStop
      ? Math.max(DEFAULT_TRAILIE_FIT_PADDING.bottom, previewHeight + PREVIEW_BOTTOM_BREATHING_PX)
      : DEFAULT_TRAILIE_FIT_PADDING.bottom;
    return { ...DEFAULT_TRAILIE_FIT_PADDING, bottom };
  }, [isPhoneSheet, selectedStop, previewHeight]);

  const visibleMappedCount = useMemo(() => {
    const days = activeDayId === 'all'
      ? mapModel?.days || []
      : (mapModel?.days || []).filter((d) => d.id === activeDayId);
    return days.reduce((sum, d) => sum + d.mappedCount, 0);
  }, [mapModel, activeDayId]);

  if (!open) return null;

  const coverageCaption = mapModel && mapModel.mappableCount > mapModel.mappedCount
    ? `${mapModel.mappedCount} of ${mapModel.mappableCount} itinerary stops mapped`
    : null;

  // Portaled to document.body: this component mounts deep inside the chat
  // message tree, where an animated ancestor (message entrance transitions)
  // can establish its own CSS stacking context and trap a `position: fixed`
  // descendant inside it — the overlay would then render behind the site's
  // sticky nav instead of above everything, as a real top-level dialog must.
  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Trip map">
      <button
        type="button"
        className="absolute inset-0 hidden bg-black/50 sm:block"
        aria-label="Close trip map"
        onClick={onClose}
      />
      <div
        className="absolute inset-0 flex flex-col sm:inset-6 sm:rounded-2xl sm:shadow-2xl md:inset-10 lg:inset-x-20 lg:inset-y-10"
        style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}
      >
        {/* Header: title + close stay on one row; day tabs are the next row. */}
        <div
          className="flex shrink-0 flex-nowrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-4 sm:py-3"
          style={{ borderColor: 'var(--border)' }}
          data-testid="trip-map-header"
        >
          <div className="min-w-0 flex-1">
            <h2
              className="truncate text-sm font-semibold"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
            >
              Trip map{plan?.parkName ? ` · ${plan.parkName}` : ''}
            </h2>
            {coverageCaption ? (
              <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{coverageCaption}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trip map"
            data-testid="trip-map-close"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-hover)]"
          >
            <X className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b px-4 py-2" style={{ borderColor: 'var(--border)' }}>
          <DayTab label="All" active={activeDayId === 'all'} onClick={() => setActiveDayId('all')} />
          {(mapModel?.days || []).map((day) => (
            <DayTab
              key={day.id}
              label={`Day ${day.dayNumber}`}
              active={activeDayId === day.id}
              onClick={() => setActiveDayId(day.id)}
            />
          ))}
        </div>

        {/* Map area */}
        <div className="relative min-h-0 flex-1">
          <ItineraryMapView
            days={mapModel?.days || []}
            activeDayId={activeDayId}
            selectedStopId={selectedStopId}
            onMarkerClick={(stopId) => setSelectedStopId(stopId)}
            isMobile={false}
            pathMode="abstract-edges"
            fitPadding={trailieFitPadding}
            controlsPlacement={isPhoneSheet ? 'top-right' : undefined}
          />

          {mapsRuntime.ok === false ? (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
              <div
                data-testid="trip-map-runtime-unavailable"
                className="pointer-events-auto flex max-w-xs flex-col items-center gap-2 rounded-xl px-4 py-5 text-center shadow-lg"
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <AlertCircle className="h-5 w-5" style={{ color: 'var(--text-tertiary)' }} />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {mapsRuntime.travelerMessage || MAPS_RUNTIME_TRAVELER_MESSAGE}
                </p>
              </div>
            </div>
          ) : visibleMappedCount === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div
                className="pointer-events-auto flex max-w-xs flex-col items-center gap-2 rounded-xl px-4 py-5 text-center shadow-lg"
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <MapPin className="h-5 w-5" style={{ color: 'var(--text-tertiary)' }} />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  No mapped stops here yet — coordinates for these stops
                  are not confirmed, so we are not guessing at a pin.
                </p>
              </div>
            </div>
          ) : null}

          <StopPreviewCard
            stop={selectedStop}
            dayNumber={selectedStop?.dayNumber}
            onClose={() => setSelectedStopId(null)}
            onViewInItinerary={onViewInItinerary}
            cardRef={previewRef}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

function DayTab({ label, active, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40"
      style={{
        backgroundColor: active ? 'var(--accent-green)' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'var(--accent-green)' : 'var(--border)'}`,
      }}
    >
      {label}
    </button>
  );
}
