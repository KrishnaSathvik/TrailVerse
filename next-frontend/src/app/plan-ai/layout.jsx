export const metadata = {
  title: 'Trailie \u2014 Plan Your National Park Trip | TrailVerse',
  description:
    'Meet Trailie. Plan trips across all 470+ U.S. national parks with AI. Use live NPS data, weather, and crowd insights to compare parks, build day-by-day itineraries, and export your trip plan.',
  alternates: { canonical: 'https://www.nationalparksexplorerusa.com/plan-ai' },
  openGraph: {
    title: 'Trailie \u2014 National Park Trip Planner | TrailVerse',
    description:
      'Generate national park itineraries with live alerts, campgrounds, weather, and crowd insight for all 470+ U.S. parks.',
    url: 'https://www.nationalparksexplorerusa.com/plan-ai',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse — Trailie Trip Planner' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trailie \u2014 National Park Trip Planner | TrailVerse',
    description:
      'Plan smarter national park trips with live NPS data and AI-powered itineraries.',
    images: ['/og-image-trailverse.jpg'],
  },
};

// Static JSON-LD — all values are hardcoded string literals (no user input)
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Trailie \u2014 TrailVerse Trip Planner',
  applicationCategory: 'TravelApplication',
  operatingSystem: 'Web',
  url: 'https://www.nationalparksexplorerusa.com/plan-ai',
  description:
    'Trailie plans trips across all 470+ U.S. national parks. Uses live NPS data, weather, and structured itineraries to help you plan your perfect park visit.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  publisher: {
    '@type': 'Organization',
    name: 'TrailVerse',
    url: 'https://www.nationalparksexplorerusa.com',
  },
});

export default function PlanAILayout({ children }) {
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
