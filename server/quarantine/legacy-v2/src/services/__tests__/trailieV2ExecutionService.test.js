'use strict';

jest.mock('node-fetch', () => jest.fn());

const {
  executeTrailieV2Turn,
  deriveRouterSignals,
  intentToPromptMode,
  aggregateAttemptCost,
  defaultDetectContradiction,
  defaultResolveDeterministicRender,
} = require('../../../../../src/services/trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');

// ---------------------------------------------------------------------------
// Test harness — injected fakes only. NO live provider is ever constructed or
// dispatched. Broker + Responses are the only real provider boundaries, and
// both are replaced with counting fakes.
// ---------------------------------------------------------------------------

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
    entities: [{ type: 'destination', role: 'target', canonicalId: 'park:nps:yose', confidence: 1 }],
    confidence: 0.9,
    reasonCodes: ['general_travel_question'],
    compound: false,
    requiresLunaShadow: false,
    travelerJob: null,
    ...overrides,
  };
}

function emptyBundle(requestId = 'turn-x') {
  return buildEvidenceBundle({ requestId, resolutions: [], candidates: [] });
}

function itineraryOutputResult(overrides = {}) {
  // Shape mimicking a normalized Responses result carrying a valid tool call.
  // A substantial grounded outing can carry a day. These supporting blocks
  // exercise normal finalization without supplying artificial coverage.
  const days = overrides.days || [{
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
    toolCalls: [{
      name: 'create_itinerary',
      id: 'call_1',
      input: { days },
      rawArgs: JSON.stringify({ days }),
    }],
    structuredOutput: null,
    structuredOutputStatus: null,
    completionStatus: 'complete',
    stopReason: 'stop',
    refusal: null,
    usage: { inputTokens: 1200, outputTokens: 300, cachedInputTokens: 0 },
    ...overrides.resultOverrides,
  };
}

function proseResult(text = 'Yosemite is beautiful in spring.', usage = { inputTokens: 800, outputTokens: 120 }) {
  return {
    provider: 'openai',
    model: 'gpt-6-sol',
    outputText: text,
    toolCalls: [],
    structuredOutput: null,
    structuredOutputStatus: null,
    completionStatus: 'complete',
    stopReason: 'stop',
    refusal: null,
    usage,
  };
}

function planPatchOutputResult(planPatch) {
  return {
    provider: 'openai',
    model: 'gpt-6-sol',
    outputText: '',
    toolCalls: [{
      name: 'patch_itinerary',
      id: 'patch_1',
      input: planPatch,
      rawArgs: JSON.stringify(planPatch),
    }],
    completionStatus: 'complete',
    stopReason: 'stop',
    refusal: null,
    usage: { inputTokens: 900, outputTokens: 180, cachedInputTokens: 0 },
  };
}

/** Static provider-contract facts, not a live place catalogue. Positive-path
 * tests must supply grounding; the default empty broker remains fail-closed. */
function groundedFixture(places = [['Valley floor scenic walk', 'walk']]) {
  const candidates = places.map(([name, type], index) => ({
    evidenceId: `fixture:place:${index}`, topic: 'activities', evidenceType: 'fact',
    claim: { text: `${name}: a ${type} experience.`, normalizedValue: {
      name, type, activityTypes: [type],
    } },
  }));
  return {
    planRequirements: () => [{ requirementId: 'fixture-activities', topic: 'activities', criticality: 'optional' }],
    resolveEvidence: async ({ requirements = [], requestId }) => buildEvidenceBundle({
      requestId, candidates, resolutions: requirements.map(r => ({
        requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: candidates.map(c => c.evidenceId),
      })),
    }),
  };
}

function buildDeps(overrides = {}) {
  const dispatches = [];
  const brokerCalls = [];
  const attemptContexts = [];

  // Effective provider fns (override or default) are wrapped so recording holds
  // regardless of what a test injects — the dispatch/broker counters are the
  // isolation evidence WP11A relies on.
  const userExec = overrides.executeResponses;
  const defaultExec = async (request) => (request.tools && request.tools.length ? itineraryOutputResult() : proseResult());
  const executeResponses = jest.fn(async (request, ctx) => {
    dispatches.push(request);
    return (userExec || defaultExec)(request, ctx);
  });

  const userResolve = overrides.resolveEvidence;
  const defaultResolve = async ({ requirements = [], requestId }) => buildEvidenceBundle({
    requestId,
    resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [] })),
    candidates: [],
  });
  const resolveEvidence = jest.fn(async (args) => {
    brokerCalls.push(args.requestId);
    return (userResolve || defaultResolve)(args);
  });

  const deps = {
    classifyIntent: jest.fn(() => classification()),
    planRequirements: jest.fn(() => []),
    resolveDeterministicRender: jest.fn(() => ({ eligible: false })),
    detectContradiction: jest.fn(() => []),
    now: () => new Date('2026-09-23T12:00:00.000Z'),
    newTurnId: () => 'turn-test',
    onAttemptContext: (ctx) => attemptContexts.push(ctx),
    // Existing suite injects executeResponses only; keep non-stream path unless a
    // Phase 3.5 streaming test opts in with streamGeneration + streamResponses.
    streamGeneration: false,
    ...overrides,
    // Wrapped versions win over any raw override.
    responseAdapters: {},
    executeResponses,
    resolveEvidence,
  };
  return { deps, dispatches, brokerCalls, attemptContexts };
}

function baseInput(overrides = {}) {
  return {
    userMessage: 'What is Yosemite like in spring?',
    conversationContext: { history: [] },
    tripState: null,
    constraints: null,
    resolvedContext: {},
    ...overrides,
  };
}

describe('WP11A trailieV2ExecutionService — disabled by default', () => {
  test('returns disabled without touching providers when runtime flag off', async () => {
    const { deps, dispatches, brokerCalls } = buildDeps();
    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: false });
    expect(result.status).toBe('disabled');
    expect(dispatches).toHaveLength(0);
    expect(brokerCalls).toHaveLength(0);
    expect(deps.classifyIntent).not.toHaveBeenCalled();
  });
});

describe('WP11A pure helpers', () => {
  test('intentToPromptMode maps itinerary intents to architect', () => {
    expect(intentToPromptMode(classification({ primaryIntent: 'full_trip' }))).toBe('architect');
    expect(intentToPromptMode(classification({ primaryIntent: 'simple_itinerary' }))).toBe('architect');
    expect(intentToPromptMode(classification({ primaryIntent: 'compare' }))).toBe('compare');
    expect(intentToPromptMode(classification({ primaryIntent: 'live_in_trip_assistance' }))).toBe('live');
    expect(intentToPromptMode(classification({ primaryIntent: 'general_qa' }))).toBe('buddy');
  });

  test('priority-plus-backup questions stay prose-first even if classified as itinerary', async () => {
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({
        primaryIntent: 'simple_itinerary',
        depth: 'planning',
        verticals: ['itinerary'],
      }),
    });
    const result = await executeTrailieV2Turn(baseInput({
      userMessage:
        "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
    }), { ...deps, enabled: true });

    expect(result.status).toBe('complete');
    expect(dispatches[0].tools).toEqual([]);
    expect(dispatches[0].toolChoice).toBeNull();
    expect(result.canonicalPlan).toBeNull();
    expect(result.presentation.presentationKind).toBe('plain_answer');
  });

  test('deriveRouterSignals maps confidence < 0.8 to high ambiguity', () => {
    const signals = deriveRouterSignals({
      intent: classification({ confidence: 0.6 }),
      coverage: 'complete',
      tripDays: null,
      destinationCount: 1,
      hardConstraintCount: 0,
      deterministicRender: { eligible: false },
    });
    expect(signals.ambiguity).toBe('high');
    expect(signals.evidenceCompleteness).toBe('complete');
  });

  test('defaultDetectContradiction flags open claims against selected negative operational evidence', () => {
    const bundle = {
      evidence: [{
        topic: 'roads', claim: { polarity: 'negative', subject: 'nps:park:yose Tioga Road' },
      }],
    };
    expect(defaultDetectContradiction({ text: 'Tioga Road is open right now.', bundle }))
      .toEqual(['evidence_contradiction']);
    expect(defaultDetectContradiction({ text: 'Yosemite Valley is lovely.', bundle })).toEqual([]);
  });

  test('defaultResolveDeterministicRender stays off unless an exact fact + quick depth is present', () => {
    const intent = { depth: 'quick' };
    expect(defaultResolveDeterministicRender({ resolvedContext: {}, intent }).eligible).toBe(false);
    expect(defaultResolveDeterministicRender({
      resolvedContext: { exactFact: { factType: 'entrance_fee', value: '$35', text: '$35 per vehicle' } },
      intent,
    })).toMatchObject({ eligible: true, factType: 'entrance_fee', languageAddsValue: false });
    expect(defaultResolveDeterministicRender({
      resolvedContext: { exactFact: { factType: 'entrance_fee', value: '$35' } },
      intent: { depth: 'deep' },
    }).eligible).toBe(false);
  });

  test('aggregateAttemptCost yields cost_unknown when any attempt is unknown', () => {
    expect(aggregateAttemptCost([
      { costStatus: 'priced', costUsd: 0.01 },
      { costStatus: 'cost_unknown', costUsd: null },
    ])).toEqual({ costStatus: 'cost_unknown', costUsd: null });
    expect(aggregateAttemptCost([
      { costStatus: 'priced', costUsd: 0.01 },
      { costStatus: 'priced', costUsd: 0.02 },
    ])).toEqual({ costStatus: 'priced', costUsd: 0.03 });
  });
});

