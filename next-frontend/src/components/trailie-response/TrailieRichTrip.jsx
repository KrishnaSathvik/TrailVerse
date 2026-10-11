'use client';
import { useId, useMemo } from 'react';
import { getSharedDayHeading } from '@/utils/sharedTripFormat';
import { tripBases, tripTitle } from '@/lib/tripPresentation';
import { composeRichTrip } from '@/lib/trailieRichPresentation';
import useTripImagery from '@/hooks/useTripImagery';
import ItineraryMapView, { ITINERARY_MAP_PATH_MODE } from '@/components/itinerary/ItineraryMapView';
import PersonalizeTrip from './PersonalizeTrip';
import DemoTripActions from '@/components/trailie-demo/DemoTripActions';

function ImageStrip({ images, title }) {
  if (!images.length) return null;
  const single = images.length === 1;
  return (
    <div className={`mt-5 grid gap-2 ${single ? '' : 'grid-cols-3'}`}>
      {images.map(image => (
        // Official NPS / existing TrailVerse imagery only; a failed load removes itself.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={image.url} src={image.url} alt={image.alt || image.title || title} loading="lazy"
          onError={event => { event.currentTarget.hidden = true; }}
          className={`w-full rounded-lg object-cover ${single ? 'aspect-[16/7]' : 'aspect-[4/3]'}`}
          style={{ backgroundColor: 'var(--surface-hover)' }} />
      ))}
    </div>
  );
}

