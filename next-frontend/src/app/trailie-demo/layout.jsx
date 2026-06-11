import { indexablePageRobots } from '@/lib/seo';

const CANONICAL = 'https://www.nationalparksexplorerusa.com/trailie-demo';

const TITLE = 'Trailie Demo — Try AI National Park Trip Planning | TrailVerse';
const DESCRIPTION =
  'Preview Trailie with sample trip-planning chats — permits, closures, itineraries, and follow-ups. No sign-in for the demo; guests get 5 free messages on the full chat. Sign up to save trips.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: indexablePageRobots,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: 'Trailie Demo — Interactive National Park AI Chat | TrailVerse',
    description: DESCRIPTION,
    url: CANONICAL,
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse Trailie AI trip planner demo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trailie Demo — Try AI National Park Planning',
    description: DESCRIPTION,
    images: ['/og-image-trailverse.jpg'],
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
    name: 'Trailie — TrailVerse Trip Planner',
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
