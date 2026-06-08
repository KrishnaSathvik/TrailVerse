import Link from 'next/link';
import {
  SEO_ACTIVITY_LINKS,
  SEO_FEATURED_PARKS,
  SEO_INTENT_LINKS,
  SEO_STATE_LINKS,
  SEO_TYPE_LINKS,
  seoParkHref,
} from '@/lib/seoBrowseHub';
import { hrefWithFrom } from '@/lib/returnNavigation';

function LinkGroup({ title, links, fromPath, mobileFeaturedLimit }) {
  if (!links?.length) return null;

  return (
    <div>
      <h3
        className="text-xs font-semibold uppercase tracking-wide mb-2 sm:text-sm sm:normal-case sm:tracking-normal"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </h3>
      <ul className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-2 text-sm">
        {links.map((link, index) => (
          <li
            key={link.href}
            className={
              mobileFeaturedLimit != null && index >= mobileFeaturedLimit
                ? 'hidden sm:list-item min-w-0'
                : 'min-w-0'
            }
          >
            <Link
              href={fromPath ? hrefWithFrom(link.href, fromPath) : link.href}
              className="inline-flex min-h-11 items-center py-1.5 hover:underline break-words sm:min-h-0 sm:py-0 sm:inline"
              style={{ color: 'var(--accent-green)' }}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Crawlable browse links — used in server-rendered SEO shells.
 * @param {{ parks?: Array<{ fullName: string }>, compact?: boolean, className?: string, fromPath?: string, mobileFeaturedLimit?: number, showPopularDestinations?: boolean }} props
 */
export default function SeoBrowseLinks({
  parks,
  compact = false,
  className = '',
  fromPath,
  mobileFeaturedLimit,
  showPopularDestinations = true,
}) {
  const parkLinks = (parks?.length ? parks : SEO_FEATURED_PARKS).map((park) => ({
    href: seoParkHref(park.fullName || park.name),
    label: park.fullName || park.name,
  }));

  if (compact) {
    return (
      <nav aria-label="Browse parks and sites" className={className}>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {parkLinks.slice(0, 8).map((link) => (
            <li key={link.href}>
              <Link
                href={fromPath ? hrefWithFrom(link.href, fromPath) : link.href}
                className="hover:underline"
                style={{ color: 'var(--accent-green)' }}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Browse parks and sites" className={`space-y-4 sm:space-y-5 ${className}`.trim()}>
      {showPopularDestinations ? (
        <LinkGroup
          title="Popular destinations"
          links={parkLinks}
          fromPath={fromPath}
          mobileFeaturedLimit={mobileFeaturedLimit}
        />
      ) : null}
      <LinkGroup title="Browse by state" links={SEO_STATE_LINKS} fromPath={fromPath} />
      <LinkGroup title="Browse by activity" links={SEO_ACTIVITY_LINKS} fromPath={fromPath} />
      <LinkGroup title="Browse by park type" links={SEO_TYPE_LINKS} fromPath={fromPath} />
      <LinkGroup title="Parks by trip style" links={SEO_INTENT_LINKS} fromPath={fromPath} />
    </nav>
  );
}
