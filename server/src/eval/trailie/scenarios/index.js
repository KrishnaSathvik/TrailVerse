'use strict';

/**
 * Stage 13 — synthetic evaluation scenario inventory (Part B/C).
 *
 * Every scenario is synthetic and reproducible. Fields:
 *   scenarioId, scenarioVersion, category, userPrompt
 *   userRequestedItinerary / openEndedDiscovery  (drives the structured gate)
 *   structuredConstraints, resolvedMetadata, canonicalFacts, allExtractedParks
 *   structuredResponses  — per-attempt Phase A behavior queue (synthetic provider)
 *   proseResponses       — per-call Phase B prose queue (synthetic provider)
 *   expected             — assertions + ground-truth labels
 *
 * See docs/TRAILIE-STAGE13-EVALUATION.md for the fixture contract.
 */

const {
  SCENARIO_VERSION, stop, day, itinerary, goodProse, proseFromSpec, specFor,
} = require('./builders');

// ── Reusable itineraries ────────────────────────────────────────────────────

const ONE_DAY = itinerary([
  day('day-1', 1, 'Day 1 — Zion Highlights', [
    stop('stop-1', 0, 'Riverside Walk', { difficulty: 'easy', duration: 90, parkName: 'Zion National Park', parkCode: 'zion', latitude: 37.28, longitude: -112.95 }),
    stop('stop-2', 1, 'Emerald Pools', { difficulty: 'moderate', duration: 150, parkName: 'Zion National Park', parkCode: 'zion', latitude: 37.25, longitude: -112.96 }),
    stop('stop-3', 2, 'Canyon Overlook', { type: 'landmark', difficulty: 'easy', duration: 60, parkName: 'Zion National Park', parkCode: 'zion', latitude: 37.21, longitude: -112.94 }),
  ]),
]);

const THREE_DAY = itinerary([
  day('day-1', 1, 'Day 1', [
    stop('s1', 0, 'Bright Angel Trail', { difficulty: 'moderate', duration: 240, parkName: 'Grand Canyon National Park', parkCode: 'grca' }),
    stop('s2', 1, 'Mather Point', { type: 'landmark', difficulty: 'easy', duration: 45, parkName: 'Grand Canyon National Park', parkCode: 'grca' }),
  ]),
  day('day-2', 2, 'Day 2', [
    stop('s3', 0, 'Rim Trail', { difficulty: 'easy', duration: 120, parkName: 'Grand Canyon National Park', parkCode: 'grca' }),
    stop('s4', 1, 'Yavapai Museum', { type: 'visitor_center', difficulty: 'easy', duration: 60, parkName: 'Grand Canyon National Park', parkCode: 'grca' }),
  ]),
  day('day-3', 3, 'Day 3', [
    stop('s5', 0, 'Desert View Drive', { type: 'landmark', difficulty: 'easy', duration: 180, parkName: 'Grand Canyon National Park', parkCode: 'grca' }),
  ]),
]);

const SEVEN_DAY = itinerary(
  Array.from({ length: 7 }, (_, i) =>
    day(`d${i + 1}`, i + 1, `Day ${i + 1}`, [
      stop(`d${i + 1}s1`, 0, `Trail ${i + 1}A`, { difficulty: 'moderate', duration: 150, parkName: 'Yellowstone National Park', parkCode: 'yell' }),
      stop(`d${i + 1}s2`, 1, `Landmark ${i + 1}B`, { type: 'landmark', difficulty: 'easy', duration: 60, parkName: 'Yellowstone National Park', parkCode: 'yell' }),
    ])
  )
);

const MULTI_PARK = itinerary([
  day('mp1', 1, 'Day 1 — Zion', [
    stop('mp1s1', 0, 'The Narrows', { difficulty: 'moderate', duration: 240, parkName: 'Zion National Park', parkCode: 'zion' }),
  ], { overnightLocation: 'Springdale, UT' }),
  day('mp2', 2, 'Day 2 — Bryce Canyon', [
    stop('mp2s1', 0, 'Navajo Loop', { difficulty: 'moderate', duration: 180, parkName: 'Bryce Canyon National Park', parkCode: 'brca', drivingTimeFromPreviousMin: 110 }),
  ], { overnightLocation: 'Bryce, UT' }),
]);

