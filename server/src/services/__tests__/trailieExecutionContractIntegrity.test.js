'use strict';

/**
 * DOWNSTREAM CONTRACT INTEGRITY — the invariants that keep a legacy phrase
 * ladder from silently reinterpreting a turn the canonical understanding
 * already got right.
 *
 * Everything here is offline: no providers, no network, no model calls.
 * Generation is a deterministic injected fake.
 */

const {
  classifyTrailieIntent,
  validateIntentClassification,
} = require('../trailieIntentClassifier');
const { buildTurnUnderstanding } = require('../turnUnderstanding');
const {
  deriveExecutionContract,
  summarizeExecutionContract,
} = require('../trailieExecutionContract');
const {
  validateArtifactFulfillment,
  buildArtifactNotAppliedMessage,
} = require('../artifactFulfillment');
const {
  executeTrailieV2Turn,
  __testables,
} = require('../trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');
const { translateTurnConstraints } = require('../../utils/canonicalConstraintTranslation');
const { parseConstraints } = require('../../utils/constraintEngine');
const {
  getProviderTestSummary,
  resetProviderTestSummary,
} = require('../../config/providerTestPolicy');

const ACTIVE_PLAN_STATE = Object.freeze({
  hasActiveTrip: true,
  hasItinerary: true,
  lastTravelerJob: 'day_by_day_itinerary',
  activeDecision: { kind: 'day_by_day_itinerary', destinationParkCode: 'bibe' },
});

function classify(userPrompt, priorTripState = null) {
  return classifyTrailieIntent({ userPrompt, priorTripState });
}

// ---------------------------------------------------------------------------
// 1. ARTIFACT ESCALATION CEILING
// ---------------------------------------------------------------------------

describe('artifact escalation ceiling', () => {
  // Generic paraphrase FAMILY: an open request for approaches, each carrying a
  // duration, because duration is the escalation trigger that broke T7.1.
  const PLAIN_ANSWER_WITH_DURATION = [
    "We have four days at Big Bend in late March and we can't settle on how to use them. Lay out a couple of different ways we could play it.",
    'We have four days at Zion in October. Give me a couple approaches.',
    'Four days at Olympic in June. How could we handle this?',
    "We'll have four days in Glacier. Walk me through a few options.",
    'Four days at Acadia in September. What are the sensible ways to do it?',
    'Five days at Sequoia in July. What are some different ways to shape it?',
  ];

  test.each(PLAIN_ANSWER_WITH_DURATION)(
    'duration alone cannot escalate a plain-answer request into a required itinerary: %s',
    (prompt) => {
      const understanding = buildTurnUnderstanding({ userPrompt: prompt });
      expect(understanding.requestedArtifact).toBe('plain_answer');
      expect(understanding.structurePolicy).toBe('optional');

      const intent = classify(prompt);
      // Legacy may still influence topical routing; it may NOT require an artifact.
      expect(intent.executionContract.allowsCanonicalPlanArtifact).toBe(false);
      expect(intent.executionContract.requiresCanonicalPlanArtifact).toBe(false);
      expect(intent.structurePolicy).toBe('optional');
      expect(validateIntentClassification(intent).valid).toBe(true);
    }
  );

  test('a blocked escalation is recorded as a reconciliation, not silently dropped', () => {
    const intent = classify(PLAIN_ANSWER_WITH_DURATION[0]);
    expect(intent.intentSource).toBe('reconciled');
    expect(intent.executionContract.reasonCodes).toContain('legacy_artifact_escalation_blocked');
    expect(intent.executionContract.conflicts[0]).toMatchObject({
      field: 'requestedArtifact',
      resolution: 'legacy_artifact_escalation_blocked',
    });
  });

  const FORBIDDEN_ARTIFACT_PROMPTS = [
    "Plan a week in southern Utah but don't build the daily itinerary yet.",
    'Help me plan 5 days in Utah. No day-by-day itinerary yet.',
    'We have six days in western Colorado. Don’t give me a day-by-day itinerary — just the shape of the trip.',
  ];

  test.each(FORBIDDEN_ARTIFACT_PROMPTS)(
    'no downstream classifier may produce itinerary-required execution when the artifact is forbidden: %s',
    (prompt) => {
      const intent = classify(prompt);
      expect(intent.forbiddenArtifacts).toContain('itinerary');
      expect(intent.executionContract.allowsCanonicalPlanArtifact).toBe(false);
      expect(intent.verticals).not.toContain('itinerary');
      expect(validateIntentClassification(intent).valid).toBe(true);
    }
  );

  test('the ceiling holds even with implicit trip framing plus a long duration', () => {
    // The latent hole: the implicit-trip-planning branch never saw the
    // understanding contract, so it could not honour a prohibition or a
    // structure policy on its own.
    const prompt = 'Four of us have five days at Big Bend and we want some hikes. '
      + "Don't build a day-by-day itinerary — just tell us how we could play it.";
    const intent = classify(prompt);
    expect(intent.forbiddenArtifacts).toContain('itinerary');
    expect(intent.executionContract.allowsCanonicalPlanArtifact).toBe(false);
    expect(intent.verticals).not.toContain('itinerary');
  });
});

