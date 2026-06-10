'use client';

import Link from 'next/link';
import { Calendar, Compare } from '@components/icons';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';
import Button from '@/components/common/Button';
import { shortParkName } from '@/lib/parkPlanningContent';
import { logCtaClick } from '@/utils/analytics';

export default function ParkPlanOverviewSection({
  parkName,
  parkCode,
  snapshot,
  planCta,
  onPlan,
  compareHref,
}) {
  const short = shortParkName(parkName);

  const facts = [
    { label: 'Best time', value: snapshot.bestTime },
    { label: 'Trip length', value: snapshot.tripLength },
    { label: 'Don\'t miss', value: snapshot.dontMiss },
    ...(snapshot.baseTown ? [{ label: 'Nearby city', value: snapshot.baseTown }] : []),
  ];

  const handleCompare = () => {
    logCtaClick({
      ctaId: 'park_overview_compare',
      label: 'Compare with other parks',
      surface: 'park_plan_overview',
      destination: compareHref,
      parkCode,
    });
  };

  return (
    <section
      className="mb-6 sm:mb-8 rounded-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
      }}
      aria-labelledby="park-plan-overview-heading"
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
              id="park-plan-overview-heading"
              className="text-lg sm:text-xl font-semibold mt-0.5 leading-snug"
              style={{ color: 'var(--text-primary)' }}
            >
              {planCta.title}
            </h2>
            <p
              className="text-sm mt-1.5 leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              {planCta.body}
            </p>
          </div>
        </div>

        <div
          className="mt-5 pt-5"
          style={{ borderTopWidth: '1px', borderColor: 'var(--border)' }}
        >
          <h3
            className="text-sm font-semibold mb-3 sm:mb-4"
            style={{ color: 'var(--text-primary)' }}
          >
            {short} at a glance
          </h3>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {facts.map((item) => (
              <div
                key={item.label}
                className="rounded-xl p-3.5 sm:p-4 min-w-0"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                }}
              >
                <dt
                  className="text-xs font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {item.label}
                </dt>
                <dd
                  className="text-sm sm:text-base font-semibold leading-snug"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div
          className="mt-4 pt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
          style={{ borderTopWidth: '1px', borderColor: 'var(--border)' }}
        >
          <Button
            onClick={onPlan}
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
            {planCta.button}
          </Button>
          <Link
            href={compareHref}
            onClick={handleCompare}
            className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition hover:opacity-80 sm:justify-start"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Compare className="h-4 w-4 shrink-0" />
            Compare parks
          </Link>
        </div>
      </div>
    </section>
  );
}