function CompactDays({ plan, days, updated }) {
  // A focused update lists each changed stop; a broad one stays one line per day.
  const detailed = updated && days.length <= 2;
  return (
    <div className="min-w-0">
      {!updated && <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Your {plan.days.length}-day trip</h4>}
      <ol aria-label={updated ? 'Changed days' : 'Trip days'} className={`${updated ? '' : 'mt-3'} divide-y divide-[var(--border)]`}>
        {days.map((day, i) => {
          const index = plan.days.indexOf(day);
          const stops = (day.stops || []).map(s => s.name).filter(Boolean);
          const experiences = (day.dayStructure?.blocks || []).filter(block => block.kind === 'experience');
          return (
            <li key={day.id || day.dayNumber || i} className="py-3 first:pt-0 last:pb-0">
              <p className="text-xs font-medium text-[var(--text-tertiary)]">Day {day.dayNumber || index + 1}</p>
              <p className="mt-0.5 text-[15px] font-semibold leading-snug">{getSharedDayHeading(day, index).title || day.title || 'Your planned stops'}</p>
              {!!stops.length && (
                detailed
                  ? <ul className="mt-1.5 space-y-0.5 text-sm text-[var(--text-secondary)]">{stops.map((name, j) => <li key={`${name}-${j}`}>{name}</li>)}</ul>
                  : <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{stops.slice(0, 3).join(' · ')}{stops.length > 3 ? ` · +${stops.length - 3} more` : ''}</p>
              )}
              {experiences.map((block, j) => (
                <div key={`experience-${j}`} className="mt-2 text-sm text-[var(--text-secondary)]">
                  <p>{(block.periods || []).join(' → ')} · {block.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Flexible experience · not mapped</p>
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MapPreview({ map, unmappedCount, flexibleCount, title }) {
  return (
    <figure className="min-w-0">
      <div role="img" aria-label={`Map preview of ${title}: ${map.mappedCount} mapped ${map.mappedCount === 1 ? 'stop' : 'stops'}`}
        className="h-60 overflow-hidden rounded-lg border sm:h-72 lg:h-full lg:min-h-[18rem]" style={{ borderColor: 'var(--border)' }}>
        <ItineraryMapView days={map.days} pathMode={ITINERARY_MAP_PATH_MODE.NONE} preview />
      </div>
      {(unmappedCount > 0 || flexibleCount > 0) && (
        <figcaption className="mt-2 text-xs text-[var(--text-tertiary)]">
          {unmappedCount > 0 && <p>{unmappedCount} {unmappedCount === 1 ? 'stop isn’t' : 'stops aren’t'} shown on the map</p>}
          {flexibleCount > 0 && <p>{flexibleCount} {flexibleCount === 1 ? 'flexible activity isn’t' : 'flexible activities aren’t'} shown on the map</p>}
        </figcaption>
      )}
    </figure>
  );
}

export default function TrailieRichTrip({
  response, refinement, onOpen, onFollowup, onRequireAccount = null, planningState = null, supplement = null,
  current = false, disabled = false, example = false, guestExhausted = false,
  showDemoActions = true,
}) {
  const plan = response?.canonicalPlan;
  const updatedTurn = refinement?.isRefinement === true;
  const imagery = useTripImagery(plan, { enabled: Boolean(plan?.days?.length) && !updatedTurn });
  const model = useMemo(() => composeRichTrip(response, refinement, { imagery, planningState }), [response, refinement, imagery, planningState]);
  const headingId = useId();
  if (!model) return null;
  const { updated, days, images, guidance, map, unmappedCount, dimensions, revision } = model;
  const title = tripTitle(plan);
  const bases = tripBases(plan);
  const flexibleCount = plan.days.reduce((count, day) => count + (day.dayStructure?.blocks || []).filter(block => block.kind === 'experience').length, 0);
  // Only the latest accepted trip offers choices; older revisions stay quiet.
  const personalize = example ? showDemoActions && Boolean(onOpen)
    : !updated && dimensions.length > 0 && current && Boolean(onFollowup);
  const status = updated ? 'Trip updated' : 'Trip created';
  return (
    <section aria-label={status} data-presentation-kind="rich_trip"
      data-blocks-rendered={[...model.blocks.filter(b => b !== 'trip_artifact' || onOpen), ...(personalize ? ['personalize_trip'] : [])].join(',')}
      className="w-full min-w-0 border-t pt-5 text-[var(--text-primary)]" style={{ borderColor: 'var(--border)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-green)]" {...(current ? { role: 'status' } : {})}>{status}</p>
      <h3 id={headingId} className="mt-2 text-xl font-semibold leading-tight sm:text-2xl" style={{ fontFamily: 'var(--font-display)' }}>{title}</h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {plan.days.length} {plan.days.length === 1 ? 'day' : 'days'}{!updated && bases ? <span className="break-words"> · {bases}</span> : null}
      </p>

      <ImageStrip images={images} title={title} />

      <div className={`mt-6 ${map ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8' : ''}`}>
        <CompactDays plan={plan} days={days} updated={updated} />
        {map && <MapPreview map={map} unmappedCount={unmappedCount} flexibleCount={flexibleCount} title={title} />}
      </div>
      {updated && !days.length && <p className="mt-2 text-sm text-[var(--text-secondary)]">Trip preferences updated. Your day-by-day plan is unchanged.</p>}

      {supplement ? <div className="mt-6 space-y-5">{supplement}</div> : null}

      {!!guidance.length && (
        <section className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border)' }} aria-label="Things to know">
          <h4 className="text-base font-semibold">Things to know</h4>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6">
            {guidance.map(item => <li key={item.text}>{item.text} <a href={item.source} target="_blank" rel="noreferrer" className="text-[var(--text-tertiary)] underline underline-offset-2">Source</a></li>)}
          </ul>
        </section>
      )}

      {example && showDemoActions && onOpen && <DemoTripActions key={revision} plan={plan} onOpen={onOpen} />}

      {personalize && !example && (
        <PersonalizeTrip key={revision} dimensions={dimensions} onSubmit={onFollowup} current={current}
          disabled={disabled} example={example} guestExhausted={guestExhausted} onRequireAccount={onRequireAccount} />
      )}

      {onOpen && !example && (
        <div className="mt-6">
          <button type="button" onClick={() => onOpen('itinerary')}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent-green)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2 sm:w-auto">
            Open trip <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </section>
  );
}
