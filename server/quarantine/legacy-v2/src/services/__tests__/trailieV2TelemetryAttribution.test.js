'use strict';

/**
 * TURN-2 P0 — per-attempt validation attribution must survive the WHOLE path.
 *
 * On 2026-08-20 the Zion turn burned three attempts and returned
 * `duplicate_base_experience`. That was true of attempts 1 and 3 only. Attempt
 * 2 produced six distinct, exposure-compliant stops, cleared completeness, and
 * was rejected by a LATER validator whose reason nothing retained: the router
 * computed `validationReasonCodes` per attempt, `finalize()` dropped them from
 * the public attempt shape, and `summarizeV2Telemetry` never had them to
 * forward. The turn was therefore only describable as "a post-completeness
 * validator said no" — which is not an attribution.
 *
 * These tests run END TO END: executeTrailieV2Turn -> routing attempt ->
 * finalize -> summarizeV2Telemetry, with the provider boundary injected. An
 * isolated projection test cannot catch this class of bug; two shipped bugs in
 * this service (the guard TDZ and the nested maxOutputTokens read) already
 * proved that.
 *
 * Fully offline: every provider boundary is a fake, asserted at the end.
 */

const { executeTrailieV2Turn } = require('../../../../../src/services/trailieV2ExecutionService');
const { summarizeV2Telemetry } = require('../../../../../src/services/trailieV2RouteBridge');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');
const {
  getProviderTestSummary,
  resetProviderTestSummary,
} = require('../../../../../src/config/providerTestPolicy');

const PROMPT = 'Build me a day-by-day itinerary for two days at Zion.';

/** Six named stops over two days, all distinct places — clears completeness. */
function cleanDays(stopOverrides = {}) {
  const stop = (id, order, type, name, note, extra = {}) => ({
    id, order, type, name, note, startTime: '', duration: 90, exposureLevel: 'low', ...extra,
  });
  return [
    {
      id: 'd1',
      dayNumber: 1,
      label: 'Day 1',
      stops: [
        stop('s1', 1, 'trail', 'Lower Emerald Pool Trail', 'An easy paved walk to the lower pool.', { duration: 120 }),
        stop('s2', 2, 'lodge', 'Zion Lodge', 'A relaxed break with restrooms and water.', { duration: 45 }),
        stop('s3', 3, 'museum', 'Human History Museum', 'Indoor exhibits and the orientation film.', stopOverrides.day1Stop3 || {}),
      ],
    },
    {
      id: 'd2',
      dayNumber: 2,
      label: 'Day 2',
      stops: [
        stop('s4', 1, 'trail', "Pa'rus Trail", 'A paved river walk with trailside exhibits.', { duration: 120 }),
        stop('s5', 2, 'visitor_center', 'Zion Nature Center', 'A shaded stop with interactive exhibits.', { duration: 60 }),
        stop('s6', 3, 'viewpoint', 'Canyon Junction Bridge', 'A short stroll to the bridge for river views.', { duration: 45 }),
      ],
    },
  ];
}

function itineraryResult({ intro, days = cleanDays(), outputText = '', usage } = {}) {
  const input = { intro, days };
  return {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    outputText,
    toolCalls: [{ name: 'create_itinerary', id: 'call_1', input, rawArgs: JSON.stringify(input) }],
    structuredOutput: null,
    structuredOutputStatus: null,
    completionStatus: 'complete',
    stopReason: 'stop',
    refusal: null,
    usage: usage || { inputTokens: 4574, outputTokens: 1281, reasoningTokens: 204, cachedInputTokens: 0 },
  };
}

function classification(overrides = {}) {
  return {
    version: 'trailie-intent-v2.0.0',
    source: 'deterministic',
    primaryIntent: 'simple_itinerary',
    verticals: ['itinerary'],
    depth: 'planning',
    freshness: 'current',
    actionability: 'planning',
    scope: 'single_destination',
    entities: [{ type: 'destination', role: 'target', canonicalId: 'park:nps:zion', confidence: 1 }],
    confidence: 0.97,
    reasonCodes: ['explicit_itinerary_request'],
    compound: false,
    requiresLunaShadow: false,
    travelerJob: 'day_by_day_itinerary',
    structurePolicy: 'required',
    // The same canonical understanding the live 2026-08-20 turn carried, so the
    // execution contract genuinely REQUIRES the canonical plan artifact.
    understanding: {
      contractVersion: 2,
      taskFamily: 'itinerary',
      taskStrength: 'explicit',
      confidence: 0.98,
      requestedArtifact: 'itinerary',
      forbiddenArtifacts: [],
      structurePolicy: 'required',
      destinationRelationship: 'single',
      destinationRefs: [{ entityId: 'nps:park:zion', parkCode: 'zion', displayName: 'Zion' }],
      temporalScope: { visitWindow: 'late september', durationDays: 2, durationSource: 'explicit_day_count' },
      operationalSubjects: [],
      explicitConstraints: [],
      softPreferences: [],
      underspecified: false,
      continuationOfActiveDecision: false,
      priorJob: null,
      topicShift: false,
      understandingSource: 'deterministic',
      reasonCodes: ['explicit_itinerary_request', 'explicit_day_count'],
    },
    ...overrides,
  };
}

