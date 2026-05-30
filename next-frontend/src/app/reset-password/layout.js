import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  title: 'Reset Password | TrailVerse',
  robots: privatePageRobots,
};

export default function ResetPasswordLayout({ children }) {
  return children;
}