describe('WP11A execution matrix', () => {
  test('unavailable requested experiences survive the final attempt telemetry projection', async () => {
    const { deps } = buildDeps({
      ...groundedFixture(),
      classifyIntent: () => classification({ primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'], structurePolicy: 'required' }),
    });
    const result = await executeTrailieV2Turn(baseInput({ userMessage: 'Plan a day with scenic drives.' }), { ...deps, enabled: true });
    expect(result.validation.status).toBe('pass');
    const progress = result.attempts[0].repairProgress;
    expect(progress.requestedExperienceCoverage).toEqual({ represented: [], missing: [], unavailable: ['scenic_drive'] });
    expect(progress.unavailable).toContain('requested_scenic_drive');
    expect(progress.satisfied).not.toContain('requested_scenic_drive');
    expect(progress.satisfied).not.toContain('requested_experience_coverage');
  });
  // A — lightweight discovery -> Luna low
  test('A: complete-evidence lightweight Q&A routes Luna low, one attempt, pass', async () => {
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'general_qa', depth: 'quick', confidence: 0.9 }),
    });
    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });
    expect(result.status).toBe('complete');
    expect(result.routeDecision.selectedTier).toBe('luna_low');
    expect(result.attempts).toHaveLength(1);
    expect(dispatches).toHaveLength(1);
    expect(result.validation.status).toBe('pass');
  });

  // B — normal Q&A -> Sol low
  test('B: standard Q&A routes Sol low and passes', async () => {
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'lodging_strategy', depth: 'standard' }),
    });
    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });
    expect(result.status).toBe('complete');
    expect(result.routeDecision.selectedTier).toBe('sol_low');
  });

  // C — grounded itinerary -> Sol medium + canonical finalization + hash
  test('C: simple itinerary produces finalized plan and itinerary hash', async () => {
    const { deps } = buildDeps({
      ...groundedFixture(),
      classifyIntent: () => classification({
        primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'], structurePolicy: 'required',
      }),
    });
    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });
    expect(result.status).toBe('complete');
    expect(result.routeDecision.selectedTier).toBe('sol_medium');
    expect(result.canonicalPlan).not.toBeNull();
    expect(result.itineraryHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('C1: complete result carries sibling intent and deterministic presentation manifest', async () => {
    const travelLogistics = {
      schemaVersion: 1,
      inventoryMode: 'planning',
      transport: {
        airportsStatus: 'available',
        airports: [{ airportCode: 'BZN', name: 'Bozeman Yellowstone International' }],
        routeLegsStatus: 'not_requested',
        routeLegs: [],
      },
      stays: {
        insidePark: { status: 'not_verified', properties: [] },
        gateway: { status: 'not_requested', properties: [] },
        campgrounds: { status: 'not_requested', properties: [] },
        vacationRentalHint: null,
      },
    };
    const { deps } = buildDeps({
      ...groundedFixture(),
      classifyIntent: () => classification({
        primaryIntent: 'simple_itinerary',
        depth: 'planning',
        verticals: ['itinerary', 'flights'],
      }),
      resolveLogisticsNeeds: () => ({ airports: true, routeLegs: false }),
      buildTravelLogisticsForTurn: async () => travelLogistics,
    });

    const result = await executeTrailieV2Turn(baseInput({ userMessage: 'Build a day-by-day itinerary.' }), { ...deps, enabled: true });

    expect(result.intent.primaryIntent).toBe('simple_itinerary');
    expect(result.presentation).toMatchObject({
      schemaVersion: 1,
      presentationKind: 'itinerary',
      primaryArtifact: { kind: 'itinerary', source: 'canonicalPlan' },
      supportingModules: [],
      prosePolicy: 'full',
    });
    expect(result.presentation.presentationKind).not.toBe(result.intent.primaryIntent);
  });

  test('C2: refinement uses patch_itinerary and preserves untargeted canonical days', async () => {
    const prior = {
      intro: 'Original three-day plan.',
      days: [1, 2, 3].map((dayNumber) => ({
        id: `d${dayNumber}`,
        dayNumber,
        label: `Day ${dayNumber}`,
        stops: [{
          id: `s${dayNumber}`,
          order: 1,
          type: 'viewpoint',
          name: `Original Day ${dayNumber}`,
          note: 'A named scenic experience.',
          startTime: '',
          duration: 120,
        }],
      })),
    };
    const patch = {
      response: 'I slowed down Day 2 and left the rest of the trip intact.',
      operations: [{
        op: 'update_day',
        dayNumber: 2,
        day: {
          id: 'd2',
          dayNumber: 2,
          label: 'A slower Day 2',
          stops: [{
            id: 's2', order: 1, type: 'viewpoint', name: 'Original Day 2',
            note: 'A relaxed scenic experience.', startTime: '', duration: 120,
          }],
        },
      }],
    };
    const { deps, dispatches } = buildDeps({
      ...groundedFixture([['Original Day 1', 'viewpoint'], ['Original Day 2', 'viewpoint'], ['Original Day 3', 'viewpoint']]),
      classifyIntent: () => classification({
        primaryIntent: 'trip_refinement',
        travelerJob: 'itinerary_refinement',
        depth: 'planning',
        verticals: ['itinerary'],
      }),
      executeResponses: async () => planPatchOutputResult(patch),
    });

    const result = await executeTrailieV2Turn(baseInput({
      userMessage: 'Make Day 2 slower and reduce driving.',
      // Mirrors the live route bridge contract.
      tripState: { existingCanonicalPlan: prior, hasItinerary: true },
      constraints: { dates: { durationDays: 3 } },
      resolvedContext: { tripDays: 3 },
    }), { ...deps, enabled: true });

    expect(result.status).toBe('complete');
    expect(dispatches[0].tools.map((tool) => tool.name)).toEqual(['patch_itinerary']);
    expect(dispatches[0].instructions).toMatch(/Do not regenerate/i);
    expect(result.canonicalPlan.days).toHaveLength(3);
    expect(result.canonicalPlan.days[0].stops[0].name).toBe('Original Day 1');
    expect(result.canonicalPlan.days[1].stops[0].name).toBe('Original Day 2');
    expect(result.canonicalPlan.days[2].stops[0].name).toBe('Original Day 3');
    expect(result.canonicalPlan.days[0]).toEqual(prior.days[0]);
    expect(result.canonicalPlan.days[2]).toEqual(prior.days[2]);
  });

  test('C2: rejects a touched-day patch that duplicates an untouched-day experience', async () => {
    const prior = {
      intro: 'Original three-day plan.',
      days: [
        {
          id: 'd1', dayNumber: 1, label: 'Day 1',
          stops: [{ id: 's1', order: 1, type: 'viewpoint', name: 'Hurricane Ridge', duration: 120 }],
        },
        {
          id: 'd2', dayNumber: 2, label: 'Day 2',
          stops: [{ id: 's2', order: 1, type: 'scenic_drive', name: 'Olympic Scenic Drive', duration: 120 }],
        },
        {
          id: 'd3', dayNumber: 3, label: 'Day 3',
          stops: [{ id: 's3', order: 1, type: 'trail', name: 'Highline Trail', duration: 120 }],
        },
      ],
    };
    const patch = {
      response: 'I made Day 2 easier and kept the rest intact.',
      operations: [{
        op: 'update_day',
        dayNumber: 2,
        day: {
          id: 'd2', dayNumber: 2, label: 'An easier Day 2',
          stops: [{ id: 's2b', order: 1, type: 'trail', name: 'Highline Trail', placeRef: 1, duration: 120 }],
        },
      }],
    };
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({
        primaryIntent: 'trip_refinement',
        travelerJob: 'itinerary_refinement',
        depth: 'planning',
        verticals: ['itinerary'],
      }),
      planRequirements: () => [{ requirementId: 'r1', topic: 'activities' }],
      resolveEvidence: async () => buildEvidenceBundle({ requestId: 'turn-test', resolutions: [{ requirementId: 'r1', status: 'satisfied_fresh', evidenceIds: ['highline'] }], candidates: [{
        evidenceId: 'highline', topic: 'activities', claim: { normalizedValue: { name: 'Highline Trail', category: 'trail', activityTypes: ['hike'] } },
      }] }),
      executeResponses: async () => planPatchOutputResult(patch),
    });

    const result = await executeTrailieV2Turn(baseInput({
      userMessage: 'Make Day 2 easier and keep the rest the same.',
      tripState: { existingCanonicalPlan: prior, hasItinerary: true },
      constraints: { dates: { durationDays: 3 } },
      resolvedContext: { tripDays: 3 },
    }), { ...deps, enabled: true });

    expect(result.status).toBe('evidence_incomplete');
    // The only offered source collides with a frozen day. An empty packed
    // registry must stay empty, rather than falling back to the raw catalogue.
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].retryability).toBe('evidence_blocker');
    expect(result.attempts[0].validationReasonCodes).toContain('no_eligible_repair_candidate');
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].tools[0].input_schema.properties.operations.items.properties.stop.properties.placeRef.enum).toBeUndefined();
    expect(result.canonicalPlan).toBeFalsy();
  });

  // D — longer trips stay on Sol medium without automatic Astra escalation
  test('D: seven-day trip routes Sol medium, without Astra', async () => {
    const places = ['Valley floor scenic walk', 'Cedar Grove Path', 'North Lake Circuit',
      'Meadow Boardwalk', 'Riverbank Trail', 'Heritage Garden Walk', 'Juniper Ridge Path'];
    const days = places.map((name, index) => ({ dayNumber: index + 1, stops: [{ name, type: 'walk', duration: 120 }] }));
    const { deps } = buildDeps({
      ...groundedFixture(places.map(name => [name, 'walk'])),
      executeResponses: async () => itineraryOutputResult({ days }),
      classifyIntent: () => classification({ primaryIntent: 'full_trip', depth: 'deep', verticals: ['itinerary'] }),
    });
    const result = await executeTrailieV2Turn(baseInput({ userMessage: 'Build a seven-day itinerary.', constraints: { dates: { numDays: 7 } }, resolvedContext: { tripDays: 7 } }), { ...deps, enabled: true });
    expect(result.status).toBe('complete');
    expect(result.canonicalPlan.days).toHaveLength(7);
    expect(result.routeDecision.selectedTier).toBe('sol_medium');
    expect(result.attempts.every((a) => a.tier !== 'astra_medium')).toBe(true);
  });

  // E — multi-destination + multiple constraints -> Sol medium
  test('E: multi-destination multi-constraint routes Sol medium', async () => {
    const { deps } = buildDeps({
      ...groundedFixture(),
      classifyIntent: () => classification({ primaryIntent: 'full_trip', depth: 'planning', verticals: ['itinerary'] }),
    });
    const result = await executeTrailieV2Turn(
      baseInput({ userMessage: 'Build a day-by-day itinerary.', resolvedContext: { destinationCount: 2 }, constraints: { hard: ['no_drives_over_4h', 'wheelchair'] } }),
      { ...deps, enabled: true },
    );
    expect(result.routeDecision.selectedTier).toBe('sol_medium');
  });

  // Q — deterministic exact fact -> zero model dispatch
  test('Q: deterministic exact fact renders with zero model dispatch', async () => {
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'general_qa', depth: 'quick' }),
      resolveDeterministicRender: () => ({
        eligible: true, exactValueAvailable: true, languageAddsValue: false, factType: 'entrance_fee',
        text: 'The entrance fee is $35 per vehicle.',
      }),
    });
    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });
    expect(result.status).toBe('complete');
    expect(result.routeDecision.deterministic).toBe(true);
    expect(result.routeDecision.selectedTier).toBe('deterministic');
    expect(dispatches).toHaveLength(0);
    expect(result.response.text).toContain('$35');
  });
});

