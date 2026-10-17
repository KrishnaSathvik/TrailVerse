import React from 'react';
import { mapServerMessagesToUi } from '@/utils/serverMessagesToUi';
import { render, cleanup } from '@testing-library/react';
import { toLiveTrailieResponseModel, toRestoredTrailieResponseModel } from '@/lib/trailieResponseModel';
import { normalizeTrailiePresentation } from '@/lib/normalizeTrailiePresentation';
import TrailieResponse from '@/components/trailie-response/TrailieResponse';
import { applyTerminalOwnership } from '@/utils/terminalOwnership';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import { createEarlyRevisionCoordinator } from '@/utils/earlyRevisionCoordinator';
import { upsertItineraryTurn, updateProseTurn, applyPendingLabel, resolveAssistantPresentation } from '@/utils/earlyRevisionMessages';
import { resolveItineraryOnlyTerminalPersistence } from '@/utils/itineraryOnlyTerminalPersistence';
import { sanitizeMessagesForPersistence } from '@/services/tripHistoryService';
import { reconcileRestoredConversation } from '@/lib/reconcileRestoredConversation';
import { createPersistenceAdapter } from '@/__tests__/integration/stage14Harness';
import { runTurn, ITINERARY } from '@/__tests__/integration/stage14Turn';
const { parse } = createRequire(resolve('package.json'))('@babel/parser');
// Execute current production callbacks, not a hand-maintained copy. This is a
// diagnostic seam test, not a mounted-browser/HTTP integration test.
const source = readFileSync(resolve('src/components/plan-ai/TripPlannerChat.jsx'), 'utf8');
const callbacks = {};
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ObjectProperty' && ['persistRevision1', 'persistRevision2', 'persistTerminal', 'revealTerminal'].includes(node.key?.name)) {
    if (callbacks[node.key.name]) throw new Error('Ambiguous callback extraction');
    callbacks[node.key.name] = source.slice(node.value.start, node.value.end);
  }
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
  }
}
function findCoordinator(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' && node.callee?.name === 'createEarlyRevisionCoordinator') { visit(node.arguments[0]); return; }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(findCoordinator);
    else if (value && typeof value === 'object') findCoordinator(value);
  }
}
findCoordinator(parse(source, { sourceType: 'module', plugins: ['jsx'] }).program);
const createCallbacks = new Function('deps', `
  const { applyTerminalOwnership, upsertItineraryTurn, updateProseTurn, applyPendingLabel,
    resolveItineraryOnlyTerminalPersistence, baseConversation, currentTripIdRef,
    writeCanonicalRevision, setCurrentPlan, setMessages, setIsGenerating, setThinkingStartTime } = deps;
  let persistedConversation = baseConversation;
  return { ${Object.entries(callbacks).map(([k,v])=>`${k}: ${v}`).join(',')} };
`);
async function faultCase({ failFirst = false, stampedProse = false, emptyText = false } = {}) {
  const turn = await runTurn({ itinerary: {
    ...ITINERARY,
    intro: 'A quiet canyon introduction.',
    narrativeSections: [
      { placement: 'before_plan', markdown: 'A quiet canyon introduction.' },
      { placement: 'after_plan', markdown: 'Check the shuttle before departure.' },
    ],
  }});
  const early = turn.revisionOne;
  const intent = { primaryIntent: 'simple_itinerary', travelerJob: 'day_by_day_itinerary' };
  const complete = { ...turn.recorder.frames.at(-1), intent };
  // Current authenticated v2 route ai.js:2705 has no successor stamps.
  const done = stampedProse ? complete : {
    type: 'done', intent, responseId: complete.responseId, responseVersion: complete.responseVersion,
    itineraryHash: early.canonicalPlan.itineraryHash, canonicalPlan: early.canonicalPlan,
    content: emptyText ? '' : 'Your trip is ready. Start at the Visitor Center, then take Riverside Walk.',
  };
  const baseConversation = [{ id: 1, role: 'user', content: 'Plan a trip' }];
  let messages = baseConversation, livePlan = null;
  const currentTripIdRef = { current: null };
  const persistence = createPersistenceAdapter(), writes = [], journal = [];
  const currentCallbacks = createCallbacks({
    applyTerminalOwnership, upsertItineraryTurn, updateProseTurn, applyPendingLabel, resolveItineraryOnlyTerminalPersistence,
    baseConversation, currentTripIdRef,
    writeCanonicalRevision: async ({ conversation, plan, expectedPreviousRevision }) => {
      if (failFirst && writes.length === 0) {
        writes.push({ accepted: false }); journal.push('write_failed');
        return { ok: false, outcome: 'conflict' };
      }
      const result = persistence.write({ tripId: currentTripIdRef.current,
        conversation: sanitizeMessagesForPersistence(conversation), plan, expectedPreviousRevision });
      writes.push({ accepted: result.ok }); journal.push(result.ok ? 'write_accepted' : 'write_rejected');
      if (result.ok) currentTripIdRef.current = result.tripId;
      return result;
    },
    setCurrentPlan: plan => { livePlan = plan; },
    setMessages: fn => { messages = fn(messages); journal.push('visible'); },
    setIsGenerating: () => {}, setThinkingStartTime: () => {},
  });
  const coordinator = createEarlyRevisionCoordinator({ ...currentCallbacks, view: {
    setTripId: id => { currentTripIdRef.current = id; },
    revealItinerary: effect => { messages = upsertItineraryTurn(messages, effect); livePlan = effect.canonicalPlan; },
    revealTerminal: currentCallbacks.revealTerminal,
  }});
  coordinator.handleEvent({ type: 'response_started', responseId: done.responseId, requiresStructuredItinerary: null });
  coordinator.handleEvent({ type: 'itinerary_ready', response: { ...early.response, intent }, canonicalPlan: early.canonicalPlan });
  await coordinator.drain();
  coordinator.handleEvent(done); await coordinator.drain();
  const trip = persistence.getTrip(currentTripIdRef.current);
  expect(trip).toBeTruthy();
  const restored = reconcileRestoredConversation([], mapServerMessagesToUi(JSON.parse(JSON.stringify(trip.conversation))));
  const live = messages.filter(m => m.role === 'assistant'), cold = restored.filter(m => m.role === 'assistant');
  expect(live).toHaveLength(1); expect(cold).toHaveLength(1);
  return { live: live[0], restored: cold[0], livePlan, storedPlan: trip.plan, writes, journal,
    livePresentation: resolveAssistantPresentation(live[0]), restoredPresentation: resolveAssistantPresentation(cold[0]) };
}

