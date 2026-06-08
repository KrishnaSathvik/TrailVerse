import Link from 'next/link';

export const metadata = {
  title: 'TrailVerse Magazine — Issue 01 | Spring 2026',
  description:
    'A readable tour of TrailVerse — Trailie and Voice, map with campgrounds and scenic places, full park pages, compare, planning guides, crowd calendar, ChatGPT app, Claude, and more across 470+ parks.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/magazine',
  },
  openGraph: {
    title: 'TrailVerse Magazine — Issue 01',
    description:
      'Issue 01 — Trailie, Voice, map, browse by activity, planning guides, crowd calendar, ChatGPT and Claude, and the full park toolkit.',
    url: 'https://www.nationalparksexplorerusa.com/magazine',
    siteName: 'TrailVerse',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrailVerse Magazine — Issue 01',
    description:
      'Interactive magazine — 21 spreads covering TrailVerse planning tools, map, AI, and integrations across 470+ national parks.',
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
              Spring 2026 · 21 spreads — Trailie, Voice, map, browse by activity, planning guides,
              crowd calendar, ChatGPT, Claude, and the full park toolkit.
            </p>
          </div>
          <Link
            href="/magazine.html"
            className="text-sm font-semibold underline-offset-2 hover:underline"
            style={{ color: 'var(--accent-green)' }}
          >
            Read full screen
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
