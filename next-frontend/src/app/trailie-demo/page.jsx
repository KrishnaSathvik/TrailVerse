import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import TrailieDemoClient from './TrailieDemoClient';
import TrailieDemoCta from '@/components/trailie-demo/TrailieDemoCta';
import { LANDING_SECTION_X } from '@/lib/landingLayout';

export default function TrailieDemoPage() {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main className="flex flex-1 flex-col overflow-x-hidden">
        <section className={`${LANDING_SECTION_X} max-w-3xl mx-auto w-full pt-4 pb-6 sm:pt-8 sm:pb-10`}>
          <header className="shrink-0 mb-4 sm:mb-6 text-center">
            <h1
              className="text-xl sm:text-3xl font-semibold tracking-tight text-balance"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
            >
              Trailie demo — AI national park trip planning
            </h1>
            <p className="mt-2 text-sm sm:text-base leading-relaxed text-pretty" style={{ color: 'var(--text-secondary)' }}>
              Watch Trailie answer real trip-planning questions — open-ended discovery with drive times, state parks outside NPS, park comparisons, and multi-day itineraries — then{' '}
              <span className="whitespace-nowrap">try your own plan free.</span>
            </p>
          </header>

          <TrailieDemoClient showHeader={false} showCta={false} />
        </section>

        <section className={`${LANDING_SECTION_X} max-w-3xl mx-auto w-full pb-10 sm:pb-14 pt-2`}>
          <TrailieDemoCta />
        </section>
      </main>

      <Footer />
    </div>
  );
}
