'use client';
import { useId, useMemo } from 'react';
import { tripBases, tripTitle } from '@/lib/tripPresentation';
import { composeRichTrip } from '@/lib/trailieRichPresentation';
import useTripImagery from '@/hooks/useTripImagery';
import AdjustTrip from './AdjustTrip';
import GuidanceList from './GuidanceList';
import DemoTripActions from '@/components/trailie-demo/DemoTripActions';
import { logItineraryOpened } from '@/utils/analytics';

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

/** Shape confirmation only — day purposes, never a second stop-by-stop itinerary. */
function DayPurposeList({ dayPurposes, updated, totalDays }) {
  return (
    <div className="min-w-0">
      {!updated && (
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
          Your {totalDays}-day trip
        </h4>
      )}
      <ol aria-label={updated ? 'Changed days' : 'Trip shape'} className={`${updated ? '' : 'mt-3'} divide-y divide-[var(--border)]`}>
        {dayPurposes.map((day) => (
          <li key={`day-purpose-${day.dayNumber}`} className="py-3 first:pt-0 last:pb-0">
            <p className="text-xs font-medium text-[var(--text-tertiary)]">Day {day.dayNumber}</p>
            <p className="mt-0.5 text-[15px] font-semibold leading-snug">
              {day.purpose || 'Open the trip for the full day plan'}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function TrailieRichTrip({
  response, refinement, onOpen, onFollowup, onRequireAccount = null, planningState = null, supplement = null, guidanceInSupplement = false,
  current = false, disabled = false, example = false, guestExhausted = false,
  showDemoActions = true,
}) {
  const plan = response?.canonicalPlan;
  const updatedTurn = refinement?.isRefinement === true;
  const imagery = useTripImagery(plan, { enabled: Boolean(plan?.days?.length) && !updatedTurn });
  const model = useMemo(() => composeRichTrip(response, refinement, { imagery }), [response, refinement, imagery]);
  const headingId = useId();
  if (!model) return null;
  const { updated, dayPurposes, images, guidance, revision } = model;
  // The narrative Things to Know section absorbs trip guidance when present.
  const supplementNode = typeof supplement === 'function' ? supplement(guidanceInSupplement ? guidance : []) : supplement;
  const title = tripTitle(plan);
  const bases = tripBases(plan);
  const flexibleCount = plan.days.reduce(
    (count, day) => count + (day.dayStructure?.blocks || []).filter(block => block.kind === 'experience').length,
    0,
  );
  // Only the latest accepted trip offers refinement; older revisions stay quiet.
  // Samples/Demo get "Make this trip yours"; a live trip is already the traveler's own.
  const adjust = !example && current && Boolean(onFollowup);
  const status = updated ? 'Trip updated' : 'Trip created';
  return (
    <section aria-label={updated ? 'Trip actions' : status} data-presentation-kind="rich_trip"
      data-blocks-rendered={[...model.blocks.filter(block => updated ? block === 'trip_artifact' && !example && onOpen : block !== 'trip_artifact' || onOpen), ...(adjust ? ['adjust_trip'] : [])].join(',')}
      className={`w-full min-w-0 text-[var(--text-primary)] ${updated ? '' : 'border-t pt-5'}`} style={{ borderColor: 'var(--border)' }}>
      {!updated && <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-green)]" {...(current ? { role: 'status' } : {})}>{status}</p>
      <h3 id={headingId} className="mt-2 text-xl font-semibold leading-tight sm:text-2xl" style={{ fontFamily: 'var(--font-display)' }}>{title}</h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {plan.days.length} {plan.days.length === 1 ? 'day' : 'days'}{!updated && bases ? <span className="break-words"> · {bases}</span> : null}
      </p>

      <ImageStrip images={images} title={title} />

      <div className="mt-6">
        <DayPurposeList dayPurposes={dayPurposes} updated={updated} totalDays={plan.days.length} />
        {flexibleCount > 0 && !updated && (
          <p className="mt-3 text-xs leading-5 text-[var(--text-tertiary)]">
            {flexibleCount} flexible {flexibleCount === 1 ? 'experience stays' : 'experiences stay'} in the day plan — not missing map content.
          </p>
        )}
      </div>
      </>}

      {supplementNode ? <div className="mt-6 space-y-5">{supplementNode}</div> : null}

      {!updated && !!guidance.length && !guidanceInSupplement && (
        <section className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border)' }} aria-label="Things to know">
          <h4 className="text-base font-semibold">Things to know</h4>
          <GuidanceList guidance={guidance} />
        </section>
      )}

      {example && showDemoActions && onOpen && <DemoTripActions key={revision} plan={plan} onOpen={onOpen} />}

      {adjust && (
        <AdjustTrip key={revision} onSubmit={onFollowup} current={current}
          disabled={disabled} guestExhausted={guestExhausted} onRequireAccount={onRequireAccount} />
      )}

      {onOpen && !example && (
        <div className="mt-6">
          <button type="button" onClick={() => { logItineraryOpened(); onOpen('itinerary'); }}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent-green)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2 sm:w-auto">
            Open trip <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </section>
  );
}