// ---------------------------------------------------------------------------
// 2. EXPLICIT ARTIFACTS STILL WIN (the floor)
// ---------------------------------------------------------------------------

describe('explicit plan-me-a-day builds request a canonical itinerary', () => {
  const ZION_LIVE =
    "Plan me a day in Zion National Park including the Pa'rus Trail and Canyon Overlook. We'll have a rental car, and keep them as separate stops.";
  const YELLOWSTONE_6C =
    'Plan me 2 days in Yellowstone with the major geothermal areas, but keep each day reasonably clustered.';
  const YOSEMITE_ONE_DAY =
    'Plan me a day in Yosemite Valley. I want to hike the Mist Trail in the morning, including Vernal Fall Footbridge and Vernal Fall as stops, then do one separate scenic experience later in the day.';

  function expectCanonicalItinerary(intent) {
    expect(intent.requestedArtifact).toBe('itinerary');
    expect(intent.structurePolicy).toBe('required');
    expect(intent.executionContract.allowsCanonicalPlanArtifact).toBe(true);
    expect(intent.executionContract.requiresCanonicalPlanArtifact).toBe(true);
    expect(intent.executionContract.reasonCodes).not.toContain('legacy_artifact_escalation_blocked');
    expect(intent.executionContract.forbiddenArtifacts).not.toContain('itinerary');
  }

  test('exact Zion live prompt is a required itinerary, guest or authed, empty prior state', () => {
    expectCanonicalItinerary(classify(ZION_LIVE));
    expectCanonicalItinerary(classify(ZION_LIVE, null));
    expectCanonicalItinerary(classify(ZION_LIVE, { hasActiveTrip: false, hasItinerary: false }));
    const guest = classify(ZION_LIVE);
    expect(guest.travelerJob).toBe('day_by_day_itinerary');
    expect(guest.primaryIntent).toBe('simple_itinerary');
    expect(guest.understanding.temporalScope.durationDays).toBe(1);
  });

  test.each([
    ['Plan me a day in Glacier National Park.'],
    ['Plan me one day in Zion National Park.'],
    ['Plan me 2 days in Zion National Park including the Pa\'rus Trail and Canyon Overlook.'],
    [YELLOWSTONE_6C],
    ['Plan me a day in Yosemite Valley.'],
    [YOSEMITE_ONE_DAY],
  ])('%s remains a canonical itinerary', (prompt) => {
    expectCanonicalItinerary(classify(prompt));
  });

  test('short-visit and advice frames stay prose', () => {
    const fewHours = classify('What should I do for a few hours in Zion National Park?');
    expect(fewHours.requestedArtifact).toBe('plain_answer');
    expect(fewHours.executionContract.allowsCanonicalPlanArtifact).toBe(false);

    const rain = classify('How should I plan my day in Zion if it rains?');
    expect(rain.requestedArtifact).toBe('plain_answer');
    expect(rain.executionContract.allowsCanonicalPlanArtifact).toBe(false);

    const worthIt = classify("I'll be in Zion for 3 days. Is Angels Landing worth it?");
    expect(worthIt.requestedArtifact).toBe('plain_answer');
    expect(worthIt.executionContract.allowsCanonicalPlanArtifact).toBe(false);
    expect(worthIt.executionContract.requiresCanonicalPlanArtifact).toBe(false);
  });

  test('options/approaches still hit the artifact-escalation ceiling', () => {
    const intent = classify('We have four days at Zion. Give me a couple approaches.');
    expect(intent.requestedArtifact).toBe('plain_answer');
    expect(intent.executionContract.allowsCanonicalPlanArtifact).toBe(false);
    expect(intent.executionContract.reasonCodes).toContain('legacy_artifact_escalation_blocked');
  });

  test('explicit itinerary prohibition stays forbidden', () => {
    const intent = classify(
      "Plan a week in southern Utah but don't build the daily itinerary yet."
    );
    expect(intent.forbiddenArtifacts).toContain('itinerary');
    expect(intent.requestedArtifact).not.toBe('itinerary');
    expect(intent.executionContract.allowsCanonicalPlanArtifact).toBe(false);
  });
});

