import Link from 'next/link';

export const metadata = {
  title: 'TrailVerse Magazine — Issue 01 | Spring 2026',
  description:
    'Explore every feature of TrailVerse — AI trip planning, interactive map, park comparisons, itinerary builder, daily nature feed, and more. 470+ national parks, one platform.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/magazine',
  },
  openGraph: {
    title: 'TrailVerse Magazine — Issue 01',
    description:
      'Your universe of national parks exploration. Trailie trip planner, interactive map, compare parks, itinerary builder, and more.',
    url: 'https://www.nationalparksexplorerusa.com/magazine',
    siteName: 'TrailVerse',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrailVerse Magazine — Issue 01',
    description:
      'Interactive magazine showcasing TrailVerse features for planning trips across 470+ national parks.',
  },
};

export default function MagazinePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="shrink-0 border-b px-4 py-3 sm:px-6"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">
              TrailVerse Magazine — Issue 01
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Spring 2026 · Your universe of national parks exploration — AI planning, maps,
              compare, itineraries, and more across 470+ parks and sites.
            </p>
          </div>
          <Link
            href="/magazine.html"
            className="text-sm font-semibold underline-offset-2 hover:underline"
            style={{ color: 'var(--accent-green)' }}
          >
            Open full-screen magazine
          </Link>
        </div>
      </header>

      <noscript>
        <p className="px-4 py-3 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          <a href="/magazine.html" className="font-semibold underline">
            View TrailVerse Magazine (static HTML)
          </a>
        </p>
      </noscript>

      <iframe
        src="/magazine.html"
        title="TrailVerse Magazine — Issue 01"
        className="min-h-0 flex-1"
        style={{
          width: '100%',
          border: 'none',
          display: 'block',
        }}
      />
    </div>
  );
}
