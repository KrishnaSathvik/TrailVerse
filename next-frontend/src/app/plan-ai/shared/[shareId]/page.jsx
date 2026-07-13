import { notFound } from 'next/navigation';
import SharedTripPageClient from '@/components/shared-trip/SharedTripPageClient';
import { privatePageRobots } from '@/lib/seo';
import {
  getSampleItineraryByShareId,
  softenSampleConversation,
} from '@/data/sampleItineraries';

/** Shared chats update as the owner keeps planning — always fetch live trip data. */
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://trailverse.onrender.com/api'
    : 'http://localhost:5001/api');

async function getSharedTrip(shareId) {
  try {
    const res = await fetch(`${API_URL}/trips/shared/${shareId}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

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
  if (!trip) return { title: '404 - Page Not Found | TrailVerse' };

  const title = trip.title || `${trip.parkName || 'National Park'} Trip Plan`;

  const sample = getSampleItineraryByShareId(shareId);
  const ogImage = sample
    ? '/og/itineraries.jpg'
    : '/og-image-trailverse.jpg';

  return {
    title: `${title} | TrailVerse`,
    description: `Shared ${trip.parkName || 'national park'} trip plan created with Trailie on TrailVerse.`,
    openGraph: {
      title,
      description: `A ${trip.parkName || 'national park'} trip plan made with TrailVerse AI`,
      url: `https://www.nationalparksexplorerusa.com/plan-ai/shared/${shareId}`,
      siteName: 'TrailVerse',
      type: 'article',
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: `A ${trip.parkName || 'national park'} trip plan made with TrailVerse AI`,
      images: [ogImage],
    },
    robots: privatePageRobots,
  };
}

export default async function SharedTripPage({ params }) {
  const { shareId } = await params;
  const trip = await getSharedTrip(shareId);
  if (!trip) notFound();

  return <SharedTripPageClient trip={prepareSharedTrip(trip, shareId)} shareId={shareId} />;
}
