'use client';

import { useState } from 'react';
import Link from 'next/link';
import { planSimilarHref } from '@/data/publicItineraries';

const filters = ['All trips', 'Weekend', '3–5 days', '7+ days', 'Fall', 'Road trips'];
export function matchesFilter(item, filter) {
  const days = item.plan.days.length;
  if (filter === 'All trips') return true;
  if (filter === '3–5 days') return days >= 3 && days <= 5;
  if (filter === '7+ days') return days >= 7;
  return item.tags.includes(filter);
}

export default function ItineraryCatalog({ samples }) {
  const [filter, setFilter] = useState('All trips');
  const visible = samples.filter(item => matchesFilter(item, filter));
  return <>
    {samples.length > 0 && <div className="my-8 flex flex-wrap gap-2" role="group" aria-label="Filter itineraries">
      {filters.map(label => <button key={label} aria-pressed={filter === label} onClick={() => setFilter(label)} className={`min-h-11 rounded-full border px-4 text-sm ${filter === label ? 'border-[var(--accent-green)] bg-[var(--accent-green)] text-white' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>{label}</button>)}
    </div>}
    <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
      {visible.map(sample => <article key={sample.slug} className="min-w-0 border-b border-[var(--border)] pb-6">
        {sample.images?.[0] && <Link href={`/itineraries/${sample.slug}`} tabIndex={-1} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sample.images[0].url} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover" />
        </Link>}
        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-[var(--accent-green)]">{sample.plan.days.length} days</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight"><Link href={`/itineraries/${sample.slug}`}>{sample.title}</Link></h2>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{sample.description}</p>
        <p className="mt-3 text-xs text-[var(--text-tertiary)]">{sample.tags.join(' · ')}</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link className="inline-flex min-h-11 items-center font-semibold text-[var(--accent-green)]" href={`/itineraries/${sample.slug}`}>View itinerary →</Link>
          <Link className="inline-flex min-h-11 items-center text-[var(--text-secondary)]" href={planSimilarHref(sample)}>Plan something similar →</Link>
        </div>
      </article>)}
    </div>
    {!visible.length && <div className="my-12 border-y border-[var(--border)] py-10">
      <p className="text-lg">{samples.length ? 'No samples match this filter yet.' : 'Our sample itinerary library is being prepared.'}</p>
      <p className="mt-2 text-[var(--text-secondary)]">{samples.length ? 'Choose another trip length or season.' : 'Each trip will be reviewed before it appears here. You can plan your own trip with Trailie now.'}</p>
      {!samples.length && <Link href="/plan-ai?entry=new-trip" className="mt-5 inline-flex min-h-11 items-center font-semibold text-[var(--accent-green)]">Plan with Trailie →</Link>}
    </div>}
  </>;
}
