'use client';
import { tripBases, tripTitle } from '@/lib/tripPresentation';
import { logItineraryOpened } from '@/utils/analytics';

export default function TrailieTripCard({ plan, locked = false, onOpen, refinement = null }) {
  if (locked || !plan?.days?.length) return null;
  const updated = refinement?.isRefinement;
  const days = updated ? plan.days.filter((d, i) => refinement.changedDayNumbers?.includes(d.dayNumber || i + 1)) : plan.days;
  return (
    <section aria-label={updated ? 'Trip updated' : 'Trip created'} className="w-full max-w-[50rem] rounded-2xl border p-5 sm:p-6" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-green)]">{updated ? 'Trip updated' : 'Trip created'}</p>
      <h3 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{tripTitle(plan)}</h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{plan.days.length} {plan.days.length === 1 ? 'day' : 'days'}{!updated && tripBases(plan) ? ` · ${tripBases(plan)}` : ''}</p>
      <ol className="my-4 space-y-2 text-sm text-[var(--text-primary)]">
        {days.slice(0, 3).map((day, i) => <li key={day.id || day.dayNumber || i}><span className="text-[var(--text-secondary)]">Day {day.dayNumber || plan.days.indexOf(day) + 1} · </span>{day.label || 'Your planned stops'}
          {updated && <p className="mt-1 text-[var(--text-secondary)]">{(day.stops || []).map(s => s.name).join(' · ')}</p>}
        </li>)}
      </ol>
      {days.length > 3 && <p className="mb-3 text-sm text-[var(--text-secondary)]">+ {days.length - 3} more {updated ? 'updated ' : ''}days</p>}
      {updated && !days.length && <p className="my-3 text-sm text-[var(--text-secondary)]">Trip preferences updated. Your day-by-day plan is unchanged.</p>}
      <button type="button" onClick={() => { logItineraryOpened(); onOpen?.('itinerary'); }} className="inline-flex min-h-11 items-center gap-3 rounded-full bg-[var(--accent-green)] px-5 py-2.5 text-sm font-semibold text-white">Open trip <span aria-hidden="true">→</span></button>
    </section>
  );
}
