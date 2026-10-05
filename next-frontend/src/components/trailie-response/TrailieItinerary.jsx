'use client';

import { Fragment, useCallback, useId, useMemo, useState } from 'react';
import { canonicalDestinationDisplay } from '@/lib/tripDestination';
import { buildTripMapModel } from '@/lib/itineraryMapStops';
import { Map as MapIcon, MapPin } from '@/components/icons';
import TripMapSheet from '@/components/trip-map/TripMapSheet';
import {
  ItineraryDayHeading,
  ItineraryDriveTransition,
  ItineraryOvernightBase,
  ItineraryRequirements,
  ItineraryStopRow,
} from '@/components/itinerary/ItineraryPresentationPrimitives';

/**
 * Two-way focus, itinerary → map direction: a small pin icon appears only on
 * stops the map can actually show (grounded, canonical-coordinate stops —
 * see itineraryMapStops.js). Tapping it opens the trip map already focused
 * on that stop's pin. Never rendered for rest/meal/flex/transit/
 * informational stops or stops missing coordinates — nothing to focus on.
 */
function MapFocusButton({ mapStop, onFocusOnMap }) {
  if (!mapStop?.mapped) return null;
  return (
    <button
      type="button"
      onClick={() => onFocusOnMap(mapStop.dayId, mapStop.id)}
      aria-label={`Show ${mapStop.name || 'this stop'} on the trip map`}
      title="View on map"
      className="ml-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full align-middle transition-colors hover:bg-[var(--surface-hover)]"
    >
      <MapPin className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
    </button>
  );
}

function DaySection({ day, index, mapModel, instanceId, flashStopId, onFocusOnMap, onOpenDayMap }) {
  const dayMapModel = mapModel?.days?.[index];
  const dayHasMappedStops = (dayMapModel?.mappedCount || 0) > 0;
  const mapAction = dayHasMappedStops && onOpenDayMap ? (
    <button
      type="button"
      onClick={() => onOpenDayMap(dayMapModel.id)}
      aria-label={`View Day ${day.dayNumber || index + 1} on the trip map`}
      title="View this day on the map"
      className="inline-flex h-11 w-11 items-center justify-center rounded-full normal-case tracking-normal transition-colors hover:bg-[var(--surface-hover)]"
    >
      <MapPin className="h-3 w-3" style={{ color: 'var(--text-tertiary)' }} />
    </button>
  ) : null;

  return (
    <section className="py-8 first:pt-4 last:pb-2" style={{ borderTop: index ? '1px solid var(--border)' : undefined }}>
      <ItineraryDayHeading day={day} index={index} action={mapAction} />
      {/* Day-scoped requirement: a shared obligation naming every stop on this
          day (e.g. one permit covering the whole district) — shown once here
          instead of repeated under each stop. */}
      <ItineraryRequirements requirements={day.requirements} />
      <ol className="m-0 list-none p-0">
        {(day.stops || []).map((stop, stopIndex) => {
          const mapStop = dayMapModel?.stops?.[stopIndex];
          const stopKey = stop.id || mapStop?.id || `${day.dayNumber || index}-${stopIndex}`;
          const renderKey = `${day.dayNumber || index + 1}:${stopKey}:${stopIndex}`;
          return (
            <Fragment key={renderKey}>
              <ItineraryDriveTransition minutes={stop.drivingTimeFromPreviousMin} />
              <ItineraryStopRow
                stop={stop}
                index={stopIndex}
                numbered
                titleAction={onFocusOnMap ? <MapFocusButton mapStop={mapStop} onFocusOnMap={onFocusOnMap} /> : null}
                domId={instanceId ? `trailie-stop-${instanceId}-${stopKey}` : null}
                flashed={flashStopId === stopKey}
              />
            </Fragment>
          );
        })}
      </ol>
      <ItineraryOvernightBase location={day.overnightLocation} />
    </section>
  );
}

