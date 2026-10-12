'use client';
import { useRef, useState } from 'react';
import { acceptedPersonalization } from '@/lib/trailieRichPresentation';

// Live Plan AI: the trip is already the traveler's own, so refinement stays
// conversational. Each suggestion is one normal, visible user turn.
export const ADJUST_SUGGESTIONS = Object.freeze([
  ['Make it more relaxed', 'Make this trip more relaxed.'],
  ['Add more photography', 'Add more photography time to this trip.'],
  ['Reduce hiking', 'Reduce the hiking on this trip.'],
]);

/** Success is claimed only for a persisted, accepted refinement. Never writes trip state itself. */
export default function AdjustTrip({ onSubmit, current = false, disabled = false, guestExhausted = false, onRequireAccount = null }) {
  const [status, setStatus] = useState('idle');
  const submitting = useRef(false);
  const locked = !current || status === 'submitting' || status === 'success';
  const blocked = locked || (disabled && !guestExhausted);
  async function send(message) {
    if (blocked || submitting.current) return;
    // Out of guest messages: never submit silently, continue through sign-in.
    if (guestExhausted) { onRequireAccount?.(); return; }
    if (!onSubmit) return;
    submitting.current = true;
    setStatus('submitting');
    try {
      const result = await onSubmit(message);
      setStatus(acceptedPersonalization(result) ? 'success' : 'failure');
    } catch { setStatus('failure'); }
    finally { submitting.current = false; }
  }
  const statusText = status === 'submitting' ? 'Updating your trip…'
    : status === 'success' ? 'Trip updated'
      : status === 'failure' ? 'Couldn’t update the trip. Your saved trip is unchanged.'
        : '';
  return (
    <section aria-label="Adjust your trip" data-adjust-state={status} className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
      <h4 className="text-base font-semibold">Want to adjust anything?</h4>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Pick a suggestion or tell Trailie what to change below.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ADJUST_SUGGESTIONS.map(([label, message]) => (
          <button key={label} type="button" disabled={blocked} onClick={() => send(message)}
            className="inline-flex min-h-10 items-center rounded-full border border-[var(--border)] px-4 text-sm transition hover:border-[var(--accent-green)] disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]">
            {label}
          </button>
        ))}
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm text-[var(--text-secondary)]">{statusText}</p>
    </section>
  );
}
