import { notFound } from 'next/navigation';
import SharedTripPageClient from '@/components/shared-trip/SharedTripPageClient';
import { privatePageRobots } from '@/lib/seo';

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

export async function generateMetadata({ params }) {
  const { shareId } = await params;
  const trip = await getSharedTrip(shareId);
  if (!trip) return { title: '404 - Page Not Found | TrailVerse' };

  const title = trip.title || `${trip.parkName || 'National Park'} Trip Plan`;

  return {
    title: `${title} | TrailVerse`,
    description: `Shared ${trip.parkName || 'national park'} trip plan created with Trailie on TrailVerse.`,
    openGraph: {
      title,
      description: `A ${trip.parkName || 'national park'} trip plan made with TrailVerse AI`,
      url: `https://www.nationalparksexplorerusa.com/plan-ai/shared/${shareId}`,
      siteName: 'TrailVerse',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: `A ${trip.parkName || 'national park'} trip plan made with TrailVerse AI`,
    },
    robots: privatePageRobots,
  };
}

export default async function SharedTripPage({ params }) {
  const { shareId } = await params;
  const trip = await getSharedTrip(shareId);
  if (!trip) notFound();

  return <SharedTripPageClient trip={trip} />;
}
