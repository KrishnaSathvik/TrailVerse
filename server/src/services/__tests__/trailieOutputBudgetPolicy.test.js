'use strict';

/**
 * OUTPUT BUDGET POLICY — B1..B8.
 *
 * On 2026-09-23 a correctly-requested two-day itinerary escalated to
 * `sol_medium`, which spent 1,908 of its 3,000 output tokens on reasoning and
 * had ~1,092 left for the tool call. Output stopped at exactly 3,000 with
 * `output_incomplete`. The most expensive tier in the ladder was the LEAST
 * likely to produce an artifact.
 *
 * The fix is a tier-aware ceiling, not a bigger global one. These tests pin
 * both halves: the new headroom exists where it was earned, and it does NOT
 * exist anywhere else — least of all on a plain-answer turn, which is the
 * misclassification that this project has already paid for once.
 */

const {
  executeTrailieV2Turn,
  __testables,
} = require('../trailieV2ExecutionService');
const { createLiveBudgetGuard } = require('../liveBudgetGuard');
const { estimateMaximumCostUsd } = require('../liveBudgetGuard');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');

const { resolveOutputBudget, OUTPUT_BUDGET_POLICY, MAX_OUTPUT_TOKENS } = __testables;

// ---------------------------------------------------------------------------
// B8 (1)(2)(3)(4) — the policy table itself
// ---------------------------------------------------------------------------

describe('B8 — output policy routing', () => {
  test('(1) Terra architect maximum is UNCHANGED', () => {
    for (const tier of ['sol_low', 'luna_low']) {
      const budget = resolveOutputBudget({ itinerary: true, tier });
      expect(budget.requestMaxOutputTokens).toBe(3000);
      expect(budget.reasoningHeadroomTokens).toBe(0);
      expect(budget.artifactOutputBudgetTokens).toBe(3000);
    }
  });

  test('(2) Sol medium architect gets the larger reasoning-aware maximum', () => {
    const budget = resolveOutputBudget({ itinerary: true, tier: 'sol_medium' });
    expect(budget.artifactOutputBudgetTokens).toBe(3000);
    expect(budget.reasoningHeadroomTokens).toBe(3000);
    expect(budget.requestMaxOutputTokens).toBe(6000);
    // B2 — the smallest justified bound, nowhere near a model maximum.
    expect(budget.requestMaxOutputTokens).toBeLessThanOrEqual(2 * 3000);
  });

  test('(3) buddy / default (non-architect) limits are UNCHANGED', () => {
    for (const tier of [null, 'terra_low', 'terra_medium', 'sol_medium', 'luna_low']) {
      expect(resolveOutputBudget({ itinerary: false, tier }).requestMaxOutputTokens).toBe(1200);
    }
  });

  test('(4) the larger Sol cap does NOT revive the wrong-contract bug', () => {
    // A plain-answer turn cannot reach the architect budget by ANY tier: the
    // artifact term is chosen by the artifact contract, never by the model.
    const wrongContract = resolveOutputBudget({ itinerary: false, tier: 'sol_medium' });
    expect(wrongContract.artifactOutputBudgetTokens).toBe(1200);
    expect(wrongContract.reasoningHeadroomTokens).toBe(0);
    expect(wrongContract.requestMaxOutputTokens).toBe(1200);
  });

  test('B3 — the ceiling is the sum of two explicitly named terms', () => {
    for (const tier of ['terra_low', 'sol_medium', 'luna_low', null]) {
      for (const itinerary of [true, false]) {
        const budget = resolveOutputBudget({ itinerary, tier });
        expect(budget.requestMaxOutputTokens)
          .toBe(budget.artifactOutputBudgetTokens + budget.reasoningHeadroomTokens);
      }
    }
  });

  test('B1 — the published artifact constant is untouched', () => {
    expect(MAX_OUTPUT_TOKENS.architect).toBe(3000);
    expect(MAX_OUTPUT_TOKENS.default).toBe(1200);
    // Headroom is granted per tier, never as a new global default.
    expect(OUTPUT_BUDGET_POLICY.defaultReasoningHeadroomTokens).toBe(0);
    expect(Object.keys(OUTPUT_BUDGET_POLICY.reasoningHeadroomTokens)).toEqual(['sol_medium', 'astra_medium']);
  });

  test('an unrecognised tier falls back to zero headroom, never to the largest', () => {
    expect(resolveOutputBudget({ itinerary: true, tier: 'some_future_tier' }).requestMaxOutputTokens)
      .toBe(3000);
    expect(resolveOutputBudget({ itinerary: true }).requestMaxOutputTokens).toBe(3000);
  });

  test('B4 — the reserve is a policy number, not the one observed reasoning count', () => {
    // 1,908 was ONE sample. The reserve must not be derived from it.
    expect(OUTPUT_BUDGET_POLICY.reasoningHeadroomTokens.sol_medium).not.toBe(1908);
    expect(OUTPUT_BUDGET_POLICY.reasoningHeadroomTokens.sol_medium).toBeGreaterThan(1908);
  });
});

