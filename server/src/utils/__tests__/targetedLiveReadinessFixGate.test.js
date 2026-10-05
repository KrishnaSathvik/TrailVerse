'use strict';

/**
 * Targeted live-readiness fix gate — offline only.
 * No providers / models / network.
 */

const {
  resolveDestinationsFromMessage,
  resolveOriginFromMessage,
  toPlannerEntities,
} = require('../genericDestinationResolver');
const {
  buildTripScopeFromMessage,
} = require('../roadTripContract');
const {
  setDynamicMapForTests,
  clearDynamicMapForTests,
  PARK_NAME_TO_CODE,
} = require('../parkExtractor');
const { matchKnownPlace } = require('../../services/geocodePlaceService');
const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');
const {
  userAvoidsTrailExposure,
  isAvoidExposureActive,
} = require('../planningInputContract');
const { extractMessageConstraintOverrides } = require('../messageConstraintOverrides');
const { parseConstraints } = require('../constraintEngine');
const {
  buildPlanningStateFromRuntime,
  resolvePlanningStateForWrite,
} = require('../planningState');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const {
  assessBudget,
  validateBudgetClaim,
  buildBudgetPromptBlock,
  parseBudgetConstraint,
} = require('../budgetContract');
const { planEvidenceRequirements } = require('../../services/evidencePlannerService');

function saveThenReload(initialMessage, followUpMessage = '', formData = {}) {
  const first = parseConstraints({ formData }, initialMessage);
  const persisted = buildPlanningStateFromRuntime({ constraints: first });
  const afterFollowUp = parseConstraints(
    { planningState: persisted, formData: {} },
    followUpMessage || ''
  );
  const saved = resolvePlanningStateForWrite({
    incomingPlanningState: afterFollowUp.planningState || buildPlanningStateFromRuntime({
      constraints: afterFollowUp,
    }),
    previousPlanningState: persisted,
    conversation: [
      { role: 'user', content: initialMessage },
      ...(followUpMessage ? [{ role: 'user', content: followUpMessage }] : []),
    ],
  });
  const reloaded = parseConstraints({ planningState: saved, formData: {} }, '');
  return { first, afterFollowUp, saved, reloaded };
}

afterEach(() => {
  clearDynamicMapForTests();
});