// Sequenced fake model that returns a different normalized result per attempt.
function missingTool() {
  return {
    provider: 'openai', model: 'gpt-6-sol', outputText: '', toolCalls: [],
    structuredOutput: null, completionStatus: 'complete', stopReason: 'stop', refusal: null,
    usage: { inputTokens: 100, outputTokens: 10 },
  };
}
function invalidItineraryShape({ secondDay = false, toolCallId = 'bad-shape' } = {}) {
  const days = secondDay
    ? [
      { dayNumber: 1, stops: [{ name: 'Valid stop', duration: 120 }] },
      { dayNumber: 2, stops: 'not-an-array' },
    ]
    : [{ dayNumber: 1 }];
  return {
    ...missingTool(),
    toolCalls: [{
      name: 'create_itinerary',
      id: toolCallId,
      input: { days },
      rawArgs: JSON.stringify({ days }),
    }],
  };
}
function ambiguousItineraryTools() {
  const first = itineraryOutputResult();
  const secondDays = [{
    dayNumber: 1,
    stops: [{ name: 'Different experience', duration: 180 }],
  }];
  return {
    ...first,
    toolCalls: [
      first.toolCalls[0],
      {
        name: 'create_itinerary',
        id: 'call_2',
        input: { days: secondDays },
        rawArgs: JSON.stringify({ days: secondDays }),
      },
    ],
  };
}
function truncatedTool() {
  return { ...missingTool(), completionStatus: 'incomplete', stopReason: 'max_tokens' };
}
function refusalResult() {
  return { ...proseResult(''), refusal: 'I cannot help with that.' };
}
function sequenced(factories) {
  let i = 0;
  return async (request) => {
    const factory = factories[Math.min(i, factories.length - 1)];
    i += 1;
    void request;
    return factory();
  };
}