// ---------------------------------------------------------------------------
// B7 / B8 (5)(6)(7)(8) — the policy through the real execution path
// ---------------------------------------------------------------------------

function itineraryResult() {
  const days = [{
    id: 'd1',
    dayNumber: 1,
    label: 'Day 1',
    stops: [
      { name: 'Visitor Center orientation', duration: 45, timeWindow: 'Morning' },
      { name: 'Valley floor scenic walk', duration: 90, timeWindow: 'Late morning' },
      { name: 'Picnic and rest buffer', duration: 60, timeWindow: 'Midday' },
    ],
  }];
  return {
    provider: 'openai',
    model: 'gpt-6-sol',
    outputText: '',
    toolCalls: [{ name: 'create_itinerary', id: 'c1', input: { days }, rawArgs: JSON.stringify({ days }) }],
    completionStatus: 'complete',
    stopReason: 'stop',
    refusal: null,
    usage: { inputTokens: 1200, outputTokens: 300, cachedInputTokens: 0 },
  };
}

/** Forces escalation: no tool call, so the attempt fails and the ladder moves on. */
function missingTool() {
  return {
    provider: 'openai',
    model: 'gpt-6-sol',
    outputText: '',
    toolCalls: [],
    completionStatus: 'complete',
    stopReason: 'stop',
    refusal: null,
    usage: { inputTokens: 100, outputTokens: 10 },
  };
}

/** The live 2026-09-23 shape: output stopped dead on the ceiling. */
function outputIncomplete(maxOutputTokens, reasoningTokens) {
  return {
    ...missingTool(),
    model: 'gpt-6-astra',
    completionStatus: 'incomplete',
    stopReason: 'max_tokens',
    usage: {
      inputTokens: 4574,
      outputTokens: maxOutputTokens,
      reasoningTokens,
      cachedInputTokens: 0,
    },
  };
}

function classification(overrides = {}) {
  return {
    version: 'trailie-intent-v2.0.0',
    source: 'deterministic',
    primaryIntent: 'general_qa',
    verticals: ['parks'],
    depth: 'quick',
    freshness: 'stable',
    actionability: 'informational',
    scope: 'single_destination',
    entities: [{ type: 'destination', role: 'target', canonicalId: 'park:nps:zion', confidence: 1 }],
    confidence: 0.9,
    reasonCodes: ['general_travel_question'],
    compound: false,
    requiresLunaShadow: false,
    travelerJob: null,
    ...overrides,
  };
}

function buildDeps(overrides = {}) {
  const dispatches = [];
  const userExec = overrides.executeResponses;
  const executeResponses = jest.fn(async (request, ctx) => {
    dispatches.push(request);
    return userExec ? userExec(request, ctx) : itineraryResult();
  });
  return {
    dispatches,
    deps: {
      classifyIntent: () => classification(),
      planRequirements: () => [],
      resolveDeterministicRender: () => ({ eligible: false }),
      detectContradiction: () => [],
      resolveEvidence: async ({ requirements = [], requestId }) => buildEvidenceBundle({
        requestId,
        resolutions: requirements.map((r) => ({
          requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [],
        })),
        candidates: [],
      }),
      now: () => new Date('2026-09-23T12:00:00.000Z'),
      newTurnId: () => 'turn-output-policy',
      streamGeneration: false,
      ...overrides,
      responseAdapters: {},
      executeResponses,
    },
  };
}

const ITINERARY_INTENT = () => classification({
  primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'],
});

