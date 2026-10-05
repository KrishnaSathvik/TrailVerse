'use strict';

/**
 * P0 — the guard must work THROUGH `executeTrailieV2Turn`, not just in isolation.
 *
 * `liveBudgetGuard.test.js` exercised the module directly and passed, while the
 * wiring threw `ReferenceError: Cannot access 'routing' before initialization`
 * on every attempt: the executeAttempt callback read the `const routing` that
 * the very call it is passed into initialises. The routing ladder swallowed it
 * as `provider_attempt_failed`, so a live gate saw `provider_unavailable` and
 * spent nothing while proving nothing. A module test cannot catch that — only
 * an injected one can.
 */

const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
const { createLiveBudgetGuard } = require('../liveBudgetGuard');
const { buildEvidenceBundle } = require('../evidenceBrokerService');

function proseResult(outputTokens = 400) {
  return {
    text: 'Here are a couple of sensible ways to shape the trip, with the tradeoffs for each.',
    toolCalls: [],
    structuredOutputStatus: 'none',
    completionStatus: 'complete',
    stopReason: 'stop',
    usage: { inputTokens: 900, outputTokens, cachedInputTokens: 0 },
  };
}

function buildDeps(overrides = {}) {
  const dispatches = [];
  const executeResponses = jest.fn(async (request) => {
    dispatches.push(request);
    return proseResult();
  });
  return {
    dispatches,
    deps: {
      planRequirements: () => [],
      resolveDeterministicRender: () => ({ eligible: false }),
      detectContradiction: () => [],
      resolveEvidence: async ({ requirements = [], requestId }) => buildEvidenceBundle({
        requestId,
        resolutions: requirements.map((r) => ({
          requirementId: r.requirementId,
          status: 'satisfied_fresh',
          evidenceIds: [],
        })),
        candidates: [],
      }),
      now: () => new Date('2026-08-18T12:00:00.000Z'),
      newTurnId: () => 'turn-budget-wiring',
      streamGeneration: false,
      ...overrides,
      responseAdapters: {},
      executeResponses,
    },
  };
}

const turnInput = (userMessage) => ({
  userMessage,
  conversationContext: { history: [] },
  tripState: null,
  constraints: null,
  resolvedContext: {},
});

const PROMPT = 'What are a few sensible ways to spend four days around Great Basin in September?';

describe('the guard works through the real execution path', () => {
  test('injecting a guard does not break generation (TDZ regression)', async () => {
    const guard = createLiveBudgetGuard({ authorizedBudgetUsd: 5 });
    const { deps, dispatches } = buildDeps();

    const result = await executeTrailieV2Turn(turnInput(PROMPT), {
      ...deps, enabled: true, liveBudget: guard,
    });

    // The precise failure this test exists for.
    expect(result.terminalReason).not.toBe('provider_unavailable');
    expect(dispatches.length).toBeGreaterThan(0);
    const snap = guard.snapshot();
    expect(snap.dispatches.length).toBeGreaterThan(0);
    expect(snap.dispatches[0].dispatchAllowed).toBe(true);
    expect(snap.dispatches[0].attemptNumber).toEqual(expect.any(Number));
  });

  test('a budget too small to afford any attempt blocks before the provider is called', async () => {
    const guard = createLiveBudgetGuard({ authorizedBudgetUsd: 0.0000001 });
    const { deps, dispatches } = buildDeps();

    const result = await executeTrailieV2Turn(turnInput(PROMPT), {
      ...deps, enabled: true, liveBudget: guard,
    });

    expect(dispatches).toHaveLength(0);
    expect(result.status).toBe('failed');
    expect(result.terminalReason).toBe('live_budget_guard_blocked');
    expect(guard.snapshot().blockedDispatches).toBeGreaterThan(0);
    expect(guard.snapshot().actualSpendUsd).toBe(0);
  });

  test('the estimate is a real upper bound on the actual billed cost', async () => {
    // The guard read `request.maxOutputTokens`, but createResponsesRequest
    // nests it under `generation`. The flat read returned undefined, priced the
    // output term at zero, and the "upper bound" came in UNDER actual cost on
    // 3 of 3 live dispatches (1.33x, 1.32x, 2.09x). Bound must dominate actual.
    const guard = createLiveBudgetGuard({ authorizedBudgetUsd: 5 });
    const { deps } = buildDeps();
    await executeTrailieV2Turn(turnInput(PROMPT), {
      ...deps, enabled: true, liveBudget: guard,
    });
    const [row] = guard.snapshot().dispatches;
    expect(row.maxOutputTokens).toBeGreaterThan(0);
    expect(row.estimatedMaximumCostBeforeDispatch).toBeGreaterThan(0);
    if (row.actualCostAfterDispatch != null) {
      expect(row.estimatedMaximumCostBeforeDispatch)
        .toBeGreaterThanOrEqual(row.actualCostAfterDispatch);
    }
  });

  test('with no guard injected the path is untouched', async () => {
    const { deps, dispatches } = buildDeps();
    const result = await executeTrailieV2Turn(turnInput(PROMPT), { ...deps, enabled: true });
    expect(dispatches.length).toBeGreaterThan(0);
    expect(result.terminalReason).not.toBe('live_budget_guard_blocked');
    expect(result.telemetrySummary.liveBudget).toBeNull();
  });

  test('the ledger is surfaced in telemetry and never exceeds the authorization', async () => {
    const guard = createLiveBudgetGuard({ authorizedBudgetUsd: 5 });
    const { deps } = buildDeps();
    const result = await executeTrailieV2Turn(turnInput(PROMPT), {
      ...deps, enabled: true, liveBudget: guard,
    });
    const ledger = result.telemetrySummary.liveBudget;
    expect(ledger).not.toBeNull();
    expect(ledger.authorizedBudgetUsd).toBe(5);
    expect(ledger.actualSpendUsd).toBeLessThanOrEqual(ledger.authorizedBudgetUsd);
    expect(ledger.remainingBudgetUsd).toBeGreaterThanOrEqual(0);
  });
});
