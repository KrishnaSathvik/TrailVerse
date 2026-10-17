'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SCENARIOS } from '@/components/trailie-demo/TrailieInteractiveDemo';
import { scenarioAwaitsRecapture, isItineraryScenario } from '@/lib/trailieDemoPlaybackSchema';

/**
 * One row per EXISTING /trailie-demo scenario, with a link that sends that exact
 * question through current Trailie.
 *
 * Nothing here runs automatically. Every link is a normal anchor the operator
 * clicks deliberately, one at a time, because each click is a real paid
 * generation. There is no "run all".
 */
function buildAskHref(question) {
  return `/plan-ai?entry=new-trip&ask=${encodeURIComponent(question)}`;
}

function Pill({ children, tone = 'neutral' }) {
  const palette = {
    neutral: { bg: 'var(--surface-hover)', fg: 'var(--text-secondary)', border: 'var(--border)' },
    accent: { bg: 'color-mix(in srgb, var(--accent-green) 12%, var(--bg-primary))', fg: 'var(--accent-green)', border: 'color-mix(in srgb, var(--accent-green) 35%, var(--border))' },
    warn: { bg: 'color-mix(in srgb, var(--accent-orange, #d97706) 12%, var(--bg-primary))', fg: 'var(--accent-orange, #d97706)', border: 'color-mix(in srgb, var(--accent-orange, #d97706) 35%, var(--border))' },
  }[tone];

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}
    >
      {children}
    </span>
  );
}

export default function TrailieDemoReviewClient() {
  const [copied, setCopied] = useState(null);

  const copyQuestion = async (id, question) => {
    try {
      await navigator.clipboard.writeText(question);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: 'var(--text-primary)' }}>
          Trailie demo — local review
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Each row is an existing <code>/trailie-demo</code> scenario. Sign in first, then run{' '}
          <strong>one at a time</strong> — every run is a real generation. Review the answer, share it,
          and only then move to the next.
        </p>
        <div
          className="rounded-xl px-4 py-3 text-sm leading-relaxed"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent-green) 8%, var(--bg-primary))',
            border: '1px solid color-mix(in srgb, var(--accent-green) 25%, var(--border))',
            color: 'var(--text-secondary)',
          }}
        >
          Open <code>__trailieDemo.last()</code> in the browser console after each run to see what the
          turn actually did. Multi-turn scenarios: send turn 1, wait for it to finish, then paste turn 2
          into the composer yourself.
        </div>
      </header>

      <ol className="space-y-4">
        {SCENARIOS.map((scenario, index) => (
          <li
            key={scenario.id}
            className="rounded-2xl p-4 sm:p-5"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {index + 1}. {scenario.label}
              </span>
              <Pill tone={isItineraryScenario(scenario) ? 'accent' : 'neutral'}>
                {isItineraryScenario(scenario) ? 'itinerary' : 'conversation'}
              </Pill>
              {scenario.turns.length > 1 ? <Pill>{scenario.turns.length} turns</Pill> : null}
              {scenarioAwaitsRecapture(scenario) ? <Pill tone="warn">awaiting re-capture</Pill> : null}
              {scenario.turns.some((t) => t.questionUpdated) ? (
                <Pill tone="warn">question updated — legacy answer is stale</Pill>
              ) : null}
            </div>

            <div className="space-y-3">
              {scenario.turns.map((turn, turnIndex) => (
                <div key={`${scenario.id}-${turnIndex}`} className="min-w-0">
                  <p
                    className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {turnIndex === 0 ? 'Turn 1' : `Turn ${turnIndex + 1} — paste into composer`}
                  </p>
                  <p className="text-sm leading-relaxed break-words" style={{ color: 'var(--text-primary)' }}>
                    {turn.question}
                  </p>

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {turnIndex === 0 ? (
                      <Link
                        href={buildAskHref(turn.question)}
                        className="inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                        style={{ backgroundColor: 'var(--accent-green)' }}
                      >
                        Run in real Trailie →
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => copyQuestion(`${scenario.id}-${turnIndex}`, turn.question)}
                      className="inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-semibold transition hover:opacity-90"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {copied === `${scenario.id}-${turnIndex}` ? 'Copied' : 'Copy question'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <footer className="pt-2">
        <Link href="/trailie-demo" className="text-sm font-medium" style={{ color: 'var(--accent-green)' }}>
          ← Back to the public demo
        </Link>
      </footer>
    </div>
  );
}
