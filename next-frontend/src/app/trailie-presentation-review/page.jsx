import { notFound } from 'next/navigation';
import TrailiePresentationReviewClient from './TrailiePresentationReviewClient';

export const metadata = {
  title: 'Trailie presentation review',
  robots: { index: false, follow: false },
};

export default function TrailiePresentationReviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <TrailiePresentationReviewClient />;
}
