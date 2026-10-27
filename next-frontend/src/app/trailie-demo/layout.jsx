import { indexablePageRobots } from '@/lib/seo';

const CANONICAL = 'https://www.nationalparksexplorerusa.com/trailie-demo';

const TITLE = 'Trailie Demo — Outdoor & National Park Trip Planning | TrailVerse';
const DESCRIPTION =
  'Explore five recorded Trailie conversations: park recommendations, Zion and Bryce planning, realistic road trips, and Yellowstone and Glacier itinerary refinements. No sign-in needed to watch.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: indexablePageRobots,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: 'Trailie Demo — See Outdoor Trip Planning | TrailVerse',
    description: DESCRIPTION,
    url: CANONICAL,
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og/trailie.jpg', width: 1200, height: 630, alt: "Meet Trailie, TrailVerse's park trip planner." }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trailie Demo — Outdoor & National Park Planning',
    description: DESCRIPTION,
    images: ['/og/trailie.jpg'],
  },
};

const webPageLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Trailie Interactive Demo',
  description: DESCRIPTION,
  url: CANONICAL,
  isPartOf: {
    '@type': 'WebSite',
    name: 'TrailVerse',
    url: 'https://www.nationalparksexplorerusa.com',
  },
  about: {
    '@type': 'SoftwareApplication',
    name: 'Trailie',
    applicationCategory: 'TravelApplication',
    operatingSystem: 'Web',
    url: 'https://www.nationalparksexplorerusa.com/plan-ai',
  },
  publisher: {
    '@type': 'Organization',
    name: 'TrailVerse',
    url: 'https://www.nationalparksexplorerusa.com',
  },
};

export default function TrailieDemoLayout({ children }) {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(webPageLd)}</script>
      {children}
    </>
  );
}
