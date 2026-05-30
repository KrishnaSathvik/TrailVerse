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
    url: 'https://www.nationalparksexplorerusa.com/discover'
  }
};

export default function DiscoverLayout({ children }) {
  return children;
}
