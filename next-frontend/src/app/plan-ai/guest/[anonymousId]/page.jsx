'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import PlanAIShell from '@components/plan-ai/PlanAIShell';
import GuestResumePageClient from '@components/plan-ai/GuestResumePageClient';

function GuestResumePage() {
  const { anonymousId } = useParams();
  return <GuestResumePageClient anonymousId={anonymousId} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PlanAIShell loadingMessage="Loading your chat..." />}>
      <GuestResumePage />
    </Suspense>
  );
}
