'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import PlanAIContent from '../PlanAIContent';
import PlanAIShell from '@components/plan-ai/PlanAIShell';

function PlanAIWithTrip() {
  const { tripId } = useParams();
  return <PlanAIContent tripId={tripId} />;
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <PlanAIShell title="Your trip" showSubHeader loadingMessage="Loading trip..." />
      }
    >
      <PlanAIWithTrip />
    </Suspense>
  );
}
