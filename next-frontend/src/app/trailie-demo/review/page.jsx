import { notFound } from 'next/navigation';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import TrailieDemoReviewClient from './TrailieDemoReviewClient';

/**
 * Local-only review console for the /trailie-demo scenarios.
 *
 * It exists so the operator can take each EXISTING demo question and run it
 * through current, real Trailie one at a time — the demo page itself only ever
 * replays approved fixtures and never calls a provider.
 *
 * Development only. In a production build this route 404s, so it is not part of
 * the public product and cannot be discovered.
 */
export const metadata = {
  title: 'Trailie demo — local review',
  robots: { index: false, follow: false },
};

export default function TrailieDemoReviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <TrailieDemoReviewClient />
        </div>
      </main>
      <Footer />
    </div>
  );
}
