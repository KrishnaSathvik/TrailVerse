'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from '@/components/icons';
import SharedTripDayCard from '@/components/shared-trip/SharedTripDayCard';
import { canonicalDestinationDisplay } from '@/lib/tripDestination';

/**
 * Stage 14.3 — the frozen itinerary, shown as soon as revision 1 is DURABLE.
 *
 * The parent keys this on `plan.itineraryHash`, which is immutable from
 * `itinerary_ready` onward. Revision 2 (prose) therefore cannot remount it, and
 * collapse state survives prose arrival. `pendingLabel` is presentation state
 * derived from the lifecycle — never canonical assistant content, never saved.
 */
function EarlyItineraryCard({ plan, pendingLabel = null, onMount }) {
  const [showDays, setShowDays] = useState(true);

  useEffect(() => {
    onMount?.();
    // Mount-only on purpose: this is the remount probe the stability test reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days = plan?.days || [];
  if (!days.length) return null;

  const issues = Array.isArray(plan.feasibilityIssues)
    ? plan.feasibilityIssues.filter((issue) => {
      if (issue?.severity === 'info' || issue?.type === 'insufficient_coordinates') return false;
      // An issue stamped for another plan revision is never current.
      if (issue?.planHash && plan?.itineraryHash && issue.planHash !== plan.itineraryHash) {
        return false;
      }
      return true;
    })
    : [];
  const tripAlternatives = Array.isArray(plan.alternatives)
    ? plan.alternatives.filter((alt) => String(alt?.name || alt || '').trim())
    : [];

  return (
    <section
      className="mt-4 min-w-0"
      aria-label="Trip itinerary"
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>Trip plan</p>
          <p className="mt-1 truncate text-base font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            {canonicalDestinationDisplay(plan.parkName) || 'Your trip plan'}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {days.length} {days.length === 1 ? 'day' : 'days'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDays((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          {showDays ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showDays ? 'Hide days' : 'Show days'}
        </button>
      </div>

      {issues.length > 0 && (
        <div className="mb-4 border-l-2 pl-3.5" style={{ borderColor: '#b45309' }}>
          {issues.map((issue, i) => (
            <p
              key={issue.code || issue.message || i}
              className="flex items-start gap-1.5 text-xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {issue.message || String(issue)}
            </p>
          ))}
        </div>
      )}

      {showDays && (
        <div>
          {days.map((day, index) => (
            <SharedTripDayCard key={day.id || day.day || index} day={day} dayIndex={index} />
          ))}
          {tripAlternatives.length > 0 ? (
            <div className="mt-5 border-l-2 pl-3.5" style={{ borderColor: 'var(--border)' }} aria-label="Backup plan">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Backup plan
              </p>
              <ul className="mt-1.5 space-y-1">
                {tripAlternatives.map((alt, index) => {
                  const name = typeof alt === 'string' ? alt : alt.name;
                  const note = typeof alt === 'string' ? null : (alt.note || alt.when);
                  return (
                    <li key={`${name}-${index}`} className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {name}{note ? ` — ${note}` : ''}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {pendingLabel ? (
        <p
          className="mt-4 border-t pt-3 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}
          role="status"
        >
          {pendingLabel}
        </p>
      ) : null}
    </section>
  );
}

export default React.memo(EarlyItineraryCard);
