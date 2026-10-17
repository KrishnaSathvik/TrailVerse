'use client';

import { useCallback, useId, useMemo, useState } from 'react';
import { formatTravelMinutes, groundedPlaceType, hasUnknownRoadAccess, ROAD_ACCESS_NOTE } from '@/lib/tripPresentation';
import { presentDay } from '@/lib/dayPresentation';
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

const MARKER = {
  activity: 'left-[0.3rem] top-1 h-4 w-4 border-2 border-[var(--accent-green)] bg-[var(--surface)] text-[9px] font-bold text-[var(--accent-green-dark)]',
  flexible: 'left-[0.45rem] top-1.5 h-3 w-3 border border-dashed border-[var(--accent-green)] bg-[var(--surface)]',
  supporting: 'left-[0.55rem] top-2 h-2 w-2 bg-[var(--text-tertiary)]',
  supportingStop: 'left-[0.3rem] top-0.5 h-4 w-4 bg-[var(--text-tertiary)] text-[9px] font-semibold text-[var(--surface)]',
};

const SUPPORTING_KIND_LABEL = {
  arrival: 'Arrival',
  departure: 'Departure',
  meal: 'Meal',
  downtime: 'Downtime',
  outside_trip: 'Outside this day',
};

function ItemText({ item, compact }) {
  const lead = item.practical || item.text?.[0];
  const why = item.why || item.text?.[1];
  return <>
    {lead && <p className={`mt-1 ${compact ? 'text-[13px] leading-5' : 'text-sm leading-6'} text-[var(--text-secondary)]`}>{lead}</p>}
    {why && <p className="mt-1 text-[13px] leading-5 text-[var(--text-tertiary)]">{why}</p>}
  </>;
}

function DayItem({ item, day, dayMapModel, instanceId, flashStopId, onFocusOnMap }) {
  if (item.type === 'travel') {
    return (
      <li data-day-item="travel" className="relative mb-4 pl-8 sm:pl-9">
        <p className="text-[13px] font-medium text-[var(--text-secondary)]">
          <span aria-hidden="true" className="mr-1.5 text-[var(--text-tertiary)]">↓</span>
          {item.title}{item.title && item.travelTime ? ' · ' : ''}{item.travelTime && <span data-drive-transition="true">{item.travelTime}</span>}
        </p>
        {item.text[0] && <p className="mt-0.5 text-xs leading-5 text-[var(--text-tertiary)]">{item.text[0]}</p>}
      </li>
    );
  }
  const stop = item.stops[0];
  const stopIndex = item.stopIndexes?.[0] ?? -1;
  const mapStop = stopIndex >= 0 ? dayMapModel?.stops?.[stopIndex] : null;
  const stopKey = stop ? stop.id || mapStop?.id || `${day.dayNumber}-${stopIndex}` : null;
  const placeType = item.stops.length === 1 ? groundedPlaceType(stop) : null;
  const meta = [placeType, item.duration > 0 ? formatTravelMinutes(item.duration) : null, item.difficulty, item.exposure ? `${item.exposure} exposure` : null].filter(Boolean);
  const compact = item.type === 'supporting';
  const kindLabel = compact ? SUPPORTING_KIND_LABEL[item.kind] : null;
  return (
    <li
      id={stopKey && instanceId ? `trailie-stop-${instanceId}-${stopKey}` : undefined}
      data-day-item={item.type}
      data-stop-treatment={stop ? (item.type === 'supporting' ? 'supporting' : 'experience') : undefined}
      className={`relative pl-8 transition-colors duration-700 sm:pl-9 ${compact ? 'pb-4' : 'pb-6'}`}
      style={{ backgroundColor: stopKey && flashStopId === stopKey ? 'var(--surface-hover)' : 'transparent' }}
    >
      {/* Stop-backed items carry the same number as their map pin. */}
      <span aria-hidden="true" className={`absolute z-10 flex items-center justify-center rounded-full ${MARKER[stop && compact ? 'supportingStop' : item.type]}`}>
        {stopIndex >= 0 ? stopIndex + 1 : ''}
      </span>
      {item.showDaypart && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-green-dark)]">{item.daypart}</p>}
      {kindLabel && !item.showDaypart && (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{kindLabel}</p>
      )}
      {kindLabel && item.showDaypart && (
        <p className="mb-1 text-[11px] font-medium text-[var(--text-tertiary)]">{kindLabel}</p>
      )}
      {item.clock && <p className="text-xs font-semibold text-[var(--text-primary)]">{item.clock}{item.timingReason ? <span className="font-normal text-[var(--text-secondary)]"> · {item.timingReason}</span> : null}</p>}
      <h4 className={`${compact ? 'text-sm' : 'text-base'} font-semibold leading-snug text-[var(--text-primary)]`}>
        {item.title}
        {onFocusOnMap && mapStop?.mapped ? <MapFocusButton mapStop={mapStop} onFocusOnMap={onFocusOnMap} /> : null}
      </h4>
      {meta.length > 0 && <p className="mt-0.5 text-xs font-medium text-[var(--text-tertiary)]">{meta.join(' · ')}</p>}
      {item.stops.length > 1 && <ul className="mt-1.5 space-y-0.5 text-[13px] text-[var(--text-secondary)]">
        {item.stops.map(s => <li key={s.id}>{s.name}{s.duration ? ` · ${formatTravelMinutes(s.duration)}` : ''}</li>)}
      </ul>}
      <ItemText item={item} compact={compact} />
      <ItineraryRequirements requirements={item.requirements} compact />
      {item.alternatives?.length > 0 && <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
        <span className="font-semibold text-[var(--text-primary)]">If this doesn’t work: </span>
        {item.alternatives.map(a => (typeof a === 'string' ? a : [a?.name, a?.note].filter(Boolean).join(' — '))).filter(Boolean).join('; ')}
      </p>}
    </li>
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
  const items = presentDay(day);
  return (
    <section className="py-8 first:pt-4 last:pb-2" style={{ borderTop: index ? '1px solid var(--border)' : undefined }}>
      <ItineraryDayHeading day={day} index={index} action={mapAction} />
      {/* Day-scoped requirement: one obligation shared by this day's places. */}
      <ItineraryRequirements requirements={day.requirements} />
      <ol className="relative m-0 list-none p-0">
        <span aria-hidden="true" className="absolute bottom-6 left-[0.8rem] top-2 w-px bg-[var(--border)]" />
        {items.map(item => (
          <DayItem key={item.key} item={item} day={day} dayMapModel={dayMapModel} instanceId={instanceId} flashStopId={flashStopId} onFocusOnMap={onFocusOnMap} />
        ))}
      </ol>
      <ItineraryOvernightBase location={day.overnightLocation} />
    </section>
  );
}

export default function TrailieItinerary({ plan, variant = 'itinerary', pendingLabel = null, showMapActions = true, showTripNotes = true }) {
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
      {/* Said once per trip, never repeated under each day. */}
      {showTripNotes && days.some(hasUnknownRoadAccess) && <p className="mb-4 text-sm leading-6 text-[var(--text-secondary)]">{ROAD_ACCESS_NOTE}</p>}

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
