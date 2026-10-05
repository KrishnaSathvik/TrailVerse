'use strict';

/**
 * P0 — an authorized live cap must bind INSIDE a turn, not only between turns.
 *
 * Reproduces the 2026-08-18 overrun: $0.12 authorized, $0.1996 spent, because
 * the ledger was read once before the turn and three attempts followed.
 */

const {
  createLiveBudgetGuard,
  estimateMaximumCostUsd,
  LIVE_BUDGET_BLOCK_REASON,
} = require('../liveBudgetGuard');

const OPENAI = 'openai';
const TERRA = 'gpt-5.6-terra';
const SOL = 'gpt-5.6-sol';

describe('conservative pre-dispatch estimation', () => {
  test('prices the full output allowance, not a hopeful average', () => {
    const small = estimateMaximumCostUsd({
      provider: OPENAI, model: TERRA, inputTokenEstimate: 1000, maxOutputTokens: 1200,
    });
    const large = estimateMaximumCostUsd({
      provider: OPENAI, model: TERRA, inputTokenEstimate: 1000, maxOutputTokens: 3000,
    });
    expect(large).toBeGreaterThan(small);
  });

  test('an unpriceable model cannot be bounded, so it is not authorized', () => {
    const guard = createLiveBudgetGuard({ authorizedBudgetUsd: 10 });
    const verdict = guard.assess({
      provider: OPENAI, model: 'model-that-does-not-exist', inputTokenEstimate: 100, maxOutputTokens: 100,
    });
    expect(verdict.dispatchAllowed).toBe(false);
    expect(verdict.blockReason).toBe('live_budget_price_unknown');
  });
});

describe('the cap binds inside a turn', () => {
  test('an escalation that does not fit the remaining budget is refused', () => {
    const guard = createLiveBudgetGuard({ authorizedBudgetUsd: 0.12 });

    const first = guard.assess({
      provider: OPENAI, model: TERRA, inputTokenEstimate: 1100, maxOutputTokens: 3000, attemptNumber: 1,
    });
    expect(first.dispatchAllowed).toBe(true);
    guard.record({ ticket: first.ticket, costUsd: 0.0369, costStatus: 'priced' });

    const second = guard.assess({
      provider: OPENAI, model: TERRA, inputTokenEstimate: 1100, maxOutputTokens: 3000, attemptNumber: 2,
    });
    guard.record({ ticket: second.ticket, costUsd: 0.0603, costStatus: 'priced' });

    // The real run escalated here to Sol and blew the cap.
    const escalation = guard.assess({
      provider: OPENAI, model: SOL, inputTokenEstimate: 1100, maxOutputTokens: 3000, attemptNumber: 3,
    });
    expect(escalation.dispatchAllowed).toBe(false);
    expect(escalation.blockReason).toBe(LIVE_BUDGET_BLOCK_REASON);

    const snap = guard.snapshot();
    expect(snap.actualSpendUsd).toBeLessThanOrEqual(snap.authorizedBudgetUsd);
    expect(snap.blockedDispatches).toBe(1);
  });

  test('actual spend can never exceed the authorized budget across a run', () => {
    const guard = createLiveBudgetGuard({ authorizedBudgetUsd: 0.05 });
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const verdict = guard.assess({
        provider: OPENAI, model: SOL, inputTokenEstimate: 2000, maxOutputTokens: 3000, attemptNumber: attempt,
      });
      if (!verdict.dispatchAllowed) continue;
      // Charge the worst case the guard authorized.
      guard.record({
        ticket: verdict.ticket,
        costUsd: verdict.estimatedMaximumCostBeforeDispatch,
        costStatus: 'priced',
      });
    }
    const snap = guard.snapshot();
    expect(snap.actualSpendUsd).toBeLessThanOrEqual(0.05);
    expect(snap.remainingBudgetUsd).toBeGreaterThanOrEqual(0);
  });

  test('a repair attempt is guarded exactly like a primary one', () => {
    const guard = createLiveBudgetGuard({ authorizedBudgetUsd: 0.02 });
    const primary = guard.assess({
      provider: OPENAI, model: TERRA, inputTokenEstimate: 500, maxOutputTokens: 1200, attemptNumber: 1,
    });
    guard.record({ ticket: primary.ticket, costUsd: 0.019, costStatus: 'priced' });
    const repair = guard.assess({
      provider: OPENAI, model: TERRA, inputTokenEstimate: 500, maxOutputTokens: 1200, attemptNumber: 2,
    });
    expect(repair.dispatchAllowed).toBe(false);
  });
});

describe('accounting', () => {
  test('unpriced dispatches do not silently reduce the ledger', () => {
    const guard = createLiveBudgetGuard({ authorizedBudgetUsd: 1 });
    const verdict = guard.assess({
      provider: OPENAI, model: TERRA, inputTokenEstimate: 100, maxOutputTokens: 100,
    });
    guard.record({ ticket: verdict.ticket, costUsd: null, costStatus: 'cost_unknown' });
    expect(guard.snapshot().actualSpendUsd).toBe(0);
  });

  test('every dispatch decision is recorded with its bound and remaining budget', () => {
    const guard = createLiveBudgetGuard({ authorizedBudgetUsd: 0.1 });
    const v = guard.assess({
      provider: OPENAI, model: TERRA, inputTokenEstimate: 1000, maxOutputTokens: 1200, attemptNumber: 1,
    });
    guard.record({ ticket: v.ticket, costUsd: 0.004, costStatus: 'priced' });
    const [row] = guard.snapshot().dispatches;
    expect(row).toMatchObject({
      model: TERRA,
      attemptNumber: 1,
      maxOutputTokens: 1200,
      dispatchAllowed: true,
      blockReason: null,
      actualCostAfterDispatch: 0.004,
    });
    expect(row.estimatedMaximumCostBeforeDispatch).toBeGreaterThan(0);
    expect(row.remainingBudgetBeforeDispatch).toBe(0.1);
  });

  test('a guard requires a positive authorized budget', () => {
    expect(() => createLiveBudgetGuard({ authorizedBudgetUsd: 0 })).toThrow(TypeError);
    expect(() => createLiveBudgetGuard({})).toThrow(TypeError);
  });
});
