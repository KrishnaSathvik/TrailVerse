'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import PlanWorkspace from '@/components/itinerary/PlanWorkspace';
import LoadingSpinner from '@/components/common/LoadingSpinner';

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <LoadingSpinner size="md" text="Loading plan…" />
    </div>
  );
}

function PlanPage() {
  const { tripId } = useParams();
  return <PlanWorkspace tripId={tripId} />;
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <PlanPage />
    </Suspense>
  );
}
