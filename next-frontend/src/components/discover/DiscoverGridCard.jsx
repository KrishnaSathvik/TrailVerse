'use client';

import Link from 'next/link';
import { ActivityIcon } from '@/lib/discoverActivityIcons';
import { StateIcon } from '@/lib/discoverStateIcons';
import { recordDiscoverVisit } from './RecentChips';

export default function DiscoverGridCard({
  href,
  label,
  count,
  iconKey,
  stateCode,
  dimension,
  slug,
  showIcon = false,
  showCount = false,
}) {
  const handleClick = () => {
    if (dimension && slug) {
      recordDiscoverVisit({ dimension, slug, label });
    }
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="flex items-center justify-between gap-3 rounded-2xl px-4 py-4 min-h-[4.5rem] transition hover:-translate-y-0.5"
      style={{
        backgroundColor: 'var(--surface-hover, var(--surface))',
        borderWidth: '1px',
        borderColor: 'var(--border)',
      }}
    >
      <span className="text-sm font-semibold leading-tight pr-2" style={{ color: 'var(--text-primary)' }}>
        {label}
      </span>
      <div className="flex items-center shrink-0">
        {showCount && typeof count === 'number' && (
          <span className="text-sm tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
            {count}
          </span>
        )}
        {showIcon && stateCode && (
          <StateIcon stateCode={stateCode} className="h-7 w-7" style={{ color: 'var(--text-primary)' }} />
        )}
        {showIcon && !stateCode && iconKey && (
          <ActivityIcon iconKey={iconKey} className="h-7 w-7" />
        )}
      </div>
    </Link>
  );
}