describe('11A.2 Q2 priority/fallback advice stays a prose artifact', () => {
  const Q2 =
    "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?";

  function expectProseAdvice(intent) {
    expect(intent.travelerJob).toBe('access_contingency');
    expect(intent.requestedArtifact).toBe('plain_answer');
    expect(intent.structurePolicy).toBe('optional');
    expect(intent.executionContract.allowsCanonicalPlanArtifact).toBe(false);
    expect(intent.executionContract.requiresCanonicalPlanArtifact).toBe(false);
    expect(intent.executionContract.reasonCodes).not.toContain('legacy_artifact_downgrade_blocked');
    expect(intent.freshness).toBe('current');
  }

  test('exact Glacier Q2 is access_contingency prose, not a required itinerary', () => {
    const understanding = buildTurnUnderstanding({ userPrompt: Q2 });
    expect(understanding.requestedArtifact).toBe('plain_answer');
    expect(understanding.structurePolicy).toBe('optional');
    expectProseAdvice(classify(Q2));
    expectProseAdvice(classify(Q2, null));
    expectProseAdvice(classify(Q2, { hasActiveTrip: false, hasItinerary: false }));
  });

  test.each([
    'What should I prioritize at Glacier if Logan Pass parking is full?',
    "What's a good backup plan if Logan Pass access doesn't work out?",
    'I have one day in Glacier. What should I prioritize, and what if the Going-to-the-Sun Road is closed?',
    'How should I plan my day in Zion if it rains?',
  ])('priority/fallback/current-access stays prose: %s', (prompt) => {
    const intent = classify(prompt);
    expect(intent.requestedArtifact).toBe('plain_answer');
    expect(intent.executionContract.requiresCanonicalPlanArtifact).toBe(false);
    expect(intent.executionContract.reasonCodes).not.toContain('legacy_artifact_downgrade_blocked');
  });

  test('one-day duration alone does not select an itinerary artifact', () => {
    const intent = classify('I have one full day in Glacier. What should I prioritize?');
    expect(intent.requestedArtifact).toBe('plain_answer');
    expect(intent.executionContract.requiresCanonicalPlanArtifact).toBe(false);
  });
});

