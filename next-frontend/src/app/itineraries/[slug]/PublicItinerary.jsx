'use client';

import { useState } from 'react';
import Link from 'next/link';
import TripWorkspaceView from '@/components/itinerary/TripWorkspaceView';
import TrailieMarkdown from '@/components/trailie-response/TrailieMarkdown';

export default function PublicItinerary({ sample }) {
  const [view, setView] = useState('itinerary');
  const hero = sample.images[0];
  const capturedAt = Date.parse(sample.plan.generatedAt);
  const capturedDate = Number.isFinite(capturedAt) ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(capturedAt) : null;
  return <>
    <nav aria-label="Breadcrumb" className="public-shell min-w-0 pt-6 text-sm text-[var(--text-secondary)]">
      <Link href="/itineraries" className="inline-flex min-h-11 items-center hover:text-[var(--accent-green)]">Sample itineraries</Link>
      <span aria-hidden="true" className="mx-2">/</span>
      <span className="text-[var(--text-primary)]">{sample.title}</span>
    </nav>
    <TripWorkspaceView plan={sample.plan} title={sample.title} publicMode sampleReadingMode
      eyebrow="Planned by Trailie" view={view} onViewChange={setView}
      tabsAccessory={<button onClick={() => setView(view === 'map' ? 'itinerary' : 'map')} className="min-h-11 shrink-0 px-3 text-sm font-semibold text-[var(--accent-green)]">{view === 'map' ? 'Itinerary' : 'View map'}</button>}
      lead={<div className="mt-5 grid items-start gap-5 sm:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          {sample.tags.length > 0 && <p className="text-xs font-medium text-[var(--accent-green)]">{sample.tags.join(' · ')}</p>}
          <figure className="mt-3 max-w-[42rem] text-sm text-[var(--text-secondary)]">
            <figcaption className="py-3 font-semibold">What we asked Trailie</figcaption>
            <blockquote className="border-l-2 border-[var(--border)] pl-4 leading-6">“{sample.prompt}”</blockquote>
          </figure>
        </div>
        {hero && <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero.url} alt={hero.alt} className="h-32 w-full rounded-xl object-cover sm:h-36" />
          {hero.credit && <figcaption className="mt-1 text-[11px] text-[var(--text-tertiary)]">{hero.credit}</figcaption>}
        </figure>}
      </div>} />
    <div className="public-shell min-w-0 pb-12">
      {sample.response && <details className="mb-6 max-w-[52rem] rounded-xl border border-[var(--border)] px-5 py-1">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Trailie’s original answer</summary>
        <div className="pb-4 text-sm leading-6 text-[var(--text-secondary)]">
          {capturedDate && <p className="mb-3 text-xs text-[var(--text-tertiary)]">Recorded {capturedDate}. Conditions and availability may have changed.</p>}
          <TrailieMarkdown text={sample.response} />
        </div>
      </details>}
      <Link href="/itineraries" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent-green)]">Browse more sample itineraries →</Link>
    </div>
  </>;
}
