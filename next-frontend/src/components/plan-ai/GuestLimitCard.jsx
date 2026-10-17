'use client';

import Button from '@/components/common/Button';
import TrailieAvatar from './TrailieAvatar';
import { buildGuestLimitIntro, buildGuestLimitReset } from '@/lib/guestLimitMessage';

export default function GuestLimitCard({ plan, onSignIn, timeUntilReset }) {
  const hasTrip = Boolean(plan?.days?.length);
  const [title, description] = buildGuestLimitIntro({ hasTrip }).split('\n\n');

  return (
    <>
      <section aria-label="Guest message limit" className="w-full max-w-md rounded-xl border p-4"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
        <div className="mb-3 flex items-center gap-2">
          <TrailieAvatar className="!h-7 !w-7" />
          <span className="text-sm font-semibold">Trailie</span>
        </div>
        <p className="text-sm font-semibold leading-5">{title}</p>
        <p className="mt-1 text-sm leading-5" style={{ color: 'var(--text-secondary)' }}>{description}</p>
        <Button onClick={onSignIn} variant="primary" size="sm" className="mt-3 w-full sm:w-auto">
          Sign in to continue
        </Button>
        <p className="mt-3 text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
          {buildGuestLimitReset({ timeUntilReset })}
        </p>
      </section>
    </>
  );
}