describe('WP11A repair / escalation lifecycle', () => {
  // F — locally repairable Sol failure -> exactly one same-model retry -> success
  test('F: one same-model Sol retry on repairable failure, same frozen inputs', async () => {
    const { deps, dispatches, brokerCalls, attemptContexts } = buildDeps({
      ...groundedFixture(),
      classifyIntent: () => classification({
        primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'], structurePolicy: 'required',
      }),
      planRequirements: () => [{ requirementId: 'r1', topic: 'overview', criticality: 'required' }],
      executeResponses: sequenced([missingTool, itineraryOutputResult]),
    });
    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });
    expect(result.status).toBe('complete');
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts.map((a) => a.tier)).toEqual(['sol_medium', 'sol_medium']);
    expect(result.attempts[1].attemptKind).toBe('same_model_retry');
    expect(dispatches).toHaveLength(2);
    expect(brokerCalls).toHaveLength(1); // NO evidence refetch on model failure
    // Same frozen EvidenceBundle / TripState / constraints / Prompt-v2 across attempts.
    expect(attemptContexts[0].promptSnapshot).toBe(attemptContexts[1].promptSnapshot);
    expect(attemptContexts[0].evidenceBundle).toBe(attemptContexts[1].evidenceBundle);
  });

  test('F1: structured shape diagnostics reach the next repair and stay off the success', async () => {
    const { deps, dispatches } = buildDeps({
      ...groundedFixture(),
      classifyIntent: () => classification({
        primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'], structurePolicy: 'required',
      }),
      executeResponses: sequenced([
        () => invalidItineraryShape({ toolCallId: 'x'.repeat(500) }),
        itineraryOutputResult,
      ]),
    });

    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });

    expect(result.status).toBe('complete');
    expect(result.attempts[0].validationReasonCodes).toContain('tool_output_invalid');
    expect(result.attempts[0].validationDiagnostics).toMatchObject({
      kind: 'structured_output',
      structuredStatus: 'malformed_tool',
      structuralErrors: [{
        code: 'missing_required_field',
        path: 'days.0.stops',
        message: 'Required field is missing',
      }],
    });
    expect(result.attempts[0].validationDiagnostics.toolCallId.length).toBeLessThanOrEqual(120);
    expect(dispatches[1].instructions).toMatch(/days\.0\.stops/);
    expect(dispatches[1].instructions).toMatch(/required field is missing/i);
    expect(result.attempts[1].validationDiagnostics).toBeNull();
    expect(JSON.stringify({ content: result.content, canonicalPlan: result.canonicalPlan }))
      .not.toMatch(/missing_required_field|days\.0\.stops|tool_output_invalid/);
  });

  test('F2: missing tool output retains its distinct status through execution', async () => {
    const { deps, dispatches } = buildDeps({
      ...groundedFixture(),
      classifyIntent: () => classification({
        primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'], structurePolicy: 'required',
      }),
      executeResponses: sequenced([missingTool, itineraryOutputResult]),
    });

    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });

    expect(result.status).toBe('complete');
    expect(result.attempts[0].validationDiagnostics).toMatchObject({
      kind: 'structured_output',
      structuredStatus: 'missing_tool',
      structuralErrors: [],
    });
    expect(dispatches[1].instructions).toMatch(/call.*create_itinerary.*exactly once/i);
  });

  test('F2b: ambiguous tool output retains its distinct diagnostic through execution', async () => {
    const { deps, dispatches } = buildDeps({
      ...groundedFixture(),
      classifyIntent: () => classification({
        primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'], structurePolicy: 'required',
      }),
      executeResponses: sequenced([ambiguousItineraryTools, itineraryOutputResult]),
    });

    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });

    expect(result.status).toBe('complete');
    expect(result.attempts[0].validationDiagnostics).toMatchObject({
      kind: 'structured_output',
      structuredStatus: 'malformed_tool',
      structuralErrors: [{ code: 'ambiguous_tool_calls' }],
    });
    expect(dispatches[1].instructions).toMatch(/exactly one distinct create_itinerary tool call/i);
    expect(result.attempts[1].validationDiagnostics).toBeNull();
  });

  test('F3: each failed attempt owns its diagnostics; the same normalized blocker cannot earn a third dispatch', async () => {
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({
        primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'], structurePolicy: 'required',
      }),
      executeResponses: sequenced([
        () => invalidItineraryShape(),
        () => invalidItineraryShape({ secondDay: true }),
        itineraryOutputResult,
      ]),
    });

    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });

    expect(result.status).toBe('evidence_incomplete');
    expect(dispatches).toHaveLength(2);
    expect(result.attempts[1].blockerSignature).toBe(result.attempts[0].blockerSignature);
    expect(result.canonicalPlan).toBeNull();
    expect(result.attempts[0].validationDiagnostics.structuralErrors[0].path).toBe('days.0.stops');
    expect(result.attempts[1].validationDiagnostics.structuralErrors[0].path).toBe('days.1.stops');
    expect(dispatches[1].instructions).toMatch(/days\.0\.stops/);
    expect(result.attempts.every(a => a.retryability === 'model_fixable' && a.tier === 'sol_medium')).toBe(true);
  });

  test('F4: routing emits explicit attempt ownership boundaries without dropping repair diagnostics', async () => {
    const events = [];
    let dispatch = 0;
    const streamResponses = jest.fn(async (_request, { onEvent }) => {
      dispatch += 1;
      const first = dispatch === 1;
      onEvent({ type: 'text_delta', delta: first ? 'Bad first prose.' : 'Good second prose.' });
      return first ? invalidItineraryShape() : itineraryOutputResult();
    });
    const { deps, dispatches } = buildDeps({
      ...groundedFixture(),
      classifyIntent: () => classification({
        primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'], structurePolicy: 'required',
      }),
      streamGeneration: true,
      streamResponses,
    });

    const result = await executeTrailieV2Turn(baseInput({
      emitCanonicalEvent: (event) => events.push(event),
    }), { ...deps, enabled: true });

    expect(result.status).toBe('complete');
    expect(events.filter((event) => event.type === 'attempt_started').map((event) => event.payload.attempt))
      .toEqual([1, 2]);
    expect(events.filter((event) => event.type === 'attempt_rejected').map((event) => event.payload.attempt))
      .toEqual([1]);
    expect(events.find((event) => event.type === 'attempt_rejected').payload).toEqual({ attempt: 1 });
    expect(result.attempts[0].validationDiagnostics.structuralErrors[0].path).toBe('days.0.stops');
    expect(dispatches).toHaveLength(0);
  });

  // G — an unchanged required-tool blocker cannot earn another attempt
  test('G: repeated required-tool blocker stops before Astra', async () => {
    const { deps } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'full_trip', depth: 'deep', verticals: ['itinerary'], structurePolicy: 'required' }),
      executeResponses: sequenced([missingTool, missingTool, itineraryOutputResult]),
    });
    const result = await executeTrailieV2Turn(baseInput({ resolvedContext: { tripDays: 8 } }), { ...deps, enabled: true });
    expect(result.status).toBe('evidence_incomplete');
    expect(result.attempts[1].blockerSignature).toBe(result.attempts[0].blockerSignature);
    expect(result.attempts.every(a => a.validationReasonCodes.includes('tool_output_invalid') && a.retryability === 'model_fixable')).toBe(true);
    expect(result.canonicalPlan).toBeNull();
    expect(result.attempts.map((a) => a.tier)).toEqual(['sol_medium', 'sol_medium']);
    expect(result.attempts.every((a) => a.tier !== 'claude_fallback')).toBe(true);
  });

  // H — refusal is not evidence of model-fixable reasoning progress
  test('H: refusal without model-fixable reasoning progress stops without escalation', async () => {
    const { deps } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'full_trip', depth: 'deep', verticals: ['itinerary'] }),
      executeResponses: sequenced([refusalResult, itineraryOutputResult]),
    });
    const result = await executeTrailieV2Turn(baseInput({ resolvedContext: { tripDays: 8 } }), { ...deps, enabled: true });
    expect(result.status).toBe('failed');
    expect(result.terminalReason).toBe('refusal');
    expect(result.canonicalPlan).toBeNull();
    expect(result.attempts.map((a) => a.tier)).toEqual(['sol_medium']);
    expect(result.attempts[0].validationReasonCodes).toEqual(['refusal']);
    expect(result.attempts[0].retryability).toBe('deterministic_blocker');
  });

  // I — an unchanged empty-answer blocker stops after the bounded retry
  test('I: repeated empty answer stops with no published draft or provider fallback', async () => {
    const { deps } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'full_trip', depth: 'deep', verticals: ['itinerary'] }),
      executeResponses: sequenced([missingTool]),
    });
    const result = await executeTrailieV2Turn(baseInput({ resolvedContext: { tripDays: 9 } }), { ...deps, enabled: true });
    expect(result.status).toBe('evidence_incomplete');
    expect(result.terminalReason).toBe('evidence_incomplete');
    expect(result.attempts.every(a => a.validationReasonCodes.includes('output_incomplete') && a.retryability === 'model_fixable')).toBe(true);
    expect(result.attempts[1].blockerSignature).toBe(result.attempts[0].blockerSignature);
    expect(result.attempts.map((a) => a.tier)).toEqual(['sol_medium', 'sol_medium']);
    expect(result.canonicalPlan).toBeNull();
  });
});

