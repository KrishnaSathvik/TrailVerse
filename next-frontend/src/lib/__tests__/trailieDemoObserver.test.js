/**
 * The demo observer is a passive tee. These tests assert the two properties
 * that matter for manual acceptance: it records the fields the operator reads,
 * and it never retains credentials.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installTrailieDemoObserver,
  recordTrailieDemoSubmission,
  recordTrailieDemoTripId,
} from '../trailieDemoObserver';

describe('trailieDemoObserver', () => {
  beforeEach(() => {
    delete window.__trailieDemo;
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('installs once and is safe to call repeatedly', () => {
    const first = installTrailieDemoObserver();
    const second = installTrailieDemoObserver();
    expect(first).toBe(second);
    expect(window.__trailieDemo).toBe(first);
  });

  it('opens a record per submitted prompt with the reviewed fields', () => {
    installTrailieDemoObserver();
    recordTrailieDemoSubmission({
      prompt: 'Plan a 2-day Yellowstone trip for a family',
      authenticated: true,
      tripId: null,
    });

    const turn = window.__trailieDemo.last();
    expect(turn).toMatchObject({
      prompt: 'Plan a 2-day Yellowstone trip for a family',
      authenticated: true,
      tripId: null,
      responseId: null,
      providerRequestCount: 0,
      itineraryReadyObserved: false,
      proseReadyObserved: false,
      persistenceWrites: 0,
      doneWrites: 0,
      costUsd: null,
    });
    expect(turn).toHaveProperty('responseVersion');
    expect(turn).toHaveProperty('responseRevision');
    expect(turn).toHaveProperty('provider');
    expect(turn).toHaveProperty('model');
  });

  it('attaches the trip id once the create write resolves it', () => {
    installTrailieDemoObserver();
    recordTrailieDemoSubmission({ prompt: 'x', authenticated: true, tripId: null });
    recordTrailieDemoTripId('trip-123');
    expect(window.__trailieDemo.last().tripId).toBe('trip-123');
  });

  it('ignores submissions when it was never installed', () => {
    expect(() =>
      recordTrailieDemoSubmission({ prompt: 'x', authenticated: false, tripId: null })
    ).not.toThrow();
    expect(window.__trailieDemo).toBeUndefined();
  });

  it('never retains credentials in the collected records', () => {
    installTrailieDemoObserver();
    recordTrailieDemoSubmission({ prompt: 'Plan a trip', authenticated: true, tripId: null });

    const serialized = JSON.stringify(window.__trailieDemo.turns);
    expect(serialized).not.toMatch(/authorization|bearer|password|token|cookie/i);
  });

  it('treats a v2 response_finalized event as turn-complete, not prose-ready', async () => {
    const { applySseEvent } = await import('../trailieDemoObserver.js');
    installTrailieDemoObserver();
    recordTrailieDemoSubmission({ prompt: 'Plan Glacier', authenticated: true, tripId: null });
    applySseEvent(window.__trailieDemo.last(), { type: 'response_finalized', model: 'gpt-5.6-terra' });
    expect(window.__trailieDemo.last().turnCompleteObserved).toBe(true);
    expect(window.__trailieDemo.last().proseReadyObserved).toBe(false);
    expect(window.__trailieDemo.last().model).toBe('gpt-5.6-terra');
  });

  it('marks prose-ready on explicit prose_ready events', async () => {
    const { applySseEvent } = await import('../trailieDemoObserver.js');
    installTrailieDemoObserver();
    recordTrailieDemoSubmission({ prompt: 'Plan Glacier', authenticated: true, tripId: null });
    applySseEvent(window.__trailieDemo.last(), { type: 'prose_ready', model: 'gpt-5.6-terra' });
    expect(window.__trailieDemo.last().proseReadyObserved).toBe(true);
    expect(window.__trailieDemo.last().turnCompleteObserved).toBe(false);
  });

  it('renders a compact row per turn for console review', () => {
    installTrailieDemoObserver();
    recordTrailieDemoSubmission({ prompt: 'a'.repeat(90), authenticated: true, tripId: 't1' });

    const [row] = window.__trailieDemo.table();
    expect(row.prompt).toHaveLength(58); // 57 chars + ellipsis
    expect(row).toMatchObject({ auth: true, tripId: 't1', providerReqs: 0, doneWrites: 0 });
  });
});
