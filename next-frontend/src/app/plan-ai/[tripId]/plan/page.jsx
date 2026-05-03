'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import PlanWorkspace from '@/components/itinerary/PlanWorkspace';

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="text-center">
        <div className="h-8 w-8 border-4 border-t-green-500 rounded-full animate-spin mx-auto mb-4"
          style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent-green)' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading plan...</p>
      </div>
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