describe('WP11A cancellation', () => {
  // J — cancel before generation -> no provider attempt
  test('J: pre-aborted signal yields cancelled with no provider or broker call', async () => {
    const { deps, dispatches, brokerCalls } = buildDeps();
    const controller = new AbortController();
    controller.abort();
    const result = await executeTrailieV2Turn(
      { ...baseInput(), signal: controller.signal }, { ...deps, enabled: true },
    );
    expect(result.status).toBe('cancelled');
    expect(dispatches).toHaveLength(0);
    expect(brokerCalls).toHaveLength(0);
    expect(deps.classifyIntent).not.toHaveBeenCalled();
  });

  // K — cancel during generation -> abort propagates, no retry / no escalation
  test('K: abort during generation stops the turn with no retry', async () => {
    const controller = new AbortController();
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'] }),
      executeResponses: async () => {
        controller.abort();
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      },
    });
    const result = await executeTrailieV2Turn(
      { ...baseInput(), signal: controller.signal }, { ...deps, enabled: true },
    );
    expect(result.status).toBe('cancelled');
    expect(dispatches).toHaveLength(1);
    expect(result.attempts.length).toBeLessThanOrEqual(1);
  });
});

describe('WP11A evidence + validation guards', () => {
  // L — evidence incomplete (unmet hard) -> deterministic safe failure, no model dispatch
  test('L: unmet hard evidence blocks generation without fabricating truth', async () => {
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'live_in_trip_assistance', depth: 'quick', verticals: ['safety'] }),
      planRequirements: () => [{ requirementId: 'r1', topic: 'roads', criticality: 'hard' }],
      resolveEvidence: async ({ requestId }) => buildEvidenceBundle({
        requestId, resolutions: [{ requirementId: 'r1', status: 'missing', evidenceIds: [] }], candidates: [],
      }),
    });
    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });
    expect(result.status).toBe('evidence_incomplete');
    expect(result.terminalReason).toBe('evidence_incomplete');
    expect(dispatches).toHaveLength(0);
    expect(result.canonicalPlan).toBeNull();
  });

  test('L2: unmet destination identity annotates and still answers', async () => {
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'general_qa', depth: 'quick', verticals: ['parks'] }),
      planRequirements: () => [{ requirementId: 'r1', topic: 'destination_identity', criticality: 'hard' }],
      resolveEvidence: async ({ requestId }) => buildEvidenceBundle({
        requestId, resolutions: [{ requirementId: 'r1', status: 'missing', evidenceIds: [] }], candidates: [],
      }),
      executeResponses: async () => proseResult('October in Yellowstone is quieter, and snow can close roads.'),
    });
    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });
    expect(result.status).not.toBe('evidence_incomplete');
    expect(dispatches.length).toBeGreaterThan(0);
  });

  // M — hard evidence contradiction -> deterministic validation rejects, no success
  test('M: contradicted operational claim is rejected and never reaches success', async () => {
    const { deps } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'general_qa', depth: 'standard' }),
      executeResponses: async () => proseResult('Tioga Road is open and accessible right now.'),
      detectContradiction: () => ['evidence_contradiction'],
    });
    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });
    expect(result.status).toBe('failed');
    expect(result.validation.reasonCodes).toContain('evidence_contradiction');
    expect(result.canonicalPlan).toBeNull();
  });

  test('M2: unsupported mobility claim in a plain answer is repaired against frozen evidence', async () => {
    const evidenceBundle = buildEvidenceBundle({
      requestId: 'turn-test',
      resolutions: [{ requirementId: 'r1', status: 'satisfied_fresh', evidenceIds: ['e1'] }],
      candidates: [{
        evidenceId: 'e1',
        topic: 'activities',
        claim: {
          text: 'Mystery Lake Trail is an easy scenic hike.',
          normalizedValue: { name: 'Mystery Lake Trail', activityTypes: ['hike'] },
          qualifiers: ['named_activity_candidate'],
        },
        source: { provider: 'nps', sourceClass: 'official_owner' },
        quality: { authorityClass: 'official_owner' },
        observation: { observedAt: '2026-09-23T12:00:00.000Z' },
      }],
    });
    const replies = [
      'Keep each outing comfortably under their one-mile walking limit. Focus on Mystery Lake Trail.',
      "Focus on roadside overlooks and visitor centers. I couldn't verify Mystery Lake Trail closely enough to promise it stays within one mile.",
    ];
    let reply = 0;
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'general_qa', depth: 'standard' }),
      planRequirements: () => [{ requirementId: 'r1', topic: 'activities', criticality: 'required' }],
      resolveEvidence: async () => evidenceBundle,
      executeResponses: async () => ({ ...proseResult(''), toolCalls: [{ name: 'respond_with_guidance', input: { segments: [{ stance: 'information', evidenceRef: null, constraintRef: null, text: replies[Math.min(reply++, replies.length - 1)] }] } }] }),
    });
    const result = await executeTrailieV2Turn(baseInput({
      userMessage: 'What should we focus on with a one-mile walking limit?',
      constraints: { mobility: { maxWalkMilesPerSegment: 1 } },
    }), { ...deps, enabled: true });

    expect(result.status).toBe('complete');
    expect(result.attempts).toHaveLength(2);
    expect(dispatches[1].instructions).toMatch(/walking limit|distance evidence/i);
    expect(result.response.text).toMatch(/couldn't verify/i);
  });

  // N — repeated tool truncation is contained; no partial artifact is accepted
  test('N: truncated tool output is never accepted as a valid plan', async () => {
    const { deps } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'], structurePolicy: 'required' }),
      executeResponses: sequenced([truncatedTool]),
    });
    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });
    expect(result.status).toBe('evidence_incomplete');
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts.every(a => a.validationStage === 'structured_output' && a.retryability === 'model_fixable' && a.tier === 'sol_medium')).toBe(true);
    expect(result.canonicalPlan).toBeNull();
    expect(result.validation.reasonCodes).toContain('output_incomplete');
  });

  test('truncated nonempty prose is repaired before being returned as complete', async () => {
    const { deps } = buildDeps({
      executeResponses: sequenced([
        () => ({ ...proseResult('Use your hotel as the base, followed by a photo stop at'),
          completionStatus: 'incomplete', stopReason: 'max_tokens' }),
        () => proseResult('I will use your booked hotel as the trip base.'),
      ]),
    });
    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });
    expect(result.status).toBe('complete');
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].validationReasonCodes).toContain('output_incomplete');
    expect(result.response.text).toBe('I will use your booked hotel as the trip base.');
  });
});