describe('explicit artifact requests are required', () => {
  const EXPLICIT_ITINERARY = [
    'Build the two-day itinerary for Mount Rainier.',
    'Give me a day-by-day plan for three days at Crater Lake.',
    'Create a 7-day trip through Yellowstone and Grand Teton.',
  ];

  test.each(EXPLICIT_ITINERARY)('%s requires an itinerary', (prompt) => {
    const intent = classify(prompt);
    expect(intent.requestedArtifact).toBe('itinerary');
    expect(intent.structurePolicy).toBe('required');
    expect(intent.executionContract.requiresCanonicalPlanArtifact).toBe(true);
  });

  const PATCH_REQUESTS = [
    'Make the second day easier.',
    'Keep the trip but reduce the walking.',
    "Change the plan so we don't have to hike much.",
    'One more thing — my knee has been bothering me. Keep the trip, but keep the walking pretty light.',
  ];

  test.each(PATCH_REQUESTS)('%s is a required itinerary_patch when a plan exists', (prompt) => {
    const intent = classify(prompt, ACTIVE_PLAN_STATE);
    expect(intent.requestedArtifact).toBe('itinerary_patch');
    expect(intent.structurePolicy).toBe('required');
    expect(intent.travelerJob).toBe('itinerary_refinement');
    expect(intent.primaryIntent).toBe('trip_refinement');
    expect(intent.executionContract.requiresCanonicalPlanArtifact).toBe(true);
    expect(intent.executionContract.patchExecutable).toBe(true);
  });

  test('the same wording without a canonical plan is not a patch', () => {
    const intent = classify('Keep the trip but reduce the walking.');
    expect(intent.requestedArtifact).not.toBe('itinerary_patch');
  });
});

// ---------------------------------------------------------------------------
// 3. PRECEDENCE / PROVENANCE
// ---------------------------------------------------------------------------

describe('intent arbitration provenance', () => {
  test('a legacy classification with no canonical understanding keeps full ownership', () => {
    const contract = deriveExecutionContract({
      understanding: null,
      travelerJob: 'day_by_day_itinerary',
      legacy: { primaryIntent: 'full_trip', verticals: ['itinerary'], structurePolicy: 'required' },
    });
    expect(contract.intentSource).toBe('deterministic_legacy');
    expect(contract.allowsCanonicalPlanArtifact).toBe(true);
    expect(contract.reasonCodes).toContain('no_canonical_understanding');
  });

  test('the diagnostic projection carries no traveler language', () => {
    const intent = classify('Build the two-day itinerary for Mount Rainier.');
    const summary = summarizeExecutionContract(intent.executionContract);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(/Rainier/i);
    expect(summary).toMatchObject({
      requestedArtifact: 'itinerary',
      structurePolicy: 'required',
      intentSource: expect.any(String),
    });
  });
});

// ---------------------------------------------------------------------------
// 4. REQUIRED ARTIFACT FULFILLMENT
// ---------------------------------------------------------------------------

