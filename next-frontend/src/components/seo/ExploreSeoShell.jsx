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
      <div className="public-shell py-5 sm:py-8">
        <div id="explore-page-hero" className="mb-5 sm:mb-6">
          <div
            className="public-eyebrow"
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
            className="public-page-title mb-4"
            style={{ color: 'var(--text-primary)' }}
          >
            {EXPLORE_SEO_HEADLINE}
          </h1>

          <p
            className="public-page-intro"
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
