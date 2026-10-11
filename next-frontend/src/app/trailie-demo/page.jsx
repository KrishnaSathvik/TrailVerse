import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import TrailieDemoClient from './TrailieDemoClient';

export default function TrailieDemoPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main>
        <section className="public-shell pt-6 pb-5 sm:pt-8 sm:pb-6">
          <div className="public-reading text-center">
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--accent-green)' }}
            >
              Trailie demo
            </p>
            <h1
              className="mb-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
              style={{ color: 'var(--text-primary)' }}
            >
              See how Trailie plans in real conversations.
            </h1>
            <p
              className="mx-auto max-w-3xl text-sm leading-relaxed text-pretty sm:text-base"
              style={{ color: 'var(--text-secondary)' }}
            >
              Explore five real Trailie conversations: choosing a park, combining Zion and Bryce,
              weighing a packed road trip, and refining Yellowstone and Glacier plans.
              These are recorded answers — try your own trip when you’re ready.
            </p>
          </div>
        </section>

        <section className="public-shell pb-10 sm:pb-12 lg:pb-16">
          <div className="public-full">
            <TrailieDemoClient showHeader={false} showCta />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
