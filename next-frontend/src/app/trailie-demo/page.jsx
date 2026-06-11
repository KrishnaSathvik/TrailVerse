import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import TrailieDemoClient from './TrailieDemoClient';
import { LANDING_SECTION } from '@/lib/landingLayout';

export default function TrailieDemoPage() {
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main className="overflow-x-hidden">
        <section className={`${LANDING_SECTION} pb-10 sm:pb-14 pt-8 sm:pt-12`}>
          <div className="max-w-2xl mx-auto w-full min-w-0">
            <header className="mb-6 sm:mb-8 text-center">
              <h1
                className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
              >
                Trailie demo — AI national park trip planning
              </h1>
              <p className="mt-3 text-sm sm:text-base leading-relaxed text-pretty" style={{ color: 'var(--text-secondary)' }}>
                Pick a sample below to see how Trailie answers.
              </p>
            </header>

            <TrailieDemoClient showHeader={false} />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
