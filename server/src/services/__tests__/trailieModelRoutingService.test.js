'use strict';

const fs = require('fs');
const path = require('path');
const {
  runTrailieModelRouting,
} = require('../trailieModelRoutingService');

function context(overrides = {}) {
  const { signals: signalOverrides = {}, ...contextOverrides } = overrides;
  return {
    signals: {
      intent: 'simple_itinerary', depth: 'standard', tripDays: 3,
      destinationCount: 1, verticalCount: 1, hardConstraintCount: 0,
      ambiguity: 'low', evidenceCompleteness: 'complete', taskPhase: 'initial',
      ...signalOverrides,
    },
    evidenceBundle: { bundleId: 'frozen-bundle', evidence: [{ evidenceId: 'e1', claim: { text: 'PRIVATE_EVIDENCE_SENTINEL' } }] },
    tripState: { destination: 'PRIVATE_TRIP_SENTINEL' },
    constraints: { pace: 'PRIVATE_CONSTRAINT_SENTINEL' },
    promptV2: { publicPrefix: 'public', privateSuffix: 'PRIVATE_PROMPT_SENTINEL' },
    ...contextOverrides,
  };
}

function success(output = 'safe') {
  return { output, completionStatus: 'completed', usage: { inputTokens: 10, outputTokens: 2 } };
}