describe('FIX 1 — generic destination resolution', () => {
  test('A — NPS site outside static National Park set resolves via dynamic catalog', () => {
    setDynamicMapForTests([
      {
        key: 'dinosaur national monument',
        code: 'dino',
        lat: 40.4401,
        lon: -109.3046,
      },
      { key: 'dinosaur', code: 'dino', lat: 40.4401, lon: -109.3046 },
    ]);

    const dests = resolveDestinationsFromMessage('Visit Dinosaur National Monument.');
    expect(dests).toHaveLength(1);
    expect(dests[0].parkCode).toBe('dino');
    expect(dests[0].entityId).toBe('nps:park:dino');
    expect(dests[0].latitude).toBeCloseTo(40.4401);
    expect(dests[0].longitude).toBeCloseTo(-109.3046);
    expect(dests[0].status).toBe('resolved');
  });

  test('B — non-NPS known-place resolves as known-place entity', () => {
    expect(matchKnownPlace('Camp near Flaming Gorge')).toBeTruthy();
    const dests = resolveDestinationsFromMessage('Stop at Flaming Gorge on the way.');
    expect(dests.some((d) => /flaming gorge/i.test(d.displayName))).toBe(true);
    const fg = dests.find((d) => /flaming gorge/i.test(d.displayName));
    expect(fg.entityType).toBe('known_place');
    expect(fg.entityId).toMatch(/^place:known:/);
    expect(fg.status).toBe('resolved');
    expect(fg.latitude).not.toBeNull();
  });

  test('C — unknown destination preserved as explicit unresolved', () => {
    const dests = resolveDestinationsFromMessage(
      'Road trip from Denver through Rocky Mountain and Zzyzx Unicorn Mesa.'
    );
    const unresolved = dests.find((d) => d.status === 'unresolved');
    expect(unresolved).toBeTruthy();
    expect(unresolved.displayName.toLowerCase()).toMatch(/zzyzx unicorn mesa/);
    expect(unresolved.entityType).toBe('unresolved_destination');
    expect(unresolved.entityId).toMatch(/^unresolved:/);
  });

  test('D — mixed route Origin → NPS park → NPS site → non-NPS place', () => {
    setDynamicMapForTests([
      {
        key: 'dinosaur national monument',
        code: 'dino',
        lat: 40.4401,
        lon: -109.3046,
      },
      { key: 'dinosaur', code: 'dino', lat: 40.4401, lon: -109.3046 },
    ]);

    const msg =
      'Road trip from Denver through Rocky Mountain National Park, Dinosaur National Monument and Flaming Gorge.';
    const scope = buildTripScopeFromMessage(msg);
    expect(scope.type).toBe('road_trip');
    expect(scope.origin?.displayName?.toLowerCase()).toContain('denver');
    expect(scope.destinations).toHaveLength(3);
    expect(scope.destinations[0].parkCode).toBe('romo');
    expect(scope.destinations[1].parkCode).toBe('dino');
    expect(scope.destinations[2].entityType).toBe('known_place');
    expect(scope.destinations[2].displayName.toLowerCase()).toMatch(/flaming gorge/);
  });

  test('E — resolved A, unresolved B, resolved C keeps middle slot', () => {
    setDynamicMapForTests([
      { key: 'site beta reserve', code: 'sbrx', lat: 41.1, lon: -108.2 },
    ]);
    const msg =
      'Road trip from Denver through Rocky Mountain, Zzyzx Unicorn Mesa and Flaming Gorge.';
    const scope = buildTripScopeFromMessage(msg);
    expect(scope.destinations).toHaveLength(3);
    expect(scope.destinations[0].parkCode).toBe('romo');
    expect(scope.destinations[1].status).toBe('unresolved');
    expect(scope.destinations[1].displayName.toLowerCase()).toMatch(/zzyzx/);
    expect(scope.destinations[2].entityType).toBe('known_place');
    // Not silently collapsed to [A, C]
    expect(scope.destinations.map((d) => d.status)).toEqual([
      'resolved',
      'unresolved',
      'resolved',
    ]);
  });

  test('F — no destination-specific production branches in resolver source', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../genericDestinationResolver.js'),
      'utf8'
    );
    expect(src).not.toMatch(/Dinosaur National Monument/i);
    expect(src).not.toMatch(/Flaming Gorge/i);
    expect(src).not.toMatch(/includes\(['"]dino/i);
  });
});

describe('FIX 2 — planning vs permit intent', () => {
  test('A — weekend camping + interests → itinerary planning', () => {
    const r = classifyTrailieIntent({
      userPrompt:
        'Six friends want a weekend in Great Smoky Mountains National Park. We want camping, hiking, and wildlife.',
    });
    expect(['simple_itinerary', 'full_trip']).toContain(r.primaryIntent);
  });

  test('B — 3 days family hotel → itinerary', () => {
    const r = classifyTrailieIntent({
      userPrompt: '3 days in Acadia with my family. Hotel and easy hikes.',
    });
    expect(['simple_itinerary', 'full_trip']).toContain(r.primaryIntent);
  });

  test('C — do I need a permit to camp → permit_camping', () => {
    const r = classifyTrailieIntent({
      userPrompt: 'Do I need a permit to camp in Yosemite?',
    });
    expect(r.primaryIntent).toBe('permit_camping');
  });

  test('D — how do campground reservations work → permit intent', () => {
    const r = classifyTrailieIntent({
      userPrompt: 'How do campground reservations work in Yosemite?',
    });
    expect(r.primaryIntent).toBe('permit_camping');
  });

  test('E — camp during 4-day trip → planning with camping preference', () => {
    const r = classifyTrailieIntent({
      userPrompt: 'We want to camp during our 4-day trip to Zion.',
    });
    expect(['simple_itinerary', 'full_trip']).toContain(r.primaryIntent);
    const c = parseConstraints({}, 'We want to camp during our 4-day trip to Zion.');
    expect(c.accommodation).toMatch(/camp/i);
  });

  test('F — overnight without reservation → permit/camping informational', () => {
    const r = classifyTrailieIntent({
      userPrompt: 'Can I camp overnight at Yosemite without a reservation?',
    });
    expect(r.primaryIntent).toBe('permit_camping');
  });
});

describe('FIX 3 — exposure phrase expansion', () => {
  test('A — I do not want exposed trails', () => {
    expect(userAvoidsTrailExposure('I do not want exposed trails.')).toBe(true);
  });

  test("B — I don't want exposed trails", () => {
    expect(userAvoidsTrailExposure("I don't want exposed trails.")).toBe(true);
  });

  test("C — I'm not comfortable with exposed sections", () => {
    expect(userAvoidsTrailExposure("I'm not comfortable with exposed sections.")).toBe(true);
  });

  test('D — silent follow-up keeps persisted avoidExposure', () => {
    expect(isAvoidExposureActive({ avoidExposure: true }, '')).toBe(true);
  });

  test('E — unknown activity exposure under true remains fail-closed', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: {
        days: [
          {
            dayNumber: 1,
            stops: [
              {
                name: 'Mystery Ridge',
                type: 'trail',
                difficulty: 'moderate',
                exposureLevel: 'unknown',
                duration: 90,
              },
            ],
          },
        ],
      },
      userPrompt: 'I do not want exposed trails.',
      constraints: { avoidExposure: true },
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('constraint_eligibility_unknown');
  });

  test('F — social media phrase stays false', () => {
    expect(userAvoidsTrailExposure("I don't want exposure to social media.")).toBe(false);
  });

  test('G — existing no/avoid/without still true', () => {
    expect(userAvoidsTrailExposure('no exposed trails')).toBe(true);
    expect(userAvoidsTrailExposure('avoid exposed trails')).toBe(true);
    expect(userAvoidsTrailExposure('without exposed sections')).toBe(true);
  });
});

