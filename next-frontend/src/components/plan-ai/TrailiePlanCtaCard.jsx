'use client';

import Link from 'next/link';
import { Calendar } from '@components/icons';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';
import Button from '@/components/common/Button';

export default function TrailiePlanCtaCard({
  title,
  body,
  buttonLabel,
  href = '/plan-ai',
  secondaryHref,
  secondaryLabel,
  secondaryIcon: SecondaryIcon,
  className = '',
}) {
  return (
    <section
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
      }}
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
              className="text-lg sm:text-xl font-semibold mt-0.5 leading-snug"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h2>
            <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {body}
            </p>
          </div>
        </div>

        <div
          className="mt-4 pt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
          style={{ borderTopWidth: '1px', borderColor: 'var(--border)' }}
        >
          <Button
            href={href}
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
            {buttonLabel}
          </Button>
          {secondaryHref && secondaryLabel ? (
            <Link
              href={secondaryHref}
              className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition hover:opacity-80 sm:justify-start"
              style={{ color: 'var(--text-secondary)' }}
            >
              {SecondaryIcon ? <SecondaryIcon className="h-4 w-4 shrink-0" /> : null}
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
