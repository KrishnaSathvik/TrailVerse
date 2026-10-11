'use client';
import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import PlanWorkspace from '@/components/itinerary/PlanWorkspace';
import LoadingSpinner from '@/components/common/LoadingSpinner';
function TripMapPage() {
  const { tripId } = useParams();
  return <PlanWorkspace tripId={tripId} view="map" />;
}
export default function Page() {
  return <Suspense fallback={<LoadingSpinner text="Loading trip map…" />}><TripMapPage /></Suspense>;
}
