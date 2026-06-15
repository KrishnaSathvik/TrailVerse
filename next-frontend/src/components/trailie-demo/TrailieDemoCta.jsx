'use client';

import Link from 'next/link';
import { ArrowRight } from '@components/icons';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';

const DEMO_CTA = {
  title: 'Plan your own trip',
  body: 'Ask Trailie anything — add follow-ups, save your itinerary, or chat by voice. Share your dates and where you’re starting from so the advice fits your trip.',
  accountNote: 'Guests get 5 free messages. Sign up to save trips and download a PDF.',
  button: 'Open Trailie',
};

export default function TrailieDemoCta({ className = '' }) {
  return (
    <div className={className}>
      <div
        className="rounded-2xl p-4 sm:p-6 text-left"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
        }}
      >
        <div className="mb-4 flex items-start gap-3 sm:gap-4">
          <TrailieAvatar className="!h-10 !w-10 sm:!h-11 sm:!w-11 shrink-0" />
          <div className="min-w-0">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: 'var(--accent-green)' }}
            >
              Trailie
            </p>
            <h3
              className="mt-0.5 text-lg font-semibold sm:text-xl leading-snug"
              style={{ color: 'var(--text-primary)' }}
            >
              {DEMO_CTA.title}
            </h3>
          </div>
        </div>
        <p className="mb-4 text-sm sm:text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {DEMO_CTA.body}
        </p>
        <Link
          href="/plan-ai"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ backgroundColor: 'var(--accent-green)' }}
        >
          {DEMO_CTA.button}
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-3 text-center text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {DEMO_CTA.accountNote}
        </p>
      </div>
    </div>
  );
}
