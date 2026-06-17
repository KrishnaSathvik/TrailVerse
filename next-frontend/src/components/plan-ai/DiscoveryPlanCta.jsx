'use client';

import React from 'react';
import { ListOrdered } from '@components/icons';
import Button from '@components/common/Button';

/** Shown after open-ended discovery answers — nudges user toward a structured itinerary. */
export default function DiscoveryPlanCta({ onRequestPlan, disabled = false, compact = false, insideBubble = false }) {
  return (
    <div
      className={
        insideBubble
          ? 'mt-4 pt-3 border-t'
          : `rounded-2xl border ${compact ? 'px-3 py-2.5' : 'mt-2 px-3 py-3 sm:px-4 sm:py-3.5'}`
      }
      style={
        insideBubble
          ? { borderColor: 'var(--border)' }
          : {
              borderColor: 'rgba(67, 160, 106, 0.28)',
              backgroundColor: 'rgba(67, 160, 106, 0.08)',
            }
      }
    >
      {!compact && (
        <p className="text-xs mb-2.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Picked a direction? Trailie will ask a quick question or two if anything is missing, then build your day-by-day plan.
        </p>
      )}
      <Button
        type="button"
        onClick={onRequestPlan}
        variant="outline"
        size="sm"
        icon={ListOrdered}
        disabled={disabled}
        className="w-full min-h-[44px] touch-manipulation sm:w-auto sm:min-h-0"
      >
        Want a day-by-day plan?
      </Button>
    </div>
  );
}
