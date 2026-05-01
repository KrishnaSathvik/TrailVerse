'use client';

import { Suspense } from 'react';
import PlanAIContent from './PlanAIContent';

function PlanAIPage() {
  return <PlanAIContent tripId={null} />;
}

function Loading() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-3xl mx-auto px-4 py-16 sm:py-24 text-center">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
          Trailie
        </h1>
        <p className="text-base sm:text-lg mb-8" style={{ color: 'var(--text-secondary)' }}>
          Meet Trailie, your AI park-planning guide. Plan trips across all 470+ U.S. national parks with AI. Get personalized itineraries
          built from live NPS alerts, weather forecasts, crowd data, and campground availability.
        </p>
        <div className="h-8 w-8 border-4 border-forest-500/30 border-t-forest-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading trip planner...</p>
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
