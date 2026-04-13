export const metadata = {
  title: 'National Park Events Calendar – Ranger Programs & Tours | TrailVerse',
  description: 'Browse ranger programs, guided hikes, talks, and seasonal events across U.S. national parks. Filter by park, date, and activity type — all in one calendar.',
  alternates: { canonical: 'https://www.nationalparksexplorerusa.com/events' },
  openGraph: {
    title: 'National Park Events Calendar – Ranger Programs & Tours | TrailVerse',
    description: 'Browse ranger programs, guided tours, and seasonal events at U.S. national parks.',
    url: 'https://www.nationalparksexplorerusa.com/events',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse — National Park Events' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'National Park Events Calendar | TrailVerse',
    description: 'Ranger programs, guided hikes, and seasonal events across U.S. national parks.',
    images: ['/og-image-trailverse.jpg'],
  },
};

// Static JSON-LD — hardcoded string literals only (no user input)
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'National Park Events Calendar',
  description: 'Browse ranger programs, guided hikes, talks, and seasonal events across all U.S. national parks.',
  url: 'https://www.nationalparksexplorerusa.com/events',
  mainEntity: {
    '@type': 'ItemList',
    name: 'National Park Events',
    description: 'Upcoming ranger programs, guided tours, and seasonal events at U.S. national parks.',
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
  },
  publisher: {
    '@type': 'Organization',
    name: 'TrailVerse',
    url: 'https://www.nationalparksexplorerusa.com',
  },
});

export default function EventsLayout({ children }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      {children}
    </>
  );
}
