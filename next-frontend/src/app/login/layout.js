import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  title: 'Sign In | TrailVerse',
  robots: privatePageRobots,
};

export default function LoginLayout({ children }) {
  return children;
}
