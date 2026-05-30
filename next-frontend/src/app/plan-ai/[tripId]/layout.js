import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  title: 'Trip Plan | TrailVerse',
  robots: privatePageRobots,
};

export default function TripPlanLayout({ children }) {
  return children;
}
