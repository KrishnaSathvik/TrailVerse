export const metadata = {
  title: 'Trailie \u2014 Outdoor & National Park Trip Planning | TrailVerse',
  description:
    'Trailie on TrailVerse plans day-by-day outdoor trips \u2014 live NPS data for 470+ parks and sites, plus state parks and local spots when you sign in. Compare parks, weather, alerts, and itineraries.',
  alternates: { canonical: 'https://www.nationalparksexplorerusa.com/plan-ai' },
  openGraph: {
    title: 'Trailie \u2014 Outdoor & National Park Trip Planning | TrailVerse',
    description:
      'Trailie plans outdoor and national park trips on TrailVerse \u2014 itineraries, compare, live NPS context, and sign-in for state parks and local logistics.',
    url: 'https://www.nationalparksexplorerusa.com/plan-ai',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'Trailie on TrailVerse' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trailie \u2014 Outdoor & National Park Trip Planning | TrailVerse',
    description:
      'Trailie on TrailVerse \u2014 day-by-day outdoor trips, 470+ NPS sites with live data, state parks when you sign in.',
    images: ['/og-image-trailverse.jpg'],
  },
};

// Static JSON-LD — all values are hardcoded string literals (no user input)
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Trailie',
  applicationCategory: 'TravelApplication',
  operatingSystem: 'Web',
  url: 'https://www.nationalparksexplorerusa.com/plan-ai',
  description:
    'Trailie on TrailVerse plans outdoor and national park trips with day-by-day itineraries, park comparison, and live NPS data for 470+ sites; sign in for state parks and local logistics.',
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
