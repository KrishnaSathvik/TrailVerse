import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  ...privatePageRobots,
  title: 'Trailie Voice UI QA',
  robots: { index: false, follow: false },
};

export default function VoiceUiQaLayout({ children }) {
  return children;
}
