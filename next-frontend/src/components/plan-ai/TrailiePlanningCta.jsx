'use client';

import Link from 'next/link';
import { Calendar, Compare, MapPin } from '@components/icons';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';
import Button from '@/components/common/Button';
import { buildIntentPlanAiHref } from '@/lib/intentPlanAi';

const DEFAULT_BODY =
  'Browse 470+ parks, compare destinations, or ask Trailie to build your itinerary — free to explore, no account required.';

/**
 * Trailie-branded planning CTA — matches park detail ParkPlanOverviewSection header + actions.
 */
export default function TrailiePlanningCta({
  title = 'Start planning',
  body = DEFAULT_BODY,
  planHref = '/plan-ai',
  intentPath = null,
  planLabel = 'Plan with Trailie',
  compareHref = '/compare',
  compareLabel = 'Compare parks',
  exploreHref = '/explore',
  showExplore = true,
  className = '',
}) {
  const resolvedPlanHref = intentPath ? buildIntentPlanAiHref(intentPath) : planHref;

  return (
    <section
      className={`rounded-2xl overflow-hidden ${className}`.trim()}
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
      }}
      aria-labelledby="trailie-planning-cta-heading"
    >
      <div className="p-4 sm:p-5 lg:p-6">
        <div className="flex items-start gap-3 min-w-0">
          <TrailieAvatar className="!h-11 !w-11 sm:!h-12 sm:!w-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: 'var(--accent-green)' }}
            >
              Trailie
            </p>
            <h2
              id="trailie-planning-cta-heading"
              className="text-lg sm:text-xl font-semibold mt-0.5 leading-snug"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h2>
            <p
              className="text-sm mt-1.5 leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              {body}
            </p>
          </div>
        </div>

        <div
          className="mt-4 pt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap sm:gap-3"
          style={{ borderTopWidth: '1px', borderColor: 'var(--border)' }}
        >
          <Button
            href={resolvedPlanHref}
            variant="secondary"
            size="md"
            icon={Calendar}
            className="w-full sm:w-auto sm:min-w-[220px]"
            style={{
              backgroundColor: 'var(--accent-green)',
              color: '#fff',
              borderColor: 'transparent',
            }}
          >
            {planLabel}
          </Button>
          <Link
            href={compareHref}
            className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition hover:opacity-80 sm:justify-start"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Compare className="h-4 w-4 shrink-0" />
            {compareLabel}
          </Link>
          {showExplore ? (
            <Link
              href={exploreHref}
              className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition hover:opacity-80 sm:justify-start"
              style={{ color: 'var(--text-secondary)' }}
            >
              <MapPin className="h-4 w-4 shrink-0" />
              Explore parks
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
