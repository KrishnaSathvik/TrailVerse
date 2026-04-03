export const metadata = {
  title: 'National Parks Blog - Expert Travel Guides & Adventure Tips | TrailVerse',
  description: 'Read expert guides, travel tips, and adventure stories about America\'s National Parks. Get insider knowledge for your next park visit.',
  keywords: 'national parks blog, park travel guides, hiking tips, camping guides, national park stories, outdoor adventure blog',
  openGraph: {
    title: 'National Parks Blog - Expert Travel Guides & Adventure Tips | TrailVerse',
    description: 'Read expert guides, travel tips, and adventure stories about America\'s National Parks.',
    url: 'https://www.nationalparksexplorerusa.com/blog',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse — National Parks Blog' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'National Parks Blog - Expert Travel Guides & Adventure Tips | TrailVerse',
    description: 'Read expert guides, travel tips, and adventure stories about America\'s National Parks.',
    images: ['/og-image-trailverse.jpg'],
  },
};

export default function BlogLayout({ children }) {
  return children;
}
