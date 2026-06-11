import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  title: 'Guest Chat | TrailVerse',
  description: 'Read-only view of a Trailie guest planning conversation.',
  robots: privatePageRobots,
};

export default function GuestChatLayout({ children }) {
  return children;
}
