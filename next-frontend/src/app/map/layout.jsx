export const metadata = {
  title: 'Interactive Map - Explore National Parks | TrailVerse',
  description: 'Explore all National Parks on our interactive map. Find parks near you, plan routes, discover nearby restaurants, hotels, and attractions.',
  keywords: 'national parks map, interactive map, park finder, route planner, nearby attractions',
  openGraph: {
    title: 'Interactive Map - Explore National Parks | TrailVerse',
    description: 'Explore all National Parks on our interactive map.',
    url: 'https://www.nationalparksexplorerusa.com/map',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse — Interactive Park Map' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Interactive Map - Explore National Parks | TrailVerse',
    description: 'Explore all National Parks on our interactive map.',
    images: ['/og-image-trailverse.jpg'],
  },
};

export default function MapLayout({ children }) {
  return children;
}
