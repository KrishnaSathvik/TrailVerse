'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import TrailieResponse from '@/components/trailie-response/TrailieResponse';
import { SCENARIOS } from '@/components/trailie-demo/TrailieInteractiveDemo';
import {
  toDemoTrailieResponseModel,
  toLiveTrailieResponseModel,
} from '@/lib/trailieResponseModel';

const CASES = SCENARIOS.map((scenario, index) => [`q${index + 1}`, scenario.label, scenario.turns.findLast(turn => turn.plan) || scenario.turns[0]]);

function liveModel(turn) {
  return toLiveTrailieResponseModel({
    message: {
      role: 'assistant',
      content: turn.prose,
      itineraryPlan: turn.plan,
      travelLogistics: turn.travelLogistics,
      responseArtifacts: turn.responseArtifacts,
      intent: turn.intent,
      presentation: turn.presentation,
      parkName: turn.parkName,
      parkNames: turn.parkNames,
      hasLiveData: Boolean(turn.liveData?.nps),
      hasWebSearch: Boolean(turn.liveData?.web),
    },
    lifecycle: { showProse: true, showPlan: Boolean(turn.plan) },
  });
}

export default function TrailiePresentationReviewClient() {
  const params = useSearchParams();
  const selectedCase = params.get('case') || 'q1';
  const surface = params.get('surface') === 'plan-ai' ? 'plan-ai' : 'demo';
  const [, label, turn] = CASES.find(([id]) => id === selectedCase) || CASES[0];
  const response = surface === 'plan-ai'
    ? liveModel(turn)
    : toDemoTrailieResponseModel({ turn });

  return (
    <main className="min-h-screen px-3 py-6 sm:px-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="public-shell">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--accent-green-dark)' }}>
              Local frozen-data review · {surface}
            </p>
            <h1 className="mt-1 text-xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              {label}
            </h1>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Review cases">
            {CASES.map(([id]) => (
              <Link key={id} href={`/trailie-presentation-review?surface=${surface}&case=${id}`} className="inline-flex min-h-11 items-center rounded-lg border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                {id.toUpperCase()}
              </Link>
            ))}
          </nav>
        </header>
        <p className="public-reading mb-4 rounded-2xl px-4 py-3 text-sm leading-6" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-primary)' }}>
          {turn.question}
        </p>
        <TrailieResponse response={response} example={surface === 'demo'} hideActions />
      </div>
    </main>
  );
}
