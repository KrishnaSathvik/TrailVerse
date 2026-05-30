import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  title: 'Home | TrailVerse',
  description: 'Your daily park briefing — weather, sky conditions, alerts, and recommendations for today\'s featured park.',
  robots: privatePageRobots,
};

export default function HomeLayout({ children }) {
  return children;
}
