'use client';
import { useMemo, useState } from 'react';
import TrailieItinerary from '@/components/trailie-response/TrailieItinerary';
import ItineraryMapView, { DAY_COLORS } from './ItineraryMapView';
import { buildTripMapModel, isDrawableTransferEdge } from '@/lib/itineraryMapStops';
import { groundedPlaceType, tripBases, tripTitle, verifiedTransferLabel } from '@/lib/tripPresentation';

export default function TripWorkspaceView({ plan, title, view = 'itinerary', onViewChange, actions = null, editor = null, initialDayId = 'all', publicMode = false, overview = null }) {
  const [selectedDay, setSelectedDay] = useState(initialDayId);
  const [selectedStop, setSelectedStop] = useState(null);
  const map = useMemo(() => buildTripMapModel(plan), [plan]);
  const days = plan?.days || [];
  const active = map.days.some(d => d.id === selectedDay) ? selectedDay : 'all';
  const visible = active === 'all' ? days : days.filter((d, i) => map.days[i].id === active);
  const unavailable = visible.some(d => (d.travelEdges || []).some(e => !verifiedTransferLabel(e)));
  const focusedDay = map.days.find(d => d.id === selectedStop?.dayId);
  const focused = focusedDay?.stops.find(s => s.id === selectedStop?.id);
  const visibleMapDays = map.days.filter(d => active === 'all' || d.id === active);
  const missingStops = active === 'all' ? [] : visibleMapDays.flatMap(d => d.stops.filter(s => s.mappable && !s.mapped));
  const hasConnectors = visibleMapDays.some(d => d.transferEdges.some(edge =>
    edge.sourceMapped && edge.targetMapped && isDrawableTransferEdge(edge, d.activityGroups || [])
  ));
  const focusedTransfer = focusedDay?.transferEdges.find(edge => edge.targetStopId === focused?.id &&
    !(focusedDay.activityGroups || []).some(group => group.stopIds.includes(edge.sourceStopId) && group.stopIds.includes(edge.targetStopId)));
  const selectDay = id => { setSelectedDay(id); setSelectedStop(null); };
  return (
    <div className="public-shell min-w-0 py-6 sm:py-10" data-trip-workspace>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-green)]">{publicMode ? 'Sample itinerary' : 'Your trip'}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{publicMode && title ? title : tripTitle(plan, title)}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{days.length}-day itinerary{tripBases(plan) ? ` · ${tripBases(plan)}` : ''}</p>
        </div>
        {!publicMode && actions}
      </header>
      {overview}
      <div role="tablist" aria-label="Trip views" className="mt-6 flex gap-6 border-b border-[var(--border)]">
        {['itinerary', 'map'].map(tab => <button key={tab} role="tab" aria-selected={view === tab} onClick={() => onViewChange?.(tab, active)} className={`min-h-12 border-b-2 px-2 text-base font-semibold ${view === tab ? 'border-[var(--accent-green)] text-[var(--accent-green)]' : 'border-transparent text-[var(--text-secondary)]'}`}>{tab === 'itinerary' ? 'Itinerary' : 'Map'}</button>)}
      </div>
      <div className="my-5 flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Trip days">
        <DayButton active={active === 'all'} onClick={() => selectDay('all')}>All</DayButton>
        {map.days.map(d => <DayButton key={d.id} active={active === d.id} onClick={() => selectDay(d.id)}>Day {d.dayNumber}</DayButton>)}
      </div>
      {view === 'itinerary' ? <div className="public-rich">
        {unavailable && <p className="mb-4 text-sm text-[var(--text-secondary)]">Some transfer times are not available yet. Allow extra time between stops.</p>}
        <TrailieItinerary plan={{ ...plan, days: visible }} showMapActions={false} />
        {!publicMode && editor}
      </div> : <section aria-label="Trip map view">
        <h2 className="mb-3 text-lg font-semibold">Trip map · {tripTitle(plan, title)}</h2>
        <div className="h-[55svh] min-h-[320px] max-h-[650px] overflow-hidden rounded-xl border border-[var(--border)] sm:h-[62vh]">
          {visibleMapDays.some(d => d.mappedCount > 0) ? <ItineraryMapView days={map.days} activeDayId={active} pathMode="abstract-edges" selectedStopId={focused?.id} selectedDayId={focusedDay?.id} onMarkerClick={(id, dayId) => setSelectedStop({ id, dayId })} /> : <p className="p-6 text-sm">No stops are shown on this map yet.</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2" aria-label="Map day legend">
          {visibleMapDays.map(d => <span key={d.id} className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><span className="h-2 w-2 rounded-full" style={{ background: DAY_COLORS[map.days.indexOf(d) % DAY_COLORS.length] }} />Day {d.dayNumber} · {d.mappedCount} {d.mappedCount === 1 ? 'stop' : 'stops'}</span>)}
        </div>
        {hasConnectors && <p className="mt-2 text-xs text-[var(--text-secondary)]">Dashed lines connect itinerary stops.</p>}
        {missingStops.length > 0 && <details className="mt-3 text-sm text-[var(--text-secondary)]">
          <summary className="w-fit cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2">{missingStops.length} {missingStops.length === 1 ? 'stop' : 'stops'} not shown on map</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">{missingStops.map(stop => <li key={stop.id}>{stop.name}</li>)}</ul>
        </details>}
        {focused && <div className="mt-4 border-t border-[var(--border)] py-4" aria-label="Selected stop">
          <p className="text-xs text-[var(--accent-green)]">Day {focused.dayNumber} · Stop {focused.pinNumber}</p>
          <h3 className="mt-1 text-lg font-semibold">{focused.name}</h3>
          {groundedPlaceType(focused) && <p className="text-sm text-[var(--text-secondary)]">{groundedPlaceType(focused)}</p>}
          <p className="mt-2 max-w-[50rem] text-sm leading-6 text-[var(--text-secondary)]">{focused.note}</p>
          {focusedTransfer && <div className="mt-3 text-sm text-[var(--text-secondary)]" aria-label="Transfer to this stop">
            <p>{focusedTransfer.displayLabel || 'Travel time unavailable'}</p>
            {focusedTransfer.displayLabel?.endsWith('by road') && <p className="mt-1 text-xs">Access mode depends on travel dates.</p>}
          </div>}
          <button className="mt-3 min-h-11 text-sm font-semibold text-[var(--accent-green)]" onClick={() => { selectDay(focused.dayId); onViewChange?.('itinerary', focused.dayId); }}>See this day’s itinerary →</button>
        </div>}
      </section>}
    </div>
  );
}
function DayButton({ active, children, onClick }) {
  return <button onClick={onClick} aria-pressed={active} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${active ? 'border-[var(--accent-green)] bg-[var(--accent-green)] text-white' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>{children}</button>;
}
