import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import TrailieDemoClient from './TrailieDemoClient';
import PublicPageHero from '@/components/common/PublicPageHero';

export default function TrailieDemoPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main>
        <PublicPageHero
          eyebrow="Trailie demo"
          icon="Sparkles"
          iconColor="var(--icon-trailie)"
          title="See how Trailie plans in real conversations."
          description="Explore five real Trailie conversations: choosing a park, combining Zion and Bryce, weighing a packed road trip, and refining Yellowstone and Glacier plans. These are recorded answers — try your own trip when you’re ready."
        />

        <section className="public-shell pt-6 pb-10 sm:pt-8 sm:pb-12 lg:pb-16">
          <div className="public-full">
            <TrailieDemoClient showHeader={false} showCta />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
