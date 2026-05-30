'use client';

import Link from 'next/link';
import { ArrowLeft, Loader2 } from '@components/icons';
import DiscoverGridCard from './DiscoverGridCard';
import { BROWSE_HUB_PATH, BROWSE_HUB_TITLE } from '@/lib/browseHub';

function hrefForItem(gridKind, item) {
  switch (gridKind) {
    case 'activities':
      return `/discover/activity/${item.slug}`;
    case 'topics':
      return `/discover/topic/${item.slug}`;
    case 'types':
      return `/discover/type/${item.slug}`;
    case 'states':
      return `/parks/state/${item.slug}`;
    default:
      return BROWSE_HUB_PATH;
  }
}

function dimensionForKind(gridKind) {
  if (gridKind === 'activities') return 'activity';
  if (gridKind === 'topics') return 'topic';
  if (gridKind === 'types') return 'type';
  if (gridKind === 'states') return 'state';
  return gridKind;
}

function sortGridItems(items, gridKind) {
  const sorted = [...items].sort((a, b) => b.parkCount - a.parkCount || a.name.localeCompare(b.name));
  if (gridKind === 'activities' || gridKind === 'topics') {
    const withParks = sorted.filter((item) => item.parkCount > 0);
    const withoutParks = sorted.filter((item) => item.parkCount === 0);
    return [...withParks, ...withoutParks];
  }
  return sorted;
}

function cardPropsForKind(gridKind, item) {
  switch (gridKind) {
    case 'activities':
      return {
        showIcon: true,
        iconKey: item.iconKey,
      };
    case 'states':
      return {
        showIcon: true,
        stateCode: item.code,
      };
    case 'topics':
      return {
        showCount: true,
        count: item.parkCount,
      };
    case 'types':
    default:
      return {};
  }
}

export default function DiscoverFullGridPage({
  title,
  items = [],
  gridKind,
  loading = false
}) {
  const dimension = dimensionForKind(gridKind);
  const sortedItems = sortGridItems(items, gridKind);

  return (
    <div className="pb-24">
      <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 pt-6">
        <Link
          href={BROWSE_HUB_PATH}
          className="inline-flex items-center gap-2 text-sm font-medium mb-6"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          {BROWSE_HUB_TITLE}
        </Link>

        <h1
          className="text-3xl font-bold mb-6"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
        >
          {title}
        </h1>

        {loading && !items.length ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--accent-green)' }} />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {sortedItems.map((item) => (
              <DiscoverGridCard
                key={item.slug}
                href={hrefForItem(gridKind, item)}
                label={item.name}
                dimension={dimension}
                slug={item.slug}
                {...cardPropsForKind(gridKind, item)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
