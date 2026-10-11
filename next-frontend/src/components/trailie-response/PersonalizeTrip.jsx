'use client';
import { useRef, useState } from 'react';
import { acceptedPersonalization, personalizationMessage } from '@/lib/trailieRichPresentation';

/**
 * Choices become one normal, visible user turn; this form never writes trip
 * or traveler state. Success is claimed only for a persisted, accepted refinement.
 */
export default function PersonalizeTrip({ dimensions, onSubmit, current = false, disabled = false, example = false, guestExhausted = false, onRequireAccount = null }) {
  const [selection, setSelection] = useState({});
  const [status, setStatus] = useState('idle');
  const submitting = useRef(false);
  const message = personalizationMessage(selection);
  const locked = example || !current || status === 'submitting' || status === 'success';
  const blocked = locked || (disabled && !guestExhausted);
  async function submit(event) {
    event.preventDefault();
    if (blocked || submitting.current || !message) return;
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
    <form data-personalization-state={status} onSubmit={submit} aria-label="Make this trip yours" className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
      <h4 className="text-base font-semibold">Make this trip yours</h4>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {example ? 'Example choices. Start your own chat to customize a trip.' : 'Pick what fits and Trailie will adjust the plan.'}
      </p>
      {dimensions.map(dimension => (
        <fieldset key={dimension.key} disabled={blocked} className="mt-4 min-w-0">
          <legend className="mb-2 text-sm font-medium">{dimension.label}</legend>
          <div className="flex flex-wrap gap-2">
            {dimension.options.map(([label, value]) => {
              const checked = selection[dimension.key] === value;
              return (
                <label key={value} className={`relative inline-flex min-h-11 max-w-full items-center rounded-lg border px-4 py-2 text-sm transition focus-within:ring-2 focus-within:ring-[var(--accent-green)] focus-within:ring-offset-1 ${blocked ? 'cursor-default opacity-60' : 'cursor-pointer hover:border-[var(--accent-green)]'}`}
                  style={{ borderColor: checked ? 'var(--accent-green)' : 'var(--border)', backgroundColor: checked ? 'color-mix(in srgb, var(--accent-green) 10%, transparent)' : 'transparent', fontWeight: checked ? 600 : 400 }}>
                  <input type="radio" name={dimension.key} value={value} checked={checked}
                    onChange={() => { setSelection(s => ({ ...s, [dimension.key]: value })); setStatus('selected'); }}
                    className="sr-only" />
                  {checked && <span aria-hidden="true" className="mr-1.5 text-[var(--accent-green)]">✓</span>}{label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      {!example && (
        <button type="submit" disabled={blocked || !message}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg border px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2 sm:w-auto"
          style={{ borderColor: 'var(--accent-green)', color: 'var(--accent-green-dark, var(--accent-green))' }}>
          {status === 'submitting' ? 'Updating your trip…' : guestExhausted ? 'Sign in to customize →' : 'Customize my trip →'}
        </button>
      )}
      <p role="status" className="mt-2 min-h-5 text-sm text-[var(--text-secondary)]">
        {status === 'submitting' ? '' : statusText}
      </p>
    </form>
  );
}