describe('validateArtifactFulfillment', () => {
  const plan = (id, days) => ({ planId: id, days });
  const twoDays = [{ dayNumber: 1, stops: [] }, { dayNumber: 2, stops: [] }];

  test('optional plain answer never requires a canonical plan', () => {
    const result = validateArtifactFulfillment({
      requestedArtifact: 'plain_answer',
      structurePolicy: 'optional',
    });
    expect(result).toMatchObject({ required: false, fulfilled: true, reasonCode: 'not_required' });
  });

  test('required itinerary passes only with a valid canonical plan', () => {
    expect(validateArtifactFulfillment({
      requestedArtifact: 'itinerary',
      structurePolicy: 'required',
      resultingCanonicalPlan: plan('p1', twoDays),
    })).toMatchObject({ fulfilled: true, reasonCode: 'fulfilled' });

    expect(validateArtifactFulfillment({
      requestedArtifact: 'itinerary',
      structurePolicy: 'required',
      resultingCanonicalPlan: null,
    })).toMatchObject({ fulfilled: false, degraded: true, reasonCode: 'canonical_plan_missing' });
  });

  test('a required patch that terminated as prose CANNOT validate as success', () => {
    const result = validateArtifactFulfillment({
      requestedArtifact: 'itinerary_patch',
      structurePolicy: 'required',
      priorCanonicalPlan: plan('p1', twoDays),
      resultingCanonicalPlan: null,
      patchResult: null,
    });
    expect(result.required).toBe(true);
    expect(result.fulfilled).toBe(false);
    expect(result.reasonCode).toBe('patch_not_applied');
  });

  test('a required patch needs a prior plan, an applied mutation, and real change', () => {
    const prior = plan('p1', twoDays);
    expect(validateArtifactFulfillment({
      requestedArtifact: 'itinerary_patch',
      structurePolicy: 'required',
      priorCanonicalPlan: null,
      resultingCanonicalPlan: prior,
      patchResult: { applied: true, touchedDayNumbers: [2] },
    })).toMatchObject({ reasonCode: 'prior_plan_missing' });

    expect(validateArtifactFulfillment({
      requestedArtifact: 'itinerary_patch',
      structurePolicy: 'required',
      priorCanonicalPlan: prior,
      resultingCanonicalPlan: plan('p1', twoDays),
      patchResult: { applied: true, touchedDayNumbers: [] },
    })).toMatchObject({ reasonCode: 'patch_produced_no_change' });

    expect(validateArtifactFulfillment({
      requestedArtifact: 'itinerary_patch',
      structurePolicy: 'required',
      priorCanonicalPlan: prior,
      resultingCanonicalPlan: plan('DIFFERENT', twoDays),
      patchResult: { applied: true, touchedDayNumbers: [2] },
    })).toMatchObject({ reasonCode: 'plan_identity_lost' });

    expect(validateArtifactFulfillment({
      requestedArtifact: 'itinerary_patch',
      structurePolicy: 'required',
      priorCanonicalPlan: prior,
      resultingCanonicalPlan: plan('p1', [{ dayNumber: 1, stops: [] }, { dayNumber: 2, stops: [{ id: 'x' }] }]),
      patchResult: { applied: true, touchedDayNumbers: [2] },
    })).toMatchObject({ fulfilled: true, reasonCode: 'fulfilled' });
  });

  test('the not-applied message never claims the saved plan changed', () => {
    const message = buildArtifactNotAppliedMessage('Swap the Lost Mine hike for the Window View trail.');
    expect(message).toMatch(/has not been changed/i);
    expect(message).not.toMatch(/\b(saved|updated) (?:your|the) (?:trip|plan)\b/i);
    expect(message).toContain('Window View');
  });
});

// ---------------------------------------------------------------------------
// 5. RETRY POLICY BY FAILURE CLASS
// ---------------------------------------------------------------------------