describe('WP11A telemetry, privacy, and isolation invariants', () => {
  // O — missing usage/pricing -> cost_unknown, never fake zero
  test('O: missing usage yields cost_unknown, priced usage yields a real cost', async () => {
    const { deps: unknownDeps } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'lodging_strategy', depth: 'standard' }),
      executeResponses: async () => proseResult('ok', null),
    });
    const unknown = await executeTrailieV2Turn(baseInput(), { ...unknownDeps, enabled: true });
    expect(unknown.telemetrySummary.totalCost.costStatus).toBe('cost_unknown');
    expect(unknown.telemetrySummary.totalCost.costUsd).toBeNull();
    expect(unknown.attempts[0].cost.costStatus).toBe('cost_unknown');

    const { deps: pricedDeps } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'lodging_strategy', depth: 'standard' }),
      executeResponses: async () => proseResult('ok', { inputTokens: 1000, outputTokens: 200 }),
    });
    const priced = await executeTrailieV2Turn(baseInput(), { ...pricedDeps, enabled: true });
    expect(priced.telemetrySummary.totalCost.costStatus).toBe('priced');
    expect(priced.telemetrySummary.totalCost.costUsd).toBeGreaterThan(0);
  });

  // P — canonical result leaks no private state / prompt / raw evidence / provider payload
  test('P: canonical result never leaks TripState, constraints, prompt, or provider payload', async () => {
    const { deps } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'lodging_strategy', depth: 'standard' }),
      executeResponses: async () => proseResult('Stay in the gateway town.'),
    });
    const result = await executeTrailieV2Turn(baseInput({
      userMessage: 'plan around SECRET_PROMPT_MARKER',
      tripState: { homeAddress: '123 Secret Lane', partySize: 4 },
      constraints: { hard: ['budget'], note: 'SENSITIVE_CONSTRAINT_NOTE' },
    }), { ...deps, enabled: true });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('123 Secret Lane');
    expect(serialized).not.toContain('SENSITIVE_CONSTRAINT_NOTE');
    expect(serialized).not.toContain('SECRET_PROMPT_MARKER');
    expect(serialized).not.toContain('CORE POLICY');
  });

  // R — object identity of frozen inputs across every attempt
  test('R: EvidenceBundle / TripState / constraints / Prompt-v2 are frozen and identical per attempt', async () => {
    const { deps, attemptContexts } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'full_trip', depth: 'deep', verticals: ['itinerary'] }),
      executeResponses: sequenced([missingTool, missingTool, itineraryOutputResult]),
    });
    const result = await executeTrailieV2Turn(
      baseInput({ resolvedContext: { tripDays: 8 }, tripState: { partySize: 2 }, constraints: { hard: ['budget'] } }),
      { ...deps, enabled: true },
    );
    expect(result.status).toBe('evidence_incomplete');
    expect(result.attempts[1].blockerSignature).toBe(result.attempts[0].blockerSignature);
    expect(attemptContexts).toHaveLength(2);
    for (const key of ['promptSnapshot', 'evidenceBundle', 'tripState', 'constraints']) {
      expect(attemptContexts[1][key]).toBe(attemptContexts[0][key]);
      expect(Object.isFrozen(attemptContexts[0][key])).toBe(true);
    }
  });

  // S — evidence resolved exactly once per turn
  test('S: retries and escalation never re-resolve evidence', async () => {
    const { deps, brokerCalls } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'full_trip', depth: 'deep', verticals: ['itinerary'] }),
      planRequirements: () => [{ requirementId: 'r1', topic: 'overview', criticality: 'required' }],
      executeResponses: sequenced([missingTool, missingTool, itineraryOutputResult]),
    });
    await executeTrailieV2Turn(baseInput({ resolvedContext: { tripDays: 8 } }), { ...deps, enabled: true });
    expect(brokerCalls).toHaveLength(1);
    expect(deps.resolveEvidence).toHaveBeenCalledTimes(1);
  });

  // T — exactly one provider dispatch per model attempt (no hidden retry)
  test('T: one provider dispatch per attempt', async () => {
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'full_trip', depth: 'deep', verticals: ['itinerary'] }),
      planRequirements: () => [{ requirementId: 'r1', topic: 'overview', criticality: 'required' }],
      executeResponses: sequenced([missingTool, missingTool, itineraryOutputResult]),
    });
    const result = await executeTrailieV2Turn(baseInput({ resolvedContext: { tripDays: 8 } }), { ...deps, enabled: true });
    expect(dispatches).toHaveLength(result.attempts.length);
  });

  test('emits only product-level lifecycle events (no model/provider names)', async () => {
    const events = [];
    const { deps } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'lodging_strategy', depth: 'standard' }),
      executeResponses: async () => proseResult('ok'),
    });
    await executeTrailieV2Turn(
      { ...baseInput(), emitCanonicalEvent: (e) => events.push(e) }, { ...deps, enabled: true },
    );
    const types = events.map((e) => e.type);
    expect(types).toContain('response_started');
    expect(types).toContain('response_finalized');
    const serialized = JSON.stringify(events);
    expect(serialized).not.toMatch(/terra|luna|sol|gpt-5|openai|escalat/i);
  });
});

describe('WP11A default wiring (real classifier + planner + router)', () => {
  test('runs end-to-end through the real WP2/WP4/WP9 components', async () => {
    const dispatches = [];
    const result = await executeTrailieV2Turn(baseInput({
      userMessage: 'Where should I stay near Yosemite?',
    }), {
      enabled: true,
      // Only the provider boundaries are faked. Coverage is satisfied so the
      // real router/prompt/finalization path runs unmodified.
      resolveEvidence: async ({ requirements, requestId }) => buildEvidenceBundle({
        requestId,
        resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [] })),
        candidates: [],
      }),
      executeResponses: async (request) => {
        dispatches.push(request);
        return proseResult('Stay in the gateway town of El Portal.');
      },
    });
    expect(result.status).toBe('complete');
    expect(['luna_low', 'sol_low', 'sol_medium']).toContain(result.routeDecision.selectedTier);
    expect(dispatches).toHaveLength(1);
    expect(result.intent.primaryIntent).toBe('lodging_strategy');
  });
});

