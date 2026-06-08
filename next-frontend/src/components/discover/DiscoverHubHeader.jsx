'use client';

import Link from 'next/link';
import { ArrowLeft } from '@components/icons';
import ExpandableDescription from './ExpandableDescription';
import { BROWSE_HUB_PATH, BROWSE_HUB_TITLE } from '@/lib/browseHub';
import { useReturnNavigation } from '@/hooks/useReturnNavigation';

export default function DiscoverHubHeader({
  backHref = BROWSE_HUB_PATH,
  backLabel = BROWSE_HUB_TITLE,
  title,
  intro,
  parkCount,
  parkCountSuffix = 'parks and sites (NPS)',
  actions = null
}) {
  const { backHref: resolvedHref, backLabel: resolvedLabel } = useReturnNavigation({
    defaultHref: backHref,
    defaultLabel: backLabel,
  });

  return (
    <header className="mb-8">
      <Link
        href={resolvedHref}
        className="inline-flex items-center gap-2 text-sm font-medium mb-6 hover:opacity-80"
        style={{ color: 'var(--text-secondary)' }}
      >
        <ArrowLeft className="h-4 w-4" />
        {resolvedLabel}
      </Link>

      <h1
        className="text-3xl sm:text-4xl font-bold mb-4"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
      >
        {title}
      </h1>

      {intro && (
        <ExpandableDescription
          text={intro}
          collapsedChars={400}
          className="text-base leading-relaxed max-w-3xl whitespace-pre-line"
        />
      )}

      {parkCount != null && (
        <p className="mt-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          {parkCount} {parkCountSuffix}
        </p>
      )}

      {actions ? <div className="flex flex-wrap gap-3 mt-6">{actions}</div> : null}
    </header>
  );
}
