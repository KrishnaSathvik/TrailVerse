'use client';

import Link from 'next/link';
import { ArrowRight } from '@components/icons';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';

export default function TrailieDemoCta({ className = '' }) {
  return (
    <div
      className={`border-t pt-8 sm:pt-10 ${className}`}
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <TrailieAvatar className="!h-8 !w-8 sm:!h-9 sm:!w-9 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-4">
          <div
            className="text-sm sm:text-base leading-relaxed space-y-3"
            style={{ color: 'var(--text-secondary)' }}
          >
            <p>
              Want to try your own trip? Ask me which parks fit your dates, who wins in a compare, or
              map out a full itinerary — same kinds of questions as the samples above.
            </p>
            <p>
              Name a park and I&apos;ll weave in live alerts, weather, and permit notes when I have them.
              Sign up free if you want live web search for hotels and roads, or to save a trip and share
              the link. Guests get five messages to start.
            </p>
          </div>

          <Link
            href="/plan-ai"
            className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 sm:px-6 sm:py-3"
            style={{ backgroundColor: 'var(--accent-green)' }}
          >
            Plan your trip
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
