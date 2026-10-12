'use client';

import { useState } from 'react';
import Link from 'next/link';
import TripWorkspaceView from '@/components/itinerary/TripWorkspaceView';
import PlanYourVersion, { tripOutline } from '@/components/itinerary/PlanYourVersion';
import { getSharedDayHeading } from '@/utils/sharedTripFormat';

export default function PublicItinerary({ sample }) {
  const [view, setView] = useState('itinerary');
  const hero = sample.images[0];
  const outline = tripOutline(sample.plan, (day, i) => getSharedDayHeading(day, i).title || day.label || 'Planned day');
  return <>
    <nav aria-label="Breadcrumb" className="public-shell min-w-0 pt-6 text-sm text-[var(--text-secondary)]">
      <Link href="/itineraries" className="inline-flex min-h-11 items-center hover:text-[var(--accent-green)]">Sample itineraries</Link>
      <span aria-hidden="true" className="mx-2">/</span>
      <span className="text-[var(--text-primary)]">{sample.title}</span>
    </nav>
    <TripWorkspaceView plan={sample.plan} title={sample.title} publicMode view={view} onViewChange={setView}
      lead={<>
        {sample.tags.length > 0 && <p className="mt-1 text-sm text-[var(--text-tertiary)]">{sample.tags.join(' · ')}</p>}
        {hero && <figure className="mt-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero.url} alt={hero.alt} className="aspect-[16/7] max-h-[520px] w-full rounded-2xl object-cover" />
          {hero.credit && <figcaption className="mt-2 text-xs text-[var(--text-tertiary)]">{hero.credit}</figcaption>}
        </figure>}
        <figure className="mt-6 max-w-[var(--public-reading-width)] border-l-2 border-[var(--border)] pl-4">
          <figcaption className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Asked Trailie</figcaption>
          <blockquote className="mt-1 text-[15px] leading-6 text-[var(--text-secondary)]">“{sample.prompt}”</blockquote>
        </figure>
      </>} />
    <div className="public-shell min-w-0 pb-16">
      <div className="border-t border-[var(--border)] pt-10">
        <PlanYourVersion title={sample.title} days={sample.plan.days.length} outline={outline}
          onExplore={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
        <p className="mt-4 max-w-[52rem] text-xs leading-5 text-[var(--text-tertiary)]">This is a read-only sample planned by Trailie. Seasonal access, reservations and conditions change; confirm them for your dates.</p>
      </div>
    </div>
  </>;
}