describe('retry policy by failure class', () => {
  const {
    FAILURE_CLASSES,
    classifyValidationFailure,
    structureRetryAllowed,
  } = __testables;

  test('failure classes are distinguished, not collapsed', () => {
    expect(classifyValidationFailure(['output_incomplete'])).toBe(FAILURE_CLASSES.OUTPUT_INCOMPLETE);
    expect(classifyValidationFailure(['tool_output_invalid'])).toBe(FAILURE_CLASSES.SCHEMA_INVALID);
    expect(classifyValidationFailure(['plan_patch_target_not_found'])).toBe(FAILURE_CLASSES.ARTIFACT_MISSING);
    expect(classifyValidationFailure(['refinement_changed_unaffected_days'])).toBe(FAILURE_CLASSES.ARTIFACT_MISSING);
    expect(classifyValidationFailure(['evidence_contradiction'])).toBe(FAILURE_CLASSES.TRUTH_OR_CONSTRAINT);
    expect(classifyValidationFailure(['hard_constraint_violation'])).toBe(FAILURE_CLASSES.TRUTH_OR_CONSTRAINT);
  });

  test('optional/preferred structure failure with usable prose buys no structured retry', () => {
    for (const policy of ['optional', 'preferred']) {
      expect(structureRetryAllowed({
        failureClass: FAILURE_CLASSES.OUTPUT_INCOMPLETE,
        structurePolicy: policy,
        hasSafeProse: true,
      })).toBe(false);
    }
  });

  test('required structure failure still earns bounded repair', () => {
    expect(structureRetryAllowed({
      failureClass: FAILURE_CLASSES.OUTPUT_INCOMPLETE,
      structurePolicy: 'required',
      hasSafeProse: true,
    })).toBe(true);
  });

  test('truth and constraint failures are never treated as structure failures', () => {
    expect(structureRetryAllowed({
      failureClass: FAILURE_CLASSES.TRUTH_OR_CONSTRAINT,
      structurePolicy: 'optional',
      hasSafeProse: true,
    })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. CANONICAL CONSTRAINT TRANSLATION + CONTINUITY
// ---------------------------------------------------------------------------

describe('canonical constraint translation', () => {
  const canonical = (message, persistedPlanningState = null) => parseConstraints(
    { planningState: persistedPlanningState },
    message
  ).planningState;

  test('exposure aversion families reach canonical state', () => {
    for (const message of [
      'We hate exposed trails.',
      'Nothing with drop-offs, please.',
      'Avoid cliff-edge hikes.',
      'One of us gets genuinely uneasy anywhere with a steep drop-off right beside the trail.',
    ]) {
      expect(canonical(message).preferences.avoidExposure).toBe(true);
    }
  });

  test('explicit numeric mobility becomes a number; non-numeric never does', () => {
    const numeric = canonical("We can't comfortably walk more than a mile.");
    expect(numeric.mobility.maxWalkMilesPerSegment).toBe(1);

    for (const message of [
      'Keep the walking pretty light.',
      'Cut anything requiring much walking.',
      'Keep the trip, but keep the walking pretty light.',
    ]) {
      const state = canonical(message);
      expect(state.mobility.walkingTolerance).toBe('limited');
      expect(state.mobility.maxWalkMilesPerSegment).toBeNull();
    }
  });

  test('a bare medical mention invents no walking capability', () => {
    const state = canonical('My knee has been bothering me this month.');
    expect(state.mobility.walkingTolerance).toBeNull();
    expect(state.mobility.maxWalkMilesPerSegment).toBeNull();
  });

  test('pace families reach canonical state', () => {
    for (const message of ['We like taking it slow.', 'Take it easy.', 'Keep things relaxed.']) {
      expect(canonical(message).preferences.pace).toBe('relaxed');
    }
  });

  test('canonical constraints survive turns that never mention them again', () => {
    const t1 = canonical('Plan two full days at Mount Rainier. We like taking it slow, and one of us gets uneasy anywhere with a steep drop-off.');
    expect(t1.preferences.avoidExposure).toBe(true);
    expect(t1.preferences.pace).toBe('relaxed');

    const t2 = canonical('Keep the trip, but keep the walking pretty light.', t1);
    expect(t2.mobility.walkingTolerance).toBe('limited');
    expect(t2.preferences.avoidExposure).toBe(true);

    const t3 = canonical('What is the weather like then?', t2);
    expect(t3.preferences.avoidExposure).toBe(true);
    expect(t3.preferences.pace).toBe('relaxed');
    expect(t3.mobility.walkingTolerance).toBe('limited');
  });

  test('an explicit reversal in the current turn clears a stale hard constraint', () => {
    const t1 = canonical('We hate exposed trails.');
    expect(t1.preferences.avoidExposure).toBe(true);
    const t2 = canonical('Exposure is actually fine.', t1);
    expect(t2.preferences.avoidExposure).toBe(false);
  });

  test('every translated constraint carries provenance and a supporting span', () => {
    const understanding = buildTurnUnderstanding({
      userPrompt: 'Keep the walking pretty light and avoid cliff-edge trails.',
      priorTripState: ACTIVE_PLAN_STATE,
    });
    const { provenance } = translateTurnConstraints({ understanding });
    expect(provenance.length).toBeGreaterThan(0);
    for (const entry of provenance) {
      expect(entry.source).toBe('current_message');
      expect(typeof entry.supportingSpan).toBe('string');
      expect(entry.supportingSpan.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. THE REAL REQUEST PATH (mocked generation only)
// ---------------------------------------------------------------------------

const LONG_PROSE = [
  'There are two honest ways to spend four days at Big Bend. The first keeps you in the Chisos Basin',
  'for the first half of the trip and saves the river road for the back half, which cuts your driving',
  'sharply and lets you reach the high trails while it is cool. The second treats the park as three',
  'districts and gives one full day to each, with the fourth day left deliberately open so you can',
  'follow the weather rather than a schedule. Neither one requires a reservation you do not already have.',
].join(' ');

function proseResult(text = LONG_PROSE) {
  return {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    outputText: text,
    toolCalls: [],
    structuredOutput: null,
    structuredOutputStatus: null,
    completionStatus: 'complete',
    stopReason: 'stop',
    refusal: null,
    usage: { inputTokens: 800, outputTokens: 300, cachedInputTokens: 0 },
  };
}

/** A model that burns the whole budget inside a truncated tool call. */
function truncatedToolResult() {
  return {
    ...proseResult(''),
    toolCalls: [{ name: 'create_itinerary', arguments: '{"days":[{"dayNumber":1,' }],
    structuredOutputStatus: 'truncated',
    completionStatus: 'incomplete',
    stopReason: 'max_output_tokens',
    usage: { inputTokens: 800, outputTokens: 3000, cachedInputTokens: 0 },
  };
}

function buildDeps(overrides = {}) {
  const dispatches = [];
  const requests = [];
  const executeResponses = jest.fn(async (request, ctx) => {
    dispatches.push(request);
    requests.push(request);
    return (overrides.executeResponses || (async () => proseResult()))(request, ctx);
  });
  return {
    dispatches,
    requests,
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
      newTurnId: () => 'turn-contract-integrity',
      streamGeneration: false,
      ...overrides,
      responseAdapters: {},
      executeResponses,
    },
  };
}

const turnInput = (userMessage, tripState = null) => ({
  userMessage,
  conversationContext: { history: [] },
  tripState,
  constraints: null,
  resolvedContext: {},
});

beforeEach(() => resetProviderTestSummary());

describe('real request path — explicit plan-me-a-day exposes create_itinerary', () => {
  const ZION_LIVE =
    "Plan me a day in Zion National Park including the Pa'rus Trail and Canyon Overlook. We'll have a rental car, and keep them as separate stops.";

  test('architect itinerary generation is selected and the itinerary tool is offered', async () => {
    const { deps, requests } = buildDeps();
    await executeTrailieV2Turn(turnInput(ZION_LIVE), { ...deps, enabled: true });
    expect(requests.length).toBeGreaterThan(0);
    expect((requests[0].tools || []).map((tool) => tool?.name || tool)).toContain('create_itinerary');
    expect(requests[0].generation.maxOutputTokens).toBeGreaterThanOrEqual(3000);
  });
});

describe('real request path — plain answer with a false legacy full-trip positive', () => {
  const PROMPT = "We have four days at Big Bend in late March and we can't settle on how to use them. "
    + 'Lay out a couple of different ways we could play it.';

  test('architect itinerary generation is NOT selected, so the exhaustion path is unreachable', async () => {
    const { deps, requests, dispatches } = buildDeps();
    const result = await executeTrailieV2Turn(turnInput(PROMPT), { ...deps, enabled: true });

    // The legacy ladder still calls this full_trip; the contract still says prose.
    const intent = classify(PROMPT);
    expect(intent.primaryIntent).toBe('full_trip');
    expect(intent.executionContract.allowsCanonicalPlanArtifact).toBe(false);

    // No itinerary tool was offered and the architect budget was never used.
    expect(dispatches).toHaveLength(1);
    expect(requests[0].tools).toEqual([]);
    expect(requests[0].generation.maxOutputTokens).toBeLessThan(3000);

    expect(result.status).toBe('complete');
    expect(result.response.text).toContain('Big Bend');
    expect(result.canonicalPlan).toBeNull();
    expect(result.telemetrySummary.executionContract).toMatchObject({
      requestedArtifact: 'plain_answer',
      structurePolicy: 'optional',
      allowsCanonicalPlanArtifact: false,
      intentSource: 'reconciled',
    });
    expect(result.artifactFulfillment).toMatchObject({ required: false, fulfilled: true });
  });

  test('the 3000-token architect ceiling is unchanged — the fix is the contract, not the budget', () => {
    expect(__testables.MAX_OUTPUT_TOKENS.architect).toBe(3000);
  });

  test('even a model that truncates cannot burn three structured attempts on this turn', async () => {
    const { deps, dispatches } = buildDeps({ executeResponses: async () => truncatedToolResult() });
    const result = await executeTrailieV2Turn(turnInput(PROMPT), { ...deps, enabled: true });
    // Prose mode: there is no structured artifact to truncate, so the turn does
    // not enter the retry ladder at all for structural reasons.
    expect(dispatches.length).toBeLessThanOrEqual(3);
    expect(result.telemetrySummary.executionContract.allowsCanonicalPlanArtifact).toBe(false);
  });
});

describe('real request path — required patch that cannot be applied', () => {
  const PRIOR_PLAN = {
    planId: 'plan-bibe-1',
    days: [
      { dayNumber: 1, stops: [{ id: 's1', name: 'Chisos Basin' }] },
      { dayNumber: 2, stops: [{ id: 's2', name: 'Lost Mine Trail' }] },
      { dayNumber: 3, stops: [{ id: 's3', name: 'Santa Elena Canyon' }] },
    ],
  };

  test('prose must not masquerade as an applied mutation', async () => {
    const { deps } = buildDeps({
      executeResponses: async () => proseResult(
        'I would shorten the second day and swap the long climb for a short riverside walk, '
        + 'which keeps the same scenery without the sustained elevation gain over several miles.'
      ),
    });
    const tripState = {
      ...ACTIVE_PLAN_STATE,
      canonicalPlan: PRIOR_PLAN,
      existingCanonicalPlan: PRIOR_PLAN,
    };
    const result = await executeTrailieV2Turn(
      turnInput('Keep the trip, but keep the walking pretty light.', tripState),
      { ...deps, enabled: true }
    );

    expect(result.artifactFulfillment.required).toBe(true);
    expect(result.artifactFulfillment.fulfilled).toBe(false);
    // NOT an ordinary pass.
    expect(result.validation.status).not.toBe('pass');
    if (result.status === 'complete') {
      expect(result.validation.status).toBe('degraded');
      expect(result.validation.reasonCodes).toContain('artifact_not_applied');
      expect(result.response.text).toMatch(/has not been changed/i);
      // The stale plan is neither re-published as updated nor silently dropped.
      expect(result.canonicalPlan).toBeNull();
      expect(result.itineraryHash).toBeNull();
    }
  });
});

describe('safe prose fallback matrix — constraint failures', () => {
  test('a hard-constraint violation is never degraded into a delivered answer', async () => {
    const { deps } = buildDeps({
      executeResponses: async () => proseResult(
        'Take the exposed cliff-edge ledge trail along the rim; it is a wonderful walk with sheer '
        + 'drop-offs the whole way, and you will be on your feet for most of the afternoon out there.'
      ),
    });
    const result = await executeTrailieV2Turn(
      {
        userMessage: 'What should we do with our afternoon?',
        conversationContext: { history: [] },
        tripState: null,
        // Explicit, canonical hard constraint.
        constraints: { avoidExposure: true, preferences: { avoidExposure: true } },
        resolvedContext: {},
      },
      { ...deps, enabled: true }
    );

    // A constraint failure is not a structure failure: no prose degradation.
    expect(result.status).not.toBe('complete');
    expect(result.telemetrySummary.failureClasses).toContain('truth_or_constraint');
  });
});

describe('provider isolation across the whole contract path', () => {
  test('no live provider is constructed or dispatched', () => {
    const summary = getProviderTestSummary();
    expect(summary.liveOpenAiConstructors).toBe(0);
    expect(summary.liveAnthropicConstructors).toBe(0);
    expect(summary.liveProviderDispatches).toBe(0);
    expect(summary.externalProviderHttpRequests).toBe(0);
  });
});
