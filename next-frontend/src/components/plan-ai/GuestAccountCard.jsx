'use client';

import { buildGuestLimitReset } from '@/lib/guestLimitMessage';

/**
 * Shown only after the guest allowance is spent. Copy depends on whether a
 * canonical trip actually exists — never on reply prose.
 */
export default function GuestAccountCard({ plan, onCreateAccount, onSignIn, timeUntilReset }) {
  const hasPlan = Boolean(plan?.days?.length);
  const reset = buildGuestLimitReset({ timeUntilReset });
  return (
    <section aria-labelledby="guest-continuation-title" className="public-reading border-t pt-5"
      style={{ borderColor: 'var(--border)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-green)]">
        {hasPlan ? 'Your trip is ready' : 'Keep planning with Trailie'}
      </p>
      <h2 id="guest-continuation-title" className="mt-2 break-words text-lg font-semibold leading-snug text-[var(--text-primary)] sm:text-xl">
        {hasPlan
          ? `${plan.parkName ? `${plan.parkName} · ` : ''}${plan.days.length} ${plan.days.length === 1 ? 'day' : 'days'}`
          : 'You’ve used your free messages'}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
        {hasPlan
          ? 'Create a free account or sign in to keep this conversation, open your itinerary and map, and continue planning.'
          : 'Create a free account to continue this conversation.'}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-3">
        <button type="button" onClick={onCreateAccount}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--accent-green)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2">
          Create free account
        </button>
        <button type="button" onClick={onSignIn}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2"
          style={{ borderColor: 'var(--border)' }}>
          Sign in
        </button>
      </div>
      {reset && <p className="mt-3 text-xs leading-5 text-[var(--text-tertiary)]">{reset}</p>}
    </section>
  );
}
