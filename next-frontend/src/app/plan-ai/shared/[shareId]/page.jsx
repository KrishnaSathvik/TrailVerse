import { notFound, redirect } from 'next/navigation';
import { getSharedTrip } from '@/lib/sharedTrips';
import SharedTripPageClient from '@/components/shared-trip/SharedTripPageClient';
import { privatePageRobots } from '@/lib/seo';
import {
  getSampleItineraryByShareId,
  getSampleItineraryHref,
  softenSampleConversation,
} from '@/data/sampleItineraries';

/** Shared chats update as the owner keeps planning — always fetch live trip data. */
export const dynamic = 'force-dynamic';

function prepareSharedTrip(trip, shareId) {
  const sample = getSampleItineraryByShareId(shareId);
  if (!sample) return trip;
  return {
    ...trip,
    conversation: softenSampleConversation(trip.conversation, sample.prompt),
  };
}

export async function generateMetadata({ params }) {
  const { shareId } = await params;
  const trip = await getSharedTrip(shareId);
  if (!trip) {
    const sample = getSampleItineraryByShareId(shareId);
    return { title: sample ? `${sample.title} | TrailVerse` : '404 - Page Not Found | TrailVerse', robots: privatePageRobots };
  }

  const title = trip.title || `${trip.parkName || 'National Park'} Trip Plan`;

  const sample = getSampleItineraryByShareId(shareId);
  const ogImage = sample
    ? '/og-image-trailverse.jpg'
    : '/og-image-trailverse.jpg';

  return {
    title: `${title} | TrailVerse`,
    description: `Shared ${trip.parkName || 'national park'} trip plan created with Trailie on TrailVerse.`,
    openGraph: {
      title,
      description: `A ${trip.parkName || 'national park'} trip planned with Trailie`,
      url: `https://www.nationalparksexplorerusa.com/plan-ai/shared/${shareId}`,
      siteName: 'TrailVerse',
      type: 'article',
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: `A ${trip.parkName || 'national park'} trip planned with Trailie`,
      images: [ogImage],
    },
    robots: privatePageRobots,
  };
}

export default async function SharedTripPage({ params }) {
  const { shareId } = await params;
  const trip = await getSharedTrip(shareId);
  if (!trip) {
    const sample = getSampleItineraryByShareId(shareId);
    if (sample) redirect(getSampleItineraryHref({ ...sample, shareId: null }));
    notFound();
  }

  return <SharedTripPageClient trip={prepareSharedTrip(trip, shareId)} shareId={shareId} />;
}
