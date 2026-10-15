'use client';
import { useMemo, useRef, useState } from 'react';
import TrailieItinerary from '@/components/trailie-response/TrailieItinerary';
import TrailieMarkdown from '@/components/trailie-response/TrailieMarkdown';
import { ItineraryRequirements } from './ItineraryPresentationPrimitives';
import ItineraryMapView, { DAY_COLORS } from './ItineraryMapView';
import { buildTripMapModel, isDrawableTransferEdge } from '@/lib/itineraryMapStops';
import { groundedPlaceType, hasUnknownRoadAccess, ROAD_ACCESS_NOTE, tripBases, tripTitle } from '@/lib/tripPresentation';
import { groundedTripGuidance } from '@/lib/trailieRichPresentation';
import { flexibleActivityCount, planHasQuietedUncertainty } from '@/lib/dayPresentation';
import { getSharedDayHeading } from '@/utils/sharedTripFormat';

/**
 * One read-only trip renderer for Demo, Samples, shared and owner trips.
 * Owner mode adds `actions` and `editor`; the itinerary itself is common.
 */
export default function TripWorkspaceView({
  plan, title, view = 'itinerary', onViewChange, actions = null, editor = null, initialDayId = 'overview',
  publicMode = false, eyebrow = null, lead = null, embedded = false, tabsAccessory = null, sampleReadingMode = false,
}) {
  const map = useMemo(() => buildTripMapModel(plan), [plan]);
  const topRef = useRef(null);
  const days = plan?.days || [];
  const dayIds = map.days.map(d => d.id);
  const [selected, setSelected] = useState(dayIds.includes(initialDayId) ? initialDayId : 'overview');
  const [mapDay, setMapDay] = useState(dayIds.includes(initialDayId) ? initialDayId : 'all');
  const tab = view === 'map' ? 'map' : selected;
  const displayTitle = publicMode && title ? title : tripTitle(plan, title);
  const bases = tripBases(plan);

  const openTab = next => {
    if (next === 'map') {
      setMapDay(dayIds.includes(selected) ? selected : 'all');
      onViewChange?.('map', dayIds.includes(selected) ? selected : 'all');
      return;
    }
    setSelected(next);
    if (view === 'map') onViewChange?.('itinerary', next);
    if (embedded) topRef.current?.scrollIntoView?.({ block: 'start' });
  };
  const dayIndex = dayIds.indexOf(tab);

  return (
    <div className={embedded ? 'min-w-0 px-4 pb-12 sm:px-8' : 'public-shell min-w-0 py-6 sm:py-10'} data-trip-workspace>
      <header ref={topRef} className={`flex flex-wrap items-start justify-between gap-4 ${embedded ? 'pt-6' : ''}`}>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-green)]">{eyebrow || (publicMode ? 'Sample itinerary' : 'Your trip')}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: 'var(--font-display)' }}>{displayTitle}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {days.length} {days.length === 1 ? 'day' : 'days'}{bases ? <span className="break-words"> · {bases}</span> : null}
          </p>
        </div>
        {!publicMode && actions}
      </header>
      {lead}
      <div className={`mt-6 flex items-center gap-2 border-b border-[var(--border)] ${embedded ? 'sticky top-0 z-20 bg-[var(--bg-primary)]' : ''}`}>
        <div role="tablist" aria-label="Trip views" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          <Tab active={tab === 'overview'} onClick={() => openTab('overview')}>Overview</Tab>
          {map.days.map(d => <Tab key={d.id} active={tab === d.id} onClick={() => openTab(d.id)}>Day {d.dayNumber}</Tab>)}
          <Tab active={tab === 'map'} onClick={() => openTab('map')}>Map</Tab>
        </div>
        {tabsAccessory}
      </div>

      {tab === 'overview' && <TripOverview sampleReadingMode={sampleReadingMode} plan={plan} map={map} title={displayTitle} onOpenDay={openTab} onOpenMap={() => openTab('map')} />}
      {dayIndex >= 0 && <div role="tabpanel" aria-label={`Day ${map.days[dayIndex].dayNumber}`}
        className={`grid gap-8 ${map.days[dayIndex].mappedCount > 0 ? 'lg:grid-cols-[minmax(0,44rem)_minmax(0,1fr)]' : ''}`}>
        <div className="min-w-0 max-w-[44rem]">
          <TrailieItinerary plan={{ ...plan, days: [days[dayIndex]] }} showMapActions={false} showTripNotes={false} />
          <nav aria-label="Other days" className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4 text-sm">
            {dayIndex > 0 ? <button className="min-h-11 font-semibold text-[var(--accent-green)]" onClick={() => openTab(dayIds[dayIndex - 1])}>← Day {map.days[dayIndex - 1].dayNumber}</button> : <button className="min-h-11 text-[var(--text-secondary)]" onClick={() => openTab('overview')}>← Overview</button>}
            {dayIndex < days.length - 1 ? <button className="min-h-11 font-semibold text-[var(--accent-green)]" onClick={() => openTab(dayIds[dayIndex + 1])}>Day {map.days[dayIndex + 1].dayNumber} →</button> : <button className="min-h-11 font-semibold text-[var(--accent-green)]" onClick={() => openTab('map')}>See the map →</button>}
          </nav>
        </div>
        {map.days[dayIndex].mappedCount > 0 && <aside aria-label="This day on the map" className="hidden min-w-0 lg:block">
          {/* A list, not another live map: each day switch would otherwise be a new billable map load. */}
          <div className="sticky top-16 mt-8 rounded-xl border border-[var(--border)] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">On the map today</p>
            <ol className="mt-3 space-y-2">
              {map.days[dayIndex].stops.filter(s => s.mapped).map(s => <li key={s.id} className="flex items-baseline gap-3 text-sm">
                <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: DAY_COLORS[dayIndex % DAY_COLORS.length] }}>{s.pinNumber}</span>
                <span className="min-w-0">{s.name}</span>
              </li>)}
            </ol>
            {days[dayIndex].overnightLocation && <p className="mt-4 border-t border-[var(--border)] pt-3 text-sm"><span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Stay</span><span className="ml-3 font-semibold">{days[dayIndex].overnightLocation}</span></p>}
            <button onClick={() => { setMapDay(dayIds[dayIndex]); onViewChange?.('map', dayIds[dayIndex]); }} className="mt-4 min-h-10 text-sm font-semibold text-[var(--accent-green)]">See Day {map.days[dayIndex].dayNumber} on the map →</button>
          </div>
        </aside>}
      </div>}
      {tab === 'map' && <TripMapPanel plan={plan} map={map} title={displayTitle} mapDay={mapDay} setMapDay={setMapDay}
        onSeeDay={id => { setSelected(id); onViewChange?.('itinerary', id); }} />}
      {!publicMode && tab !== 'map' && editor}
    </div>
  );
}

