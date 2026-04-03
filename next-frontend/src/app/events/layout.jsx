export const metadata = {
  title: 'National Parks Events Calendar - Ranger Programs & Activities | TrailVerse',
  description: 'Discover upcoming events, ranger programs, workshops, and special activities at America\'s National Parks. Plan your visit around exciting park events.',
  keywords: 'national parks events, ranger programs, park activities, workshops, guided tours, national park calendar',
  openGraph: {
    title: 'National Parks Events Calendar - Ranger Programs & Activities | TrailVerse',
    description: 'Discover upcoming events, ranger programs, workshops, and special activities at America\'s National Parks.',
    url: 'https://www.nationalparksexplorerusa.com/events',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse — National Parks Events' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'National Parks Events Calendar - Ranger Programs & Activities | TrailVerse',
    description: 'Discover upcoming events, ranger programs, workshops, and special activities at America\'s National Parks.',
    images: ['/og-image-trailverse.jpg'],
  },
};

export default function EventsLayout({ children }) {
  return children;
}
