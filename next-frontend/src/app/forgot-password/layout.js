import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  title: 'Forgot Password | TrailVerse',
  robots: privatePageRobots,
};

export default function ForgotPasswordLayout({ children }) {
  return children;
}
