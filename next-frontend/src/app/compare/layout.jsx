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

export default function CompareLayout({ children }) {
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
