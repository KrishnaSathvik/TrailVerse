import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import TestimonialsServerList from '@/components/testimonials/TestimonialsServerList';
import {
  TESTIMONIALS_PAGE_INTRO,
  TESTIMONIALS_SECTION_SUBTITLE,
  TESTIMONIALS_SECTION_TITLE,
} from '@/components/testimonials/testimonialsCopy';
import { getApprovedTestimonialsServer } from '@/lib/testimonialsApi';
import TestimonialSubmitSection from './TestimonialSubmitSection';

export const metadata = {
  title: 'Traveler Reviews — TrailVerse',
  description:
    'Read how travelers use TrailVerse to research national parks, check weather and alerts, and plan trips. Share your own review — no account required.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/testimonials',
  },
  openGraph: {
    title: 'Traveler Reviews — TrailVerse',
    description:
      'Real stories from people planning trips across 470+ national parks and sites with TrailVerse.',
    url: 'https://www.nationalparksexplorerusa.com/testimonials',
    siteName: 'TrailVerse',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Traveler Reviews — TrailVerse',
    description: 'Traveler reviews and stories from the TrailVerse community.',
  },
};

export default async function TestimonialsPage() {
  const { data: testimonials } = await getApprovedTestimonialsServer({ limit: 20 });

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main>
        <section className="pt-8 sm:pt-20 pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              {TESTIMONIALS_SECTION_TITLE}
            </h1>
            <p className="text-xl max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              {TESTIMONIALS_SECTION_SUBTITLE} {TESTIMONIALS_PAGE_INTRO}
            </p>
          </div>
        </section>

        <TestimonialsServerList testimonials={testimonials} />
        <TestimonialSubmitSection />
      </main>
      <Footer />
    </div>
  );
}