// Removal base: a strenuous stop with NO alternatives is removed under beginner
// fitness (the corrector downgrades only when it is the sole stop).
const REMOVAL_BASE = itinerary([
  day('day-1', 1, 'Day 1 — Zion', [
    stop('stop-rw', 0, 'Riverside Walk', { difficulty: 'easy', duration: 90, parkName: 'Zion National Park', parkCode: 'zion' }),
    stop('stop-al', 1, 'Angels Landing', { difficulty: 'strenuous', duration: 240, parkName: 'Zion National Park', parkCode: 'zion' }),
  ]),
]);
const REMOVAL_CONSTRAINTS = { hasConstraints: true, fitnessLevel: 'beginner', interests: [] };
// Frozen prose spec after Angels Landing is removed.
const REMOVAL_REMAINING_SPEC = [{ dayId: 'day-1', label: 'Day 1 — Zion', stops: [{ stopId: 'stop-rw', text: 'Head to Riverside Walk, an easy stroll.' }] }];

// Prose-consistency base (no constraints → frozen == payload).
const CONSISTENCY_BASE = itinerary([
  day('day-1', 1, 'Day 1', [
    stop('stop-1', 0, 'Rim Trail', { difficulty: 'easy', duration: 120, parkName: 'Zion National Park' }),
    stop('stop-2', 1, 'Overlook Point', { type: 'landmark', difficulty: 'easy', duration: 45, parkName: 'Zion National Park' }),
  ]),
  day('day-2', 2, 'Day 2', [
    stop('stop-3', 0, 'Canyon Trail', { difficulty: 'moderate', duration: 180, parkName: 'Zion National Park' }),
  ]),
]);

const complete = (itin) => [{ kind: 'complete', itinerary: itin }];

// ── Category: Basic itinerary quality (1–6) ─────────────────────────────────

