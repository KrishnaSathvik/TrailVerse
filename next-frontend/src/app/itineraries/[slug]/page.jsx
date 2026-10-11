import { notFound } from 'next/navigation';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import { PUBLIC_ITINERARIES, getPublicItinerary } from '@/data/publicItineraries';
import { indexablePageRobots } from '@/lib/seo';
import PublicItinerary from './PublicItinerary';

export const dynamicParams = false;
export const generateStaticParams = () => PUBLIC_ITINERARIES.map(({ slug }) => ({ slug }));

export async function generateMetadata({ params }) {
  const sample = getPublicItinerary((await params).slug);
  if (!sample) return {};
  return {
    title: `${sample.title}: ${sample.plan.days.length}-day itinerary | TrailVerse`,
    description: sample.description,
    alternates: { canonical: `https://www.nationalparksexplorerusa.com/itineraries/${sample.slug}` },
    robots: indexablePageRobots,
    openGraph: { title: sample.title, description: sample.description, images: sample.images.map(image => ({ url: image.url, alt: image.alt })) },
  };
}

export default async function ItineraryPage({ params }) {
  const sample = getPublicItinerary((await params).slug);
  if (!sample) notFound();
  return <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <Header />
    <main><PublicItinerary sample={sample} /></main>
    <Footer />
  </div>;
}