describe('FIX 4 — accommodation replacement', () => {
  test('A — switch from camping to a cabin', () => {
    const overrides = extractMessageConstraintOverrides('switch from camping to a cabin');
    expect(overrides.accommodation).toMatch(/cabin|lodging/i);
    const c = parseConstraints(
      { formData: { accommodation: 'camping' } },
      'switch from camping to a cabin'
    );
    expect(c.accommodation).toMatch(/cabin|lodging/i);
  });

  test('B — switch from camping to a hotel → lodging', () => {
    const c = parseConstraints(
      { formData: { accommodation: 'camping' } },
      'switch from camping to a hotel'
    );
    expect(c.accommodation).toBe('lodging');
  });

  test('C — camp instead from hotel → camping', () => {
    const c = parseConstraints(
      { formData: { accommodation: 'hotel' } },
      "let's camp instead"
    );
    expect(c.accommodation).toMatch(/camp/i);
  });

  test('D — actually hotel instead from cabin → lodging', () => {
    const c = parseConstraints(
      { formData: { accommodation: 'cabin' } },
      'actually stay in a hotel instead'
    );
    expect(c.accommodation).toBe('lodging');
  });

  test('E — camping near a cabin without correction does not force cabin override', () => {
    const overrides = extractMessageConstraintOverrides('We want camping near a cabin village trailhead.');
    // No correction cue → should not invent cabin override over camping preference
    expect(overrides.accommodation == null || overrides.accommodation === 'camping').toBe(true);
  });

  test('F — save/reload retains cabin replacement', () => {
    const { afterFollowUp, saved, reloaded } = saveThenReload(
      'We will camp.',
      'switch from camping to a cabin',
      { accommodation: 'camping' }
    );
    expect(afterFollowUp.accommodation).toMatch(/cabin|lodging/i);
    expect(saved.lodging?.type).toMatch(/cabin|lodging|hotel/i);
    expect(String(saved.lodging?.type)).not.toMatch(/^camping$/i);
    expect(reloaded.accommodation).toMatch(/cabin|lodging/i);
  });
});

describe('FIX 5 — budget honesty (non-destabilizing)', () => {
  test('cannot_verify still blocks unsupported whole-trip guarantee', () => {
    const constraint = parseBudgetConstraint('Keep the whole trip under $500.', {
      groupSize: 2,
      tripDays: 3,
    });
    const assessment = assessBudget({
      budgetConstraint: constraint,
      costComponents: [
        {
          category: 'entrance_fee',
          label: 'Park fee',
          amountMin: 30,
          amountMax: 30,
          status: 'verified',
          basis: 'evidence',
          appliesTo: 'trip',
        },
      ],
      tripScope: { type: 'single_destination' },
      constraints: { accommodation: 'camping', groupSize: 2 },
    });
    expect(assessment.verdict).toBe('cannot_verify');
    const issues = validateBudgetClaim(
      'The whole trip comes in under $500.',
      assessment
    );
    expect(issues.some((i) => i.type === 'budget_claim_unsupported')).toBe(true);
  });

  test('cannot_verify prompt requires useful qualification', () => {
    const constraint = parseBudgetConstraint('Keep it under $500.', {
      groupSize: 2,
      tripDays: 3,
    });
    const assessment = assessBudget({
      budgetConstraint: constraint,
      costComponents: [],
      tripScope: { type: 'single_destination' },
      constraints: { accommodation: 'camping', groupSize: 2 },
    });
    const block = buildBudgetPromptBlock(assessment);
    expect(block).toMatch(/cannot_verify|not yet verified|cannot confirm|cannot verify/i);
    expect(block).toMatch(/unknown|unpriced|not.*priced|major/i);
  });
});

