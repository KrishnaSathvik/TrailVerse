import { BROWSE_HUB_META_DESCRIPTION, BROWSE_HUB_OG_TITLE, BROWSE_HUB_SEO_TITLE } from '@/lib/browseHub';

export const metadata = {
  title: BROWSE_HUB_SEO_TITLE,
  description: BROWSE_HUB_META_DESCRIPTION,
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/discover'
  },
  openGraph: {
    title: BROWSE_HUB_OG_TITLE,
    description: BROWSE_HUB_META_DESCRIPTION,
    url: 'https://www.nationalparksexplorerusa.com/discover',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og/discover.jpg', width: 1200, height: 630, alt: 'TrailVerse — Explore parks by activity' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: BROWSE_HUB_OG_TITLE,
    description: BROWSE_HUB_META_DESCRIPTION,
    images: ['/og/discover.jpg'],
  },
};

export default function DiscoverLayout({ children }) {
  return children;
}
