'use strict';

/**
 * Trailie v2 — P1 Closure Gate
 * Offline only. No providers / models / network.
 *
 * Closes the three Full Static Re-Audit P1 blockers:
 *   P1-1 interest-clear authority vs stale formData
 *   P1-2 budget claim safety on live finalize/response path
 *   P1-3 durable avoidExposure arming on silent follow-ups
 */

const {
  parseConstraints,
  validateItineraryConstraints,
} = require('../../../../../src/utils/constraintEngine');
const {
  buildPlanningStateFromRuntime,
  resolvePlanningStateForWrite,
  normalizePersistedPlanningState,
  planningStateToConstraintSeed,
  emptyPlanningState,
} = require('../../../../../src/utils/planningState');
const {
  parseBudgetConstraint,
  assessBudget,
  validateBudgetClaim,
  createCostComponent,
  buildBudgetClaimRepairInstructions,
} = require('../../../../../src/utils/budgetContract');
const {
  evaluateItineraryCompleteness,
  evaluateStopExposureConsistency,
} = require('../../../../../src/utils/itineraryCompleteness');
const {
  userAvoidsTrailExposure,
  isAvoidExposureActive,
} = require('../../../../../src/utils/planningInputContract');
const {
  executeTrailieV2Turn,
} = require('../../../../../src/services/trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');

// ── helpers ──────────────────────────────────────────────────────────────────

function saveThenReloadWithFormData(initialMessage, followUps, staleFormData) {
  let constraints = parseConstraints({ formData: {} }, initialMessage);
  let persisted = buildPlanningStateFromRuntime({ constraints });

  for (const msg of followUps) {
    constraints = parseConstraints(
      { planningState: persisted, formData: staleFormData || {} },
      msg
    );
    persisted = buildPlanningStateFromRuntime({
      constraints,
      previous: persisted,
      formData: staleFormData || {},
    });
  }

  const written = resolvePlanningStateForWrite({
    incomingPlanningState: persisted,
    previousPlanningState: persisted,
    formData: staleFormData || {},
    conversation: [
      { role: 'user', content: initialMessage },
      ...followUps.map((content) => ({ role: 'user', content })),
    ],
  });

  const reloaded = parseConstraints(
    { planningState: written, formData: staleFormData || {} },
    ''
  );
  return { constraints, persisted, written, reloaded };
}

function plan(days) {
  return { days };
}
function day(n, stops) {
  return { day: n, dayNumber: n, stops };
}

function itineraryOutputWithProse(text, days) {
  return {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    outputText: text,
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
    usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 0 },
  };
}

function completeDays(overrides = {}) {
  return overrides.days || [{
    id: 'd1',
    dayNumber: 1,
    label: 'Day 1',
    stops: [
      {
        name: 'Visitor Center orientation',
        duration: 45,
        timeWindow: 'Morning',
        type: 'visitor_center',
        exposureLevel: 'low',
      },
      {
        name: 'Valley floor scenic walk',
        duration: 90,
        timeWindow: 'Late morning',
        type: 'trail',
        exposureLevel: 'low',
        difficulty: 'easy',
      },
      {
        name: 'Picnic and rest buffer',
        duration: 60,
        timeWindow: 'Midday',
        type: 'rest',
      },
    ],
  }];
}

