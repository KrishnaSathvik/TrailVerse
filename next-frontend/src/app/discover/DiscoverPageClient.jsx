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
      <div className="public-shell">
        <header
          className="border-b py-5 sm:py-8 mb-6 sm:mb-8"
          style={{ borderColor: 'var(--border)' }}
        >
          <div
            className="public-eyebrow"
          >
            <Compass className="h-4 w-4" style={{ color: 'var(--icon-discovery)' }} />
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              {BROWSE_HUB_NAV_LABEL}
            </span>
          </div>
          <h1
            className="public-page-title mb-4"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
          >
            {BROWSE_HUB_HEADLINE}
          </h1>
          <p className="public-page-intro" style={{ color: 'var(--text-secondary)' }}>
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
