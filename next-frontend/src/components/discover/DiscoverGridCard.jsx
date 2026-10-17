'use client';

import Link from 'next/link';
import { ArrowRight } from '@components/icons';
import { ActivityIcon } from '@/lib/discoverActivityIcons';
import { StateIcon } from '@/lib/discoverStateIcons';
import { recordDiscoverVisit } from './RecentChips';
import { logDiscoverClick } from '@/utils/analytics';

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
      logDiscoverClick({ dimension, slug, label });
    }
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="public-discovery-link flex items-center justify-between gap-3 border-b px-2 py-4 min-h-[4.5rem] transition-colors"
      style={{
        borderColor: 'var(--border)',
      }}
    >
      <span className="text-sm font-semibold leading-tight pr-2" style={{ color: 'var(--text-primary)' }}>
        {label}
      </span>
      <div className="flex items-center gap-3 shrink-0">
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
        <ArrowRight className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
      </div>
    </Link>
  );
}
