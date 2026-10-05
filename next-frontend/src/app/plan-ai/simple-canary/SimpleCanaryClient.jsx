'use client';
import { useEffect, useRef, useState } from 'react';
import PlanAIShell from '@/components/plan-ai/PlanAIShell';
import ChatInput from '@/components/ai-chat/ChatInput';
import TrailieMarkdown from '@/components/trailie-response/TrailieMarkdown';
import TrailieItinerary from '@/components/trailie-response/TrailieItinerary';
import { getStoredToken } from '@/services/authService';

export default function SimpleCanaryClient() {
  const [messages, setMessages] = useState([]);
  const [tripId, setTripId] = useState(null);
  const [budget, setBudget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getStoredToken() || ''}` });
  useEffect(() => {
    fetch('/api/ai/simple-chat', { headers: headers() }).then(async response => {
      if (!response.ok) throw new Error('Private canary unavailable. Sign in to the authorized local account.');
      const body = await response.json(); setBudget(body.budget);
    }).catch(e => setError(e.message));
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);
  async function send(message) {
    if (busy || error || budget?.stopped || budget?.turns >= 6) return;
    setBusy(true); setMessages(previous => [...previous, { role: 'user', content: message }]);
    try {
      const response = await fetch('/api/ai/simple-chat', { method: 'POST', headers: headers(), body: JSON.stringify({ message, tripId }) });
      const body = await response.json(); if (body.budget) setBudget(body.budget);
      if (!response.ok || body.status !== 'complete') {
        const reason = body.status === 'tool_failed'
          ? `travel lookup failed (${body.code || 'unknown error'})`
          : body.status === 'canary_budget_exhausted'
            ? 'the next request would exceed the remaining model budget'
            : body.status || response.status;
        throw new Error(`Canary stopped: ${reason}. No retry or fallback was run.`);
      }
      setTripId(body.tripId); setMessages(previous => [...previous, { role: 'assistant', content: body.response.content, plan: body.response.itineraryData }]);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <PlanAIShell title="Trailie · Private canary" subtitle="Local model-first demo"
    headerActions={<button disabled={busy || Boolean(error)} onClick={() => { setMessages([]); setTripId(null); }} className="rounded-xl border px-4 py-2">New conversation</button>}>
    <div className="flex-1 overflow-y-auto px-4 py-6"><div className="mx-auto max-w-3xl space-y-8">
      {!messages.length && <p>Where would you like to go?</p>}
      {messages.map((message, index) => <article key={index} className={message.role === 'user' ? 'ml-auto max-w-xl rounded-2xl bg-[var(--surface-hover)] p-4' : ''}>
        <p className="mb-2 text-xs opacity-60">{message.role === 'user' ? 'You' : 'Trailie'}</p>
        <TrailieMarkdown text={message.content} />
        {message.plan && <TrailieItinerary plan={message.plan} />}
      </article>)}
      {busy && <p role="status">Trailie is working…</p>}
      {error && <p role="alert" className="rounded-xl border border-red-400 p-4">{error}</p>}
      <div ref={bottom} />
    </div></div>
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <p className="mb-2 text-xs opacity-60">{budget?.turns || 0}/6 turns · ${((budget?.chargedMicros || 0) / 1000000).toFixed(5)} / $0.15 model budget{budget?.stopped ? ' · Stopped' : ''}</p>
      <ChatInput onSend={send} disabled={busy || Boolean(error) || !budget || budget.stopped || budget.turns >= 6} placeholder="Ask Trailie…" />
    </div>
  </PlanAIShell>;
}