function Tab({ active, children, onClick }) {
  return <button role="tab" aria-selected={active} onClick={onClick}
    className={`min-h-12 shrink-0 border-b-2 px-3 text-sm font-semibold sm:px-4 sm:text-[15px] ${active ? 'border-[var(--accent-green)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
    {children}
  </button>;
}

/** Trip-wide planning dependencies vs grounded operational rules, each said once. */
export function TripGuidance({ plan, headingLevel = 'h2', collapsible = false, showDateReminder = false }) {
  const H = collapsible ? 'summary' : headingLevel;
  const Section = collapsible ? 'details' : 'section';
  const sections = (plan?.narrativeSections || []).filter(s => s?.markdown?.trim());
  const rules = groundedTripGuidance(plan);
  const roadNote = (plan?.days || []).some(hasUnknownRoadAccess);
  const requirements = (plan?.requirements || []).filter(Boolean);
  // Day notes no longer repeat "unconfirmed"; the trip says it once here.
  const confirmNote = showDateReminder || planHasQuietedUncertainty(plan);
  return <>
    {sections.length > 0 && <Section aria-label="Before booking" className="min-w-0">
      <H className={collapsible ? "min-h-11 cursor-pointer py-3 text-sm font-semibold" : "text-lg font-semibold"}>Before booking</H>
      <div className="mt-3 space-y-4 text-sm leading-6 text-[var(--text-secondary)]">
        {sections.map((section, i) => <div key={i}>
          {section.heading && !/^(before booking|before you book|before you go|things to know)$/i.test(section.heading) && <p className="mb-1 font-semibold text-[var(--text-primary)]">{section.heading}</p>}
          <TrailieMarkdown text={section.markdown} />
        </div>)}
      </div>
    </Section>}
    {(rules.length > 0 || roadNote || confirmNote || requirements.length > 0) && <Section aria-label="Things to know" className="min-w-0">
      <H className={collapsible ? "min-h-11 cursor-pointer py-3 text-sm font-semibold" : "text-lg font-semibold"}>Things to know</H>
      <ItineraryRequirements requirements={requirements} compact />
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--text-secondary)]">
        {rules.map(item => <li key={item.text}>{item.text} <a href={item.source} target="_blank" rel="noreferrer" className="text-[var(--text-tertiary)] underline underline-offset-2">Source</a></li>)}
        {roadNote && <li>{ROAD_ACCESS_NOTE.replace(/^Getting around: /, '')}</li>}
        {confirmNote && <li>{showDateReminder ? 'Seasonal access, reservations and conditions change; confirm them for your dates.' : 'Trail conditions, opening hours and drive times change. Confirm them for your dates before setting out.'}</li>}
      </ul>
    </Section>}
  </>;
}

function TripOverview({ plan, map, title, onOpenDay, onOpenMap, sampleReadingMode = false }) {
  // Paragraph breaks only: preserve Trailie's wording and travel assumptions.
  const sentences = plan.intro ? Array.from(new Intl.Segmenter('en', { granularity: 'sentence' }).segment(plan.intro), item => item.segment) : [];
  const overviewParagraphs = [sentences.slice(0, 2).join('').trim(), sentences.slice(2).join('').trim()].filter(Boolean);
  return (
    <div role="tabpanel" aria-label="Trip overview" className="pt-6">
      <div className={sampleReadingMode ? "max-w-[52rem]" : "grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"}>
        <div className="min-w-0">
          {plan.intro && (sampleReadingMode
            ? <section aria-label="Overview" className="max-w-[48rem] text-[15px] leading-7 text-[var(--text-secondary)]">
                <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">Overview</h2>
                <div className="space-y-3">{overviewParagraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>
              </section>
            : <p className="max-w-[var(--public-reading-width)] text-[15px] leading-7 text-[var(--text-secondary)]">{plan.intro}</p>)}
          <ol aria-label="Trip days" className={`${plan.intro ? 'mt-6' : ''} divide-y divide-[var(--border)] border-y border-[var(--border)]`}>
            {plan.days.map((day, i) => {
              const heading = getSharedDayHeading(day, i);
              return <li key={map.days[i].id}>
                <button onClick={() => onOpenDay(map.days[i].id)} className="group flex min-h-14 w-full items-baseline gap-4 py-3 text-left">
                  <span className="w-12 shrink-0 text-xs font-semibold uppercase tracking-wider text-[var(--accent-green-dark)]">{heading.badge}</span>
                  <span className="min-w-0 flex-1">
                    {sampleReadingMode && day.dayStructure?.type && <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{day.dayStructure.type.replaceAll('_', ' ')} day</span>}
                    <span className="block text-[15px] font-semibold leading-snug group-hover:text-[var(--accent-green)]">{heading.title || day.title || 'Planned day'}</span>
                    {day.dayStructure?.summary && (
                      <span className="mt-0.5 block text-sm leading-5 text-[var(--text-secondary)] line-clamp-2">{day.dayStructure.summary}</span>
                    )}
                    {day.overnightLocation && <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">Stay · {day.overnightLocation}</span>}
                  </span>
                  <span aria-hidden="true" className="text-[var(--text-tertiary)] group-hover:text-[var(--accent-green)]">→</span>
                </button>
              </li>;
            })}
          </ol>
        </div>
        {/* No map instance here: the interactive (billable) map loads only on the Map tab. */}
        {!sampleReadingMode && <aside aria-label="Trip at a glance" className={`min-w-0 self-start rounded-xl border border-[var(--border)] p-5 ${sampleReadingMode ? "order-first lg:order-last" : ""}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">At a glance</p>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-[var(--text-tertiary)]">Length</dt><dd>{plan.days.length} {plan.days.length === 1 ? 'day' : 'days'}</dd>
            {tripBases(plan) && <><dt className="text-[var(--text-tertiary)]">Stays</dt><dd className="break-words">{tripBases(plan)}</dd></>}
            <dt className="text-[var(--text-tertiary)]">Map</dt><dd>{map.mappedCount} {map.mappedCount === 1 ? 'place' : 'places'} on the map</dd>
          </dl>
          {map.hasAnyMappedStop && <button onClick={onOpenMap} aria-label={`Open the map for ${title}`} className="mt-4 min-h-10 text-sm font-semibold text-[var(--accent-green)]">Open map →</button>}
        </aside>}
      </div>
      {sampleReadingMode ? <section aria-label="Before you go" className="mt-8 border-t border-[var(--border)] pt-6">
        <h2 className="text-lg font-semibold">Before you go</h2>
        <div className="mt-4 grid gap-6 lg:grid-cols-2"><TripGuidance plan={plan} headingLevel="h3" showDateReminder /></div>
      </section> : <div className="mt-10 grid gap-8 border-t border-[var(--border)] pt-8 lg:grid-cols-2">
        <TripGuidance plan={plan} />
      </div>}
    </div>
  );
}

