import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  title: 'Chat History | TrailVerse',
  robots: privatePageRobots,
};

export default function ChatHistoryLayout({ children }) {
  return children;
}
