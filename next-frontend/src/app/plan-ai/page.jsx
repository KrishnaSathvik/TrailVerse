'use client';

import { Suspense } from 'react';
import PlanAIContent from './PlanAIContent';
import PlanAIShell from '@components/plan-ai/PlanAIShell';

function PlanAIPage() {
  return <PlanAIContent tripId={null} />;
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <PlanAIShell title="Outdoor trip planning" showSubHeader />
      }
    >
      <PlanAIPage />
    </Suspense>
  );
}
