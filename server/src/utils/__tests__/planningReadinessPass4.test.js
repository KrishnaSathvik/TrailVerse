'use strict';

/**
 * Planning Readiness Pass #4 — budget realism offline matrix.
 * No providers / models / network.
 */

const {
  parseBudgetConstraint,
  deriveTripCeiling,
  createCostComponent,
  createFeeAlternatives,
  resolveComponentTripAmount,
  assessBudget,
  extractUserSuppliedCosts,
  validateBudgetClaim,
  validateBudgetConstraints,
} = require('../budgetContract');
const { parseConstraints, buildConstraintBlock, validateItineraryConstraints } = require('../constraintEngine');
const { buildTripState } = require('../tripStateBuilder');
const { planEvidenceRequirements } = require('../../services/evidencePlannerService');
const { applyMessageConstraintOverrides } = require('../messageConstraintOverrides');

describe('Planning Readiness Pass #4 — budget realism', () => {
  test('CASE A — under $600 total', () => {
    const c = parseBudgetConstraint('Trip under $600 total.');
    expect(c.kind).toBe('numeric');
    expect(c.amount).toBe(600);
    expect(c.scope).toBe('trip_total');
    expect(c.derivedTripCeiling).toBe(600);
  });

  test('CASE B — $300 per person × 2', () => {
    const c = deriveTripCeiling(
      parseBudgetConstraint('$300 per person'),
      { groupSize: 2 }
    );
    expect(c.scope).toBe('per_person_total');
    expect(c.derivedTripCeiling).toBe(600);
  });

  test('CASE C — $150/day × 4', () => {
    const c = deriveTripCeiling(
      parseBudgetConstraint('$150 per day'),
      { tripDays: 4 }
    );
    expect(c.scope).toBe('per_day_total');
    expect(c.derivedTripCeiling).toBe(600);
    expect(parseBudgetConstraint('$150/day', { tripDays: 4 }).derivedTripCeiling).toBe(600);
  });

  test('CASE D — $100 per person per day', () => {
    const c = deriveTripCeiling(
      parseBudgetConstraint('$100 per person per day'),
      { groupSize: 2, tripDays: 3 }
    );
    expect(c.scope).toBe('per_person_per_day');
    expect(c.derivedTripCeiling).toBe(600);
  });

  test('CASE E — missing party leaves ceiling unresolved', () => {
    const c = parseBudgetConstraint('$300 per person');
    expect(c.scope).toBe('per_person_total');
    expect(c.derivedTripCeiling).toBeNull();
    expect(c.derivationBasis).toMatch(/missing_group_size/);
    const assessment = assessBudget({ budgetConstraint: c, components: [] });
    expect(assessment.verdict).toBe('cannot_verify');
    expect(assessment.diagnostics.some((d) => d.code === 'budget_scope_unresolved')).toBe(true);
  });

  test('CASE F — known costs exceed budget', () => {
    const budgetConstraint = parseBudgetConstraint('under $600 total');
    const components = [
      createCostComponent({
        category: 'entrance_fee',
        amountMin: 100,
        status: 'verified',
        basis: 'evidence',
        appliesTo: 'trip',
      }),
      createCostComponent({
        category: 'campground',
        amountMin: 550,
        status: 'verified',
        basis: 'evidence',
        appliesTo: 'trip',
      }),
    ];
    const assessment = assessBudget({
      budgetConstraint,
      components,
      accommodation: 'camping',
      applicableCategories: ['entrance_fee', 'campground'],
    });
    expect(assessment.knownCostMin).toBe(650);
    expect(assessment.verdict).toBe('exceeds_budget');
    expect(validateBudgetConstraints(assessment).some((i) => i.reasonCode === 'budget_known_costs_exceed_limit')).toBe(true);
  });

  test('CASE G — known under but major unknown → cannot_verify', () => {
    const budgetConstraint = parseBudgetConstraint('under $600 total');
    const components = [
      createCostComponent({
        category: 'entrance_fee',
        amountMin: 100,
        status: 'verified',
        basis: 'evidence',
        appliesTo: 'trip',
      }),
      createCostComponent({ category: 'lodging', status: 'unknown', basis: 'unavailable' }),
      createCostComponent({ category: 'food', status: 'unknown', basis: 'unavailable' }),
      createCostComponent({ category: 'fuel', status: 'unknown', basis: 'unavailable' }),
    ];
    const assessment = assessBudget({
      budgetConstraint,
      components,
      accommodation: 'hotel',
      applicableCategories: ['entrance_fee', 'lodging', 'food', 'fuel'],
    });
    expect(assessment.verdict).toBe('cannot_verify');
    expect(assessment.verdict).not.toBe('within_budget');
    expect(assessment.unknownCategories.length).toBeGreaterThan(0);
  });

  test('CASE H — complete supported range within budget', () => {
    const budgetConstraint = parseBudgetConstraint('under $600 total');
    const components = [
      createCostComponent({
        category: 'entrance_fee',
        amountMin: 80,
        amountMax: 100,
        status: 'verified',
        basis: 'evidence',
        appliesTo: 'trip',
      }),
      createCostComponent({
        category: 'campground',
        amountMin: 400,
        amountMax: 450,
        status: 'verified',
        basis: 'evidence',
        appliesTo: 'trip',
      }),
    ];
    const assessment = assessBudget({
      budgetConstraint,
      components,
      accommodation: 'camping',
      applicableCategories: ['entrance_fee', 'campground'],
    });
    expect(assessment.coverage).toBe('complete');
    expect(assessment.knownCostMin).toBe(480);
    expect(assessment.knownCostMax).toBe(550);
    expect(assessment.verdict).toBe('within_budget');
  });

  test('CASE I — range crosses limit', () => {
    const budgetConstraint = parseBudgetConstraint('under $600 total');
    const components = [
      createCostComponent({
        category: 'entrance_fee',
        amountMin: 500,
        amountMax: 700,
        status: 'verified',
        basis: 'evidence',
        appliesTo: 'trip',
      }),
    ];
    const assessment = assessBudget({
      budgetConstraint,
      components,
      applicableCategories: ['entrance_fee'],
    });
    expect(assessment.verdict).toBe('likely_within_budget');
    expect(assessment.verdict).not.toBe('within_budget');
  });

  test('CASE J — per vehicle not × party', () => {
    const fee = createCostComponent({
      category: 'entrance_fee',
      amountMin: 35,
      status: 'verified',
      basis: 'evidence',
      appliesTo: 'vehicle',
      quantity: 1,
    });
    const resolved = resolveComponentTripAmount(fee, { groupSize: 4 });
    expect(resolved.min).toBe(35);
  });

  test('CASE K — per person × party', () => {
    const fee = createCostComponent({
      category: 'entrance_fee',
      amountMin: 20,
      status: 'verified',
      basis: 'evidence',
      appliesTo: 'person',
    });
    expect(resolveComponentTripAmount(fee, { groupSize: 4 }).min).toBe(80);
  });

  test('CASE L — camping nightly × nights', () => {
    const camp = createCostComponent({
      category: 'campground',
      amountMin: 30,
      status: 'verified',
      basis: 'evidence',
      appliesTo: 'night',
    });
    expect(resolveComponentTripAmount(camp, { nights: 3 }).min).toBe(90);
  });

  test('CASE M — hotel unknown no fabricated rate', () => {
    const assessment = assessBudget({
      budgetConstraint: parseBudgetConstraint('under $600 total'),
      components: [
        createCostComponent({ category: 'entrance_fee', amountMin: 50, status: 'verified', basis: 'evidence', appliesTo: 'trip' }),
      ],
      accommodation: 'hotel',
      applicableCategories: ['entrance_fee', 'lodging'],
    });
    expect(assessment.unknownCategories).toContain('lodging');
    expect(assessment.verdict).toBe('cannot_verify');
    expect(assessment.trustedComponents.every((c) => c.category !== 'lodging' || c.amountMin == null)).toBe(true);
  });

  test('CASE N — user-supplied hotel', () => {
    const comps = extractUserSuppliedCosts('Hotel is already booked for $450 total.');
    expect(comps).toHaveLength(1);
    expect(comps[0].category).toBe('lodging');
    expect(comps[0].amountMin).toBe(450);
    expect(comps[0].basis).toBe('user_supplied');
    expect(comps[0].status).toBe('verified');
  });

  test('CASE O — fuel unknown for road trip; no hours→dollars', () => {
    const assessment = assessBudget({
      budgetConstraint: parseBudgetConstraint('under $800 total'),
      components: [
        createCostComponent({ category: 'entrance_fee', amountMin: 70, status: 'verified', basis: 'evidence', appliesTo: 'trip' }),
      ],
      tripScope: { type: 'road_trip', transportMode: 'drive', routeLegs: [{}, {}] },
      accommodation: 'camping',
      applicableCategories: ['entrance_fee', 'campground', 'fuel'],
    });
    expect(assessment.unknownCategories).toContain('fuel');
    expect(assessment.verdict).not.toBe('within_budget');
  });

  test('CASE P — multi-park per-entity fees partial coverage', () => {
    const components = [
      createCostComponent({
        category: 'entrance_fee',
        amountMin: 35,
        status: 'verified',
        basis: 'evidence',
        entityId: 'nps:park:romo',
        appliesTo: 'vehicle',
      }),
      createCostComponent({
        category: 'entrance_fee',
        amountMin: 30,
        status: 'verified',
        basis: 'evidence',
        entityId: 'nps:park:blca',
        appliesTo: 'vehicle',
      }),
      createCostComponent({
        category: 'entrance_fee',
        status: 'unknown',
        basis: 'unavailable',
        entityId: 'nps:park:meve',
      }),
    ];
    const assessment = assessBudget({
      budgetConstraint: parseBudgetConstraint('under $600 total'),
      components,
      applicableCategories: ['entrance_fee'],
    });
    expect(assessment.knownCostMin).toBe(65);
    expect(assessment.coverage).toBe('partial');
    expect(assessment.unknownCategories).toContain('entrance_fee');
  });

  test('CASE Q — fee alternatives not summed', () => {
    const alt = createFeeAlternatives([
      { label: 'vehicle', amount: 35, appliesTo: 'vehicle' },
      { label: 'motorcycle', amount: 20, appliesTo: 'vehicle' },
      { label: 'individual', amount: 20, appliesTo: 'person' },
    ]);
    const assessment = assessBudget({
      budgetConstraint: parseBudgetConstraint('under $600 total'),
      components: [alt],
      applicableCategories: ['entrance_fee'],
    });
    expect(assessment.knownCostMin).toBeNull();
    expect(assessment.diagnostics.some((d) => d.code === 'budget_component_alternatives')).toBe(true);
    expect(resolveComponentTripAmount(alt, { groupSize: 4 }).reason).toBe('alternatives_not_summed');
  });

  test('CASE R — numeric override to per person', () => {
    const initial = parseConstraints(
      { formData: { budget: '1200', groupSize: 2 } },
      'Budget $1,200 total for the trip'
    );
    expect(initial.budgetConstraint.scope).toBe('trip_total');
    expect(initial.budgetConstraint.derivedTripCeiling).toBe(1200);

    const overrides = applyMessageConstraintOverrides(
      { budget: '1200', groupSize: 2, interests: ['hiking'], accommodation: 'camping' },
      'Actually make it $400 per person.'
    );
    expect(Number(overrides.budgetConstraint.amount)).toBe(400);
    expect(overrides.budgetConstraint.scope).toBe('per_person_total');

    const follow = parseConstraints(
      { formData: { groupSize: 2, interests: ['hiking'], accommodation: 'camping', fitnessLevel: 'moderate' } },
      'Actually make it $400 per person.'
    );
    expect(follow.budgetConstraint.scope).toBe('per_person_total');
    expect(follow.budgetConstraint.derivedTripCeiling).toBe(800);
    expect(follow.groupSize).toBe(2);
    expect(follow.interests).toContain('hiking');
    expect(follow.accommodation).toBe('camping');
  });

  test('CASE S — explicit budget clear only', () => {
    const cleared = parseConstraints(
      { formData: { budget: '600', groupSize: 2 } },
      "Forget the budget, we're flexible."
    );
    expect(cleared.budgetConstraint.cleared).toBe(true);
    expect(cleared.budget).toBeNull();

    const omitted = parseConstraints(
      { formData: { budget: '600', groupSize: 2 } },
      'Also add more hiking.'
    );
    // Message omit does not clear — formData budget still present as legacy
    expect(omitted.budget).toBe('600');
  });

  test('CASE T — tier only, no fake ceiling', () => {
    const c = parseBudgetConstraint('Keep it cheap.');
    expect(c.kind).toBe('tier');
    expect(c.qualitativeTier).toBe('budget');
    expect(c.derivedTripCeiling).toBeNull();
  });

  test('CASE U — claim safety when cannot_verify', () => {
    const assessment = assessBudget({
      budgetConstraint: parseBudgetConstraint('under $600 total'),
      components: [
        createCostComponent({ category: 'entrance_fee', amountMin: 100, status: 'verified', basis: 'evidence', appliesTo: 'trip' }),
      ],
      accommodation: 'hotel',
      applicableCategories: ['entrance_fee', 'lodging'],
    });
    expect(assessment.verdict).toBe('cannot_verify');
    const issues = validateBudgetClaim('Your entire trip comes in under $600.', assessment);
    expect(issues.some((i) => i.reasonCode === 'budget_claim_unsupported')).toBe(true);
  });

  test('CASE V — hard fail when known floor exceeds ceiling', () => {
    const assessment = assessBudget({
      budgetConstraint: parseBudgetConstraint('budget of $500'),
      components: [
        createCostComponent({
          category: 'entrance_fee',
          amountMin: 550,
          status: 'verified',
          basis: 'evidence',
          appliesTo: 'trip',
        }),
      ],
      applicableCategories: ['entrance_fee'],
    });
    expect(assessment.verdict).toBe('exceeds_budget');
    const issues = validateItineraryConstraints(
      { days: [{ stops: [{ name: 'Trail', duration: 60 }] }] },
      {
        hasConstraints: true,
        dates: {},
        interests: [],
        budgetConstraint: assessment.constraint,
        budgetAssessment: assessment,
      }
    );
    expect(issues.some((i) => i.reasonCode === 'budget_known_costs_exceed_limit')).toBe(true);
  });

  test('prompt block includes budget contract', () => {
    const c = parseConstraints({}, 'Plan a camping trip under $600 total for 3 days. Two of us.');
    const block = buildConstraintBlock(c);
    expect(block).toMatch(/BUDGET CONTRACT/);
    expect(block).toMatch(/Derived trip ceiling/);
    expect(block).toMatch(/verdict/);
  });

  test('Evidence Planner requests fees when numeric budget active', () => {
    const reqs = planEvidenceRequirements({
      turnId: 'pass4-fees',
      userPrompt: 'Plan a 3 day camping trip under $600',
      intent: {
        primaryIntent: 'full_trip',
        entities: [],
        verticals: ['itinerary'],
        depth: 'planning',
        freshness: 'planning',
        actionability: 'planning',
        scope: 'single_destination',
      },
      resolvedEntities: [{
        entityId: 'nps:park:zion',
        displayName: 'Zion',
        latitude: 37.3,
        longitude: -113,
      }],
      constraints: {
        budget: '600',
        budgetConstraint: parseBudgetConstraint('under $600 total'),
        accommodation: 'camping',
        interests: ['hiking'],
      },
    });
    expect(reqs.some((r) => r.topic === 'fees' && (r.reasonCodes || []).includes('budget_cost_evidence'))).toBe(true);
    expect(reqs.some((r) => r.topic === 'hotel_live')).toBe(false);
  });

  test('refinement preserves party/dates/interests/accommodation/tripScope', () => {
    const follow = parseConstraints(
      {
        formData: {
          groupSize: 4,
          budget: '1000',
          accommodation: 'camping',
          fitnessLevel: 'moderate',
          interests: ['hiking', 'wildlife'],
          numDays: 5,
        },
      },
      'Actually make the budget $700. Road trip from Denver through Rocky Mountain and Mesa Verde.'
    );
    expect(Number(follow.budgetConstraint.amount)).toBe(700);
    expect(follow.groupSize).toBe(4);
    expect(follow.accommodation).toBe('camping');
    expect(follow.fitnessLevel).toBe('moderate');
    expect(follow.interests).toEqual(expect.arrayContaining(['hiking', 'wildlife']));
    expect(follow.dates.numDays).toBe(5);
    expect(follow.tripScope.type).toBe('road_trip');

    const state = buildTripState({
      constraints: follow,
      allExtractedParks: follow.tripScope.destinations.map((d) => ({
        parkCode: d.parkCode,
        parkName: d.displayName,
        lat: d.latitude,
        lon: d.longitude,
      })),
      lastUserMessage: 'Actually make the budget $700.',
    });
    expect(state.preferences.budget).toBe('700');
    expect(state.preferences.budgetConstraint?.amount).toBe(700);
    expect(state.travelers.count).toBe(4);
    expect(state.tripScope?.type).toBe('road_trip');
  });

  test('user-supplied campsite cost via parseConstraints', () => {
    const c = parseConstraints(
      { formData: { budget: '600', accommodation: 'camping', groupSize: 2 } },
      'The campsite is already paid, $180 total.'
    );
    expect(c.costComponents.some((x) => x.category === 'campground' && x.amountMin === 180)).toBe(true);
  });

  test('bare $600 documents as trip_total', () => {
    const c = parseBudgetConstraint('Our budget is $600');
    expect(c.scope).toBe('trip_total');
    expect(c.derivedTripCeiling).toBe(600);
  });
});
