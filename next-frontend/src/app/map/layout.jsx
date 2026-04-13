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

// FAQ schema targeting "interactive national parks map" queries
const faqJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Is there an interactive map of all U.S. national parks?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. TrailVerse provides a free interactive map showing all 470+ U.S. national parks, monuments, battlefields, seashores, and historic sites. You can filter by state, activity type, or search by name, and click any park to see details, alerts, and weather.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I find national parks near me on a map?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. The TrailVerse map can detect your location and show nearby parks. You can also search by state or zoom into any region to discover parks, plus find nearby restaurants, hotels, and attractions around each one.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I plan a route between national parks on the map?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. You can plan routes between parks directly on the map, then jump into the AI trip planner to generate a full day-by-day itinerary with drive times, activities, and campground options.',
      },
    },
  ],
});

export default function MapLayout({ children }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqJsonLd }}
      />
      {children}
    </>
  );
}