function buildLiveDeps(resultFactory) {
  const brokerCalls = [];
  let attempt = 0;
  return {
    enabled: true,
    classifyIntent: () => ({
      version: 'trailie-intent-v2.0.0',
      source: 'deterministic',
      primaryIntent: 'full_trip',
      verticals: ['itinerary'],
      depth: 'planning',
      freshness: 'planning',
      actionability: 'planning',
      scope: 'single_destination',
      entities: [],
      confidence: 0.9,
      reasonCodes: ['full_trip'],
      compound: false,
      requiresLunaShadow: false,
    }),
    planRequirements: () => [],
    resolveEvidence: async ({ requestId }) => {
      brokerCalls.push(requestId || 'x');
      return buildEvidenceBundle({ requestId: requestId || 'p1-closure', resolutions: [], candidates: [] });
    },
    resolveDeterministicRender: () => ({ eligible: false }),
    detectContradiction: () => [],
    buildPrompt: () => ({ publicPrefix: '', privateSuffix: '', snapshotId: 'p1' }),
    createRequest: ({ tools } = {}) => ({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      tools: tools || [{ name: 'create_itinerary' }],
    }),
    streamGeneration: false,
    responseAdapters: {},
    executeResponses: async () => {
      attempt += 1;
      return resultFactory(attempt);
    },
    now: () => new Date('2026-08-11T12:00:00.000Z'),
    newTurnId: () => 'turn-p1-closure',
    _brokerCalls: brokerCalls,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
describe('P1-1 — interest clear authority', () => {
  test('A — explicit empty planningState beats stale formData hiking', () => {
    const state = buildPlanningStateFromRuntime({
      constraints: {
        interests: [],
        dates: {},
        hasConstraints: true,
      },
    });
    expect(Array.isArray(state.preferences.interests)).toBe(true);
    expect(state.preferences.interests).toEqual([]);

    const reloaded = parseConstraints(
      {
        planningState: state,
        formData: { interests: ['hiking'] },
      },
      ''
    );
    expect(reloaded.interests).toEqual([]);
  });

  test('B — absent interests field still allows formData compatibility', () => {
    const raw = emptyPlanningState();
    delete raw.preferences.interests;
    // Simulate legacy blob that never had an interests key
    const legacy = {
      schemaVersion: raw.schemaVersion,
      destination: raw.destination,
      dates: raw.dates,
      travelers: raw.travelers,
      lodging: raw.lodging,
      transportation: raw.transportation,
      preferences: {
        fitness: null,
        pace: null,
        riskTolerance: null,
        avoidExposure: null,
        maxDailyDriveMinutes: null,
        // interests intentionally omitted
      },
      budgetConstraint: null,
      tripScope: null,
      userSuppliedCosts: [],
    };
    const n = normalizePersistedPlanningState(legacy);
    expect(n.ok).toBe(true);
    expect(n.state.preferences.interests).toBeNull();

    const seed = planningStateToConstraintSeed(n.state);
    expect(Object.prototype.hasOwnProperty.call(seed, 'interests')).toBe(false);

    const parsed = parseConstraints(
      { planningState: n.state, formData: { interests: ['hiking'] } },
      ''
    );
    expect(parsed.interests).toEqual(['hiking']);
  });

  test('C — remove all interests, save/reload with stale formData stays empty', () => {
    const stale = { interests: ['hiking', 'photography'] };
    const { written, reloaded } = saveThenReloadWithFormData(
      'We want hiking and photography.',
      ['Remove hiking.', 'Remove photography.'],
      stale
    );
    expect(written.preferences.interests).toEqual([]);
    expect(reloaded.interests).toEqual([]);
  });

  test('D — empty then add wildlife; no hiking/photography resurrection', () => {
    const stale = { interests: ['hiking', 'photography'] };
    const { reloaded } = saveThenReloadWithFormData(
      'We want hiking and photography.',
      ['Remove hiking.', 'Remove photography.', 'Add wildlife.'],
      stale
    );
    expect(reloaded.interests).toEqual(['wildlife']);
    expect(reloaded.interests).not.toContain('hiking');
    expect(reloaded.interests).not.toContain('photography');
  });

  test('E — explicit empty survives silent follow-up with stale formData', () => {
    const stale = { interests: ['hiking'] };
    const { reloaded } = saveThenReloadWithFormData(
      'We want hiking.',
      ['Remove hiking.', 'Make Day 2 easier.'],
      stale
    );
    expect(reloaded.interests).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('P1-2 — budget claim safety on live path', () => {
  const incompleteAssessment = () =>
    assessBudget({
      budgetConstraint: parseBudgetConstraint('under $600 total'),
      components: [
        createCostComponent({
          category: 'entrance_fee',
          amountMin: 100,
          status: 'verified',
          basis: 'evidence',
          appliesTo: 'trip',
        }),
      ],
      accommodation: 'hotel',
      applicableCategories: ['entrance_fee', 'lodging'],
    });

  test('A — cannot_verify + entire trip under $600 → flagged', () => {
    const assessment = incompleteAssessment();
    expect(assessment.verdict).toBe('cannot_verify');
    const issues = validateBudgetClaim(
      'Your entire trip is under $600.',
      assessment
    );
    expect(issues.some((i) => i.reasonCode === 'budget_claim_unsupported')).toBe(true);
  });

  test('B — exceeds_budget + fits your $600 budget → flagged', () => {
    const assessment = assessBudget({
      budgetConstraint: parseBudgetConstraint('budget of $600'),
      components: [
        createCostComponent({
          category: 'entrance_fee',
          amountMin: 700,
          status: 'verified',
          basis: 'evidence',
          appliesTo: 'trip',
        }),
      ],
      applicableCategories: ['entrance_fee'],
    });
    expect(assessment.verdict).toBe('exceeds_budget');
    const issues = validateBudgetClaim(
      'This fits your $600 budget.',
      assessment
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  test('C — within_budget complete + under $600 → allowed', () => {
    const assessment = assessBudget({
      budgetConstraint: parseBudgetConstraint('under $600 total'),
      components: [
        createCostComponent({
          category: 'entrance_fee',
          amountMin: 80,
          status: 'verified',
          basis: 'evidence',
          appliesTo: 'trip',
        }),
        createCostComponent({
          category: 'lodging',
          amountMin: 200,
          status: 'verified',
          basis: 'user_supplied',
          appliesTo: 'trip',
        }),
        createCostComponent({
          category: 'food',
          amountMin: 150,
          status: 'verified',
          basis: 'user_supplied',
          appliesTo: 'trip',
        }),
      ],
      accommodation: 'hotel',
      applicableCategories: ['entrance_fee', 'lodging', 'food'],
    });
    expect(assessment.verdict).toBe('within_budget');
    expect(assessment.coverage).toBe('complete');
    const issues = validateBudgetClaim('Trip stays under $600.', assessment);
    expect(issues).toEqual([]);
  });

  test('D — cannot_verify + qualified uncertainty prose → allowed', () => {
    const assessment = incompleteAssessment();
    const issues = validateBudgetClaim(
      'Known park fees are within your budget, but lodging and food are not fully priced so the total cannot be verified.',
      assessment
    );
    expect(issues).toEqual([]);
  });

  test('E — no numeric budget + budget-friendly → no false positive', () => {
    const issues = validateBudgetClaim(
      'Here are some budget-friendly options for the weekend.',
      null
    );
    expect(issues).toEqual([]);

    const tierAssessment = assessBudget({
      budgetConstraint: parseBudgetConstraint('Keep it cheap.'),
      components: [],
      applicableCategories: [],
    });
    const issues2 = validateBudgetClaim(
      'I picked budget-friendly options.',
      tierAssessment
    );
    expect(issues2).toEqual([]);
  });

  test('F — repair instructions do not require evidence refetch', () => {
    const text = buildBudgetClaimRepairInstructions([
      { reasonCode: 'budget_claim_unsupported' },
    ]);
    expect(text).toMatch(/budget assessment/i);
    expect(text).toMatch(/do not invent/i);
    expect(text).not.toMatch(/refetch|re-fetch|new evidence/i);
  });

  test('G — live finalize/response path executes validateBudgetClaim on candidate prose', async () => {
    const assessment = incompleteAssessment();
    expect(assessment.verdict).toBe('cannot_verify');

    const overclaimOnly = buildLiveDeps(() =>
      itineraryOutputWithProse(
        'Your whole trip stays under $600 with this plan.',
        completeDays()
      )
    );

    const blocked = await executeTrailieV2Turn(
      {
        userMessage: 'Plan 3 days camping under $600.',
        constraints: {
          hasConstraints: true,
          dates: { numDays: 1 },
          interests: [],
          accommodation: 'camping',
          budgetConstraint: assessment.constraint,
          budgetAssessment: assessment,
        },
        resolvedContext: { tripDays: 1 },
      },
      overclaimOnly
    );

    // Overclaiming prose must not escape as a completed final response.
    expect(blocked.status).not.toBe('complete');
    expect(
      (blocked.validation?.reasonCodes || []).includes('budget_claim_unsupported')
      || blocked.status === 'failed'
    ).toBe(true);

    // Same frozen empty-requirement bundle path — no broker refetch across attempts.
    expect(overclaimOnly._brokerCalls.length).toBe(0);

    // Also prove options.budgetClaimText wiring on validateItineraryConstraints.
    const direct = validateItineraryConstraints(
      { days: completeDays() },
      {
        hasConstraints: true,
        dates: { numDays: 1 },
        interests: [],
        budgetConstraint: assessment.constraint,
        budgetAssessment: assessment,
      },
      { budgetClaimText: 'Your whole trip stays under $600 with this plan.' }
    );
    expect(direct.some((i) => i.reasonCode === 'budget_claim_unsupported')).toBe(true);

    // Repair path: second attempt qualifies the claim → may complete; still one evidence resolve (none needed).
    const repairedDeps = buildLiveDeps((attempt) => {
      const prose =
        attempt === 1
          ? 'Your whole trip stays under $600 with this plan.'
          : 'Known park fees fit the budget, but lodging and food are not fully priced so total compliance cannot be verified.';
      return itineraryOutputWithProse(prose, completeDays());
    });

    const repaired = await executeTrailieV2Turn(
      {
        userMessage: 'Plan 3 days camping under $600.',
        constraints: {
          hasConstraints: true,
          dates: { numDays: 1 },
          interests: [],
          accommodation: 'camping',
          budgetConstraint: assessment.constraint,
          budgetAssessment: assessment,
        },
        resolvedContext: { tripDays: 1 },
      },
      repairedDeps
    );

    expect(repairedDeps._brokerCalls.length).toBe(0);
    if (repaired.status === 'complete') {
      expect(repaired.response?.text || '').not.toMatch(/whole trip stays under \$600/i);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('P1-3 — exposure durable arming', () => {
  test('A — persisted avoidExposure + silent prompt + high exposure → violation', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          {
            name: 'Ridge Path',
            type: 'trail',
            duration: 90,
            exposureLevel: 'high',
            note: 'Scenic ridge.',
          },
          {
            name: 'Quiet Bend',
            type: 'viewpoint',
            duration: 45,
            exposureLevel: 'low',
          },
        ]),
      ]),
      constraints: { avoidExposure: true, dates: { numDays: 1 }, interests: [] },
      userPrompt: 'Make Day 2 more relaxed.',
    });
    expect(result.ok).toBe(false);
    expect(
      result.reasonCodes.some((c) =>
        c === 'exposure_constraint_violation' || c === 'exposure_prose_conflict'
      )
    ).toBe(true);
  });

  test('B — avoidExposure + silent + unknown → fail-closed', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          {
            name: 'Mystery Spur',
            type: 'trail',
            duration: 90,
            exposureLevel: 'unknown',
          },
          {
            name: 'Meadow Walk',
            type: 'trail',
            duration: 60,
            exposureLevel: 'low',
          },
        ]),
      ]),
      constraints: { avoidExposure: true, dates: { numDays: 1 }, interests: [] },
      userPrompt: 'Make Day 2 more relaxed.',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('constraint_eligibility_unknown');
  });

  test('C — avoidExposure + silent + low → compatible', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          {
            name: 'Riverwalk Path',
            type: 'trail',
            duration: 90,
            exposureLevel: 'low',
            note: 'Low-exposure paved walk.',
          },
          {
            name: 'Quiet Bend Viewpoint',
            type: 'landmark',
            duration: 45,
            exposureLevel: 'low',
          },
        ]),
      ]),
      constraints: { avoidExposure: true, dates: { numDays: 1 }, interests: [] },
      userPrompt: 'Make Day 2 more relaxed.',
    });
    expect(result.ok).toBe(true);
  });

  test('D — avoidExposure false + unrelated prompt → unknown stays eligible', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          {
            name: 'Mystery Spur',
            type: 'trail',
            duration: 90,
            exposureLevel: null,
          },
          {
            name: 'Meadow Walk',
            type: 'trail',
            duration: 60,
            exposureLevel: 'low',
          },
        ]),
      ]),
      constraints: { avoidExposure: false, dates: { numDays: 1 }, interests: [] },
      userPrompt: 'What about lunch spots?',
    });
    expect(result.reasonCodes).not.toContain('constraint_eligibility_unknown');
    expect(result.reasonCodes).not.toContain('exposure_constraint_violation');
  });

  test('E — fresh prompt "no exposed trails" normalizes + arms gate', () => {
    const c = parseConstraints({}, '2 days, no exposed trails, easy hikes');
    expect(c.avoidExposure).toBe(true);
    expect(isAvoidExposureActive(c, '2 days, no exposed trails, easy hikes')).toBe(true);
    expect(userAvoidsTrailExposure('no exposed trails')).toBe(true);
  });

  test('F — "no exposure to social media" does not arm', () => {
    expect(userAvoidsTrailExposure('no exposure to social media')).toBe(false);
    const c = parseConstraints({}, 'no exposure to social media during the trip');
    expect(c.avoidExposure).not.toBe(true);
  });

  test('G — save avoidExposure, reload, silent refinement keeps gate armed', () => {
    const first = parseConstraints({}, '3 days Zion, no exposed trails');
    expect(first.avoidExposure).toBe(true);
    const saved = buildPlanningStateFromRuntime({ constraints: first });
    expect(saved.preferences.avoidExposure).toBe(true);

    const silent = parseConstraints(
      { planningState: saved, formData: {} },
      'Make Day 2 more relaxed.'
    );
    expect(silent.avoidExposure).toBe(true);
    expect(isAvoidExposureActive(silent, 'Make Day 2 more relaxed.')).toBe(true);

    const codes = evaluateStopExposureConsistency(
      { name: 'Ridge', type: 'trail', exposureLevel: 'high' },
      'Make Day 2 more relaxed.',
      { avoidExposure: silent.avoidExposure }
    );
    expect(codes.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('Cross-P1 integration', () => {
  test('combined persisted multi-constraint silent follow-up + candidate findings', () => {
    const first = parseConstraints(
      {
        formData: {
          interests: ['hiking', 'photography'],
          budget: '1200',
          accommodation: 'hotel',
        },
      },
      [
        'Road trip from Denver to Rocky Mountain then Arches for 4 friends,',
        'camping, keep the whole trip under $700, max 4 hours driving a day,',
        'no exposed trails. Clear hotel preference — we are camping.',
      ].join(' ')
    );

    // Force the durable cleared-interests + camping + budget + exposure state
    // that the product contract requires for this scenario.
    let state = buildPlanningStateFromRuntime({
      constraints: {
        ...first,
        travelParty: 'friends',
        groupSize: 4,
        interests: [],
        accommodation: 'camping',
        avoidExposure: true,
        budgetConstraint: parseBudgetConstraint('under $700 total for the trip'),
        maxDailyDriveMinutes: 240,
      },
    });

    // Ensure road-trip scope if parse captured it; otherwise set a minimal one.
    if (!state.tripScope || state.tripScope.type === 'single_destination') {
      state = {
        ...state,
        tripScope: {
          type: 'road_trip',
          transportMode: 'drive',
          origin: { displayName: 'Denver', entityId: 'place:denver' },
          destinations: [
            { parkCode: 'romo', displayName: 'Rocky Mountain', order: 1 },
            { parkCode: 'arch', displayName: 'Arches', order: 2 },
          ],
          routeShape: 'one_way',
          maxDailyDriveMinutes: 240,
          routeLegs: [],
        },
        preferences: {
          ...state.preferences,
          interests: [],
          avoidExposure: true,
          maxDailyDriveMinutes: 240,
        },
      };
    } else {
      state = {
        ...state,
        preferences: {
          ...state.preferences,
          interests: [],
          avoidExposure: true,
          maxDailyDriveMinutes: 240,
        },
      };
    }

    const staleFormData = {
      interests: ['hiking', 'photography'],
      budget: '1200',
      accommodation: 'hotel',
    };

    const follow = parseConstraints(
      { planningState: state, formData: staleFormData },
      'Make Day 2 more relaxed.'
    );

    expect(follow.interests).toEqual([]);
    expect(follow.accommodation).toMatch(/camp/i);
    expect(follow.avoidExposure).toBe(true);
    expect(follow.maxDailyDriveMinutes).toBe(240);
    expect(follow.budgetConstraint?.amount).toBe(700);
    expect(follow.tripScope?.type).toBe('road_trip');

    const assessment = assessBudget({
      budgetConstraint: follow.budgetConstraint,
      components: [
        createCostComponent({
          category: 'entrance_fee',
          amountMin: 80,
          status: 'verified',
          basis: 'evidence',
          appliesTo: 'trip',
        }),
      ],
      accommodation: 'camping',
      applicableCategories: ['entrance_fee', 'lodging', 'food'],
    });
    expect(assessment.verdict).toBe('cannot_verify');

    const completeness = evaluateItineraryCompleteness({
      itineraryData: plan([
        day(1, [
          {
            name: 'Easy Meadow Loop',
            type: 'trail',
            duration: 90,
            exposureLevel: 'low',
          },
          {
            name: 'Lakeside picnic',
            type: 'rest',
            duration: 45,
          },
        ]),
        day(2, [
          {
            name: 'Exposed Ridge Traverse',
            type: 'trail',
            duration: 120,
            exposureLevel: 'high',
            note: 'High exposure ridgeline.',
          },
          {
            name: 'Valley overlook',
            type: 'viewpoint',
            duration: 40,
            exposureLevel: 'low',
          },
        ]),
      ]),
      constraints: { ...follow, budgetAssessment: assessment },
      userPrompt: 'Make Day 2 more relaxed.',
    });

    expect(
      completeness.reasonCodes.some((c) =>
        c === 'exposure_constraint_violation' || c === 'exposure_prose_conflict'
      )
    ).toBe(true);

    const claimIssues = validateBudgetClaim(
      'The whole trip stays under $700.',
      assessment
    );
    expect(claimIssues.some((i) => i.reasonCode === 'budget_claim_unsupported')).toBe(true);

    // No hiking resurrection
    expect(follow.interests).not.toContain('hiking');
    expect(follow.interests).not.toContain('photography');
  });
});