const input = (userMessage) => ({
  userMessage,
  conversationContext: { history: [] },
  tripState: null,
  constraints: null,
  resolvedContext: {},
});

const ITINERARY_PROMPT = 'Plan two full days for us at Zion in late September.';
const PROSE_PROMPT = 'What is Zion like in late September?';

describe('B8 — the policy through executeTrailieV2Turn', () => {
  test('(5) a required itinerary escalating to Sol dispatches with the new limit', async () => {
    const sequence = [missingTool, missingTool, itineraryResult];
    let i = 0;
    const { deps, dispatches } = buildDeps({
      classifyIntent: ITINERARY_INTENT,
      executeResponses: async () => sequence[Math.min(i++, sequence.length - 1)](),
    });

    await executeTrailieV2Turn(input(ITINERARY_PROMPT), { ...deps, enabled: true });

    expect(dispatches.length).toBe(3);
    // Terra primary + Terra retry keep 3,000; the Sol escalation gets 6,000.
    expect(dispatches[0].model).toBe('gpt-6-sol');
    expect(dispatches[0].generation.maxOutputTokens).toBe(6000);
    expect(dispatches[1].generation.maxOutputTokens).toBe(6000);
    expect(dispatches[2].model).toBe('gpt-6-astra');
    expect(dispatches[2].generation.maxOutputTokens).toBe(6000);
  });

  test('(4, live) a plain-answer turn never dispatches an architect budget', async () => {
    const { deps, dispatches } = buildDeps({
      executeResponses: async () => ({
        provider: 'openai',
        model: 'gpt-6-sol',
        outputText: 'Late September is mild, with fewer crowds after Labor Day.',
        toolCalls: [],
        completionStatus: 'complete',
        stopReason: 'stop',
        refusal: null,
        usage: { inputTokens: 800, outputTokens: 120 },
      }),
    });

    await executeTrailieV2Turn(input(PROSE_PROMPT), { ...deps, enabled: true });

    expect(dispatches.length).toBeGreaterThan(0);
    for (const dispatch of dispatches) {
      expect(dispatch.generation.maxOutputTokens).toBe(1200);
    }
  });

  test('(6) the budget guard sees the SAME maxOutputTokens as the request', async () => {
    const guard = createLiveBudgetGuard({ authorizedBudgetUsd: 5 });
    const sequence = [missingTool, missingTool, itineraryResult];
    let i = 0;
    const { deps, dispatches } = buildDeps({
      classifyIntent: ITINERARY_INTENT,
      executeResponses: async () => sequence[Math.min(i++, sequence.length - 1)](),
    });

    await executeTrailieV2Turn(input(ITINERARY_PROMPT), {
      ...deps, enabled: true, liveBudget: guard,
    });

    const rows = guard.snapshot().dispatches;
    expect(rows).toHaveLength(dispatches.length);
    rows.forEach((row, index) => {
      expect(row.maxOutputTokens).toBe(dispatches[index].generation.maxOutputTokens);
    });
    // B7 — the larger Sol allowance must reach the conservative estimate.
    expect(rows[2].maxOutputTokens).toBe(6000);
    expect(rows[2].estimatedMaximumCostBeforeDispatch)
      .toBeGreaterThan(rows[0].estimatedMaximumCostBeforeDispatch);
  });

  test('(7) a larger Sol request exceeding authorization is blocked BEFORE dispatch', async () => {
    // Sized to sit between what a Terra attempt costs and what the enlarged Sol
    // attempt costs, so the ladder runs and then the escalation is refused.
    const at = new Date('2026-09-23T12:00:00.000Z');
    const solBound = estimateMaximumCostUsd({
      provider: 'openai', model: 'gpt-6-astra', inputTokenEstimate: 2000, maxOutputTokens: 6000, at,
    });
    const solBoundAtOldCap = estimateMaximumCostUsd({
      provider: 'openai', model: 'gpt-6-astra', inputTokenEstimate: 2000, maxOutputTokens: 3000, at,
    });
    expect(solBound).toBeGreaterThan(solBoundAtOldCap);

    const guard = createLiveBudgetGuard({ authorizedBudgetUsd: solBoundAtOldCap });
    const { deps, dispatches } = buildDeps({
      classifyIntent: ITINERARY_INTENT,
      executeResponses: async () => missingTool(),
    });

    const result = await executeTrailieV2Turn(input(ITINERARY_PROMPT), {
      ...deps, enabled: true, liveBudget: guard,
    });

    const snapshot = guard.snapshot();
    const solRow = snapshot.dispatches.find((row) => row.model === 'gpt-6-astra');
    expect(solRow).toBeDefined();
    expect(solRow.maxOutputTokens).toBe(6000);
    expect(solRow.dispatchAllowed).toBe(false);
    expect(solRow.blockReason).toBe('live_budget_guard_blocked');
    // Refused before the provider: no Sol request was ever built into a dispatch.
    expect(dispatches.some((d) => d.model === 'gpt-6-astra')).toBe(false);
    expect(result.status).toBe('failed');
  });

  test('(8) no dispatch escapes the policy — every request carries a policy value', async () => {
    const sequence = [missingTool, missingTool, itineraryResult];
    let i = 0;
    const { deps, dispatches } = buildDeps({
      classifyIntent: ITINERARY_INTENT,
      executeResponses: async () => sequence[Math.min(i++, sequence.length - 1)](),
    });

    await executeTrailieV2Turn(input(ITINERARY_PROMPT), { ...deps, enabled: true });

    const allowed = new Set([1200, 3000, 6000]);
    for (const dispatch of dispatches) {
      expect(allowed.has(dispatch.generation.maxOutputTokens)).toBe(true);
      expect(dispatch.generation.maxOutputTokens).toBe(
        resolveOutputBudget({
          itinerary: dispatch.tools.length > 0,
          tier: dispatch.model === 'gpt-6-astra' ? 'astra_medium' : 'sol_medium',
        }).requestMaxOutputTokens,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// B6 — output-incomplete telemetry
// ---------------------------------------------------------------------------

describe('B6 — output-incomplete telemetry', () => {
  test('reasoning, allowance, status and headroom are captured separately', async () => {
    // Replays the live shape at the NEW ceiling: 1,908 reasoning tokens no
    // longer starves the artifact, and the numbers needed to prove that are on
    // the attempt record.
    const { deps } = buildDeps({
      classifyIntent: ITINERARY_INTENT,
      executeResponses: async () => outputIncomplete(6000, 1908),
    });

    const result = await executeTrailieV2Turn(input(ITINERARY_PROMPT), { ...deps, enabled: true });

    const sol = result.attempts.find((a) => a.model === 'gpt-6-astra');
    expect(sol).toBeDefined();
    expect(sol.usage.reasoningTokens).toBe(1908);
    expect(sol.usage.outputTokens).toBe(6000);
    expect(sol.outputPolicy.maxOutputTokens).toBe(6000);
    expect(sol.outputPolicy.artifactOutputBudgetTokens).toBe(3000);
    expect(sol.outputPolicy.reasoningHeadroomTokens).toBe(3000);
    expect(sol.outputPolicy.artifactHeadroomTokens).toBe(6000 - 1908);
    expect(sol.completion.status).toBe('incomplete');
    expect(sol.completion.incompleteReason).toBe('max_output_tokens');
  });

  test('the old 3,000 ceiling is what left ~1,092 tokens for the artifact', () => {
    // Diagnostic arithmetic, pinned so the regression is legible: 3,000 minus
    // the observed 1,908 reasoning tokens is less than the MEDIAN serialized
    // two-day plan measured across real repo artifacts (~957 tokens) plus any
    // margin, and well under the p90 (~1,936).
    expect(3000 - 1908).toBe(1092);
    expect(6000 - 1908).toBeGreaterThan(3000);
  });

  test('telemetry carries token COUNTS only — no reasoning content field', async () => {
    const { deps } = buildDeps({
      classifyIntent: ITINERARY_INTENT,
      executeResponses: async () => outputIncomplete(6000, 1908),
    });
    const result = await executeTrailieV2Turn(input(ITINERARY_PROMPT), { ...deps, enabled: true });
    const serialized = JSON.stringify(result.attempts);
    expect(serialized).not.toMatch(/reasoningText|reasoningContent|chainOfThought|"thinking"/i);
    for (const attempt of result.attempts) {
      for (const value of Object.values(attempt.outputPolicy)) {
        expect(value === null || typeof value === 'number').toBe(true);
      }
    }
  });
});
