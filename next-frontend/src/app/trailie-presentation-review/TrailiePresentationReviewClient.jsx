'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import TrailieResponse from '@/components/trailie-response/TrailieResponse';
import { SCENARIOS } from '@/components/trailie-demo/TrailieInteractiveDemo';
import {
  toDemoTrailieResponseModel,
  toLiveTrailieResponseModel,
} from '@/lib/trailieResponseModel';

const scenarios = Object.fromEntries(SCENARIOS.map((scenario) => [scenario.id, scenario]));
const CASES = [
  ['q1', 'Q1 · Valley of Fire', scenarios['valley-of-fire-weekend']?.turns[0]],
  ['q2', 'Q2 · Acadia vs Shenandoah', scenarios['compare-acadia-shenandoah']?.turns[0]],
  ['q3', 'Q3 · Yellowstone', scenarios['yellowstone-relaxed']?.turns[0]],
  ['q4', 'Q4 · Rocky Mountain', scenarios['rocky-mountain-one-day']?.turns[0]],
  ['q5', 'Q5 · Zion', scenarios['zion-couple-itinerary']?.turns[0]],
];

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
      <div className="mx-auto w-full max-w-3xl">
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
              <Link key={id} href={`/trailie-presentation-review?surface=${surface}&case=${id}`} className="rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                {id.toUpperCase()}
              </Link>
            ))}
          </nav>
        </header>
        <p className="mb-4 rounded-2xl px-4 py-3 text-sm leading-6" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-primary)' }}>
          {turn.question}
        </p>
        <TrailieResponse response={response} example={surface === 'demo'} hideActions />
      </div>
    </main>
  );
}
