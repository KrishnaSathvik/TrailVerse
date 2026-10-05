'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import tripService from '@/services/tripService';
import TripMapSheet from '@/components/trip-map/TripMapSheet';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { buildTripMapModel } from '@/lib/itineraryMapStops';
import { tripSurfacePath } from '@/lib/tripSurfacePath';

export default function TripMapPage() {
  const { tripId } = useParams();
  const router = useRouter();
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    setError(null);
    tripService.getTrip(tripId).then(data => {
      if (!cancelled) {
        const next = (data.data || data).plan;
        if (next?.days?.length) setPlan(next);
        else setError('This trip does not have an itinerary yet.');
      }
    }).catch(() => { if (!cancelled) setError('Sign in to your account to open this trip.'); });
    return () => { cancelled = true; };
  }, [tripId]);
  const mapModel = useMemo(() => buildTripMapModel(plan), [plan]);
  const viewItinerary = () => router.push(tripSurfacePath(tripId, 'itinerary'));
  if (error) return <div className="p-6"><p>{error}</p><button onClick={() => router.push('/login')}>Sign in</button></div>;
  if (!plan) return <LoadingSpinner text="Loading trip map…" />;
  return (
    <main className="p-6">
      <button onClick={viewItinerary}>View itinerary</button>
      {mapModel.hasAnyMappedStop
        ? <TripMapSheet open plan={plan} mapModel={mapModel} onClose={viewItinerary} onViewInItinerary={viewItinerary} />
        : <p className="mt-4">This trip has no verified map locations yet.</p>}
    </main>
  );
}