describe('terminal ownership: production callbacks and mounted response across cold restore', () => {
  it.each([
    ['normal itinerary only', {}],
    ['empty itinerary terminal after initial failure', { failFirst: true, emptyText: true }],
    ['stamped prose successor', { stampedProse: true }],
    ['stamped prose after initial failure', { failFirst: true, stampedProse: true }],
    ['unstamped v2 display text after initial failure', { failFirst: true }],
  ])('%s preserves the visible answer and its ownership', async (_name, options) => {
    const r = await faultCase(options);
    const live = toLiveTrailieResponseModel({ message: r.live });
    const cold = toRestoredTrailieResponseModel({ message: r.restored });
    expect(normalizeTrailiePresentation(cold)).toEqual(normalizeTrailiePresentation(live));
    expect(cold.lifecycle).toEqual(live.lifecycle);
    expect(r.restored.responseRevision).toBe(r.live.responseRevision);
    expect(r.restored.lifecycleStatus).toBe(r.live.lifecycleStatus);
    expect(live.lifecycle.showPlan).toBe(true);
    expect(live.lifecycle.showProse).toBe(Boolean(options.stampedProse));
    expect(r.live.responseRevision).toBe(options.stampedProse ? 2 : 1);
    const view = render(<TrailieResponse response={live} hideActions />);
    expect(view.getAllByRole('article', { name: 'Assistant message' })).toHaveLength(1);
    expect(view.getAllByText('A quiet canyon introduction.')).toHaveLength(1);
    expect(view.getAllByText('Check the shuttle before departure.')).toHaveLength(1);
    const visible = view.container.textContent;
    view.rerender(<TrailieResponse response={cold} hideActions />);
    expect(view.container.textContent).toBe(visible);
    expect(view.getAllByRole('article', { name: 'Assistant message' })).toHaveLength(1);
    cleanup();
  });
  it('keeps text-only responses on direct terminal persistence and restores their prose', async () => {
    const { createSimulatedClient } = await import('./stage14Harness');
    const persistence = createPersistenceAdapter();
    const turn = await runTurn({ structuredFailure: true });
    const client = createSimulatedClient({ persistence });
    await client.consume(turn.recorder);
    const stored = [...persistence.state.trips.values()][0];
    const coldMessages = reconcileRestoredConversation([], mapServerMessagesToUi(JSON.parse(JSON.stringify(stored.conversation))));
    expect(client.assistantTurns()).toHaveLength(1);
    expect(coldMessages.filter(m => m.role === 'assistant')).toHaveLength(1);
    const live = toLiveTrailieResponseModel({ message: client.assistantTurns()[0] });
    const cold = toRestoredTrailieResponseModel({ message: coldMessages.find(m => m.role === 'assistant') });
    expect(live.lifecycle.showProse).toBe(true);
    expect(live.lifecycle.showPlan).toBe(false);
    expect(normalizeTrailiePresentation(cold)).toEqual(normalizeTrailiePresentation(live));
    expect(client.assistantTurns()[0].responseRevision).toBeUndefined();
  });
});
