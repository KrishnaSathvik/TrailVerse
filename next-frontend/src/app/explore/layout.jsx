export const metadata = {
  title: 'Explore All 470+ Parks & Sites - Find Your Perfect Adventure | TrailVerse',
  description: 'Discover America\'s 470+ parks and sites with detailed guides, photos, activities, and planning tools. Find parks by state, activity, or search by name.',
  keywords: 'national parks explorer, USA national parks, park finder, national park guide, hiking, camping, outdoor activities, park activities',
  openGraph: {
    title: 'Explore All 470+ Parks & Sites - Find Your Perfect Adventure | TrailVerse',
    description: 'Discover America\'s 470+ parks and sites with detailed guides, photos, activities, and planning tools.',
    url: 'https://www.nationalparksexplorerusa.com/explore',
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

export default function ExploreLayout({ children }) {
  return children;
}
