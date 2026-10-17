import { describe, expect, it, vi } from 'vitest';
import { resolveTerminalOwnership, applyTerminalOwnership } from '../terminalOwnership';
import { createEarlyRevisionCoordinator } from '../earlyRevisionCoordinator';

const plan = { days: [{ day: 1, stops: [{ name: 'Visitor Center' }] }] };
describe('terminal ownership', () => {
  it.each([
    [{}, 'itinerary_only'],
    [{ content: 'Nonempty presentation is not a successor' }, 'itinerary_only'],
    [{ responseRevision: 1, lifecycleStatus: 'itinerary_ready' }, 'itinerary_only'],
    [{ responseRevision: 2 }, 'prose_successor'],
    [{ lifecycleStatus: 'prose_ready' }, 'prose_successor'],
    [{ lifecycleStatus: 'fallback_complete' }, 'prose_successor'],
    [{ response: { responseRevision: 2, lifecycleStatus: 'prose_ready' } }, 'prose_successor'],
    [{ responseRevision: 1, lifecycleStatus: 'prose_ready' }, 'itinerary_only'],
  ])('uses successor metadata: %j', (metadata, ownership) => {
    expect(resolveTerminalOwnership({ canonicalPlan: plan, ...metadata }).ownership).toBe(ownership);
  });
  it('does not invent an itinerary revision for a text-only terminal', () => {
    const decision = resolveTerminalOwnership({ responseId: 'plain', content: 'A direct answer.' });
    const projected = applyTerminalOwnership([], decision);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ content: 'A direct answer.', hasItinerary: false });
    expect(projected[0].responseRevision).toBeUndefined();
  });
  it('passes the identical decision to persistence and reveal, after persistence accepts', async () => {
    const persist = vi.fn(async () => ({ ok: true, tripId: 'saved' }));
    const reveal = vi.fn();
    const coordinator = createEarlyRevisionCoordinator({
      persistRevision1: async () => ({ ok: false }), persistTerminal: persist,
      view: { revealTerminal: reveal },
    });
    const response = { responseId: 'r', responseVersion: 1, responseRevision: 1,
      lifecycleStatus: 'itinerary_ready', content: '', contentHash: 'empty', itineraryHash: 'plan' };
    coordinator.handleEvent({ type: 'response_started', responseId: 'r' });
    coordinator.handleEvent({ type: 'itinerary_ready', response, canonicalPlan: { ...plan, ...response } });
    await coordinator.drain();
    coordinator.handleEvent({ type: 'done', ...response, content: 'Presentation only', canonicalPlan: plan });
    await coordinator.drain();
    expect(persist).toHaveBeenCalledTimes(1); expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal.mock.calls[0][0].terminalDecision).toBe(persist.mock.calls[0][0].terminalDecision);
    expect(persist.mock.invocationCallOrder[0]).toBeLessThan(reveal.mock.invocationCallOrder[0]);
  });
});
