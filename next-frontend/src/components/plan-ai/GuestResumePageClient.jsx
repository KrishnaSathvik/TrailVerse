'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PlanAIShell from '@components/plan-ai/PlanAIShell';
import { seedGuestSessionFromLink } from '@/lib/seedGuestSession';

/**
 * Guest resume link — seeds anonymousSession + redirects to interactive /plan-ai
 */
export default function GuestResumePageClient({ anonymousId }) {
  const router = useRouter();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const resume = async () => {
      try {
        const result = await seedGuestSessionFromLink(anonymousId);
        if (cancelled) return;

        if (!result.ok) {
          setError(result.error || 'Unable to resume this chat.');
          return;
        }

        router.replace('/plan-ai');
      } catch (err) {
        console.error('Guest resume failed:', err);
        if (!cancelled) {
          setError('Unable to resume this chat. The session may have expired.');
        }
      }
    };

    resume();
    return () => {
      cancelled = true;
    };
  }, [anonymousId, router]);

  if (error) {
    return (
      <PlanAIShell loadingMessage="">
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            {error}
          </p>
          <Link
            href="/plan-ai"
            className="text-sm font-semibold underline underline-offset-2"
            style={{ color: 'var(--accent-green)' }}
          >
            Start a new chat with Trailie
          </Link>
        </div>
      </PlanAIShell>
    );
  }

  return <PlanAIShell loadingMessage="Restoring your chat with Trailie..." />;
}
