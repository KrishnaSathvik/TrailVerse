'use client';

import { useState } from 'react';
import Link from 'next/link';
import TripWorkspaceView from '@/components/itinerary/TripWorkspaceView';
import TrailieMarkdown from '@/components/trailie-response/TrailieMarkdown';
import { groundedTripGuidance } from '@/lib/trailieRichPresentation';
import { planSimilarHref } from '@/data/publicItineraries';

export default function PublicItinerary({ sample }) {
  const [view, setView] = useState('itinerary');
  const guidance = groundedTripGuidance(sample.plan);
  return <>
    <div className="public-shell min-w-0 pt-8">
      <Link href="/itineraries" className="inline-flex min-h-11 items-center text-sm text-[var(--accent-green)]">← All sample itineraries</Link>
    </div>
    <TripWorkspaceView plan={sample.plan} title={sample.title} publicMode view={view} onViewChange={setView} overview={<>
      {sample.images[0] && <figure className="mt-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sample.images[0].url} alt={sample.images[0].alt} className="aspect-[16/7] max-h-[480px] w-full rounded-xl object-cover" />
        {sample.images[0].credit && <figcaption className="mt-2 text-xs text-[var(--text-tertiary)]">{sample.images[0].credit}</figcaption>}
      </figure>}
      <p className="mt-6 text-sm text-[var(--text-secondary)]">Best for · {sample.tags.join(' · ')}</p>
      <section className="mt-6" aria-label="Trip overview">
        <h2 className="text-sm font-semibold uppercase tracking-widest">Overview</h2>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--text-secondary)]">{sample.plan.intro || sample.description}</p>
        <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {sample.plan.days.map((day, i) => <li key={day.dayNumber || i}>Day {day.dayNumber || i + 1} · {day.label}</li>)}
        </ol>
      </section>
    </>} />
    <div className="public-shell min-w-0 pb-12">
      {(guidance.length > 0 || (sample.plan.narrativeSections || []).length > 0) && <section className="public-rich max-w-3xl border-t border-[var(--border)] py-8" aria-label="Things to know">
        <h2 className="mb-4 text-2xl font-semibold">Things to know</h2>
        {guidance.map(item => <p key={item.text} className="mb-4 text-sm leading-6">{item.text} <a href={item.source} className="underline">Official guidance ↗</a></p>)}
        {(sample.plan.narrativeSections || []).map((section, i) => <div key={i} className="mb-5">
          {section.heading && section.heading.toLowerCase() !== 'things to know' && <h3 className="mb-2 text-lg font-semibold">{section.heading}</h3>}
          <TrailieMarkdown text={section.markdown} />
        </div>)}
      </section>}
      <aside className="border-t border-[var(--border)] pt-8">
        <h2 className="text-2xl font-semibold">Want your own version?</h2>
        <p className="mt-2 max-w-2xl leading-7 text-[var(--text-secondary)]">This is a read-only sample. Start a new conversation with Trailie to plan around your dates, interests, and pace.</p>
        <Link href={planSimilarHref(sample)} className="mt-5 inline-flex min-h-12 items-center rounded-full bg-[var(--accent-green)] px-6 font-semibold text-white">Plan a trip like this →</Link>
      </aside>
    </div>
  </>;
}
