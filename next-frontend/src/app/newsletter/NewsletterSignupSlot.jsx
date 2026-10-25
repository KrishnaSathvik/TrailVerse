'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import NewsletterWidget from '@/components/blog/NewsletterWidget';
import { SUPPORT_EMAIL } from '@/lib/publicEmails';

export default function NewsletterSignupSlot() {
  const searchParams = useSearchParams();
  const subscribed = searchParams.get('subscribed') === 'true';
  const unsubscribed = searchParams.get('unsubscribed') === 'true';
  const subscribeError = searchParams.get('subscribe_error');
  const unsubscribeError = searchParams.get('unsubscribe_error');

  if (subscribed) {
    return (
      <div
        className="info-panel"
        style={{ backgroundColor: 'var(--surface)' }}
        role="status"
        aria-live="polite"
      >
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          You&apos;re in.
        </h2>
        <p className="text-sm sm:text-base mt-2" style={{ color: 'var(--text-secondary)' }}>
          Welcome to Where Next? Your subscription is confirmed. We’ll send you the newsletter when it launches.
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
      {unsubscribeError ? (
        <p className="text-sm mb-4 text-[var(--error)]" role="alert">We couldn’t complete your unsubscribe request. Try the link in your email again, or contact {SUPPORT_EMAIL}.</p>
      ) : null}
      {subscribeError ? (
        <p className="text-sm mb-4" role="alert" style={{ color: 'var(--error, #ef4444)' }}>
          {subscribeError === 'expired'
            ? 'That confirmation link has expired. Submit your email again to get a new one.'
            : subscribeError === 'server' ? 'We couldn’t confirm your subscription. Try the link again shortly.' : 'That confirmation link is invalid. Submit your email again to get a new one.'}
        </p>
      ) : null}
      <NewsletterWidget source="newsletter-page" containerClassName="where-next-signup" hideIntro />
    </div>
  );
}
