'use client';

import { Suspense } from 'react';
import PlanAIContent from './PlanAIContent';

function PlanAIPage() {
  return <PlanAIContent tripId={null} />;
}

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="text-center">
        <div className="h-8 w-8 border-4 border-forest-500/30 border-t-forest-500 rounded-full animate-spin mx-auto mb-4" />
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <PlanAIPage />
    </Suspense>
  );
}
