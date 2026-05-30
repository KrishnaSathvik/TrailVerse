import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  title: 'Offline | TrailVerse',
  robots: privatePageRobots,
};

export default function OfflineLayout({ children }) {
  return children;
}
