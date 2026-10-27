import InfoPageHeader from '@/components/info/InfoPageHeader';
import Link from 'next/link';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import TestimonialsServerList from '@/components/testimonials/TestimonialsServerList';
import {
  TESTIMONIALS_SECTION_SUBTITLE,
} from '@/components/testimonials/testimonialsCopy';
import { getApprovedTestimonialsServer } from '@/lib/testimonialsApi';
import TestimonialSubmitSection from './TestimonialSubmitSection';

export const metadata = {
  title: 'Traveler Stories — TrailVerse',
  description:
    'Read how travelers use TrailVerse to research national parks, check weather and alerts, and plan trips. Share your own review — no account required.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/testimonials',
  },
  openGraph: {
    title: 'Traveler Stories — TrailVerse',
    description:
      'Real stories from people planning trips across 470+ national parks and sites with TrailVerse.',
    url: 'https://www.nationalparksexplorerusa.com/testimonials',
    siteName: 'TrailVerse',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Traveler Stories — TrailVerse',
    description: 'Traveler reviews and stories from the TrailVerse community.',
  },
};

export default async function TestimonialsPage({ searchParams }) {
  const query = await searchParams;
  const requested = Number(query?.batch);
  const batch = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 50) : 1;
  const limit = batch * 20;
  const { data: testimonials, error } = await getApprovedTestimonialsServer({ limit: limit + 1 });

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="info-page">
        <InfoPageHeader eyebrow="Community" icon="Award" iconColor="var(--icon-travel)" title="Traveler Stories" description={<>
              {TESTIMONIALS_SECTION_SUBTITLE}
            </>} />

        <div className="info-stories"><TestimonialsServerList testimonials={testimonials.slice(0, limit)} error={error} /></div>
        {testimonials.length > limit && batch < 50 && (
          <div className="info-width pb-8">
            <Link href={`/testimonials?batch=${batch + 1}`} className="public-action public-action-secondary px-5">
              Load more stories
            </Link>
          </div>
        )}
        <TestimonialSubmitSection />
      </main>
      <Footer />
    </div>
  );
}
