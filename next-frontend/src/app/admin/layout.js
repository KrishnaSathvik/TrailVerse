import { privatePageRobots } from '@/lib/seo';

export const metadata = {
  title: 'Admin | TrailVerse',
  robots: privatePageRobots,
};

export default function AdminLayout({ children }) {
  return children;
}
