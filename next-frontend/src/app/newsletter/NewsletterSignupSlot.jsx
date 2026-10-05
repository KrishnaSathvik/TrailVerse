'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import NewsletterWidget from '@/components/blog/NewsletterWidget';

export default function NewsletterSignupSlot() {
  const searchParams = useSearchParams();
  const subscribed = searchParams.get('subscribed') === 'true';
  const unsubscribed = searchParams.get('unsubscribed') === 'true';
  const subscribeError = searchParams.get('subscribe_error');

  if (subscribed) {
    return (
      <div
        className="rounded-[2rem] p-6 sm:p-8"
        style={{ backgroundColor: 'var(--surface)' }}
        role="status"
        aria-live="polite"
      >
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          You&apos;re in.
        </h2>
        <p className="text-sm sm:text-base mt-2" style={{ color: 'var(--text-secondary)' }}>
          Welcome to Where Next? You&apos;ll get one place worth going each week.
        </p>
        <p className="mt-4">
          <Link
            href="/explore"
            className="font-semibold focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] rounded-sm"
            style={{ color: 'var(--accent-green)' }}
          >
            Keep exploring TrailVerse →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      {unsubscribed ? (
        <p className="text-sm mb-4" role="status" style={{ color: 'var(--text-secondary)' }}>
          You&apos;ve been unsubscribed from Where Next?.
        </p>
      ) : null}
      {subscribeError ? (
        <p className="text-sm mb-4" role="alert" style={{ color: 'var(--error, #ef4444)' }}>
          {subscribeError === 'expired'
            ? 'That confirmation link has expired. Submit your email again to get a new one.'
            : 'That confirmation link is invalid. Submit your email again to get a new one.'}
        </p>
      ) : null}
      <NewsletterWidget source="newsletter-page" />
    </div>
  );
}
