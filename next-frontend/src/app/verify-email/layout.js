import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  title: 'Verify Email | TrailVerse',
  robots: privatePageRobots,
};

export default function VerifyEmailLayout({ children }) {
  return children;
}