const basic = [
  {
    scenarioId: 'basic-01-one-day', category: 'basic_itinerary',
    userPrompt: 'Plan a one-day trip to Zion.', userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Zion National Park', parkCode: 'zion' },
    structuredResponses: complete(ONE_DAY), proseResponses: [{ content: goodProse(ONE_DAY) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', minimumDays: 1, maximumDays: 1, expectedConsistencyOutcome: 'passed', consistency: { shouldPass: true, expectedIssueCodes: [] } },
  },
  {
    scenarioId: 'basic-02-three-day', category: 'basic_itinerary',
    userPrompt: 'Plan a 3-day trip to the Grand Canyon.', userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Grand Canyon National Park', parkCode: 'grca' },
    structuredResponses: complete(THREE_DAY), proseResponses: [{ content: goodProse(THREE_DAY) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', minimumDays: 3, maximumDays: 3, expectedConsistencyOutcome: 'passed', consistency: { shouldPass: true, expectedIssueCodes: [] } },
  },
  {
    scenarioId: 'basic-03-seven-day', category: 'basic_itinerary',
    userPrompt: 'Plan a week in Yellowstone.', userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Yellowstone National Park', parkCode: 'yell' },
    structuredResponses: complete(SEVEN_DAY), proseResponses: [{ content: goodProse(SEVEN_DAY) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', minimumDays: 7, maximumDays: 7, expectedConsistencyOutcome: 'passed', consistency: { shouldPass: true, expectedIssueCodes: [] } },
  },
  {
    scenarioId: 'basic-04-multi-park', category: 'basic_itinerary',
    userPrompt: 'A road trip covering Zion and Bryce Canyon.', userRequestedItinerary: true,
    resolvedMetadata: { parkNames: ['Zion National Park', 'Bryce Canyon National Park'] },
    structuredResponses: complete(MULTI_PARK), proseResponses: [{ content: goodProse(MULTI_PARK) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', requiredParkCodes: ['zion', 'brca'], expectedConsistencyOutcome: 'passed', consistency: { shouldPass: true, expectedIssueCodes: [] } },
  },
  {
    scenarioId: 'basic-05-multi-park-incomplete-weather', category: 'basic_itinerary',
    userPrompt: 'Zion and Bryce road trip next month.', userRequestedItinerary: true,
    resolvedMetadata: { parkNames: ['Zion National Park', 'Bryce Canyon National Park'], weatherCoverage: { zion: true, brca: false } },
    canonicalFacts: { weather: [{ parkCode: 'zion', forecast: 'clear' }] },
    structuredResponses: complete(MULTI_PARK), proseResponses: [{ content: goodProse(MULTI_PARK) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', expectedConsistencyOutcome: 'passed', consistency: { shouldPass: true, expectedIssueCodes: [] } },
  },
  {
    scenarioId: 'basic-06-overnight-transitions', category: 'basic_itinerary',
    userPrompt: 'Multi-day trip with overnight stays between parks.', userRequestedItinerary: true,
    resolvedMetadata: { parkNames: ['Zion National Park', 'Bryce Canyon National Park'] },
    structuredResponses: complete(MULTI_PARK),
    proseResponses: [{ content: goodProse(MULTI_PARK, { intro: 'This trip crosses two parks with an overnight in between.' }) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', expectedConsistencyOutcome: 'passed', consistency: { shouldPass: true, expectedIssueCodes: [] } },
  },
];

// ── Category: Constraint correction (7–12) ──────────────────────────────────

const constraintCorrection = [
  {
    scenarioId: 'correction-07-family-easy', category: 'constraint_correction',
    userPrompt: 'Family trip to Zion, keep it easy for the kids.', userRequestedItinerary: true,
    structuredConstraints: { hasConstraints: true, fitnessLevel: 'beginner', hasChildren: true, interests: [] },
    resolvedMetadata: { parkName: 'Zion National Park', parkCode: 'zion' },
    structuredResponses: complete(ONE_DAY),
    // ONE_DAY has a 'moderate' stop (Emerald Pools, stop-2); beginner max is
    // 'easy' → the corrector removes it, leaving stop-1 + stop-3. Prose matches
    // the post-correction (frozen) plan.
    proseResponses: [{ content: proseFromSpec([{ dayId: 'day-1', label: 'Day 1 — Zion Highlights', stops: [
      { stopId: 'stop-1', text: 'Head to Riverside Walk, an easy stroll.' },
      { stopId: 'stop-3', text: 'Finish at Canyon Overlook for sunset.' },
    ] }]) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', expectedCorrections: true, consistency: { shouldPass: true, expectedIssueCodes: [] } },
  },
  {
    scenarioId: 'correction-08-exceeds-difficulty', category: 'constraint_correction',
    userPrompt: 'I am a beginner — plan Zion but I heard Angels Landing is intense.', userRequestedItinerary: true,
    structuredConstraints: REMOVAL_CONSTRAINTS,
    resolvedMetadata: { parkName: 'Zion National Park', parkCode: 'zion' },
    structuredResponses: complete(REMOVAL_BASE),
    proseResponses: [{ content: proseFromSpec(REMOVAL_REMAINING_SPEC) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', expectedCorrections: true, expectedRemovedStop: 'Angels Landing', consistency: { shouldPass: true, expectedIssueCodes: [] } },
  },
  {
    scenarioId: 'correction-09-too-many-days', category: 'constraint_correction',
    userPrompt: 'I only have 1 day for the Grand Canyon.', userRequestedItinerary: true,
    structuredConstraints: { hasConstraints: true, dates: { numDays: 1 }, interests: [] },
    resolvedMetadata: { parkName: 'Grand Canyon National Park', parkCode: 'grca' },
    // Provider returns a 3-day plan; day-count correction trims to 1.
    structuredResponses: complete(THREE_DAY),
    proseResponses: [{ content: proseFromSpec([{ dayId: 'day-1', label: 'Day 1', stops: [{ stopId: 's1', text: 'Bright Angel Trail.' }, { stopId: 's2', text: 'Mather Point.' }] }]) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', expectedCorrections: true, maximumDays: 1 },
  },
  {
    scenarioId: 'correction-10-unrealistic-drive', category: 'constraint_correction',
    userPrompt: 'Zion to Bryce in one afternoon, plus a big hike.', userRequestedItinerary: true,
    resolvedMetadata: { parkNames: ['Zion National Park', 'Bryce Canyon National Park'] },
    structuredResponses: complete(itinerary([
      day('day-1', 1, 'Day 1', [
        stop('ls1', 0, 'The Narrows', { difficulty: 'moderate', duration: 300, parkName: 'Zion National Park' }),
        stop('ls2', 1, 'Navajo Loop', { difficulty: 'moderate', duration: 240, parkName: 'Bryce Canyon National Park', drivingTimeFromPreviousMin: 900 }),
      ]),
    ])),
    proseResponses: [{ content: proseFromSpec([{ dayId: 'day-1', label: 'Day 1', stops: [{ stopId: 'ls1', text: 'The Narrows.' }, { stopId: 'ls2', text: 'Then Navajo Loop.' }] }]) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', expectedFeasibilityIssue: true },
  },
  {
    scenarioId: 'correction-11-removed-not-reappear', category: 'constraint_correction',
    userPrompt: 'Beginner Zion trip; do not include anything too hard.', userRequestedItinerary: true,
    structuredConstraints: REMOVAL_CONSTRAINTS,
    resolvedMetadata: { parkName: 'Zion National Park', parkCode: 'zion' },
    structuredResponses: complete(REMOVAL_BASE),
    proseResponses: [{ content: proseFromSpec(REMOVAL_REMAINING_SPEC) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', expectedRemovedStop: 'Angels Landing', consistency: { shouldPass: true, expectedIssueCodes: [], forbiddenIssueCodes: ['removed_stop_mention'] } },
  },
  {
    scenarioId: 'correction-12-stop-moved-day', category: 'constraint_correction',
    userPrompt: 'Rebalance my two-day Zion plan.', userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Zion National Park', parkCode: 'zion' },
    structuredResponses: complete(CONSISTENCY_BASE),
    // Prose places stop-3 (a Day-2 stop) under Day 1 → wrong_day_assignment.
    proseResponses: [{ content: proseFromSpec([
      { dayId: 'day-1', label: 'Day 1', stops: [{ stopId: 'stop-1', text: 'Rim Trail.' }, { stopId: 'stop-2', text: 'Overlook Point.' }, { stopId: 'stop-3', text: 'Canyon Trail.' }] },
      { dayId: 'day-2', label: 'Day 2', stops: [] },
    ]) }],
    expected: { requiresStructuredItinerary: true, expectedConsistencyOutcome: 'failed', consistency: { shouldPass: false, expectedIssueCodes: ['wrong_day_assignment'] } },
  },
];

// ── Category: Canonical evidence (13–18) ────────────────────────────────────

const canonicalEvidence = [13, 14, 15, 16, 17, 18].map((n) => {
  const facts = {
    13: { closures: [{ parkCode: 'zion', text: 'Angels Landing permit road closed', status: 'active_closure' }] },
    14: { permits: [{ parkCode: 'zion', text: 'Angels Landing requires a permit', authority: 'authoritative' }] },
    15: { permits: [{ parkCode: 'zion', text: 'Permit status uncertain', authority: 'listing' }] },
    16: { weather: [{ parkCode: 'zion', forecast: 'sunny', date: '2026-08-15' }] },
    17: { weather: [{ parkCode: 'brca', forecast: null, unavailable: true }] },
    18: { astronomy: [{ parkCode: 'zion', text: 'Fee-free day 2026-08-04' }] },
  }[n];
  return {
    scenarioId: `evidence-${n}`, category: 'canonical_evidence',
    userPrompt: 'Plan Zion with current conditions.', userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Zion National Park', parkCode: 'zion' },
    canonicalFacts: facts,
    canonicalFactStatus: { fetched: true },
    structuredResponses: complete(ONE_DAY), proseResponses: [{ content: goodProse(ONE_DAY) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', carriesCanonicalFacts: true, consistency: { shouldPass: true, expectedIssueCodes: [] } },
  };
});

// ── Category: Structured-generation failures (19–24) ────────────────────────

const structuredFailures = [
  {
    scenarioId: 'structured-19-missing-tool', category: 'structured_failure',
    userPrompt: 'Plan Zion.', userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Zion National Park' },
    structuredResponses: [{ kind: 'missing_tool' }, { kind: 'missing_tool' }],
    proseResponses: [{ content: 'Here is a helpful overview of Zion without a structured plan.' }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'prose_only', expectedStructuredStatus: 'missing_tool', userUsableFallback: true },
  },
  {
    scenarioId: 'structured-20-malformed', category: 'structured_failure',
    userPrompt: 'Plan Zion.', userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Zion National Park' },
    structuredResponses: [{ kind: 'malformed', input: { notDays: true } }],
    proseResponses: [{ content: 'A prose overview of Zion.' }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'prose_only', expectedStructuredStatus: 'malformed_tool', userUsableFallback: true },
  },
  {
    scenarioId: 'structured-21-truncated-then-recover', category: 'structured_failure',
    userPrompt: 'Plan Zion.', userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Zion National Park' },
    structuredResponses: [{ kind: 'truncated' }, { kind: 'complete', itinerary: ONE_DAY }],
    proseResponses: [{ content: goodProse(ONE_DAY) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', expectedStructuredRecovery: true },
  },
  {
    scenarioId: 'structured-22-conflicting-duplicate', category: 'structured_failure',
    userPrompt: 'Plan Zion.', userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Zion National Park' },
    structuredResponses: [{ kind: 'conflicting', a: ONE_DAY, b: THREE_DAY }],
    proseResponses: [{ content: 'A prose overview of Zion.' }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'prose_only', expectedStructuredStatus: 'malformed_tool' },
  },
  {
    scenarioId: 'structured-23-prose-provider-failure', category: 'structured_failure',
    userPrompt: 'Plan Zion.', userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Zion National Park' },
    structuredResponses: complete(ONE_DAY),
    proseResponses: [{ aborted: true }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', expectedAborted: true },
  },
  {
    scenarioId: 'structured-24-timeout-then-retry', category: 'structured_failure',
    userPrompt: 'Plan Zion.', userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Zion National Park' },
    structuredResponses: [{ kind: 'timeout' }, { kind: 'complete', itinerary: ONE_DAY }],
    proseResponses: [{ content: goodProse(ONE_DAY) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', expectedStructuredRecovery: true },
  },
];

// ── Category: Prose consistency (25–36) ─────────────────────────────────────

const base = CONSISTENCY_BASE;
const S = specFor(base);
// helper: clone the base spec and mutate
const cloneSpec = () => JSON.parse(JSON.stringify(S));

function consistencyScenario(id, name, { specMutate, extraProse = '', shouldPass, expectedIssueCodes = [], forbiddenIssueCodes = [], diagnosticUncovered = false }) {
  const spec = cloneSpec();
  if (specMutate) specMutate(spec);
  let content = proseFromSpec(spec);
  if (extraProse) content += `\n${extraProse}`;
  return {
    scenarioId: id, category: 'prose_consistency', name,
    userPrompt: 'Plan a two-day Zion trip.', userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Zion National Park' },
    structuredResponses: complete(base),
    proseResponses: [{ content }],
    expected: {
      requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready',
      expectedConsistencyOutcome: shouldPass ? 'passed' : 'failed',
      consistency: { shouldPass, expectedIssueCodes, forbiddenIssueCodes, diagnosticUncovered },
    },
  };
}

const proseConsistency = [
  consistencyScenario('prose-25-accurate', 'accurate concise prose', { shouldPass: true, expectedIssueCodes: [] }),
  consistencyScenario('prose-26-missing-stop', 'missing critical stop', {
    specMutate: (spec) => { spec[0].stops = spec[0].stops.filter((s) => s.stopId !== 'stop-2'); },
    shouldPass: false, expectedIssueCodes: ['missing_stop'],
  }),
  consistencyScenario('prose-27-added-unsupported-stop', 'added unsupported stop', {
    extraProse: 'Also visit Bryce Canyon on the way back.',
    shouldPass: false, expectedIssueCodes: ['unsupported_plan_action'],
  }),
  consistencyScenario('prose-28-wrong-day', 'wrong day assignment', {
    specMutate: (spec) => {
      spec[0].stops.push({ stopId: 'stop-3', text: 'Canyon Trail on the first day.' });
      spec[1].stops = spec[1].stops.filter((s) => s.stopId !== 'stop-3');
    },
    shouldPass: false, expectedIssueCodes: ['wrong_day_assignment'],
  }),
  consistencyScenario('prose-29-wrong-order', 'wrong stop order', {
    specMutate: (spec) => { spec[0].stops.reverse(); },
    shouldPass: false, expectedIssueCodes: ['order_violation'],
  }),
  consistencyScenario('prose-30-wrong-duration', 'incorrect duration', {
    specMutate: (spec) => { spec[0].stops[0].text = 'Rim Trail — plan for about 6 hours here.'; },
    shouldPass: false, expectedIssueCodes: ['conflicting_duration'],
  }),
  consistencyScenario('prose-31-wrong-difficulty', 'incorrect difficulty', {
    specMutate: (spec) => { spec[0].stops[0].text = 'Rim Trail is a strenuous, punishing climb.'; },
    shouldPass: false, expectedIssueCodes: ['conflicting_difficulty'],
  }),
  // 26b — missing itinerary day: a required frozen-itinerary day omitted from
  // prose must fail (Stage 13.1 detector-gap closure).
  {
    scenarioId: 'prose-26b-missing-day', category: 'prose_consistency', name: 'missing itinerary day',
    userPrompt: 'Plan a two-day Zion trip.', userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Zion National Park' },
    structuredResponses: complete(base),
    // Prose covers Day 1 only; Day 2 (day-2 / stop-3) is entirely omitted.
    proseResponses: [{ content: proseFromSpec([{ dayId: 'day-1', label: 'Day 1', stops: [
      { stopId: 'stop-1', text: 'Rim Trail.' }, { stopId: 'stop-2', text: 'Overlook Point.' },
    ] }]) }],
    expected: { requiresStructuredItinerary: true, expectedConsistencyOutcome: 'failed', consistency: { shouldPass: false, expectedIssueCodes: ['missing_day'] } },
  },
  // 32 — wrong overnight location. Formerly a DISCLOSED false negative (the
  // verifier didn't model overnight); Stage 13.1 adds a conservative detector, so
  // this is now a TRUE POSITIVE and is RETAINED as the closure regression test.
  {
    scenarioId: 'prose-32-wrong-overnight', category: 'prose_consistency', name: 'incorrect overnight location',
    userPrompt: 'Zion and Bryce road trip with overnight stays.', userRequestedItinerary: true,
    resolvedMetadata: { parkNames: ['Zion National Park', 'Bryce Canyon National Park'] },
    structuredResponses: complete(MULTI_PARK),
    proseResponses: [{ content: `${goodProse(MULTI_PARK)}\nYou will spend the night in Las Vegas, far from the parks.` }],
    expected: { requiresStructuredItinerary: true, expectedConsistencyOutcome: 'failed', consistency: { shouldPass: false, expectedIssueCodes: ['conflicting_overnight'] } },
  },
  // 32b/c/d — overnight NEGATIVE tests: the detector must stay conservative.
  {
    scenarioId: 'prose-32b-correct-overnight', category: 'prose_consistency', name: 'correct overnight location passes',
    userPrompt: 'Zion and Bryce road trip with overnight stays.', userRequestedItinerary: true,
    resolvedMetadata: { parkNames: ['Zion National Park', 'Bryce Canyon National Park'] },
    structuredResponses: complete(MULTI_PARK),
    proseResponses: [{ content: `${goodProse(MULTI_PARK)}\nSpend the night in Springdale before heading to Bryce.` }],
    expected: { requiresStructuredItinerary: true, expectedConsistencyOutcome: 'passed', consistency: { shouldPass: true, expectedIssueCodes: [], forbiddenIssueCodes: ['conflicting_overnight'] } },
  },
  {
    scenarioId: 'prose-32c-drive-through', category: 'prose_consistency', name: 'drive-through is not an overnight claim',
    userPrompt: 'Zion and Bryce road trip with overnight stays.', userRequestedItinerary: true,
    resolvedMetadata: { parkNames: ['Zion National Park', 'Bryce Canyon National Park'] },
    structuredResponses: complete(MULTI_PARK),
    proseResponses: [{ content: `${goodProse(MULTI_PARK)}\nYou will drive through Las Vegas on the way to the parks.` }],
    expected: { requiresStructuredItinerary: true, expectedConsistencyOutcome: 'passed', consistency: { shouldPass: true, expectedIssueCodes: [], forbiddenIssueCodes: ['conflicting_overnight'] } },
  },
  {
    scenarioId: 'prose-32d-generic-lodging', category: 'prose_consistency', name: 'generic lodging advice passes',
    userPrompt: 'Zion and Bryce road trip with overnight stays.', userRequestedItinerary: true,
    resolvedMetadata: { parkNames: ['Zion National Park', 'Bryce Canyon National Park'] },
    structuredResponses: complete(MULTI_PARK),
    proseResponses: [{ content: `${goodProse(MULTI_PARK)}\nBook lodging close to the park entrance well in advance.` }],
    expected: { requiresStructuredItinerary: true, expectedConsistencyOutcome: 'passed', consistency: { shouldPass: true, expectedIssueCodes: [], forbiddenIssueCodes: ['conflicting_overnight'] } },
  },
  // 33/34 — removed-stop mentions require a real correction-driven removal.
  {
    scenarioId: 'prose-33-removed-active', category: 'prose_consistency', name: 'removed stop as active recommendation',
    userPrompt: 'Beginner Zion trip.', userRequestedItinerary: true,
    structuredConstraints: REMOVAL_CONSTRAINTS, resolvedMetadata: { parkName: 'Zion National Park', parkCode: 'zion' },
    structuredResponses: complete(REMOVAL_BASE),
    proseResponses: [{ content: `${proseFromSpec(REMOVAL_REMAINING_SPEC)}\nThen hike Angels Landing for sunset.` }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', expectedConsistencyOutcome: 'failed', consistency: { shouldPass: false, expectedIssueCodes: ['removed_stop_mention'] } },
  },
  {
    scenarioId: 'prose-34-removed-explained', category: 'prose_consistency', name: 'removed stop mentioned only as explanation',
    userPrompt: 'Beginner Zion trip.', userRequestedItinerary: true,
    structuredConstraints: REMOVAL_CONSTRAINTS, resolvedMetadata: { parkName: 'Zion National Park', parkCode: 'zion' },
    structuredResponses: complete(REMOVAL_BASE),
    proseResponses: [{ content: `${proseFromSpec(REMOVAL_REMAINING_SPEC)}\nWe left out Angels Landing because it exceeds your fitness level.` }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', expectedConsistencyOutcome: 'passed', consistency: { shouldPass: true, expectedIssueCodes: [], forbiddenIssueCodes: ['removed_stop_mention'] } },
  },
  consistencyScenario('prose-35-generic-safety', 'generic safety advice (no false positive)', {
    extraProse: 'Bring plenty of water, start early, and check trail conditions before you go.',
    shouldPass: true, expectedIssueCodes: [], forbiddenIssueCodes: ['unsupported_plan_action', 'removed_stop_mention'],
  }),
  consistencyScenario('prose-36-alias-collision', 'similar-name alias collision (no false positive)', {
    // References an itinerary stop by exact name — must NOT be flagged as an
    // unsupported addition despite generic word overlap ("Canyon"). The sentence
    // ends right after the name so the additive matcher captures exactly it.
    extraProse: 'If you have extra time, also visit Canyon Trail.',
    shouldPass: true, expectedIssueCodes: [], forbiddenIssueCodes: ['unsupported_plan_action'],
  }),
];

// ── Category: Persistence & transport (37–44) ───────────────────────────────
// 37–40 are the four canonical transports; the 4-route parity harness
// (routeParity.js) asserts they are canonically identical. 41–44 (duplicate
// terminal submit, stale save conflict, restore, share/export) live at the
// persistence/transport layer and their invariants are asserted by the existing
// Stage 8 persistence tests — carried here as itinerary turns with an
// `expected.coveredElsewhere` pointer so the inventory maps 1:1 to the audit.

function transportScenario(id, prompt, extra = {}) {
  return {
    scenarioId: id, category: 'persistence_transport',
    userPrompt: prompt, userRequestedItinerary: true,
    resolvedMetadata: { parkName: 'Zion National Park', parkCode: 'zion' },
    structuredResponses: complete(ONE_DAY), proseResponses: [{ content: goodProse(ONE_DAY) }],
    expected: { requiresStructuredItinerary: true, expectedStructuredOutcome: 'itinerary_ready', ...extra },
  };
}

const persistenceTransport = [
  transportScenario('transport-37-auth-streaming', 'Plan a one-day Zion trip (authenticated streaming).', { routeParity: true, parityAnchor: true }),
  transportScenario('transport-38-auth-non-streaming', 'Plan a one-day Zion trip (authenticated non-streaming).', { routeParity: true }),
  transportScenario('transport-39-anon-streaming', 'Plan a one-day Zion trip (anonymous streaming).', { routeParity: true, anonymous: true }),
  transportScenario('transport-40-anon-non-streaming', 'Plan a one-day Zion trip (anonymous non-streaming).', { routeParity: true, anonymous: true }),
  transportScenario('transport-41-duplicate-terminal-submit', 'Resubmit the finished plan.', {
    referencedRegression: { evidenceType: 'referenced_regression', sourceTestSuite: 'server/src/routes/__tests__/requestPathReviewScheduling.test.js', testNames: ['duplicate terminal submission is idempotent'], lastResult: 'referenced_not_executed_here' },
  }),
  transportScenario('transport-42-stale-save-conflict', 'Save an out-of-date plan version.', {
    referencedRegression: { evidenceType: 'referenced_regression', sourceTestSuite: 'next-frontend/src/utils/__tests__/saveStateFromPersistence.test.js', testNames: ['STALE → sync-needed', 'CONFLICT → sync-needed'], lastResult: 'referenced_not_executed_here' },
  }),
  transportScenario('transport-43-restore-after-save', 'Restore a previously accepted save.', {
    referencedRegression: { evidenceType: 'referenced_regression', sourceTestSuite: 'server/src/routes/__tests__/trailieRouteContract.test.js', testNames: ['content passes through byte-for-byte'], lastResult: 'referenced_not_executed_here' },
  }),
  transportScenario('transport-44-share-export', 'Share and export the canonical response.', {
    referencedRegression: { evidenceType: 'referenced_regression', sourceTestSuite: 'server/src/routes/__tests__/requestPathReviewScheduling.test.js', testNames: ['default public share excludes user messages'], lastResult: 'referenced_not_executed_here' },
  }),
];

// ── Category: Non-itinerary regression (45–50) ──────────────────────────────

const nonItinerary = [
  {
    scenarioId: 'regression-45-simple-park-question', category: 'non_itinerary',
    userPrompt: 'What is Zion known for?', userRequestedItinerary: false,
    resolvedMetadata: { parkName: 'Zion National Park' },
    structuredResponses: [], proseResponses: [{ content: 'Zion is known for its towering sandstone cliffs and the Virgin River.' }],
    expected: { requiresStructuredItinerary: false, expectedStructuredOutcome: 'not_attempted', expectNoItinerary: true },
  },
  {
    scenarioId: 'regression-46-weather-only', category: 'non_itinerary',
    userPrompt: 'What is the weather at Zion this weekend?', userRequestedItinerary: false,
    resolvedMetadata: { parkName: 'Zion National Park' }, canonicalFacts: { weather: [{ parkCode: 'zion', forecast: 'sunny' }] },
    structuredResponses: [], proseResponses: [{ content: 'Expect sunny skies and highs near 90°F at Zion this weekend.' }],
    expected: { requiresStructuredItinerary: false, expectNoItinerary: true },
  },
  {
    scenarioId: 'regression-47-permit-only', category: 'non_itinerary',
    userPrompt: 'Do I need a permit for Angels Landing?', userRequestedItinerary: false,
    resolvedMetadata: { parkName: 'Zion National Park' }, canonicalFacts: { permits: [{ parkCode: 'zion', text: 'Permit required' }] },
    structuredResponses: [], proseResponses: [{ content: 'Yes — Angels Landing requires a permit via the seasonal lottery.' }],
    expected: { requiresStructuredItinerary: false, expectNoItinerary: true },
  },
  {
    scenarioId: 'regression-48-park-comparison', category: 'non_itinerary',
    userPrompt: 'Zion vs Bryce — which is better for a first visit?', userRequestedItinerary: false,
    resolvedMetadata: { parkNames: ['Zion National Park', 'Bryce Canyon National Park'] },
    structuredResponses: [], proseResponses: [{ content: 'Both are stunning; Zion offers dramatic canyon hikes while Bryce is famous for its hoodoos.' }],
    expected: { requiresStructuredItinerary: false, expectNoItinerary: true },
  },
  {
    scenarioId: 'regression-49-anonymous-conversion', category: 'non_itinerary',
    userPrompt: 'Sign me up so I can save this.', userRequestedItinerary: false,
    resolvedMetadata: {}, structuredResponses: [],
    proseResponses: [{ content: 'Create a free TrailVerse account to save and revisit your plans anytime.' }],
    expected: { requiresStructuredItinerary: false, expectNoItinerary: true, conversion: true },
  },
  {
    scenarioId: 'regression-50-followup-explanation', category: 'non_itinerary',
    userPrompt: 'Why did you suggest starting early on day one?', userRequestedItinerary: false,
    resolvedMetadata: { parkName: 'Zion National Park' },
    structuredResponses: [], proseResponses: [{ content: 'Starting early beats the midday heat and the shuttle crowds at the trailheads.' }],
    expected: { requiresStructuredItinerary: false, expectNoItinerary: true, expectNoRebuild: true },
  },
];

const ALL_SCENARIOS = [
  ...basic,
  ...constraintCorrection,
  ...canonicalEvidence,
  ...structuredFailures,
  ...proseConsistency,
  ...persistenceTransport,
  ...nonItinerary,
].map((s) => ({ scenarioVersion: SCENARIO_VERSION, ...s }));

// ── Inventory partition (Stage 13.2 §1 — execution accounting) ───────────────
// The full inventory partitions cleanly into three DISJOINT sets:
//   executable            — run as Stage 13 pipeline executions (the denominator)
//   referencedRegression  — covered by EXTERNAL suites, cited but NOT executed here
//   (notExecuted)         — anything intentionally excluded for other reasons (0)
// Anything with `expected.referencedRegression` is evidence pointing at another
// test suite; it must NEVER be executed as a Stage 13 run or counted in the 500.
const isReferencedRegression = (s) => !!(s.expected && s.expected.referencedRegression);
const REFERENCED_REGRESSION_SCENARIOS = ALL_SCENARIOS.filter(isReferencedRegression);
const EXECUTABLE_SCENARIOS = ALL_SCENARIOS.filter((s) => !isReferencedRegression(s));

/**
 * Stage 14.7K §2 — replacement-slot aliases.
 *
 * `basic-02-three-day` was permanently consumed by the failed live run. Its
 * replacement re-validates the model-resolution fix on the SAME prompt and the
 * SAME assertions — a different prompt would be a different experiment, not a
 * re-validation. So the replacement resolves to the original's definition while
 * keeping its OWN identity for markers, evidence and accounting.
 *
 * Deliberately NOT added to `ALL_SCENARIOS`: the alias is a run slot, not a new
 * scenario, and counting it in the inventory would inflate every denominator.
 */
const SCENARIO_ALIASES = Object.freeze({
  'basic-02-three-day-model-fix-validation-1': 'basic-02-three-day',
  'basic-02-three-day-canonical-fix-validation-2': 'basic-02-three-day',
});

function byId(id) {
  const direct = ALL_SCENARIOS.find((s) => s.scenarioId === id);
  if (direct) return direct;
  const aliasTarget = SCENARIO_ALIASES[id];
  if (!aliasTarget) return undefined;
  const source = ALL_SCENARIOS.find((s) => s.scenarioId === aliasTarget);
  if (!source) return undefined;
  // The slot's own id wins, so a marker or an evidence file can never be
  // attributed to the consumed original.
  return { ...source, scenarioId: id, aliasOfScenarioId: aliasTarget };
}

module.exports = {
  SCENARIO_VERSION,
  ALL_SCENARIOS,
  EXECUTABLE_SCENARIOS,
  REFERENCED_REGRESSION_SCENARIOS,
  SCENARIO_ALIASES,
  isReferencedRegression,
  CATEGORIES: [...new Set(ALL_SCENARIOS.map((s) => s.category))],
  byId,
  byCategory: (cat) => ALL_SCENARIOS.filter((s) => s.category === cat),
};
