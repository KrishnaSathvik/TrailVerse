import { describe, it, expect } from 'vitest';
import { upsertItineraryTurn, updateProseTurn } from '@/utils/earlyRevisionMessages';

/**
 * Stage 14.7F1 §2 — the persisted conversation id must be numeric.
 *
 * The defect: the revision-1 shell used `response-${responseId}`, a string,
 * while `TripPlan.conversation` declares `id: Number`. Creating a trip from
 * `itinerary_ready` failed with a cast error before any prose existed.
 *
 * Canonical identity remains `responseId`; the numeric id is storage only.
 */

const effect = (overrides = {}) => ({
  responseId: 'resp-1',
  responseVersion: 1,
  itineraryHash: 'itin-1',
  canonicalPlan: { days: [{ id: 'd1', stops: [{ id: 's1' }] }] },
  response: { lifecycleStatus: 'itinerary_ready', contentHash: 'c0' },
  ...overrides,
});

const userMessage = (id) => ({ id, role: 'user', content: 'Plan a trip.' });
const assistantOf = (messages, responseId = 'resp-1') =>
  messages.find((m) => m.role === 'assistant' && m.responseId === responseId);

describe('§2 — numeric id allocation', () => {
  it('allocates a numeric id from an empty conversation', () => {
    const out = upsertItineraryTurn([], effect());
    const shell = assistantOf(out);
    expect(typeof shell.id).toBe('number');
    expect(Number.isFinite(shell.id)).toBe(true);
  });

  it('allocates a numeric id alongside existing numeric ids', () => {
    const out = upsertItineraryTurn([userMessage(1770000000000)], effect());
    const shell = assistantOf(out);
    expect(typeof shell.id).toBe('number');
    expect(shell.id).not.toBe(1770000000000);
  });

  it('never collides with an id already used in the conversation', () => {
    // A same-millisecond turn is the realistic collision case.
    const now = Date.now();
    const existing = [userMessage(now), { id: now + 1, role: 'assistant', content: 'earlier' }];
    const out = upsertItineraryTurn(existing, effect());
    const ids = out.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not derive the numeric id from responseId', () => {
    const a = upsertItineraryTurn([], effect({ responseId: 'resp-AAAA' }));
    const b = upsertItineraryTurn([], effect({ responseId: 'resp-BBBB' }));
    const idA = assistantOf(a, 'resp-AAAA').id;
    const idB = assistantOf(b, 'resp-BBBB').id;
    // Ids come from the clock, not the response identity — so they must not
    // encode it in any recoverable way.
    expect(String(idA)).not.toContain('AAAA');
    expect(String(idB)).not.toContain('BBBB');
    expect(typeof idA).toBe('number');
    expect(typeof idB).toBe('number');
  });

  it('never emits a string id, even when a transient placeholder exists', () => {
    // `err-…` / `guest-limit-…` placeholders carry string ids that must not
    // become persisted ids.
    const messages = [
      userMessage(1770000000000),
      { id: 'err-123', role: 'assistant', content: '', isStreaming: true },
    ];
    const out = upsertItineraryTurn(messages, effect());
    const shell = assistantOf(out);
    expect(typeof shell.id).toBe('number');
  });

  it('reuses a numeric placeholder id so the turn is not duplicated', () => {
    const placeholderId = 1770000000042;
    const messages = [
      userMessage(1770000000000),
      { id: placeholderId, role: 'assistant', content: '', isStreaming: true },
    ];
    const out = upsertItineraryTurn(messages, effect());
    expect(assistantOf(out).id).toBe(placeholderId);
    expect(out.filter((m) => m.role === 'assistant')).toHaveLength(1);
  });
});

describe('§2 — identity stability', () => {
  it('duplicate itinerary_ready does not allocate a second id or turn', () => {
    const first = upsertItineraryTurn([userMessage(1)], effect());
    const firstId = assistantOf(first).id;
    const second = upsertItineraryTurn(first, effect());

    expect(second.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(assistantOf(second).id).toBe(firstId);
  });

  it('two different responses get two distinct turns and ids', () => {
    const first = upsertItineraryTurn([userMessage(1)], effect({ responseId: 'resp-1' }));
    const both = upsertItineraryTurn(first, effect({ responseId: 'resp-2', itineraryHash: 'itin-2' }));

    const assistants = both.filter((m) => m.role === 'assistant');
    expect(assistants).toHaveLength(2);
    expect(assistants[0].id).not.toBe(assistants[1].id);
    expect(assistants.map((m) => m.responseId)).toEqual(['resp-1', 'resp-2']);
  });

  it('revision 2 preserves the revision-1 numeric id and timestamp', () => {
    const first = upsertItineraryTurn([userMessage(1)], effect());
    const shell = assistantOf(first);

    const second = updateProseTurn(first, {
      responseId: 'resp-1',
      content: 'Day 1 — South Rim.',
      response: { lifecycleStatus: 'prose_ready', contentHash: 'c1' },
    });
    const updated = assistantOf(second);

    expect(updated.id).toBe(shell.id);
    expect(updated.timestamp).toBe(shell.timestamp);
    expect(updated.responseRevision).toBe(2);
    expect(updated.content).toBe('Day 1 — South Rim.');
    // Itinerary identity is carried over, never re-derived.
    expect(updated.itineraryHash).toBe(shell.itineraryHash);
    expect(updated.itineraryPlan).toBe(shell.itineraryPlan);
  });

  it('conversation ordering places the shell after the user message', () => {
    const out = upsertItineraryTurn([userMessage(1770000000000)], effect());
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('the canonical revision-1 shell keeps empty content', () => {
    const shell = assistantOf(upsertItineraryTurn([], effect()));
    expect(shell.content).toBe('');
    expect(shell.responseRevision).toBe(1);
    expect(shell.lifecycleStatus).toBe('itinerary_ready');
    expect(shell.responseId).toBe('resp-1');
    expect(shell.itineraryHash).toBe('itin-1');
  });
});
