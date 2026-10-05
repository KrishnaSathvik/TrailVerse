import { notFound } from 'next/navigation';
import SimpleCanaryClient from './SimpleCanaryClient';

export const metadata = { title: 'Trailie · Private canary', robots: { index: false, follow: false } };
export default function SimpleCanaryPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <SimpleCanaryClient />;
}
