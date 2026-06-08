'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from '@components/icons';
import { useReturnNavigation } from '@/hooks/useReturnNavigation';

function ReturnNavLinkInner({
  defaultHref,
  defaultLabel,
  className,
  style,
}) {
  const { backHref, backLabel } = useReturnNavigation({
    defaultHref,
    defaultLabel,
  });

  return (
    <Link href={backHref} className={className} style={style}>
      <ArrowLeft className="h-4 w-4" />
      {backLabel}
    </Link>
  );
}

/**
 * Back link that reads ?from= for return navigation.
 * Wrapped in Suspense for static generation (useSearchParams).
 */
export default function ReturnNavLink({
  defaultHref,
  defaultLabel,
  className = 'inline-flex items-center gap-2 text-sm font-medium hover:opacity-80',
  style = { color: 'var(--text-secondary)' },
}) {
  return (
    <Suspense
      fallback={
        <Link href={defaultHref} className={className} style={style}>
          <ArrowLeft className="h-4 w-4" />
          {defaultLabel}
        </Link>
      }
    >
      <ReturnNavLinkInner
        defaultHref={defaultHref}
        defaultLabel={defaultLabel}
        className={className}
        style={style}
      />
    </Suspense>
  );
}
