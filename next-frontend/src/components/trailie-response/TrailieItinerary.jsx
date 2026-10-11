'use client';

import { Fragment, useCallback, useId, useMemo, useState } from 'react';
import { verifiedTransferLabel, hasUnknownRoadAccess, ROAD_ACCESS_NOTE } from '@/lib/tripPresentation';
import { formatTime12, formatDurationMinutes } from '@/utils/sharedTripFormat';
import { canonicalDestinationDisplay } from '@/lib/tripDestination';
import { buildTripMapModel } from '@/lib/itineraryMapStops';
import { Map as MapIcon, MapPin } from '@/components/icons';
import TripMapSheet from '@/components/trip-map/TripMapSheet';
import {
  ItineraryDayHeading,
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

  const renderStop = (stop, stopIndex) => {
    const mapStop = dayMapModel?.stops?.[stopIndex];
    const stopKey = stop.id || mapStop?.id || `${day.dayNumber || index}-${stopIndex}`;
    const renderKey = `${day.dayNumber || index + 1}:${stopKey}:${stopIndex}`;
    const edge = (day.travelEdges || []).find(e => e.targetStopId === stop.id && e.sourceStopId === day.stops[stopIndex - 1]?.id);
    const transfer = verifiedTransferLabel(edge);
    return (
      <Fragment key={renderKey}>
        {transfer && <li className="mb-5 pl-8 text-sm text-[var(--text-secondary)]"><span aria-hidden="true">↓ </span><span data-drive-transition="true">{transfer}</span></li>}
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
  };

  return (
    <section className="py-8 first:pt-4 last:pb-2" style={{ borderTop: index ? '1px solid var(--border)' : undefined }}>
      <ItineraryDayHeading day={day} index={index} action={mapAction} />
      {hasUnknownRoadAccess(day) && <p className="mb-5 mt-3 text-sm leading-6 text-[var(--text-secondary)]">{ROAD_ACCESS_NOTE}</p>}
      {/* Day-scoped requirement: a shared obligation naming every stop on this
          day (e.g. one permit covering the whole district) — shown once here
          instead of repeated under each stop. */}
      <ItineraryRequirements requirements={day.requirements} />
      <ol className="m-0 list-none p-0">
        {day.dayStructure?.blocks?.length ? day.dayStructure.blocks.map((block, blockIndex) => (
          <Fragment key={`block-${blockIndex}`}>
            <li className="mb-4 pl-8 sm:pl-9" data-day-block={block.kind}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-green-dark)]">{block.periods.length > 1 ? `${block.periods[0]} → ${block.periods.at(-1)}` : block.periods[0]}</p>
              {(block.startTime || block.duration) && <p className="mt-1 text-xs font-semibold">{[formatTime12(block.startTime), block.duration ? `~${formatDurationMinutes(block.duration)}` : null].filter(Boolean).join(' · ')}</p>}
              <h4 className="mt-1 text-sm font-semibold">{block.label}</h4>
              {block.kind === 'experience' && <p className="mt-1 text-xs text-[var(--text-secondary)]">Flexible experience · not mapped</p>}
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{block.note}</p>
              {block.timingReason && <p className="mt-1 text-xs text-[var(--text-secondary)]">{block.timingReason}</p>}
            </li>
            {(block.stopIds || []).map(id => {
              const stopIndex = (day.stops || []).findIndex(stop => stop.id === id);
              return stopIndex >= 0 ? renderStop(day.stops[stopIndex], stopIndex) : null;
            })}
          </Fragment>
        )) : (day.stops || []).map(renderStop)}
        {day.dayStructure?.blocks?.length ? (day.stops || []).map((stop, i) =>
          day.dayStructure.blocks.some(block => block.stopIds?.includes(stop.id)) ? null : renderStop(stop, i)) : null}
      </ol>
      <ItineraryOvernightBase location={day.overnightLocation} />
    </section>
  );
}

export default function TrailieItinerary({ plan, variant = 'itinerary', pendingLabel = null, showMapActions = true }) {
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
      {showMapActions && mapModel.hasAnyMappedStop ? (
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
          onFocusOnMap={showMapActions && mapModel.hasAnyMappedStop ? focusStopOnMap : null}
          onOpenDayMap={showMapActions && mapModel.hasAnyMappedStop ? openDayMap : null}
        />
      ))}
      {pendingLabel ? <p className="mt-4 border-t pt-3 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }} role="status">{pendingLabel}</p> : null}

      {showMapActions && mapModel.hasAnyMappedStop ? (
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