describe('COMBINED offline road-trip static', () => {
  test('friends road trip arms constraints and keeps all destinations', () => {
    setDynamicMapForTests([
      {
        key: 'destination b national monument',
        code: 'dbnm',
        lat: 40.4,
        lon: -109.3,
      },
    ]);

    const msg =
      "Six friends want a 6-day road trip starting in Denver through Rocky Mountain National Park, Destination B National Monument and Mono Lake. We'll camp, want hiking and scenery, don't want exposed trails, and don't want more than 4 hours driving per day.";

    const intent = classifyTrailieIntent({ userPrompt: msg });
    expect(['simple_itinerary', 'full_trip']).toContain(intent.primaryIntent);

    const constraints = parseConstraints({}, msg);
    expect(constraints.travelParty).toBe('friends');
    expect(constraints.groupSize).toBe(6);
    expect(constraints.accommodation).toMatch(/camp/i);
    expect(constraints.interests).toEqual(expect.arrayContaining(['hiking']));
    expect(constraints.avoidExposure).toBe(true);
    expect(constraints.tripScope?.maxDailyDriveMinutes || constraints.maxDailyDriveMinutes).toBe(240);

    const scope = buildTripScopeFromMessage(msg);
    expect(scope.type).toBe('road_trip');
    expect(scope.origin?.displayName?.toLowerCase()).toContain('denver');
    expect(scope.destinations).toHaveLength(3);
    expect(scope.destinations[0].parkCode).toBe('romo');
    expect(scope.destinations[1].parkCode).toBe('dbnm');
    expect(scope.destinations[2].entityType).toBe('known_place');

    const entities = toPlannerEntities(scope.destinations, { includeUnresolvedCoords: true });
    const reqs = planEvidenceRequirements({
      turnId: 'combined-road',
      userPrompt: msg,
      intent: {
        primaryIntent: 'full_trip',
        entities: [],
        verticals: ['itinerary'],
        depth: 'planning',
        freshness: 'planning',
        actionability: 'planning',
        scope: 'multi_destination',
      },
      resolvedEntities: entities,
      tripScope: scope,
      constraints,
    });
    const driving = (reqs.requirements || reqs || []).filter(
      (r) => r.topic === 'driving_time' || r.queryType === 'driving_time'
    );
    // Adjacent legs only — not a full pairwise mesh
    expect(driving.length).toBeGreaterThanOrEqual(1);
  });
});

describe('REFINEMENT integration', () => {
  test('budget + interest remove + cabin switch survives save/reload', () => {
    const seedMsg =
      'Plan Joshua Tree camping under $500 with hiking and photography.';
    const refine =
      'Actually keep it under $400, remove hiking, and switch from camping to a cabin.';
    const { afterFollowUp, reloaded } = saveThenReload(seedMsg, refine, {
      budget: '500',
      interests: ['hiking', 'photography'],
      accommodation: 'camping',
    });

    expect(String(afterFollowUp.budget)).toBe('400');
    expect(afterFollowUp.interests).toEqual(['photography']);
    expect(afterFollowUp.accommodation).toMatch(/cabin|lodging/i);

    expect(String(reloaded.budget)).toBe('400');
    expect(reloaded.interests).toEqual(['photography']);
    expect(reloaded.accommodation).toMatch(/cabin|lodging/i);
    expect(reloaded.interests).not.toContain('hiking');
    expect(String(reloaded.accommodation)).not.toMatch(/^camping$/i);
  });
});

describe('sanity — static NP map still works without dynamic map', () => {
  test('romo resolves from hardcoded map', () => {
    expect(PARK_NAME_TO_CODE.has('rocky mountain')).toBe(true);
    const dests = resolveDestinationsFromMessage('Visit Rocky Mountain National Park');
    expect(dests[0].parkCode).toBe('romo');
  });
});
