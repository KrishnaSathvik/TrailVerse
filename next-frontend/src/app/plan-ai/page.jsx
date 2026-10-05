import { Suspense } from 'react';
import PlanAIContent from './PlanAIContent';
import PlanAIShell from '@components/plan-ai/PlanAIShell';

// Metadata comes from layout.jsx so this page can stay static/ISR.
function PlanAIPage() {
  return <PlanAIContent tripId={null} />;
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
