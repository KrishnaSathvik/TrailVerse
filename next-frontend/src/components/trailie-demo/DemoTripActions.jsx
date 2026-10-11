'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { PERSONALIZATION } from '@/lib/trailieRichPresentation';
import { tripTitle } from '@/lib/tripPresentation';
import { getSharedDayHeading } from '@/utils/sharedTripFormat';

// Local choices describe a new conversation. They never write to the sample.
export default function DemoTripActions({ plan, onOpen, showPreferences = true }) {
  const [selection, setSelection] = useState({});
  const groupId = useId();
  const title = tripTitle(plan);
  const days = plan.days || [];
  const itinerary = days.map((day, index) => `Day ${day.dayNumber || index + 1}: ${getSharedDayHeading(day, index).title || day.title || (day.stops || []).map(stop => stop.name).filter(Boolean).join(', ')}`).join('; ');
  const prompt = [
    `Plan me a ${days.length}-day trip like this to ${title}${selection.season ? ` for ${selection.season}` : ''}.`,
    selection.party && `I’m traveling ${selection.party}.`,
    selection.style && `I want it ${selection.style}.`,
    itinerary && `Use this sample itinerary as a starting point: ${itinerary}.`,
  ].filter(Boolean).join(' ');

  return (
    <section aria-label="Plan your version of the sample" className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
      {showPreferences && <>
        <h4 className="text-base font-semibold">Make this trip yours</h4>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Choose a few preferences or start with the sample as-is.</p>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          {PERSONALIZATION.slice(0, 3).map(dimension => (
            <fieldset key={dimension.key} className="min-w-0">
              <legend className="mb-2 text-sm font-medium">{dimension.label}</legend>
              <div className="flex flex-wrap gap-2">
                {dimension.options.map(([label, value]) => {
                  const checked = selection[dimension.key] === value;
                  return <label key={value} className="relative inline-flex min-h-11 max-w-full cursor-pointer items-center rounded-lg border px-3 py-2 text-sm transition hover:border-[var(--accent-green)] focus-within:ring-2 focus-within:ring-[var(--accent-green)]"
                    style={{ borderColor: checked ? 'var(--accent-green)' : 'var(--border)', backgroundColor: checked ? 'color-mix(in srgb, var(--accent-green) 10%, transparent)' : 'transparent', fontWeight: checked ? 600 : 400 }}>
                    <input type="radio" name={`${groupId}-${dimension.key}`} value={value} checked={checked} onChange={() => setSelection(previous => ({ ...previous, [dimension.key]: value }))} className="sr-only" />
                    {checked && <span aria-hidden="true" className="mr-1 text-[var(--accent-green)]">✓</span>}{label}
                  </label>;
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </>}
      <div className="mt-5 rounded-lg bg-[var(--surface)] p-4 sm:p-5">
        <p className="font-semibold">Ready to plan your version?</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]" aria-live="polite">
          We’ll start Trailie with this {title} trip{Object.keys(selection).length ? ' and your choices' : ''}.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href={`/plan-ai?entry=new-trip&ask=${encodeURIComponent(prompt)}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--accent-green)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2">
            Plan a trip like this <span aria-hidden="true" className="ml-2">→</span>
          </Link>
          {onOpen && <button type="button" onClick={() => onOpen('itinerary')} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm font-semibold hover:border-[var(--accent-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]">
            Open sample trip
          </button>}
        </div>
      </div>
    </section>
  );
}
