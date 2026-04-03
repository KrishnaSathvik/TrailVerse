export const metadata = {
  title: 'Compare National Parks - Side-by-Side Park Comparison Tool | TrailVerse',
  description: 'Compare National Parks side-by-side with detailed information about activities, weather, facilities, and more. Find the perfect park for your next adventure.',
  keywords: 'compare national parks, park comparison, national park comparison tool, park features comparison, activities comparison, weather comparison',
  openGraph: {
    title: 'Compare National Parks - Side-by-Side Park Comparison Tool | TrailVerse',
    description: 'Compare National Parks side-by-side with detailed information about activities, weather, facilities, and more.',
    url: 'https://www.nationalparksexplorerusa.com/compare',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse — Compare National Parks' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Compare National Parks - Side-by-Side Park Comparison Tool | TrailVerse',
    description: 'Compare National Parks side-by-side with detailed information about activities, weather, facilities, and more.',
    images: ['/og-image-trailverse.jpg'],
  },
};

export default function CompareLayout({ children }) {
  return children;
}
