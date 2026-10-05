'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Lock, X } from '@/components/icons';
import Button from '@/components/common/Button';
import { buildTripMapModel } from '@/lib/itineraryMapStops';

export default function TrailieTripCard({ plan, locked = false, onOpen }) {
  const [surface, setSurface] = useState(null);
  const dialog = useRef(null);
  const titleId = useId();
  const map = useMemo(() => buildTripMapModel(plan), [plan]);
  useEffect(() => {
    if (surface) dialog.current?.showModal();
    else dialog.current?.close();
  }, [surface]);
  if (!plan?.days?.length) return null;
  const days = plan.days.length;
  const open = target => locked ? setSurface(target) : onOpen(target);
  return (
    <>
      <section aria-label="Trip ready" className="max-w-lg rounded-xl border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {plan.parkName ? `${days}-day ${plan.parkName} trip ready` : `${days}-day trip ready`}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{days} {days === 1 ? 'day' : 'days'}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => open('itinerary')}>View itinerary</Button>
          {map.hasAnyMappedStop && <Button variant="secondary" size="sm" onClick={() => open('map')}>View map</Button>}
        </div>
        {locked && <p className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <Lock aria-hidden="true" className="h-3 w-3" /> Sign in free to open your itinerary and map
        </p>}
      </section>
      {locked && <dialog ref={dialog} onCancel={() => setSurface(null)} onClose={() => setSurface(null)}
        aria-labelledby={titleId} className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border p-5 backdrop:bg-black/40"
        style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}>
        <button type="button" aria-label="Close sign-in prompt" onClick={() => setSurface(null)} className="absolute right-3 top-3 rounded p-2"><X className="h-4 w-4" /></button>
        <h2 id={titleId} className="pr-8 text-lg font-semibold">Your trip is ready</h2>
        <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>Sign in free to view your full itinerary, map, and keep planning.</p>
        <Button className="mt-4" size="sm" onClick={() => onOpen(surface)}>Sign in to view {surface}</Button>
      </dialog>}
    </>
  );
}
