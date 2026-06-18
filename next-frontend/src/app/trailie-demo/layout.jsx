import { indexablePageRobots } from '@/lib/seo';

const CANONICAL = 'https://www.nationalparksexplorerusa.com/trailie-demo';

const TITLE = 'Trailie Demo — Outdoor & National Park Trip Planning | TrailVerse';
const DESCRIPTION =
  'Preview Trailie with sample outdoor trip chats — national parks, state parks, comparisons, permits, and multi-day itineraries. No sign-in for the demo; sign in on live chat for saved trips and state-park web search.';

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
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'Trailie demo on TrailVerse' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trailie Demo — Outdoor & National Park Planning',
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