function buildDeps({ executeAttempt, ...overrides } = {}) {
  const dispatches = [];
  const executeResponses = jest.fn(async (request) => {
    dispatches.push(request);
    return executeAttempt(dispatches.length, request);
  });
  return {
    dispatches,
    deps: {
      classifyIntent: jest.fn(() => classification()),
      planRequirements: jest.fn(() => []),
      resolveDeterministicRender: jest.fn(() => ({ eligible: false })),
      detectContradiction: jest.fn(() => []),
      resolveEvidence: jest.fn(async ({ requirements = [], requestId }) => buildEvidenceBundle({
        requestId,
        resolutions: requirements.map((r) => ({
          requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [],
        })),
        candidates: [],
      })),
      now: () => new Date('2026-08-21T12:00:00.000Z'),
      newTurnId: () => 'turn-telemetry-attribution',
      streamGeneration: false,
      ...overrides,
      responseAdapters: {},
      executeResponses,
    },
  };
}

const turnInput = (constraints = null) => ({
  userMessage: PROMPT,
  conversationContext: { history: [] },
  tripState: null,
  constraints,
  resolvedContext: {},
});

beforeEach(() => resetProviderTestSummary());

describe('the projected attempt exposes the ACTUAL post-completeness reason', () => {
  test('a traveler-language rejection is attributed, not swallowed', async () => {
    // The plan itself is clean; the stop note narrates the evidence system, so
    // the only validator that can reject this attempt runs AFTER completeness.
    const { deps } = buildDeps({
      executeAttempt: () => itineraryResult({
        intro: 'Two easy days in the canyon, with time to slow down and shoot.',
        days: cleanDays({ day1Stop3: { why: 'An evidence-supported candidate for the afternoon.' } }),
      }),
    });

    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    const telemetry = summarizeV2Telemetry(result);

    expect(result.status).toBe('failed');
    const [first] = telemetry.attempts;
    expect(first.validationStatus).toBe('fail');
    // The exact reason, at the exact stage — never "something after completeness".
    expect(first.validationReasonCodes).toContain('traveler_language_violation');
    expect(first.validationStage).toBe('traveler_language');
    // Completeness is explicitly NOT the reason.
    expect(first.validationReasonCodes).not.toContain('duplicate_base_experience');
  });

  test('the attempt-2 shape: a prose exposure-suitability rejection is attributed', async () => {
    // A structurally clean, completeness-passing plan whose INTRO certifies an
    // absence of exposure it has not established. `intro` is the one field the
    // plan-stage capture never retained, which is why the live attempt 2 was
    // unattributable.
    const { deps } = buildDeps({
      executeAttempt: () => itineraryResult({
        intro: 'The Pa’rus Trail walk has no drop-offs, so it suits you perfectly.',
      }),
    });

    const result = await executeTrailieV2Turn(
      turnInput({ avoidExposure: true, preferences: { avoidExposure: true } }),
      { ...deps, enabled: true }
    );
    const telemetry = summarizeV2Telemetry(result);

    const [first] = telemetry.attempts;
    expect(first.validationStage).toBe('prose_constraint_safety');
    expect(first.validationReasonCodes).toContain('unsupported_exposure_suitability_claim');
  });

  test('telemetry FORWARDS the execution result rather than re-deriving it', async () => {
    const { deps } = buildDeps({
      executeAttempt: () => itineraryResult({
        intro: 'Two easy days in the canyon.',
        days: cleanDays({ day1Stop3: { why: 'An evidence-supported candidate for the afternoon.' } }),
      }),
    });

    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    const telemetry = summarizeV2Telemetry(result);

    // One source of truth: every projected attempt equals its canonical record.
    result.attempts.forEach((attempt, index) => {
      expect(telemetry.attempts[index].validationReasonCodes)
        .toEqual(attempt.validationReasonCodes);
      expect(telemetry.attempts[index].validationStage).toBe(attempt.validationStage);
      expect(telemetry.attempts[index].validationStatus).toBe(attempt.validationStatus);
    });
    // And the terminal validation still matches the LAST attempt's codes.
    expect(result.validation.reasonCodes)
      .toEqual(expect.arrayContaining(result.attempts.at(-1).validationReasonCodes));
  });

  test('output-policy and completion diagnostics survive the projection', async () => {
    const { deps } = buildDeps({
      executeAttempt: () => ({
        ...itineraryResult({ intro: 'Two easy days.' }),
        toolCalls: [],
        completionStatus: 'incomplete',
        stopReason: 'max_tokens',
        usage: { inputTokens: 4574, outputTokens: 3000, reasoningTokens: 2990, cachedInputTokens: 0 },
      }),
    });

    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    const telemetry = summarizeV2Telemetry(result);
    const [first] = telemetry.attempts;

    expect(first.outputPolicy.maxOutputTokens).toBeGreaterThan(0);
    expect(first.outputPolicy.artifactHeadroomTokens).toEqual(expect.any(Number));
    expect(first.completion.status).toBe('incomplete');
    expect(first.completion.incompleteReason).toBe('max_output_tokens');
    expect(first.validationStage).toBe('structured_output');
    expect(first.validationReasonCodes).toContain('output_incomplete');
  });

  test('bounded structured-output diagnostics survive execution and telemetry projection', async () => {
    const malformed = {
      ...itineraryResult({ intro: '' }),
      outputText: '',
      toolCalls: [{
        id: 'diagnostic-tool-call',
        name: 'create_itinerary',
        input: { days: [{ dayNumber: 1 }] },
      }],
    };
    const { deps } = buildDeps({ executeAttempt: () => malformed });

    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    const telemetry = summarizeV2Telemetry(result);

    expect(result.attempts[0].validationDiagnostics).toMatchObject({
      kind: 'structured_output',
      structuredStatus: 'malformed_tool',
      structuralErrors: [{
        code: 'missing_required_field',
        path: 'days.0.stops',
        message: 'Required field is missing',
      }],
    });
    expect(telemetry.attempts[0].validationDiagnostics)
      .toEqual(result.attempts[0].validationDiagnostics);
    expect(JSON.stringify(telemetry.attempts)).not.toContain(JSON.stringify(malformed.toolCalls));
  });

  test('canonical-plan acceptance state is projected for a failed turn', async () => {
    const { deps } = buildDeps({
      executeAttempt: () => itineraryResult({
        intro: 'Two easy days.',
        days: cleanDays({ day1Stop3: { why: 'An evidence-supported candidate.' } }),
      }),
    });
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    const telemetry = summarizeV2Telemetry(result);

    expect(telemetry.hasPlan).toBe(false);
    expect(telemetry.canonicalPlanState).toBe('rejected');
    expect(telemetry.artifactFulfillment.fulfilled).toBe(false);
    expect(telemetry.terminalReason).toBe('routing_exhausted');
  });

  test('an accepted plan projects as accepted', async () => {
    const { deps } = buildDeps({
      executeAttempt: () => itineraryResult({
        intro: 'Two easy days in the canyon, with time to slow down between stops.',
      }),
    });
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    const telemetry = summarizeV2Telemetry(result);

    expect(result.status).toBe('complete');
    expect(telemetry.hasPlan).toBe(true);
    expect(telemetry.canonicalPlanState).toBe('accepted');
    expect(telemetry.attempts[0].validationStatus).toBe('pass');
    expect(telemetry.attempts[0].validationReasonCodes).toEqual([]);
    expect(telemetry.attempts[0].validationStage).toBeNull();
  });
});

describe('the projection stays bounded and provider-isolated', () => {
  test('no chain-of-thought, prompt text, or traveler content leaks into attempts', async () => {
    const { deps } = buildDeps({
      executeAttempt: () => itineraryResult({ intro: 'Two easy days in the canyon.' }),
    });
    const result = await executeTrailieV2Turn(turnInput(), { ...deps, enabled: true });
    const telemetry = summarizeV2Telemetry(result);

    const serialized = JSON.stringify(telemetry.attempts);
    expect(serialized).not.toContain(PROMPT);
    expect(serialized).not.toContain('canyon');
    for (const attempt of telemetry.attempts) {
      for (const code of attempt.validationReasonCodes) {
        expect(code).toMatch(/^[a-z0-9_]{1,64}$/);
      }
      if (attempt.validationStage) expect(attempt.validationStage).toMatch(/^[a-z0-9_]{1,64}$/);
    }
  });

  test('no live provider was constructed or dispatched', () => {
    const summary = getProviderTestSummary();
    expect(summary.liveOpenAiConstructors).toBe(0);
    expect(summary.liveAnthropicConstructors).toBe(0);
    expect(summary.liveProviderDispatches).toBe(0);
    expect(summary.externalProviderHttpRequests).toBe(0);
  });
});