function TripMapPanel({ plan, map, title, mapDay, setMapDay, onSeeDay }) {
  const [selectedStop, setSelectedStop] = useState(null);
  const active = map.days.some(d => d.id === mapDay) ? mapDay : 'all';
  const visibleMapDays = map.days.filter(d => active === 'all' || d.id === active);
  const focusedDay = map.days.find(d => d.id === selectedStop?.dayId);
  const focused = focusedDay?.stops.find(s => s.id === selectedStop?.id);
  const missingStops = active === 'all' ? [] : visibleMapDays.flatMap(d => d.stops.filter(s => s.mappable && !s.mapped));
  const flexible = flexibleActivityCount({ days: plan.days.filter((_, i) => active === 'all' || map.days[i].id === active) });
  const hasConnectors = visibleMapDays.some(d => d.transferEdges.some(edge =>
    edge.sourceMapped && edge.targetMapped && isDrawableTransferEdge(edge, d.activityGroups || [])
  ));
  const focusedTransfer = focusedDay?.transferEdges.find(edge => edge.targetStopId === focused?.id &&
    !(focusedDay.activityGroups || []).some(group => group.stopIds.includes(edge.sourceStopId) && group.stopIds.includes(edge.targetStopId)));
  const pick = id => { setMapDay(id); setSelectedStop(null); };
  return (
    <section aria-label="Trip map view" className="pt-5">
      <h2 className="sr-only">Trip map · {title}</h2>
      <div className="mb-4 flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Map days">
        <Chip active={active === 'all'} onClick={() => pick('all')}>All days</Chip>
        {map.days.map(d => <Chip key={d.id} active={active === d.id} onClick={() => pick(d.id)}>Day {d.dayNumber}</Chip>)}
      </div>
      <div className="h-[60svh] min-h-[320px] max-h-[720px] overflow-hidden rounded-xl border border-[var(--border)]">
        {visibleMapDays.some(d => d.mappedCount > 0) ? <ItineraryMapView days={map.days} activeDayId={active} pathMode="abstract-edges" selectedStopId={focused?.id} selectedDayId={focusedDay?.id} onMarkerClick={(id, dayId) => setSelectedStop({ id, dayId })} /> : <p className="p-6 text-sm">No places from this day are on the map.</p>}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2" aria-label="Map day legend">
        {visibleMapDays.map(d => <span key={d.id} className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><span className="h-2 w-2 rounded-full" style={{ background: DAY_COLORS[map.days.indexOf(d) % DAY_COLORS.length] }} />Day {d.dayNumber} · {d.mappedCount} {d.mappedCount === 1 ? 'place' : 'places'}</span>)}
      </div>
      {(hasConnectors || flexible > 0) && <p className="mt-2 text-xs text-[var(--text-secondary)]">
        {hasConnectors ? 'Dashed lines connect itinerary stops. ' : ''}
        {flexible > 0
          ? `${flexible} flexible ${flexible === 1 ? 'experience stays' : 'experiences stay'} in the day plan — not missing map content.`
          : ''}
      </p>}
      {missingStops.length > 0 && <details className="mt-3 text-sm text-[var(--text-secondary)]">
        <summary className="w-fit cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2">{missingStops.length} {missingStops.length === 1 ? 'place' : 'places'} not shown on map</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">{missingStops.map(stop => <li key={stop.id}>{stop.name}</li>)}</ul>
      </details>}
      {focused && <div className="mt-4 border-t border-[var(--border)] py-4" aria-label="Selected stop">
        <p className="text-xs text-[var(--accent-green)]">Day {focused.dayNumber} · Stop {focused.pinNumber}</p>
        <h3 className="mt-1 text-lg font-semibold">{focused.name}</h3>
        {groundedPlaceType(focused) && <p className="text-sm text-[var(--text-secondary)]">{groundedPlaceType(focused)}</p>}
        {focused.note && <p className="mt-2 max-w-[50rem] text-sm leading-6 text-[var(--text-secondary)]">{focused.note}</p>}
        {focusedTransfer?.displayLabel && <p className="mt-3 text-sm text-[var(--text-secondary)]" aria-label="Transfer to this stop">{focusedTransfer.displayLabel}</p>}
        <button className="mt-3 min-h-11 text-sm font-semibold text-[var(--accent-green)]" onClick={() => onSeeDay(focused.dayId)}>See this day’s itinerary →</button>
      </div>}
    </section>
  );
}

function Chip({ active, children, onClick }) {
  return <button onClick={onClick} aria-pressed={active} className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium ${active ? 'border-[var(--accent-green)] bg-[var(--accent-green)] text-white' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>{children}</button>;
}
