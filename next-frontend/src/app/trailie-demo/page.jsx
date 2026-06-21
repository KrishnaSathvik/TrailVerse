import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import TrailieDemoClient from './TrailieDemoClient';

export default function TrailieDemoPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main>
        <section className="px-4 pt-6 pb-6 sm:px-6 sm:pt-8 sm:pb-8 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p
              className="mb-4 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--accent-green)' }}
            >
              Trailie demo
            </p>
            <h1
              className="mb-6 text-4xl font-bold tracking-tight text-balance sm:text-5xl"
              style={{ color: 'var(--text-primary)' }}
            >
              Outdoor & national park trip planning
            </h1>
            <p
              className="mx-auto max-w-3xl text-lg leading-relaxed text-pretty sm:text-xl"
              style={{ color: 'var(--text-secondary)' }}
            >
              Watch Trailie answer real outdoor trip questions — national parks, state parks outside NPS, drive times,
              comparisons, and multi-day itineraries — then try your own plan free.
            </p>
          </div>
        </section>

        <section className="px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8 lg:pb-16">
          <div className="mx-auto w-full max-w-6xl">
            <TrailieDemoClient showHeader={false} showCta />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