export default function TrailieItinerary({ plan, variant = 'itinerary', pendingLabel = null }) {
  const instanceId = useId();
  const [mapOpen, setMapOpen] = useState(false);
  const [mapInitialDayId, setMapInitialDayId] = useState('all');
  const [mapFocusStopId, setMapFocusStopId] = useState(null);
  const [flashStopId, setFlashStopId] = useState(null);

  const days = plan?.days || [];
  // Pure, fresh-computed on every render from the canonical plan — never
  // cached alongside it, so a refinement's updated plan automatically
  // carries its own updated pins with no separate map state to go stale.
  const mapModel = useMemo(() => buildTripMapModel(plan), [plan]);
  const destination = canonicalDestinationDisplay(plan.parkName);

  const openFullMap = useCallback(() => {
    setMapInitialDayId('all');
    setMapFocusStopId(null);
    setMapOpen(true);
  }, []);

  const openDayMap = useCallback((dayId) => {
    setMapInitialDayId(dayId);
    setMapFocusStopId(null);
    setMapOpen(true);
  }, []);

  const focusStopOnMap = useCallback((dayId, stopId) => {
    setMapInitialDayId(dayId);
    setMapFocusStopId(stopId);
    setMapOpen(true);
  }, []);

  // Map → itinerary direction of the two-way focus: closes the sheet, scrolls
  // the matching stop card into view, and briefly highlights it.
  const viewStopInItinerary = useCallback((stopId) => {
    setMapOpen(false);
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      const el = document.getElementById(`trailie-stop-${instanceId}-${stopId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashStopId(stopId);
      window.setTimeout(() => setFlashStopId(null), 1800);
    });
  }, [instanceId]);

  if (!days.length) return null;

  if (variant === 'logistics') {
    const stops = days.flatMap((day) => day.stops || []);
    return (
      <section className="min-w-0" aria-label="Trip itinerary">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--accent-green-dark)' }}>
          Your priority
        </p>
        {destination ? <h2 className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{destination}</h2> : null}
        <ol className="mt-5 list-none p-0">
          {stops.map((stop, index) => <ItineraryStopRow key={stop.id || stop.name} stop={stop} numbered index={index} />)}
        </ol>
        {pendingLabel ? <p className="mt-4 border-t pt-3 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }} role="status">{pendingLabel}</p> : null}
      </section>
    );
  }

  return (
    <section className="min-w-0" aria-label="Trip itinerary">
      {/* Trip-scoped requirement: only what genuinely applies to the whole
          trip rather than one day/stop (attachTravelerRequirements falls back
          here only when a requirement has no day to resolve to). */}
      <ItineraryRequirements requirements={plan.requirements} />

      {/* One primary trip map surface, revealed on demand — not an always-on
          split pane. Hidden entirely when nothing on the plan has a
          canonical coordinate to show. */}
      {mapModel.hasAnyMappedStop ? (
        <button
          type="button"
          onClick={openFullMap}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
          style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        >
          <MapIcon className="h-3.5 w-3.5" style={{ color: 'var(--accent-green-dark)' }} />
          View trip map
        </button>
      ) : null}

      {days.map((day, index) => (
        <DaySection
          key={day.id || day.dayNumber || index}
          day={day}
          index={index}
          mapModel={mapModel}
          instanceId={instanceId}
          flashStopId={flashStopId}
          onFocusOnMap={mapModel.hasAnyMappedStop ? focusStopOnMap : null}
          onOpenDayMap={mapModel.hasAnyMappedStop ? openDayMap : null}
        />
      ))}
      {pendingLabel ? <p className="mt-4 border-t pt-3 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }} role="status">{pendingLabel}</p> : null}

      {mapModel.hasAnyMappedStop ? (
        <TripMapSheet
          open={mapOpen}
          plan={plan}
          mapModel={mapModel}
          initialDayId={mapInitialDayId}
          initialFocusStopId={mapFocusStopId}
          onClose={() => setMapOpen(false)}
          onViewInItinerary={viewStopInItinerary}
        />
      ) : null}
    </section>
  );
}
