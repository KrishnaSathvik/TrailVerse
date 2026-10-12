'use client';

import { useState } from 'react';
import Link from 'next/link';
import { planSimilarHref } from '@/data/publicItineraries';

const filters = ['All', 'Weekend', '3–5 days', '7+ days', 'Fall', 'Road trips'];
export function matchesFilter(item, filter) {
  const days = item.plan.days.length;
  if (filter === 'All') return true;
  if (filter === '3–5 days') return days >= 3 && days <= 5;
  if (filter === '7+ days') return days >= 7;
  return item.tags.includes(filter);
}

export default function ItineraryCatalog({ samples }) {
  const [filter, setFilter] = useState('All');
  const visible = samples.filter(item => matchesFilter(item, filter));
  return <>
    {samples.length > 0 && <div className="my-10 flex max-w-full gap-2 overflow-x-auto pb-1 sm:flex-wrap" role="group" aria-label="Filter itineraries">
      {filters.map(label => <button key={label} aria-pressed={filter === label} onClick={() => setFilter(label)} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm ${filter === label ? 'border-[var(--accent-green)] bg-[var(--accent-green)] text-white' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>{label}</button>)}
    </div>}
    <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-14 md:grid-cols-2 xl:grid-cols-3">
      {visible.map(sample => <article key={sample.slug} className="group flex min-w-0 flex-col">
        {sample.images?.[0] && <Link href={`/itineraries/${sample.slug}`} tabIndex={-1} aria-hidden="true" className="block overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sample.images[0].url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        </Link>}
        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-[var(--accent-green)]">{sample.plan.days.length} days</p>
        <h2 className="mt-1.5 text-2xl font-semibold leading-tight tracking-tight" style={{ fontFamily: 'var(--font-display)' }}><Link href={`/itineraries/${sample.slug}`} className="hover:text-[var(--accent-green)]">{sample.title}</Link></h2>
        {sample.tags.length > 0 && <p className="mt-2 text-sm text-[var(--text-tertiary)]">{sample.tags.slice(0, 3).join(' · ')}</p>}
        <p className="mt-3 text-[15px] leading-6 text-[var(--text-secondary)]">{sample.description}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-1 pt-4 text-sm">
          <Link className="inline-flex min-h-11 items-center font-semibold text-[var(--accent-green)]" href={`/itineraries/${sample.slug}`}>View itinerary →</Link>
          <Link className="inline-flex min-h-11 items-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]" href={planSimilarHref(sample)}>Plan a similar trip</Link>
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
