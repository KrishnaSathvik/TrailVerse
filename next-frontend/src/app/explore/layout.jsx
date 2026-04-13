export const metadata = {
  title: 'Explore All 470+ Parks & Sites - Find Your Perfect Adventure | TrailVerse',
  description: 'Discover America\'s 470+ parks and sites with detailed guides, photos, activities, and planning tools. Find parks by state, activity, or search by name.',
  keywords: 'national parks explorer, USA national parks, park finder, national park guide, hiking, camping, outdoor activities, park activities',
  openGraph: {
    title: 'Explore All 470+ Parks & Sites - Find Your Perfect Adventure | TrailVerse',
    description: 'Discover America\'s 470+ parks and sites with detailed guides, photos, activities, and planning tools.',
    url: 'https://www.nationalparksexplorerusa.com/explore',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse — Explore National Parks' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Explore All 470+ Parks & Sites - Find Your Perfect Adventure | TrailVerse',
    description: 'Discover America\'s 470+ parks and sites with detailed guides, photos, activities, and planning tools.',
    images: ['/og-image-trailverse.jpg'],
  },
};

// Static JSON-LD — hardcoded string literals only (no user input)
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Explore U.S. National Parks & Sites',
  description: 'Browse all 470+ U.S. national parks, monuments, and historic sites with detailed guides, photos, activities, and planning tools.',
  url: 'https://www.nationalparksexplorerusa.com/explore',
  mainEntity: {
    '@type': 'ItemList',
    name: 'U.S. National Parks & Sites',
    description: 'Complete directory of 470+ U.S. national parks, monuments, battlefields, seashores, and historic sites.',
    numberOfItems: 470,
    itemListOrder: 'https://schema.org/ItemListUnordered',
  },
  publisher: {
    '@type': 'Organization',
    name: 'TrailVerse',
    url: 'https://www.nationalparksexplorerusa.com',
  },
});

export default function ExploreLayout({ children }) {
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
