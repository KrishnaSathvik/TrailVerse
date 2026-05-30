import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  title: 'Your Profile | TrailVerse',
  robots: privatePageRobots,
};

export default function ProfileLayout({ children }) {
  return children;
}
