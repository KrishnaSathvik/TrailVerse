export const metadata = {
  title: 'Compare National Parks – Fees, Parking, Amenities, Crowds | TrailVerse',
  description: 'Compare U.S. national parks side by side on entrance fees, parking costs, amenities, crowd levels, weather, and campgrounds. Pick your perfect park before you go.',
  alternates: { canonical: 'https://www.nationalparksexplorerusa.com/compare' },
  openGraph: {
    title: 'Compare National Parks – Fees, Amenities & Crowds | TrailVerse',
    description: 'Compare entrance fees, parking costs, amenities, and crowd levels across U.S. national parks side by side.',
    url: 'https://www.nationalparksexplorerusa.com/compare',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse — Compare National Parks' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Compare National Parks – Fees, Amenities & Crowds | TrailVerse',
    description: 'Compare entrance fees, parking costs, amenities, and crowd levels across U.S. national parks.',
    images: ['/og-image-trailverse.jpg'],
  },
};

// Static JSON-LD — hardcoded string literals only (no user input)
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Compare National Parks',
  description: 'Compare U.S. national parks side by side on entrance fees, parking costs, amenities, crowd levels, weather, and campgrounds.',
  url: 'https://www.nationalparksexplorerusa.com/compare',
  mainEntity: {
    '@type': 'ItemList',
    name: 'National Parks Comparison',
    description: 'Side-by-side comparison of U.S. national parks including fees, amenities, crowds, and weather.',
    numberOfItems: 470,
    itemListOrder: 'https://schema.org/ItemListUnordered',
  },
  publisher: {
    '@type': 'Organization',
    name: 'TrailVerse',
    url: 'https://www.nationalparksexplorerusa.com',
  },
});

// FAQ schema targeting "compare entrance fees parking amenities" queries
const faqJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Where can I compare entrance fees, parking costs, and included amenities before buying?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TrailVerse lets you compare up to 4 U.S. national parks side by side. See entrance fees, parking costs, amenities, campground options, and crowd levels on one page so you can decide before you buy a pass or book a trip.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I compare national parks to decide which one to visit?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Use the TrailVerse comparison tool to select up to 4 parks and compare them on activities, weather, facilities, entrance fees, crowd levels, and campgrounds. You can also jump into the AI trip planner to build a full itinerary for any park you choose.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I compare crowd levels and best times to visit different national parks?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. The comparison view shows visitor volume by season, peak periods, and holiday weekends for each park so you can find the quietest time to visit.',
      },
    },
  ],
});

export default function CompareLayout({ children }) {
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
