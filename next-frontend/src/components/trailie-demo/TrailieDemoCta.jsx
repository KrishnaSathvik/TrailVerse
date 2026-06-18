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
              Want to try your own trip? Ask Trailie where to go outdoors, which destination wins in a compare, or
              how to map a full itinerary — same kinds of questions as the samples above.
            </p>
            <p>
              Name a park or outdoor spot and Trailie weaves in live alerts, weather, and permit notes when available.
              Sign in free for state-park web search, saved trips, and share links. Guests get five messages to start.
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
