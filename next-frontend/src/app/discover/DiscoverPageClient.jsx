'use client';

import DiscoverSection from '@/components/discover/DiscoverSection';
import DiscoverGridCard from '@/components/discover/DiscoverGridCard';
import { useDiscoverCatalog } from '@/hooks/useDiscoverCatalog';
import { BROWSE_HUB_DESCRIPTION, BROWSE_HUB_HEADLINE, BROWSE_HUB_NAV_LABEL } from '@/lib/browseHub';
import { Compass } from '@components/icons';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const PREVIEW = 6;

export default function DiscoverPageClient({ initialCatalog }) {
  const { data: catalog, isLoading, error } = useDiscoverCatalog({ initialData: initialCatalog });
  const data = catalog || initialCatalog;

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <p className="text-center py-16 px-4" style={{ color: 'var(--text-secondary)' }}>
        Unable to load browse catalog. Please try again later.
      </p>
    );
  }

  const sortByCount = (items) =>
    [...items].sort((a, b) => b.parkCount - a.parkCount || a.name.localeCompare(b.name));

  const activities = sortByCount((data?.activities || []).filter((item) => item.parkCount > 0));
  const types = sortByCount(data?.types || []);
  const states = sortByCount(data?.states || []);
  const topics = sortByCount((data?.topics || []).filter((item) => item.parkCount > 0));

  return (
    <div className="pb-24">
      <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
        <header
          className="border-b py-5 sm:py-8 mb-6 sm:mb-8"
          style={{ borderColor: 'var(--border)' }}
        >
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-3 sm:mb-4 backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
            }}
          >
            <Compass className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              {BROWSE_HUB_NAV_LABEL}
            </span>
          </div>
          <h1
            className="text-3xl sm:text-4xl font-bold mb-2"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
          >
            {BROWSE_HUB_HEADLINE}
          </h1>
          <p className="text-base max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            {BROWSE_HUB_DESCRIPTION}
          </p>
        </header>

        <DiscoverSection title="Activities" seeAllHref="/discover/activities">
          {activities.slice(0, PREVIEW).map((item) => (
            <DiscoverGridCard
              key={item.slug}
              href={`/discover/activity/${item.slug}`}
              label={item.name}
              iconKey={item.iconKey}
              showIcon
              dimension="activity"
              slug={item.slug}
            />
          ))}
        </DiscoverSection>

        <DiscoverSection title="Type" seeAllHref="/discover/types">
          {types.slice(0, PREVIEW).map((item) => (
            <DiscoverGridCard
              key={item.slug}
              href={`/discover/type/${item.slug}`}
              label={item.name}
              dimension="type"
              slug={item.slug}
            />
          ))}
        </DiscoverSection>

        <DiscoverSection title="States" seeAllHref="/discover/states">
          {states.slice(0, PREVIEW).map((item) => (
            <DiscoverGridCard
              key={item.slug}
              href={`/parks/state/${item.slug}`}
              label={item.name}
              stateCode={item.code}
              showIcon
              dimension="state"
              slug={item.slug}
            />
          ))}
        </DiscoverSection>

        <DiscoverSection title="Topics" seeAllHref="/discover/topics">
          {topics.slice(0, PREVIEW).map((item) => (
            <DiscoverGridCard
              key={item.slug}
              href={`/discover/topic/${item.slug}`}
              label={item.name}
              count={item.parkCount}
              showCount
              dimension="topic"
              slug={item.slug}
            />
          ))}
        </DiscoverSection>
      </div>
    </div>
  );
}
