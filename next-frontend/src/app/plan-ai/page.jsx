import { Suspense } from 'react';
import PlanningEntryBoundary from '@/components/plan-ai/PlanningEntryBoundary';
import PlanAIShell from '@components/plan-ai/PlanAIShell';

// Metadata comes from layout.jsx so this page can stay static/ISR.
function PlanAIPage() {
  return <PlanningEntryBoundary />;
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <PlanAIShell title="Trailie" showSubHeader />
      }
    >
      <PlanAIPage />
    </Suspense>
  );
}
