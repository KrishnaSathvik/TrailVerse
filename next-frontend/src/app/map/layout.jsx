export const metadata = {
  title: 'Interactive National Parks Map – All 470+ Parks & Sites | TrailVerse',
  description: 'Explore an interactive map of all 470+ U.S. national parks and sites. Find parks near you, filter by state or activity, plan routes, and discover nearby restaurants and hotels.',
  keywords: 'national parks map, interactive national parks map, national park interactive map, park finder, route planner, nearby attractions',
  alternates: { canonical: 'https://www.nationalparksexplorerusa.com/map' },
  openGraph: {
    title: 'Interactive National Parks Map – All 470+ Parks & Sites | TrailVerse',
    description: 'Interactive map of all 470+ U.S. national parks. Filter by state, activity, or search by name.',
    url: 'https://www.nationalparksexplorerusa.com/map',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse — Interactive National Parks Map' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Interactive National Parks Map | TrailVerse',
    description: 'Interactive map of all 470+ U.S. national parks and sites.',
    images: ['/og-image-trailverse.jpg'],
  },
};

// Static JSON-LD — hardcoded string literals only (no user input)
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Interactive National Parks Map',
  description: 'Interactive map of all 470+ U.S. national parks, monuments, and historic sites. Filter by state, activity, or search by name.',
  url: 'https://www.nationalparksexplorerusa.com/map',
  mainEntity: {
    '@type': 'Map',
    mapType: 'https://schema.org/VenueMap',
    name: 'Interactive Map of U.S. National Parks',
    description: 'Explore all 470+ U.S. national parks and sites on an interactive map with filters, route planning, and nearby services.',
  },
  publisher: {
    '@type': 'Organization',
    name: 'TrailVerse',
    url: 'https://www.nationalparksexplorerusa.com',
  },
});

export default function MapLayout({ children }) {
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
