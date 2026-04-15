import { notFound } from 'next/navigation';
import ActivityDetailClient from './ActivityDetailClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://trailverse.onrender.com/api'
    : 'http://localhost:5001/api');

async function getActivity(activityId) {
  try {
    const res = await fetch(`${API_URL}/activities/${activityId}`, {
      next: { revalidate: 3600 }
    });

    if (!res.ok) return null;

    const json = await res.json();
    return json?.data || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const activity = await getActivity(id);

  if (!activity?.title) {
    return { title: '404 - Page Not Found | TrailVerse' };
  }

  return {
    title: `${activity.title} | TrailVerse`,
    description: activity.shortDescription || activity.description || `Explore ${activity.title} on TrailVerse.`,
  };
}

export default async function ActivityDetailPage({ params }) {
  const { parkCode, id } = await params;
  const activity = await getActivity(id);

  if (!activity) {
    notFound();
  }

  return <ActivityDetailClient activity={activity} parkCode={parkCode} activityId={id} />;
}
