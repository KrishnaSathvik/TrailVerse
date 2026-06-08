import IconGlyph from '@/components/common/IconGlyph';
import ExploreBrowseNav from './ExploreBrowseNav';
import SeoBrowseLinks from './SeoBrowseLinks';
import {
  EXPLORE_PAGE_BADGE,
  EXPLORE_SEO_HEADLINE,
  exploreSeoSubtitle,
} from '@/lib/exploreSeoCopy';

/**
 * Server-rendered explore intro — crawlable h1 + browse links above the client grid.
 */
export default function ExploreSeoShell({
  nationalParksCount = 64,
  totalSitesCount,
}) {
  return (
    <section
      className="border-b"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
    >
      <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 py-5 sm:py-8">
        <div id="explore-page-hero" className="mb-5 sm:mb-6">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 sm:px-4 sm:py-2 mb-3 sm:mb-4 backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
            }}
          >
            <IconGlyph name="Compass" className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              {EXPLORE_PAGE_BADGE}
            </span>
          </div>

          <h1
            className="text-[1.75rem] leading-[1.1] sm:text-5xl lg:text-6xl font-semibold tracking-tight mb-3 sm:mb-4 sm:leading-none"
            style={{ color: 'var(--text-primary)' }}
          >
            {EXPLORE_SEO_HEADLINE}
          </h1>

          <p
            className="text-base leading-relaxed sm:text-xl sm:leading-normal max-w-3xl text-pretty sm:text-balance"
            style={{ color: 'var(--text-secondary)' }}
          >
            {exploreSeoSubtitle({ nationalParksCount, totalSitesCount })}
          </p>
        </div>

        <ExploreBrowseNav>
          <SeoBrowseLinks fromPath="/explore" showPopularDestinations={false} />
        </ExploreBrowseNav>
      </div>
    </section>
  );
}
