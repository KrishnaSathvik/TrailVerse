'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import PlanAIContent from '@/app/plan-ai/PlanAIContent';
import PlanAIShell from './PlanAIShell';
import { resolveTripEntryIntent, TRIP_ENTRY } from '@/lib/tripEntryIntent';

export default function PlanningEntryBoundary() {
  const { isAuthenticated, loading } = useAuth();
  const [resolvedLocation, setResolvedLocation] = useState(null);
  const params = useSearchParams();
  const router = useRouter();
  const pending = useRef(null);
  const conversationId = params.get('conversation');
  const startsNew = resolveTripEntryIntent(params) === TRIP_ENTRY.NEW;
  useEffect(() => {
    if (loading) return;
    if (startsNew) {
      // Consume the entry action once. Never trust a conversation ID supplied
      // alongside a new-trip link, and never reuse the active guest selection.
      const key = params.toString();
      if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
      const next = new URLSearchParams(key);
      next.set('entry', 'continue');
      next.set('conversation', pending.current.id);
      router.replace(`/plan-ai?${next.toString()}`, { scroll: false });
      return;
    }
    if (conversationId) {
      pending.current = null;
      if (!isAuthenticated) sessionStorage.setItem('trailieActiveConversation', conversationId);
      return;
    }
    const active = !isAuthenticated && sessionStorage.getItem('trailieActiveConversation');
    if (active) router.replace(`/plan-ai?entry=continue&conversation=${encodeURIComponent(active)}`, { scroll: false });
    // Resolve the browser-only resume pointer before mounting the planner.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else setResolvedLocation(params.toString());
  }, [conversationId, startsNew, params, router, isAuthenticated, loading]);
  // Never mount a planner (or auto-submit a prompt) until its scope is explicit.
  if (loading || startsNew || (!conversationId && resolvedLocation !== params.toString())) return <PlanAIShell title="Trailie" showSubHeader />;
  return <PlanAIContent key={conversationId || 'legacy'} tripId={null} />;
}