test.each([
  ['OK', false, 'authoritative'],
  ['ZERO_RESULTS', false, 'noResult'],
  ['REQUEST_DENIED', false, 'providerFailure'],
  ['OVER_QUERY_LIMIT', false, 'providerFailure'],
  ['OVER_DAILY_LIMIT', false, 'providerFailure'],
  ['HTTP_401', false, 'providerFailure'],
  ['HTTP_403', false, 'providerFailure'],
  ['HTTP_429', false, 'providerFailure'],
  ['REQUEST_DENIED', true, 'rejectedByAuthority'],
])('9C.2B1.2 execution classifies %s / fallback %s as %s', async (status, fallback, outcome) => {
  const { createEvidenceBroker } = require('../../../../../src/services/evidenceBrokerService');
  const { createGeocodeCoordinateEvidenceProvider } = require('../../../../../src/services/providers/geocodeCoordinateEvidenceProvider');
  const { buildProductionGeoCoordinateResolver } = require('../../../../../src/utils/productionGeoCoordinateResolver');
  const { normalizeItineraryCoordinates } = require('../../../../../src/utils/finalizeItinerary');
  const fetch = require('node-fetch');
  fetch.mockReset();
  const previousKey = process.env.GMAPS_SERVER_KEY;
  process.env.GMAPS_SERVER_KEY = 'fake-test-key';
  // Isolate the service's success cache between table rows.
  let geocodePlace;
  jest.isolateModules(() => { geocodePlace = require('../../../../../src/services/geocodePlaceService').geocodePlace; });
  fetch.mockResolvedValueOnce({ ok: !status.startsWith('HTTP_'), json: async () => ({
    status, error_message: 'PRIVATE PROVIDER PAYLOAD', results: status === 'OK' ? [{
      formatted_address: 'Valley floor scenic walk, Yosemite National Park',
      geometry: { location: { lat: 37.7, lng: -119.6 } },
    }] : [],
  }) });
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: fallback ? [{
    name: 'Valley floor scenic walk', admin1: 'California', country: 'United States',
    country_code: 'US', latitude: 37.7, longitude: -119.6,
  }] : [] }) });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const forbidden = jest.fn();
    const broker = createEvidenceBroker({
      providers: [createGeocodeCoordinateEvidenceProvider({ geocodePlace })],
      acquireLease: forbidden, releaseLease: forbidden, persistCandidate: forbidden, queryEvidence: forbidden,
    });
    const dispatchEphemeral = jest.fn((args) => broker.dispatchEphemeral(args));
    const frozen = Object.freeze({ requestId: 'turn-test', evidence: Object.freeze([{
      evidenceId: 'ev:walk', entityId: 'nps:park:yose', topic: 'activities',
      claim: { normalizedValue: { name: 'Valley floor scenic walk' } },
    }]), resolutions: [], coverage: { status: 'complete' } });
    const before = JSON.stringify(frozen);
    const finalizeItinerary = jest.fn(async ({ itineraryData }) => ({
      itineraryData: normalizeItineraryCoordinates(itineraryData),
      feasibilityIssues: [], operationalConflicts: [],
    }));
    const controller = new AbortController();
    const { deps } = buildDeps({
      classifyIntent: () => classification({
        primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'], structurePolicy: 'required',
      }),
      planRequirements: () => [{ requirementId: 'r1', topic: 'activities', criticality: 'optional' }],
      resolveEvidence: async () => frozen,
      executeResponses: async () => itineraryOutputResult(),
      resolveStopCoordinates: buildProductionGeoCoordinateResolver({ dispatchEphemeral }),
      finalizeItinerary,
    });
    const result = await executeTrailieV2Turn(baseInput({ signal: controller.signal }), { ...deps, enabled: true });
    expect(result.telemetrySummary.coordinateResolution).toMatchObject({
      eligibleStops: 1, dispatches: 1, authoritative: 0, noResult: 0,
      providerFailure: 0, rejectedByAuthority: 0, [outcome]: 1,
    });
    expect(fetch).toHaveBeenCalledTimes(status === 'OK' ? 1 : 2);
    expect(JSON.stringify(result.telemetrySummary)).not.toContain('PRIVATE PROVIDER PAYLOAD');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('PRIVATE PROVIDER PAYLOAD');
    expect(dispatchEphemeral).toHaveBeenCalled();
    expect(dispatchEphemeral.mock.calls[0][0]).toMatchObject({
      requestId: 'turn-test', signal: controller.signal,
      ownership: { attempt: expect.any(Number), dispatchIndex: expect.any(Number), candidateFingerprint: expect.any(String) },
    });
    const finalizedStop = finalizeItinerary.mock.calls[0][0].itineraryData.days[0].stops
      .find((s) => s.canonicalPlaceName === 'Valley floor scenic walk');
    expect(finalizedStop.evidenceRef).toBe('ev:walk');
    const { hasAuthoritativeCoordinates } = require('../../../../../src/utils/coordinateValidation');
    expect(hasAuthoritativeCoordinates(finalizedStop)).toBe(outcome === 'authoritative');
    if (outcome === 'authoritative') {
      expect(finalizedStop).toMatchObject({ latitude: 37.7, longitude: -119.6, coordinateSource: 'geocoder' });
    }
    if (fallback) {
      const dispatch = await dispatchEphemeral.mock.results[0].value;
      expect(dispatch.status).toBe('fulfilled');
      expect(dispatch.normalizedCandidates[0].claim.normalizedValue.providerSource).toBe('open-meteo');
    }
    expect(JSON.stringify(frozen)).toBe(before);
    expect(forbidden).not.toHaveBeenCalled();
  } finally {
    warn.mockRestore();
    if (previousKey === undefined) delete process.env.GMAPS_SERVER_KEY;
    else process.env.GMAPS_SERVER_KEY = previousKey;
  }
});

test.each([true, false])('9C.2B2B.2 execution uses finalizer route hook and emits counts only (success=%s)', async (success) => {
  const { createEvidenceBroker } = require('../../../../../src/services/evidenceBrokerService');
  const { createMapsEvidenceProvider } = require('../../../../../src/services/providers/mapsEvidenceProvider');
  const { buildProductionStopRouteResolver } = require('../../../../../src/utils/stopRouteArtifact');
  const days = [{ id: 'd1', dayNumber: 1, stops: [
    { id: 'a', name: 'Visitor Center orientation', duration: 45, timeWindow: 'Morning', parkCode: 'yose' },
    { id: 'b', name: 'Valley floor scenic walk', duration: 90, timeWindow: 'Late morning', parkCode: 'yose' },
    { id: 'c', name: 'Picnic and rest buffer', duration: 60, timeWindow: 'Midday', parkCode: 'yose' },
  ], travelEdges: [{ sourceStopId: 'a', targetStopId: 'b', relationship: 'transfer', modeIntent: 'drive' }] }];
  const evidence = days[0].stops.slice(0, 2).map((stop, i) => ({
    evidenceId: `ev:${stop.id}`, entityId: 'nps:park:yose', topic: 'activities', evidenceType: 'fact',
    source: { provider: 'nps' }, claim: { normalizedValue: {
      name: stop.name, entityId: `nps:park:yose:place:${stop.id}`, latitude: 37.7 + i / 100, longitude: -119.6,
    } },
  }));
  const frozen = Object.freeze({ requestId: 'turn-test', evidence, resolutions: [], coverage: { status: 'complete' } });
  const getRoute = jest.fn(async () => success ? { durationSeconds: 600, distanceMeters: 3000 } : null);
  const persistent = jest.fn(() => { throw new Error('route evidence must be ephemeral'); });
  const broker = createEvidenceBroker({ providers: [createMapsEvidenceProvider({ mapsClient: { getRoute } })],
    persistCandidate: persistent, queryEvidence: persistent, acquireLease: persistent, releaseLease: persistent });
  const { deps } = buildDeps({
    classifyIntent: () => classification({ primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'], structurePolicy: 'required' }),
    planRequirements: () => [{ requirementId: 'r1', topic: 'activities', criticality: 'optional' }],
    resolveEvidence: async () => frozen,
    executeResponses: async () => itineraryOutputResult({ days }),
    resolveStopRoute: buildProductionStopRouteResolver({ dispatchEphemeral: (args) => broker.dispatchEphemeral(args) }),
  });
  const result = await executeTrailieV2Turn(baseInput({ constraints: { planningState: { transportation: { mode: 'drive' } } } }), { ...deps, enabled: true });
  expect(result.status).toBe('complete');
  expect(getRoute).toHaveBeenCalledTimes(1);
  expect(result.telemetrySummary.routeResolution).toMatchObject({ applicableEdges: 1, eligibleEdges: 1, dispatches: 1,
    verified: success ? 1 : 0, noResult: success ? 0 : 1, fullyChecked: success ? 1 : 0, noneChecked: success ? 0 : 1 });
  expect(result.canonicalPlan.days[0].stops.find((s) => s.id === 'b').drivingTimeFromPreviousMin).toBe(success ? 10 : null);
  expect(JSON.stringify(result.canonicalPlan)).not.toMatch(/routeArtifact|routeCoverage|routeFingerprint|google_maps/);
  expect(persistent).not.toHaveBeenCalled();
});

describe('explicit trip pushback outcome', () => {
  test('required itinerary becomes a validated recommendation without escalation', async () => {
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'full_trip', depth: 'planning', verticals: ['itinerary'] }),
      executeResponses: async () => ({ ...proseResult(''), toolCalls: [{ name: 'recommend_trip_revision', input: {
        reason: 'insufficient_time',
        explanation: 'I would not fit Yellowstone, Grand Teton, Glacier and Banff into five days; too much time would go into transfers.',
        recommendation: 'I recommend Yellowstone and Grand Teton for this trip, saving Glacier and Banff for another.',
      } }] }),
    });
    const result = await executeTrailieV2Turn(baseInput({ userMessage: 'Yellowstone, Grand Teton, Glacier and Banff in five days.' }), { ...deps, enabled: true });
    expect(result.status).toBe('complete');
    expect(result.validation.status).toBe('pass');
    expect(result.canonicalPlan).toBeNull();
    expect(result.telemetrySummary.executionContract.requestedArtifact).toBe('plain_answer');
    expect(result.telemetrySummary.executionContract.reasonCodes).toContain('validated_trip_pushback');
    expect(dispatches).toHaveLength(1);
    expect(result.response.text).toContain('Banff');
  });
});

