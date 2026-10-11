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
      <main className="public-shell py-8">
        <div className="public-rich">
          <TrailieDemoReviewClient />
        </div>
      </main>
      <Footer />
    </div>
  );
}
