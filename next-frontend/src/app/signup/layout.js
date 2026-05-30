import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  title: 'Create Account | TrailVerse',
  robots: privatePageRobots,
};

export default function SignupLayout({ children }) {
  return children;
}
