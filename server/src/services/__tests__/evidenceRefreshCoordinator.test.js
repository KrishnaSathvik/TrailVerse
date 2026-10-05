'use strict';

const { createEvidenceRefreshCoordinator } = require('../evidenceRefreshCoordinator');

const request = (operation = 'alerts') => ({
  provider: 'nps', operation, parameters: { parkCode: 'yose' },
  dedupeKey: 'nps|alerts|yose',
  publicCanonicalRequest: { provider: 'nps', operation, parkCode: 'yose' },
});

function harness(executeRefresh) {
  return createEvidenceRefreshCoordinator({
    acquireLease: jest.fn().mockResolvedValue({
      outcome: 'acquired', lease: { leaseKey: 'nps|alerts|yose', ownerId: 'owner', fencingToken: 7 },
    }),
    releaseLease: jest.fn().mockResolvedValue({ released: true }),
    executeRefresh,
    waitForRefresh: jest.fn().mockResolvedValue({ outcome: 'coalesced_store_update' }),
    leaseMs: 30000,
  });
}

describe('WP5A physical refresh coordinator', () => {
  test('twenty identical callers produce one physical execution and nineteen coalesced waiters', async () => {
    let releaseFetch;
    const executeRefresh = jest.fn(() => new Promise((resolve) => { releaseFetch = resolve; }));
    const coordinator = harness(executeRefresh);
    const calls = Array.from({ length: 20 }, (_, index) => coordinator.run({
      request: request(), ownerId: `owner-${index}`, requirementCount: 1,
    }));
    await Promise.resolve();
    releaseFetch({ outcome: 'succeeded', evidenceIds: ['ev:alert'] });
    const results = await Promise.all(calls);

    expect(executeRefresh).toHaveBeenCalledTimes(1);
    expect(results.filter((item) => item.coalesced)).toHaveLength(19);
    expect(Math.max(...results.map((item) => item.coalescedWaiters))).toBe(19);
  });

  test('same dedupe key with different physical semantics is an invariant violation', async () => {
    let releaseFetch;
    const coordinator = harness(jest.fn(() => new Promise((resolve) => { releaseFetch = resolve; })));
    const first = coordinator.run({ request: request('alerts'), ownerId: 'owner-a', requirementCount: 1 });
    await Promise.resolve();
    await expect(coordinator.run({ request: request('parks'), ownerId: 'owner-b', requirementCount: 1 }))
      .rejects.toMatchObject({ code: 'evidence_refresh_dedupe_collision' });
    releaseFetch({ outcome: 'succeeded' });
    await first;
  });

  test('cancelling one waiter detaches it without aborting shared work needed by another', async () => {
    let providerSignal;
    let releaseFetch;
    const coordinator = harness(jest.fn(({ signal }) => {
      providerSignal = signal;
      return new Promise((resolve) => { releaseFetch = resolve; });
    }));
    const controller = new AbortController();
    const first = coordinator.run({ request: request(), ownerId: 'owner-a', requirementCount: 1 });
    const second = coordinator.run({ request: request(), ownerId: 'owner-b', requirementCount: 1, signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    await expect(second).rejects.toMatchObject({ code: 'evidence_refresh_cancelled' });
    expect(providerSignal.aborted).toBe(false);
    releaseFetch({ outcome: 'succeeded' });
    await expect(first).resolves.toMatchObject({ outcome: 'succeeded' });
  });

  test('cancelling the last non-scheduled waiter aborts the physical work', async () => {
    let providerSignal;
    const coordinator = harness(jest.fn(({ signal }) => {
      providerSignal = signal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { code: 'provider_cancelled' }))));
    }));
    const controller = new AbortController();
    const only = coordinator.run({ request: request(), ownerId: 'owner-a', requirementCount: 1, signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    await expect(only).rejects.toMatchObject({ code: 'evidence_refresh_cancelled' });
    expect(providerSignal.aborted).toBe(true);
  });
});