describe('WP9 isolated model routing and escalation', () => {
  test('is disabled by default and performs zero generation or validation', async () => {
    const executeAttempt = jest.fn();
    const validateAttempt = jest.fn();
    const result = await runTrailieModelRouting({ context: context(), executeAttempt, validateAttempt });
    expect(result).toMatchObject({ status: 'disabled', reasonCode: 'wp9_disabled', attempts: [] });
    expect(executeAttempt).not.toHaveBeenCalled();
    expect(validateAttempt).not.toHaveBeenCalled();
  });

  test('uses the narrow deterministic renderer without constructing a model attempt', async () => {
    const executeAttempt = jest.fn();
    const renderDeterministic = jest.fn().mockReturnValue('Entrance fee: $35.');
    const result = await runTrailieModelRouting({
      enabled: true,
      context: context({ signals: { intent: 'general_qa', deterministicRender: {
        eligible: true, exactValueAvailable: true, factType: 'entrance_fee', languageAddsValue: false,
      } } }),
      executeAttempt,
      validateAttempt: jest.fn(),
      renderDeterministic,
    });
    expect(result).toMatchObject({ status: 'complete', selectedTier: 'deterministic', output: 'Entrance fee: $35.', attempts: [] });
    expect(executeAttempt).not.toHaveBeenCalled();
    expect(renderDeterministic).toHaveBeenCalledTimes(1);
  });

  test('bounds deterministic renderer failures without exposing raw errors', async () => {
    const result = await runTrailieModelRouting({
      enabled: true,
      context: context({ signals: { intent: 'general_qa', deterministicRender: {
        eligible: true, exactValueAvailable: true, factType: 'entrance_fee', languageAddsValue: false,
      } } }),
      executeAttempt: jest.fn(),
      validateAttempt: jest.fn(),
      renderDeterministic: jest.fn().mockRejectedValue(new Error('PRIVATE_RENDER_ERROR')),
    });
    expect(result).toEqual({
      status: 'failed', reasonCode: 'deterministic_render_failed', selectedTier: null, attempts: [],
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_RENDER_ERROR');
  });

  test('returns after one passing Terra attempt', async () => {
    const executeAttempt = jest.fn().mockResolvedValue(success());
    const validateAttempt = jest.fn().mockResolvedValue({ status: 'pass', reasonCodes: [] });
    const result = await runTrailieModelRouting({ enabled: true, context: context(), executeAttempt, validateAttempt });
    expect(result).toMatchObject({ status: 'complete', selectedTier: 'sol_medium', output: 'safe' });
    expect(executeAttempt).toHaveBeenCalledTimes(1);
    expect(result.attempts).toHaveLength(1);
  });

  test('escalates a failed Luna attempt directly to Terra low', async () => {
    const executeAttempt = jest.fn()
      .mockResolvedValueOnce(success('luna'))
      .mockResolvedValueOnce(success('terra'));
    const validateAttempt = jest.fn()
      .mockResolvedValueOnce({ status: 'fail', locallyRepairable: true, reasonCodes: ['contract_failure'] })
      .mockResolvedValueOnce({ status: 'pass', reasonCodes: [] });
    const result = await runTrailieModelRouting({
      enabled: true,
      context: context({ signals: { intent: 'general_qa', depth: 'quick' } }),
      executeAttempt, validateAttempt,
    });
    expect(executeAttempt.mock.calls.map(([input]) => input.route.tier)).toEqual(['luna_low', 'sol_low']);
    expect(result).toMatchObject({ status: 'complete', selectedTier: 'sol_low', output: 'terra' });
  });

  test('allows exactly one same-model Terra retry for a locally repairable failure', async () => {
    const executeAttempt = jest.fn()
      .mockResolvedValueOnce(success('first'))
      .mockResolvedValueOnce(success('retry'));
    const validateAttempt = jest.fn()
      .mockResolvedValueOnce({ status: 'fail', locallyRepairable: true, reasonCodes: ['schema_repairable'] })
      .mockResolvedValueOnce({ status: 'pass', reasonCodes: [] });
    const result = await runTrailieModelRouting({ enabled: true, context: context(), executeAttempt, validateAttempt });
    expect(executeAttempt.mock.calls.map(([input]) => [input.route.tier, input.retry])).toEqual([
      ['sol_medium', false], ['sol_medium', true],
    ]);
    expect(result.attempts).toHaveLength(2);
    expect(result.selectedTier).toBe('sol_medium');
    expect(executeAttempt.mock.calls[1][0].repairReasonCodes).toEqual(['schema_repairable']);
  });

  test('keeps every attempt separately priced and never fabricates missing cost as zero', async () => {
    const executeAttempt = jest.fn()
      .mockResolvedValueOnce({ ...success('first'), costStatus: 'priced', costUsd: 0.012 })
      .mockResolvedValueOnce(success('second'));
    const validateAttempt = jest.fn()
      .mockResolvedValueOnce({ status: 'fail', locallyRepairable: true, reasonCodes: ['repairable'] })
      .mockResolvedValueOnce({ status: 'pass', reasonCodes: [] });
    const onAttempt = jest.fn();
    const result = await runTrailieModelRouting({
      enabled: true, context: context(), executeAttempt, validateAttempt, onAttempt,
    });
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toMatchObject({ attempt: 1, costStatus: 'priced', costUsd: 0.012 });
    expect(result.attempts[1]).toMatchObject({ attempt: 2, costStatus: 'cost_unknown', costUsd: null });
    expect(onAttempt.mock.calls.map(([attempt]) => attempt.attempt)).toEqual([1, 2]);
  });

  test('escalates only with sufficient candidates and demonstrated reasoning difficulty', async () => {
    const executeAttempt = jest.fn().mockResolvedValueOnce(success('initial')).mockResolvedValueOnce(success('repair')).mockResolvedValueOnce(success('sol'));
    const validateAttempt = jest.fn()
      .mockResolvedValueOnce({ status: 'fail', locallyRepairable: true, reasonCodes: ['schema_repairable'] })
      .mockResolvedValueOnce({ status: 'fail', locallyRepairable: false, reasonCodes: ['reasoning_failure'], repairUniverse: { remainingBudget: 1, operatorAvailable: true, scopeLegal: true, viable: true }, eligibleCandidateCount: 3, meaningfulProgress: true, reasoningSpecificFailure: true })
      .mockResolvedValueOnce({ status: 'pass', reasonCodes: [] });
    const result = await runTrailieModelRouting({ enabled: true, context: context(), executeAttempt, validateAttempt });
    expect(executeAttempt.mock.calls.map(([input]) => input.route.tier)).toEqual(['sol_medium', 'sol_medium', 'astra_medium']);
    expect(result.selectedTier).toBe('astra_medium');
    expect(result.attempts.map(({ retry, fallback }) => ({ retry, fallback }))).toEqual([
      { retry: false, fallback: false }, { retry: true, fallback: false }, { retry: false, fallback: true },
    ]);
  });

  test('stops after one Sol repair without reasoning-specific progress', async () => {
    const executeAttempt = jest.fn()
      .mockResolvedValueOnce(success('terra-1'))
      .mockResolvedValueOnce(success('terra-2'))
      .mockResolvedValueOnce(success('sol'));
    const validateAttempt = jest.fn()
      .mockResolvedValueOnce({ status: 'fail', locallyRepairable: true, reasonCodes: ['repairable'] })
      .mockResolvedValueOnce({ status: 'fail', locallyRepairable: true, reasonCodes: ['still_bad'] })
      .mockResolvedValueOnce({ status: 'pass', reasonCodes: [] });
    const result = await runTrailieModelRouting({ enabled: true, context: context(), executeAttempt, validateAttempt });
    expect(executeAttempt.mock.calls.map(([input]) => input.route.tier)).toEqual(['sol_medium', 'sol_medium']);
    expect(result.selectedTier).toBeNull();
  });

  test('fails bounded after Sol when Claude fallback is disabled', async () => {
    const executeAttempt = jest.fn().mockResolvedValue(success());
    const validateAttempt = jest.fn().mockResolvedValue({ status: 'fail', locallyRepairable: false, reasonCodes: ['hard_failure'] });
    const result = await runTrailieModelRouting({ enabled: true, context: context(), executeAttempt, validateAttempt });
    expect(executeAttempt.mock.calls.map(([input]) => input.route.tier)).toEqual(['sol_medium']);
    expect(result).toMatchObject({ status: 'failed', reasonCode: 'deterministic_blocker', selectedTier: null });
  });

  test('exhausts after Sol without Claude product-chat fallback (WP12 Phase 4)', async () => {
    const executeAttempt = jest.fn()
      .mockResolvedValueOnce(success('terra'))
      .mockResolvedValueOnce(success('sol'));
    const validateAttempt = jest.fn()
      .mockResolvedValueOnce({ status: 'fail', locallyRepairable: false, reasonCodes: ['hard'] })
      .mockResolvedValueOnce({ status: 'fail', locallyRepairable: false, reasonCodes: ['catastrophic'] });
    const result = await runTrailieModelRouting({
      enabled: true,
      context: context(), executeAttempt, validateAttempt,
    });
    expect(executeAttempt.mock.calls.map(([input]) => input.route.tier)).toEqual(['sol_medium']);
    expect(result).toMatchObject({ status: 'failed', reasonCode: 'deterministic_blocker' });
    expect(executeAttempt.mock.calls.every(([input]) => input.route.tier !== 'claude_fallback')).toBe(true);
  });

  test('passes the same deeply frozen evidence, TripState, constraints, and Prompt-v2 object to every attempt', async () => {
    const observed = [];
    const executeAttempt = jest.fn().mockImplementation(async ({ frozenContext }) => {
      observed.push(frozenContext);
      expect(Object.isFrozen(frozenContext)).toBe(true);
      expect(Object.isFrozen(frozenContext.evidenceBundle.evidence[0].claim)).toBe(true);
      expect(() => { frozenContext.tripState.destination = 'mutated'; }).toThrow();
      return success();
    });
    const validateAttempt = jest.fn()
      .mockResolvedValueOnce({ status: 'fail', locallyRepairable: true, reasonCodes: ['repair'] })
      .mockResolvedValueOnce({ status: 'pass', reasonCodes: [] });
    await runTrailieModelRouting({ enabled: true, context: context(), executeAttempt, validateAttempt });
    expect(observed).toHaveLength(2);
    expect(observed[0]).toBe(observed[1]);
  });

  test('telemetry is bounded and excludes prompts, evidence claims, TripState, outputs, and raw errors', async () => {
    const rawError = new Error('RAW_ERROR_SENTINEL PRIVATE_PROMPT_SENTINEL');
    rawError.body = 'RAW_BODY_SENTINEL';
    const executeAttempt = jest.fn().mockRejectedValue(rawError);
    const result = await runTrailieModelRouting({
      enabled: true, context: context(), executeAttempt,
      validateAttempt: jest.fn(),
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/RAW_ERROR_SENTINEL|RAW_BODY_SENTINEL|PRIVATE_PROMPT_SENTINEL|PRIVATE_EVIDENCE_SENTINEL|PRIVATE_TRIP_SENTINEL|PRIVATE_CONSTRAINT_SENTINEL/);
    expect(result.attempts[0]).toMatchObject({ status: 'provider_error', costStatus: 'cost_unknown', costUsd: null });
  });

  test('does not dispatch when already cancelled and stops escalation after cancellation', async () => {
    const pre = new AbortController(); pre.abort();
    const executeAttempt = jest.fn();
    expect(await runTrailieModelRouting({
      enabled: true, context: context(), executeAttempt,
      validateAttempt: jest.fn(), signal: pre.signal,
    })).toMatchObject({ status: 'cancelled', attempts: [] });
    expect(executeAttempt).not.toHaveBeenCalled();

    const during = new AbortController();
    const executing = jest.fn().mockImplementation(async () => { during.abort(); return success(); });
    const result = await runTrailieModelRouting({
      enabled: true, context: context(), executeAttempt: executing,
      validateAttempt: jest.fn().mockResolvedValue({ status: 'fail', locallyRepairable: true }),
      signal: during.signal,
    });
    expect(result.status).toBe('cancelled');
    expect(executing).toHaveBeenCalledTimes(1);
  });

  test('WP9 remains unreachable from resolveProviderModel (not product-chat generation)', () => {
    const root = path.resolve(__dirname, '../..');
    const files = [
      'config/resolveProviderModel.js',
    ];
    for (const file of files) {
      expect(fs.readFileSync(path.join(root, file), 'utf8')).not.toMatch(/trailieModelRouter|trailieModelRoutingService/);
    }
  });

  test('WP9 has no evidence broker, provider client, persistence, or SSE imports', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../trailieModelRoutingService.js'), 'utf8');
    expect(source).not.toMatch(/EvidenceBroker|evidenceBroker|npsService|ridbService|weather|webSearch|openaiService|claudeService|TripPlan|res\.(?:write|end)/);
  });
});