test('unknown exposure is excluded before a day patch selects a compatible reference', async () => {
  const prior = { intro: 'Two days.', days: [1, 2].map(dayNumber => ({ id: `d${dayNumber}`, dayNumber, label: `Scenic day ${dayNumber}`,
    stops: [{ id: `s${dayNumber}`, order: 1, name: `Original Vista ${dayNumber}`, type: 'viewpoint', exposureLevel: 'low', duration: 120, note: 'Take your time with the views.', startTime: '' }] })) };
  const candidates = [
    ['ev:unknown', 'Mystery Trail', null, ['hike']],
    ['ev:safe', 'Gentle River Trail', 'low', ['hike']],
  ].map(([evidenceId, name, exposureLevel, activityTypes]) => ({ evidenceId, entityId: `nps:park:yose:${evidenceId}`, topic: 'activities',
    claim: { text: name, identity: name, qualifiers: ['named_activity_candidate'], normalizedValue: { name, category: 'place', activityTypes, exposureLevel, difficulty: 'easy', operationalFacts: [] } },
    source: { provider: 'nps', sourceClass: 'official_owner' }, quality: { authorityClass: 'official_owner' }, observation: { observedAt: '2026-09-23T12:00:00Z' } }));
  const bundle = buildEvidenceBundle({ requestId: 'turn-test', resolutions: [{ requirementId: 'r1', status: 'satisfied_fresh', evidenceIds: candidates.map(c => c.evidenceId) }], candidates });
  const { deps, dispatches } = buildDeps({
    classifyIntent: () => classification({ primaryIntent: 'trip_refinement', travelerJob: 'itinerary_refinement', depth: 'planning', verticals: ['itinerary'] }),
    planRequirements: () => [{ requirementId: 'r1', topic: 'activities', entityId: 'park:nps:yose', criticality: 'soft' }],
    resolveEvidence: async () => bundle,
    executeResponses: async request => {
      if (request.tools[0].name === 'substitute_illegal_stops') return { ...proseResult(''), toolCalls: [{ name: 'substitute_illegal_stops', input: { substitutions: [{ dayRef: 2, stopRef: 1, replacement: { placeRef: 1, note: 'Enjoy the river views at an easy pace.', why: 'A gentle main outing.' } }] } }] };
      return planPatchOutputResult({ response: 'Day two is now easier.', operations: [{ op: 'update_day', dayNumber: 2, day: { ...prior.days[1], stops: [{ id: 's2new', order: 1, name: 'Mystery Trail', placeRef: 1, type: 'trail', exposureLevel: 'unknown', duration: 120, note: 'Enjoy the scenery.', startTime: '' }] } }] });
    },
  });
  const result = await executeTrailieV2Turn(baseInput({ userMessage: 'Redo day two and make it easier. No exposed hikes.', tripState: { existingCanonicalPlan: prior, hasItinerary: true }, constraints: { avoidExposure: true, dates: { durationDays: 2 } }, resolvedContext: { tripDays: 2 } }), { ...deps, enabled: true });
  expect(result.status).toBe('complete');
  expect(result.validation.status).toBe('pass');
  expect(result.canonicalPlan.days[0]).toEqual(prior.days[0]);
  expect(result.canonicalPlan.days[1].stops[0].name).toBe('Gentle River Trail');
  expect(result.canonicalPlan.days[1].stops[0].exposureLevel).toBe('low');
  expect(dispatches).toHaveLength(1);
  expect(dispatches[0].tools[0].input_schema.properties.operations.items.properties.stop.properties.placeRef.enum).toEqual([1]);
  expect(result.attempts).toHaveLength(1);
});

test('empty eligible repair pool contains an edit after one mocked generation and never escalates', async () => {
  const prior = { intro: 'A scenic day.', days: [{ dayNumber: 1, label: 'Museum', stops: [{ id: 'museum', name: 'Original Museum', type: 'museum', duration: 90 }] }] };
  const { deps, dispatches } = buildDeps({
    classifyIntent: () => classification({ primaryIntent: 'trip_refinement', travelerJob: 'itinerary_refinement', depth: 'planning', verticals: ['itinerary'] }),
    executeResponses: async () => planPatchOutputResult({ response: 'Try a replacement.', operations: [{ op: 'add_stop', dayNumber: 1, stop: { name: 'Invented Trail', type: 'trail', duration: 60 } }] }),
  });
  const result = await executeTrailieV2Turn(baseInput({ userMessage: 'Replace the closed museum with a suitable outing.',
    tripState: { existingCanonicalPlan: prior, hasItinerary: true }, constraints: { avoidExposure: true },
  }), { ...deps, enabled: true });
  expect(result.status).toBe('evidence_incomplete');
  expect(dispatches).toHaveLength(1);
  expect(result.attempts).toHaveLength(1);
  expect(result.canonicalPlan).toBeFalsy();
  expect(prior.days[0].stops[0].name).toBe('Original Museum');
});

test('closure removal cannot promote an insubstantial sightseeing day merely because pace is relaxed', async () => {
  const prior = { intro: 'Two days.', days: [
    { id: 'd1', dayNumber: 1, label: 'City history', stops: [
      { id: 'museum', order: 1, name: 'History Museum', type: 'museum', duration: 45, note: 'Visit the exhibits.' },
      { id: 'closed', order: 2, name: 'Ridge Lookout', type: 'viewpoint', duration: 90, note: 'Enjoy views.' }] },
    { id: 'd2', dayNumber: 2, label: 'Art', stops: [{ id: 'art', order: 1, name: 'Art Museum', type: 'museum', duration: 120, note: 'Visit the galleries.' }] },
  ] };
  const { deps, dispatches } = buildDeps({
      ...groundedFixture([['History Museum', 'museum']]),
    classifyIntent: () => classification({ primaryIntent: 'trip_refinement', travelerJob: 'itinerary_refinement', depth: 'planning', verticals: ['itinerary'] }),
    executeResponses: async () => planPatchOutputResult({ response: 'I removed the closed lookout from day one.', operations: [{ op: 'remove_stop', dayNumber: 1, stopId: 'closed' }] }),
  });
  const result = await executeTrailieV2Turn(baseInput({ userMessage: 'The lookout is closed. Remove it from day one.',
    tripState: { existingCanonicalPlan: prior, hasItinerary: true }, constraints: { pace: 'relaxed', dates: { durationDays: 2 } },
  }), { ...deps, enabled: true });
  expect(result.status).not.toBe('complete');
  expect(dispatches).toHaveLength(1);
  expect(result.canonicalPlan).toBeFalsy();
  expect(prior.days[0].stops.map(s => s.name)).toEqual(['History Museum', 'Ridge Lookout']);
  expect(prior.days[1].stops[0].name).toBe('Art Museum');
});

test('the default empty fixture cannot ground a generated itinerary or trigger an evidence retry', async () => {
  const { deps, dispatches } = buildDeps({ classifyIntent: () => classification({
    primaryIntent: 'simple_itinerary', depth: 'planning', verticals: ['itinerary'], structurePolicy: 'required',
  }) });
  const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });
  expect(result.status).toBe('evidence_incomplete');
  expect(result.canonicalPlan).toBeNull();
  expect(dispatches).toHaveLength(1);
  expect(result.attempts[0]).toMatchObject({ validationStage: 'stop_identity',
    validationReasonCodes: ['stop_identity_unresolved'], retryability: 'evidence_blocker', tier: 'sol_medium' });
});
