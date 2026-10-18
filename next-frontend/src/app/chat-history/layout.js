import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  title: 'My Trips | TrailVerse',
  description: 'Your trips and conversations with Trailie, all in one place.',
  robots: privatePageRobots,
};

export default function ChatHistoryLayout({ children }) {
  return children;
}
