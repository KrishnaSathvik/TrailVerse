'use strict';

/**
 * TURN 3 — MOBILITY-AWARE COMPLETENESS + REQUIRED-MUTATION FAILURE MESSAGE.
 *
 * Two defects, both found by the paid 2026-08-21 Turn 3 and both closed here.
 *
 * 1. `itineraryCompleteness` never read `walkingTolerance`. The traveler asked
 *    for less walking, the model complied by shortening day 2's only walking
 *    anchor, and the thin-day rule rejected the shortened day. Honouring the
 *    constraint and passing the validator were mutually exclusive.
 * 2. `buildArtifactNotAppliedMessage` was gated on `status === 'complete'`, so a
 *    required mutation that exhausted the routing ladder returned a generic
 *    51-character outage string and never told the traveler their saved plan was
 *    unchanged.
 *
 * THIS RUNS THE REAL SEAM. Isolated unit tests on `itineraryCompleteness` have
 * already let two bugs ship in this codebase, so every case below goes through
 * `executeTrailieV2Turn`: prior canonical plan -> TurnUnderstanding contract ->
 * plan patch -> `applyPlanPatch` -> refinement ownership -> operational
 * eligibility -> completeness -> the remaining validators -> artifact
 * fulfillment -> terminal response projection. No model, no provider, no
 * network — the provider boundary replays captured tool calls.
 *
 * FIXTURE PROVENANCE
 * `PRIOR_PLAN`, `PATCH_ATTEMPT_1` and `PATCH_ATTEMPT_3` are the REAL artifacts of
 * the paid run, from
 *   artifacts/trailie-turn3-mutation-2026-08-21/thread-M1/
 *     T3-knee-light-walking-source-plan.json
 *     T3-knee-light-walking-plan-stage-attempt-{1,3}.json
 *
 * ONE RECONSTRUCTION, AND IT IS VERIFIABLE. `sanitizeStop` in
 * `utils/planStageCapture.js` writes `null` for every field the model OMITTED,
 * and `applyPlanPatch` distinguishes the two (undefined = leave unchanged, null =
 * set to null). The captured operations' `null` fields are therefore a capture
 * artifact, not provider output, and are stripped below. The reconstruction is
 * self-checking: `attempt 1 / attempt 3 reproduce the LIVE post-constraint days`
 * asserts that the reconstructed patches produce exactly the day/stop/duration/
 * exposure shape the live capture recorded, and the fix is only credible because
 * the SAME fixtures reproduced the live `insufficient_day_coverage` rejection
 * before the completeness change and pass after it.
 */

const { executeTrailieV2Turn } = require('../../../../../src/services/trailieV2ExecutionService');
const { summarizeV2Telemetry, renderV2Content } = require('../../../../../src/services/trailieV2RouteBridge');
const { buildArtifactNotAppliedMessage } = require('../../../../../src/services/artifactFulfillment');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');
const {
  evaluateItineraryCompleteness,
  buildCompletenessRepairInstructions,
  resolveCoveragePolicy,
} = require('../../../../../src/utils/itineraryCompleteness');
const {
  getProviderTestSummary,
  resetProviderTestSummary,
} = require('../../../../../src/config/providerTestPolicy');

// ---------------------------------------------------------------------------
// The live turn, verbatim
// ---------------------------------------------------------------------------

const LIVE_PROMPT =
  'Actually my knee has been bothering me, so keep the walking pretty light. Keep the trip otherwise.';

const PRIOR_PLAN = {
  "intro": "I’d make this a deliberately unhurried two-day Zion visit focused on the canyon’s big forms, river scenery, and easy photo time rather than trying to chase every headline trail. The Pa’rus Trail and Lower Emerald Pool Trail are the strongest fit for your group: both are listed as easy and low-exposure, while still giving you classic river, canyon-wall, and waterfall/pool subjects. I’ve left out Watchman and Canyon Overlook because their documented drop-offs/exposure don’t match your request. Keep the walks slow and treat them as photo outings rather than mileage goals—pause for changing light, textures in the canyon walls, and river compositions. Since I can’t verify late-September access or day-of conditions here, check with park staff when you arrive before committing to the day’s order.",
  "days": [
    {
      "id": "day-1-zion-canyon-river",
      "dayNumber": 1,
      "label": "Zion Canyon river light and Watchman views",
      "overnightLocation": null,
      "stops": [
        {
          "id": "day1-zion-canyon-vc",
          "order": 1,
          "type": "visitor_center",
          "name": "Zion Canyon Visitor Center",
          "note": "Begin with a brief orientation near the South Entrance and ask rangers about that day’s access and conditions. This also puts you at the natural start of the river-focused walk.",
          "parkCode": "zion",
          "parkName": "Zion National Park",
          "startTime": "",
          "timeWindow": "Morning",
          "physicalDifficulty": "easy",
          "exposureLevel": "low",
          "duration": 30,
          "difficulty": "easy",
          "why": "A practical, low-key start before spending the morning outdoors.",
          "alternatives": [],
          "latitude": null,
          "longitude": null,
          "coordinateSource": "unknown"
        },
        {
          "id": "day1-parus",
          "order": 2,
          "type": "trail",
          "name": "Pa'rus Trail",
          "note": "Make this the day’s main easy photo walk. The paved trail follows the Virgin River between the visitor center and Canyon Junction, with views of the Watchman and trailside exhibits. Walk only as far as feels enjoyable, then return or continue at your own pace.",
          "parkCode": "zion",
          "parkName": "Zion National Park",
          "startTime": "",
          "timeWindow": "Morning through midday",
          "physicalDifficulty": "easy",
          "exposureLevel": "low",
          "duration": 120,
          "difficulty": "easy",
          "why": "It provides classic Zion river-and-peak photography on a documented low-exposure, accessible paved route.",
          "alternatives": [],
          "latitude": 37.2002,
          "longitude": -112.9869,
          "coordinateSource": "trailverse_catalog",
          "locationResolutionSource": "trailverse_known_stop_catalog"
        },
        {
          "id": "day1-human-history",
          "order": 3,
          "type": "museum",
          "name": "Human History Museum",
          "note": "Use the indoor exhibits and 22-minute orientation film as a cool-down and a change of pace after the river walk. Step outside afterward for views toward the Towers of the Virgin and Bridge Mountain.",
          "parkCode": "zion",
          "parkName": "Zion National Park",
          "startTime": "",
          "timeWindow": "Afternoon",
          "physicalDifficulty": "easy",
          "exposureLevel": "low",
          "duration": 60,
          "difficulty": "easy",
          "why": "A genuinely different Zion experience that adds context and another broad canyon-view photo setting without another demanding outing.",
          "alternatives": [],
          "latitude": null,
          "longitude": null,
          "coordinateSource": "unknown"
        }
      ],
      "parkCodes": [
        "zion"
      ]
    },
    {
      "id": "day-2-emerald-pools",
      "dayNumber": 2,
      "label": "Emerald Pools textures and canyon walls",
      "overnightLocation": null,
      "stops": [
        {
          "id": "day2-lower-emerald",
          "order": 1,
          "type": "trail",
          "name": "Lower Emerald Pool Trail",
          "note": "Give this your best light and most energy. The rough paved route runs through pinyon-juniper woodland to Lower Emerald Pool and ephemeral waterfalls; photograph water, hanging gardens, and the enclosing canyon walls. Stay out of the water and away from cliff edges, as directed by the park.",
          "parkCode": "zion",
          "parkName": "Zion National Park",
          "startTime": "",
          "timeWindow": "Morning",
          "physicalDifficulty": "easy",
          "exposureLevel": "low",
          "duration": 120,
          "difficulty": "easy",
          "why": "This is the second substantial, low-exposure walk, with a very different photographic palette from the river corridor.",
          "alternatives": [],
          "latitude": null,
          "longitude": null,
          "coordinateSource": "unknown"
        },
        {
          "id": "day2-zion-lodge",
          "order": 2,
          "type": "lodge",
          "name": "Zion Lodge area",
          "note": "Take an unhurried break near the trail’s facilities; the park notes restrooms and water-filling stations here. Keep the afternoon flexible for revisiting favorite Lower Emerald Pool compositions rather than adding an exposed trail.",
          "parkCode": "zion",
          "parkName": "Zion National Park",
          "startTime": "",
          "timeWindow": "Midday",
          "physicalDifficulty": "easy",
          "exposureLevel": "low",
          "duration": 60,
          "difficulty": "easy",
          "why": "It creates a real rest transition and lets the day stay relaxed after the main walk.",
          "alternatives": [],
          "latitude": null,
          "longitude": null,
          "coordinateSource": "unknown"
        },
        {
          "id": "day2-nature-center",
          "order": 3,
          "type": "visitor_center",
          "name": "Zion Nature Center",
          "note": "If it is operating during your visit, finish with the interactive geology, wildlife, and history exhibits and ranger-led programming. It is a pleasant indoor option after photography outdoors.",
          "parkCode": "zion",
          "parkName": "Zion National Park",
          "startTime": "",
          "timeWindow": "Afternoon",
          "physicalDifficulty": "easy",
          "exposureLevel": "low",
          "duration": 45,
          "difficulty": "easy",
          "why": "A quiet, low-exposure change of scene that complements the landscape-focused morning.",
          "alternatives": [],
          "latitude": null,
          "longitude": null,
          "coordinateSource": "unknown"
        }
      ],
      "parkCodes": [
        "zion"
      ]
    }
  ],
  "alternatives": [],
  "narrativeSections": [],
  "responseId": "413b596e-ec8c-47b2-b77a-07df39d945ed",
  "responseVersion": 1,
  "responseRevision": null,
  "itineraryHash": "7ed9e7576e4c0e74f5fa14a7f52419393848afd74c3064d8c99e7f2db6e37de6"
};

const PATCH_ATTEMPT_1 = {
  "response": "I’ve scaled the two walks back to short, flexible photo strolls rather than full trail objectives. Keep the Lower Emerald Pool outing especially optional—the surface is described as rough and paved, so turn around at the first sign that your knee is unhappy. The rest of the scenery-focused plan stays as is.",
  "operations": [
    {
      "op": "update_stop",
      "dayNumber": 1,
      "stopName": "Pa'rus Trail",
      "stop": {
        "timeWindow": "Morning or late afternoon",
        "duration": 45,
        "exposureLevel": "low",
        "difficulty": "easy",
        "note": "Make this a short, easy river-and-Watchman photo stroll rather than a full out-and-back. Use the paved trail, pause often, and turn around whenever your knee needs a break.",
        "why": "Keeps a low-exposure, paved canyon experience while reducing time on foot.",
        "alternatives": [],
        "backupOptions": []
      },
      "stopOrder": []
    },
    {
      "op": "update_stop",
      "dayNumber": 2,
      "stopName": "Lower Emerald Pool Trail",
      "stop": {
        "timeWindow": "Morning, at an easy pace",
        "duration": 30,
        "exposureLevel": "low",
        "difficulty": "easy",
        "note": "Treat this as a brief, optional photo walk only—not a goal to reach the pool. The trail is rough and paved; turn around early or skip it if your knee is sore.",
        "why": "Preserves the low-exposure pool-and-waterfall setting while keeping the walking deliberately light.",
        "alternatives": [
          {
            "name": "Court of the Patriarchs",
            "note": "Use this named canyon viewpoint stop instead if you prefer to avoid the rough trail surface.",
            "when": null
          },
          {
            "name": "Big Bend",
            "note": "Use this named scenic canyon stop instead if your knee needs a no-hike break.",
            "when": null
          }
        ],
        "backupOptions": []
      },
      "stopOrder": []
    }
  ]
};

const PATCH_ATTEMPT_3 = {
  "response": "I’ve kept the two-day structure and scenery/photography focus, but made the walking gentler for your knee. The Pa’rus Trail is now a short, flexible river stroll with an early turnaround, and I replaced the rough-paved Lower Emerald Pool walk with photo time at Court of the Patriarchs. Check same-day access with park staff, and skip even the short stroll if your knee is painful or unstable.",
  "operations": [
    {
      "op": "update_stop",
      "dayNumber": 1,
      "stopName": "Pa'rus Trail",
      "stop": {
        "name": "Pa'rus Trail — short river stroll",
        "startTime": "",
        "timeWindow": "Late afternoon",
        "duration": 30,
        "exposureLevel": "low",
        "difficulty": "easy",
        "note": "Keep this to a brief, easy-paced out-and-back on the paved, low-exposure trail near the Virgin River. Turn around whenever the knee has had enough rather than aiming to complete the route; use the time for Watchman and river photography.",
        "why": "Preserves the river scenery and photography while making the walking flexible and light.",
        "alternatives": [],
        "backupOptions": []
      },
      "stopOrder": []
    },
    {
      "op": "update_stop",
      "dayNumber": 2,
      "stopName": "Lower Emerald Pool Trail",
      "stop": {
        "name": "Court of the Patriarchs",
        "type": "viewpoint",
        "startTime": "",
        "timeWindow": "Morning",
        "duration": 45,
        "difficulty": "easy",
        "note": "Use this as an easy scenic and photography stop instead of the rough-paved Lower Emerald Pool Trail, reducing the strain on your knee without changing the rest of the day.",
        "why": "A named canyon-view stop that keeps the scenery focus while avoiding a longer rough-paved walk.",
        "alternatives": [],
        "backupOptions": []
      },
      "stopOrder": []
    }
  ]
};
// ---------------------------------------------------------------------------
// Canonical constraint state, exactly as the live turn carried it
// ---------------------------------------------------------------------------

/** `walkingTolerance = limited` with NO invented mileage — the locked invariant. */
const LIMITED_WALKING_CONSTRAINTS = Object.freeze({
  avoidExposure: true,
  preferences: {
    interests: ['hiking', 'photography', 'scenic-drives'],
    fitness: 'easy',
    pace: null,
    riskTolerance: null,
    avoidExposure: true,
    maxDailyDriveMinutes: null,
  },
  mobility: {
    maxWalkMilesPerSegment: null,
    walkingTolerance: 'limited',
    requiresFrequentBreaks: null,
    wheelchair: null,
    stroller: null,
    avoidStairs: null,
  },
  dates: { numDays: 2 },
});

function withMobility(mobility, extra = {}) {
  return {
    ...LIMITED_WALKING_CONSTRAINTS,
    ...extra,
    mobility: { ...LIMITED_WALKING_CONSTRAINTS.mobility, ...mobility },
  };
}

function refinementClassification() {
  return {
    version: 'trailie-intent-v2.0.0',
    source: 'deterministic',
    primaryIntent: 'trip_refinement',
    verticals: ['itinerary'],
    depth: 'planning',
    freshness: 'current',
    actionability: 'planning',
    scope: 'single_destination',
    entities: [{ type: 'destination', role: 'target', canonicalId: 'park:nps:zion', confidence: 1 }],
    confidence: 0.97,
    reasonCodes: ['refines_existing_plan'],
    compound: false,
    requiresLunaShadow: false,
    travelerJob: 'itinerary_refinement',
    structurePolicy: 'required',
    understanding: {
      contractVersion: 2,
      taskFamily: 'itinerary_refinement',
      taskStrength: 'explicit',
      confidence: 0.98,
      requestedArtifact: 'itinerary_patch',
      forbiddenArtifacts: [],
      structurePolicy: 'required',
      destinationRelationship: 'single',
      destinationRefs: [{ entityId: 'nps:park:zion', parkCode: 'zion', displayName: 'Zion' }],
      temporalScope: { visitWindow: null, durationDays: 2, durationSource: 'prior_state' },
      operationalSubjects: [],
      explicitConstraints: [{
        field: 'walkingTolerance',
        value: 'limited',
        source: 'current_message',
        span: 'keep the walking pretty light',
        confidence: 0.95,
      }],
      softPreferences: [],
      underspecified: false,
      continuationOfActiveDecision: false,
      priorJob: 'day_by_day_itinerary',
      topicShift: false,
      understandingSource: 'deterministic',
      reasonCodes: ['refines_existing_plan'],
    },
  };
}

/**
 * Drive the whole execution seam for one replayed patch.
 * `executeResponses` is the ONLY provider boundary and it never dispatches.
 */
async function replayPatchTurn({
  patch,
  constraints = LIMITED_WALKING_CONSTRAINTS,
  priorPlan = PRIOR_PLAN,
  liveBudget = null,
  providerError = null,
} = {}) {
  return executeTrailieV2Turn({
    userMessage: LIVE_PROMPT,
    conversationContext: { history: [] },
    tripState: { canonicalPlan: priorPlan },
    constraints,
    resolvedContext: {},
  }, {
    enabled: true,
    liveBudget,
    classifyIntent: () => refinementClassification(),
    planRequirements: () => [],
    resolveDeterministicRender: () => ({ eligible: false }),
    detectContradiction: () => [],
    resolveEvidence: async ({ requestId }) => buildEvidenceBundle({
      requestId, resolutions: [], candidates: [],
    }),
    now: () => new Date('2026-08-21T12:00:00.000Z'),
    newTurnId: () => 'turn-3-mobility-replay',
    streamGeneration: false,
    responseAdapters: {},
    executeResponses: async () => {
      if (providerError) throw Object.assign(new Error('provider down'), { code: providerError });
      return {
        provider: 'openai',
        model: 'gpt-5.6-terra',
        outputText: '',
        toolCalls: [{
          name: 'patch_itinerary',
          id: 'call_1',
          input: patch,
          rawArgs: JSON.stringify(patch),
        }],
        completionStatus: 'complete',
        stopReason: 'stop',
        refusal: null,
        usage: { inputTokens: 5116, outputTokens: 823, reasoningTokens: 464, cachedInputTokens: 0 },
      };
    },
  });
}

const dayShape = (plan, dayNumber) => (plan?.days || [])
  .find((d) => (d.dayNumber ?? d.day) === dayNumber)
  .stops.map((s) => `${s.name} (${s.type}, ${s.duration}m)`);

beforeEach(() => resetProviderTestSummary());

// ---------------------------------------------------------------------------
// 1. THE ACTUAL TURN-3 ARTIFACT REPLAY
// ---------------------------------------------------------------------------

describe('the real Turn 3 patches through the real execution seam', () => {
  test('attempt 1 reproduces the LIVE post-constraint days, and now finalizes', async () => {
    const result = await replayPatchTurn({ patch: PATCH_ATTEMPT_1 });
    const telemetry = summarizeV2Telemetry(result);

    // Byte-level agreement with the live capture proves the reconstruction.
    expect(dayShape(result.canonicalPlan, 1)).toEqual([
      'Zion Canyon Visitor Center (visitor_center, 30m)',
      "Pa'rus Trail (trail, 45m)",
      'Human History Museum (museum, 60m)',
    ]);
    expect(dayShape(result.canonicalPlan, 2)).toEqual([
      'Lower Emerald Pool Trail (trail, 30m)',
      'Zion Lodge area (lodge, 60m)',
      'Zion Nature Center (visitor_center, 45m)',
    ]);

    expect(result.status).toBe('complete');
    expect(result.validation.status).toBe('pass');
    expect(result.validation.reasonCodes).toEqual([]);
    expect(result.artifactFulfillment).toMatchObject({ fulfilled: true, reasonCode: 'fulfilled' });
    expect(telemetry.hasPlan).toBe(true);
    expect(telemetry.canonicalPlanState).toBe('accepted');
    // The whole point: one attempt, no repair ladder, no escalation.
    expect(telemetry.attempts).toHaveLength(1);
  });

  test('attempt 3 reproduces the LIVE post-constraint days, and now finalizes', async () => {
    const result = await replayPatchTurn({ patch: PATCH_ATTEMPT_3 });
    const telemetry = summarizeV2Telemetry(result);

    expect(dayShape(result.canonicalPlan, 1)).toEqual([
      'Zion Canyon Visitor Center (visitor_center, 30m)',
      "Pa'rus Trail — short river stroll (trail, 30m)",
      'Human History Museum (museum, 60m)',
    ]);
    expect(dayShape(result.canonicalPlan, 2)).toEqual([
      'Court of the Patriarchs (viewpoint, 45m)',
      'Zion Lodge area (lodge, 60m)',
      'Zion Nature Center (visitor_center, 45m)',
    ]);

    expect(result.status).toBe('complete');
    expect(result.artifactFulfillment).toMatchObject({ fulfilled: true, reasonCode: 'fulfilled' });
    expect(telemetry.canonicalPlanState).toBe('accepted');
  });

  test('the rejection this fix targets is EXACTLY the day-2 coverage rule', () => {
    // The live blocker, isolated: day 2 as attempt 3 produced it. One
    // experiential stop under 90 minutes whose only companions classify as
    // rest/logistics. Standard traveler -> still rejected. Same day, same
    // stops, limited-walking traveler -> accepted.
    const day2 = {
      day: 2,
      label: 'Emerald Pools textures and canyon walls',
      stops: [
        { name: 'Court of the Patriarchs', type: 'viewpoint', order: 1, duration: 45, timeWindow: 'Morning', exposureLevel: 'low' },
        { name: 'Zion Lodge area', type: 'lodge', order: 2, duration: 60, timeWindow: 'Midday', exposureLevel: 'low' },
        { name: 'Zion Nature Center', type: 'visitor_center', order: 3, duration: 45, timeWindow: 'Afternoon', exposureLevel: 'low' },
      ],
    };
    const plan = { days: [day2] };

    const oneDay = { dates: { numDays: 1 } };
    const standard = evaluateItineraryCompleteness({
      itineraryData: plan,
      constraints: withMobility({ walkingTolerance: null }, oneDay),
    });
    expect(standard.ok).toBe(false);
    expect(standard.reasonCodes).toContain('insufficient_day_coverage');
    expect(standard.coveragePolicy).toBe('standard');

    const limited = evaluateItineraryCompleteness({
      itineraryData: plan,
      constraints: withMobility({}, oneDay),
    });
    expect(limited.ok).toBe(false);
    expect(limited.reasonCodes).toEqual(['missing_requested_experience_coverage', 'missing_requested_scenic_drive', 'missing_requested_hike']);
    expect(limited.dayDiagnostics).toEqual([]);
    expect(limited.coveragePolicy).toBe('mobility_limited');
    // The day label is untouched. The fix is structural, not cosmetic: nothing
    // renamed the day "short day" to get past the rule.
    expect(day2.label).toBe('Emerald Pools textures and canyon walls');
  });

  test('validation-stage attribution is preserved on real failures', async () => {
    // Attempt 3's replacement stop with its exposure REMOVED. Unknown exposure
    // under `avoidExposure` must still be refused, at its own named stage —
    // completeness becoming mobility-aware may not soften eligibility.
    const unknownExposure = {
      ...PATCH_ATTEMPT_3,
      operations: PATCH_ATTEMPT_3.operations.map((op) => (
        op.dayNumber === 2 ? { ...op, stop: { ...op.stop, exposureLevel: null } } : op
      )),
    };
    const result = await replayPatchTurn({ patch: unknownExposure });
    const telemetry = summarizeV2Telemetry(result);

    expect(result.status).toBe('failed');
    expect(telemetry.attempts[0].validationStage).toBe('operational_eligibility');
    expect(telemetry.attempts[0].validationReasonCodes).toContain('constraint_eligibility_unknown');
    expect(telemetry.canonicalPlanState).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// 2. THE GENERIC COVERAGE MATRIX
//
// Nothing below mentions Zion, a knee, or any demo question. Each row is a
// property of the policy, not of this itinerary.
// ---------------------------------------------------------------------------

const ONE_DAY = { dates: { numDays: 1 } };
const oneDayPlan = (label, stops) => ({ days: [{ day: 1, label, stops }] });
const coverage = (plan, mobility) => evaluateItineraryCompleteness({
  itineraryData: plan,
  constraints: withMobility(mobility, ONE_DAY),
});

/** A short walk plus two distinct low-effort experiences: 30 + 60 + 45 = 135. */
const LOWER_EFFORT_BUT_COMPLETE = oneDayPlan('Canyon floor at an easy pace', [
  { name: 'Riverside Overlook', type: 'viewpoint', order: 1, duration: 30, timeWindow: 'Morning', exposureLevel: 'low' },
  { name: 'Harbor Lodge Grounds', type: 'lodge', order: 2, duration: 60, timeWindow: 'Midday', exposureLevel: 'low' },
  { name: 'Cypress Nature Center', type: 'visitor_center', order: 3, duration: 45, timeWindow: 'Afternoon', exposureLevel: 'low' },
]);

describe('generic mobility-aware coverage matrix', () => {
  test('STANDARD traveler — a single sub-threshold experience is still thin', () => {
    const result = coverage(LOWER_EFFORT_BUT_COMPLETE, { walkingTolerance: null });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('insufficient_day_coverage');
    expect(result.coveragePolicy).toBe('standard');
    expect(result.dayDiagnostics[0].coverageReasonCode).toBe('single_short_experience_supporting_only');
  });

  test('LIMITED WALKING — COMPLETE: full-day coverage passes but old fixture omits requested experiences', () => {
    const result = coverage(LOWER_EFFORT_BUT_COMPLETE, {});
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(['missing_requested_experience_coverage', 'missing_requested_scenic_drive', 'missing_requested_hike']);
    expect(result.dayDiagnostics).toEqual([]);
    expect(result.coveragePolicy).toBe('mobility_limited');
  });

  test('LIMITED WALKING — THIN: one short experience and nothing else still FAILS', () => {
    const result = coverage(
      oneDayPlan('Quick look', [
        { name: 'Riverside Overlook', type: 'viewpoint', order: 1, duration: 30, timeWindow: 'Morning', exposureLevel: 'low' },
      ]),
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('insufficient_day_coverage');
    expect(result.dayDiagnostics[0].coverageReasonCode).toBe('single_short_experience_alone');
  });

  test('LIMITED WALKING — THIN: several stops that never reach the content floor FAIL', () => {
    // 30 + 15 = 45 minutes. Two named places is not by itself a day.
    const result = coverage(
      oneDayPlan('Quick look', [
        { name: 'Riverside Overlook', type: 'viewpoint', order: 1, duration: 30, timeWindow: 'Morning', exposureLevel: 'low' },
        { name: 'Harbor Lodge Grounds', type: 'lodge', order: 2, duration: 15, timeWindow: 'Midday', exposureLevel: 'low' },
      ]),
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('insufficient_day_coverage');
    expect(result.dayDiagnostics[0].coverageReasonCode).toBe('limited_walking_day_below_content_floor');
  });

  test('LIMITED WALKING — PADDING: repeating a stop cannot buy the content floor', () => {
    // 30 + 30 genuine = 60 minutes, short of the floor. The third stop repeats
    // the second with no structural evidence of a different visit, taking the
    // raw total to 120. It contributes NOTHING: the day still fails. Padding is
    // not a completeness workaround.
    const stops = [
      { name: 'Riverside Overlook', type: 'viewpoint', order: 1, duration: 30, timeWindow: 'Morning', exposureLevel: 'low' },
      { name: 'Harbor Lodge Grounds', type: 'lodge', order: 2, duration: 30, timeWindow: 'Midday', exposureLevel: 'low' },
    ];
    const genuine = coverage(oneDayPlan('Canyon floor at an easy pace', stops), {});
    const padded = coverage(
      oneDayPlan('Canyon floor at an easy pace', [
        ...stops,
        { name: 'Harbor Lodge Grounds', type: 'lodge', order: 3, duration: 60, timeWindow: 'Midday', exposureLevel: 'low' },
      ]),
      {},
    );
    expect(genuine.ok).toBe(false);
    expect(padded.ok).toBe(false);
    expect(padded.reasonCodes).toContain('insufficient_day_coverage');
    expect(padded.dayDiagnostics[0].coverageReasonCode).toBe('limited_walking_day_below_content_floor');
  });

  test('LIMITED WALKING — PADDING: a renamed copy of the same walk is still a duplicate', () => {
    const result = coverage(
      oneDayPlan('Canyon floor at an easy pace', [
        { name: 'Riverside Overlook', type: 'viewpoint', order: 1, duration: 45, timeWindow: 'Morning', exposureLevel: 'low' },
        { name: 'Riverside Overlook', type: 'viewpoint', order: 2, duration: 45, timeWindow: 'Morning', exposureLevel: 'low' },
        { name: 'Cypress Nature Center', type: 'visitor_center', order: 3, duration: 45, timeWindow: 'Afternoon', exposureLevel: 'low' },
      ]),
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('duplicate_base_experience');
  });

  test('LIMITED WALKING — a day with no experience at all is still anchor-less', () => {
    const result = coverage(
      oneDayPlan('Logistics', [
        { name: 'North Entrance Visitor Center', type: 'visitor_center', order: 1, duration: 60, timeWindow: 'Morning', exposureLevel: 'low' },
        { name: 'Harbor Lodge Grounds', type: 'lodge', order: 2, duration: 90, timeWindow: 'Midday', exposureLevel: 'low' },
      ]),
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('missing_experience_anchor');
  });

  test('NUMERIC MOBILITY — an explicit mileage limit keeps the existing semantics', () => {
    const result = coverage(LOWER_EFFORT_BUT_COMPLETE, {
      walkingTolerance: null, maxWalkMilesPerSegment: 1,
    });
    expect(result.coveragePolicy).toBe('numeric_mobility');
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('insufficient_day_coverage');
    // The numeric constraint is a per-stop ELIGIBILITY rule and stays one.
    expect(resolveCoveragePolicy(withMobility({ maxWalkMilesPerSegment: 0.5 }))).toBe('numeric_mobility');
  });

  test('a number BEATS the non-numeric tolerance when a traveler supplies both', () => {
    // DELIBERATE AND DOCUMENTED. A traveler who gave an actual mileage is judged
    // by the numeric rules that already exist, unchanged, even if the same turn
    // also carried `walkingTolerance = limited`. This is the conservative
    // reading of "existing numeric behaviour preserved"; if the combined case
    // should instead get the limited-walking coverage shape, the single line to
    // change is the order of the two checks in `resolveCoveragePolicy`.
    const both = withMobility({ walkingTolerance: 'limited', maxWalkMilesPerSegment: 1 }, ONE_DAY);
    expect(resolveCoveragePolicy(both)).toBe('numeric_mobility');
    expect(evaluateItineraryCompleteness({
      itineraryData: LOWER_EFFORT_BUT_COMPLETE, constraints: both,
    }).reasonCodes).toContain('insufficient_day_coverage');
  });

  test('PACE — relaxed pace ALONE never bypasses completeness', () => {
    const relaxed = evaluateItineraryCompleteness({
      itineraryData: LOWER_EFFORT_BUT_COMPLETE,
      constraints: {
        ...withMobility({ walkingTolerance: null }, ONE_DAY),
        pace: 'relaxed',
        preferences: { ...LIMITED_WALKING_CONSTRAINTS.preferences, pace: 'relaxed' },
      },
      userPrompt: 'Please keep it more relaxed and less rushed.',
    });
    expect(relaxed.coveragePolicy).toBe('standard');
    expect(relaxed.ok).toBe(false);
    expect(relaxed.reasonCodes).toContain('insufficient_day_coverage');
  });

  test('PACE + LIMITED WALKING — the mobility fact is what earns the different question', () => {
    const both = evaluateItineraryCompleteness({
      itineraryData: LOWER_EFFORT_BUT_COMPLETE,
      constraints: {
        ...withMobility({}, ONE_DAY),
        pace: 'relaxed',
        preferences: { ...LIMITED_WALKING_CONSTRAINTS.preferences, pace: 'relaxed' },
      },
    });
    expect(both.coveragePolicy).toBe('mobility_limited');
    expect(both.ok).toBe(false);
    expect(both.reasonCodes).toEqual(['missing_requested_experience_coverage', 'missing_requested_scenic_drive', 'missing_requested_hike']);
    expect(both.dayDiagnostics).toEqual([]);
  });

  test('the "short day" label is NOT how a limited-walking day passes', () => {
    // Relabelling still works for genuinely light days (unchanged behaviour),
    // but the mobility policy never needs it — and never writes it. A limited
    // walking preference is not a request for a shorter trip.
    const thin = oneDayPlan('Quick look', [
      { name: 'Riverside Overlook', type: 'viewpoint', order: 1, duration: 30, timeWindow: 'Morning', exposureLevel: 'low' },
    ]);
    expect(coverage(thin, {}).ok).toBe(false);
    const complete = coverage(LOWER_EFFORT_BUT_COMPLETE, {});
    expect(complete.ok).toBe(false);
    expect(complete.reasonCodes).toEqual(['missing_requested_experience_coverage', 'missing_requested_scenic_drive', 'missing_requested_hike']);
    expect(complete.dayDiagnostics).toEqual([]);
    // Nothing in the passing plan's labels resembles a light-day hint.
    expect(LOWER_EFFORT_BUT_COMPLETE.days[0].label).toBe('Canyon floor at an easy pace');
    expect(LOWER_EFFORT_BUT_COMPLETE.days[0].label).not.toMatch(/short day|half[- ]day|rest day/i);
  });

  test('the repair instruction for a limited-walking day never asks for more walking', () => {
    const failing = coverage(
      oneDayPlan('Quick look', [
        { name: 'Riverside Overlook', type: 'viewpoint', order: 1, duration: 30, timeWindow: 'Morning', exposureLevel: 'low' },
        { name: 'Harbor Lodge Grounds', type: 'lodge', order: 2, duration: 15, timeWindow: 'Midday', exposureLevel: 'low' },
      ]),
      {},
    );
    const text = buildCompletenessRepairInstructions({
      reasonCodes: failing.reasonCodes,
      dayDiagnostics: failing.dayDiagnostics,
      coveragePolicy: failing.coveragePolicy,
    });
    expect(text).toMatch(/do NOT lengthen a walk/);
    expect(text).toMatch(/do NOT add a hike/);
    expect(text).toMatch(/unknown-exposure/i);
    // The standard wording, which does ask for a substantial anchor, is not used.
    expect(text).not.toMatch(/one substantial experiential anchor/);
  });
});

// ---------------------------------------------------------------------------
// 3. NO INVENTED MILEAGE — through finalize and the persisted projection
// ---------------------------------------------------------------------------

describe('non-numeric limited walking never becomes a number', () => {
  test('maxWalkMilesPerSegment stays null through finalize and the result envelope', async () => {
    const result = await replayPatchTurn({ patch: PATCH_ATTEMPT_3 });

    expect(result.status).toBe('complete');
    // The canonical constraint state the turn ran on is untouched.
    expect(LIMITED_WALKING_CONSTRAINTS.mobility.maxWalkMilesPerSegment).toBeNull();
    expect(LIMITED_WALKING_CONSTRAINTS.mobility.walkingTolerance).toBe('limited');

    // Nothing anywhere in the produced artifact asserts a walking distance.
    const serialized = JSON.stringify(result.canonicalPlan);
    expect(serialized).not.toMatch(/maxWalkMilesPerSegment/);
    expect(serialized).not.toMatch(/distanceMiles"\s*:\s*[0-9]/);
    for (const day of result.canonicalPlan.days) {
      for (const stop of day.stops) {
        expect(stop.distanceMiles ?? null).toBeNull();
      }
    }
    // And the policy that let the day pass is the NON-numeric one.
    expect(resolveCoveragePolicy(LIMITED_WALKING_CONSTRAINTS)).toBe('mobility_limited');
  });

  test('coverage never certifies an unknown-eligibility stop to buy itself a day', async () => {
    // A limited-walking day that is one stop short, offered a companion whose
    // exposure cannot be established under `avoidExposure = true`. Operational
    // eligibility stays authoritative: the turn fails rather than accepting it.
    const thickenWithUnknown = {
      response: 'Adding an extra stop to fill out the day.',
      operations: [{
        op: 'update_stop',
        dayNumber: 2,
        stopName: 'Zion Nature Center',
        stop: { name: 'Unverified Ridge Path', type: 'trail', duration: 45, exposureLevel: null },
      }],
    };
    const result = await replayPatchTurn({ patch: thickenWithUnknown });
    const telemetry = summarizeV2Telemetry(result);

    expect(result.status).toBe('failed');
    expect(telemetry.attempts[0].validationStage).toBe('operational_eligibility');
    expect(telemetry.attempts[0].validationReasonCodes).toContain('constraint_eligibility_unknown');
  });
});

// ---------------------------------------------------------------------------
// 4. REQUIRED-MUTATION FAILURE MESSAGE
//
// When a REQUIRED itinerary_patch ultimately fails, the traveler must be told
// their saved plan was not changed — whatever the terminal reason — and the
// internal reason must survive intact in telemetry.
// ---------------------------------------------------------------------------

const NOT_APPLIED = /couldn't apply that change to your saved itinerary, so your current plan has not been changed/i;
const GENERIC_OUTAGE = /I couldn't complete this request/i;

/** A patch that leaves day 2 genuinely thin even for a limited-walking traveler. */
const THINS_THE_DAY = {
  response: 'Trimming the day right down.',
  operations: [
    { op: 'update_stop', dayNumber: 2, stopName: 'Lower Emerald Pool Trail', stop: { duration: 20 } },
    { op: 'update_stop', dayNumber: 2, stopName: 'Zion Lodge area', stop: { duration: 10 } },
    { op: 'update_stop', dayNumber: 2, stopName: 'Zion Nature Center', stop: { duration: 10 } },
  ],
};

describe('required-mutation failure message', () => {
  test('MODE 1 — validation exhausted: explicit not-applied, reason preserved', async () => {
    const result = await replayPatchTurn({ patch: THINS_THE_DAY });
    const telemetry = summarizeV2Telemetry(result);

    expect(result.status).toBe('failed');
    expect(result.response.text).toMatch(NOT_APPLIED);
    expect(result.response.text).not.toMatch(GENERIC_OUTAGE);
    // Never claims success, and attaches no plan it did not write.
    expect(result.response.text).not.toMatch(/\b(saved|updated) (?:your|the) (?:trip|plan)\b/i);
    expect(result.canonicalPlan).toBeNull();
    expect(telemetry.hasPlan).toBe(false);

    // TELEMETRY IS NOT MASKED.
    expect(result.terminalReason).toBe('routing_exhausted');
    expect(result.validation.status).toBe('fail');
    expect(result.validation.reasonCodes).toContain('insufficient_day_coverage');
    expect(telemetry.attempts[0].validationStage).toBe('itinerary_completeness');
    expect(result.artifactFulfillment).toMatchObject({
      required: true, fulfilled: false, degraded: true, reasonCode: 'patch_not_applied',
    });
  });

  test('MODE 2 — routing exhausted on a hard-constraint failure: explicit not-applied', async () => {
    const unknownExposure = {
      ...PATCH_ATTEMPT_3,
      operations: PATCH_ATTEMPT_3.operations.map((op) => (
        op.dayNumber === 2 ? { ...op, stop: { ...op.stop, exposureLevel: null } } : op
      )),
    };
    const result = await replayPatchTurn({ patch: unknownExposure });

    expect(result.status).toBe('failed');
    expect(result.terminalReason).toBe('routing_exhausted');
    expect(result.response.text).toMatch(NOT_APPLIED);
    expect(summarizeV2Telemetry(result).attempts[0].validationStage).toBe('operational_eligibility');
  });

  test('MODE 3 — live budget guard blocked: explicit not-applied, budget reason kept', async () => {
    // A guard that refuses every dispatch. A refused dispatch is not an outage,
    // and it is not a silent success either.
    let blocked = 0;
    const refusingGuard = {
      assess: () => {
        blocked += 1;
        return { dispatchAllowed: false, blockReason: 'live_budget_exhausted', ticket: null };
      },
      record: () => ({}),
      snapshot: () => ({ blockedDispatches: blocked }),
    };
    const result = await replayPatchTurn({ patch: PATCH_ATTEMPT_3, liveBudget: refusingGuard });

    expect(result.status).toBe('failed');
    expect(result.terminalReason).toBe('live_budget_guard_blocked');
    expect(result.response.text).toMatch(NOT_APPLIED);
    expect(result.artifactFulfillment.reasonCode).toBe('patch_not_applied');
  });

  test('MODE 4 — provider unavailable: explicit not-applied', async () => {
    const result = await replayPatchTurn({ patch: PATCH_ATTEMPT_3, providerError: 'provider_unavailable' });

    expect(result.status).toBe('failed');
    expect(result.terminalReason).toBe('provider_unavailable');
    expect(result.response.text).toMatch(NOT_APPLIED);
    expect(result.canonicalPlan).toBeNull();
  });

  test('MODE 5 — truth/safety failure: saved-plan-not-changed only, no recommendation', async () => {
    // The patch prose certifies safety it cannot support. The turn must not
    // deliver that advice, and the not-applied message must carry NO travel
    // recommendation of its own — it states the saved plan is unchanged and stops.
    const unsafeProse = {
      ...PATCH_ATTEMPT_3,
      response: "The Pa'rus Trail walk has no drop-offs, so it is perfect for you.",
    };
    const result = await replayPatchTurn({ patch: unsafeProse });
    const telemetry = summarizeV2Telemetry(result);

    expect(result.status).toBe('failed');
    expect(telemetry.attempts[0].validationStage).toBe('prose_constraint_safety');
    expect(result.response.text).toMatch(NOT_APPLIED);
    // None of the unsafe prose survived into the envelope.
    expect(result.response.text).not.toMatch(/drop-offs|perfect for you|Pa'rus/i);
    // And no place name is recommended at all.
    expect(result.response.text).toBe(buildArtifactNotAppliedMessage('', { planShown: false }));
  });

  test('the message the traveler actually receives comes through the route bridge', async () => {
    // `renderV2Content` is the last hop before the client. Asserting only on
    // `result.response.text` would miss a bridge that still fell through to the
    // generic outage string — which is exactly what happened live.
    const result = await replayPatchTurn({ patch: THINS_THE_DAY });
    const rendered = renderV2Content(result);
    expect(rendered).toMatch(NOT_APPLIED);
    expect(rendered).not.toMatch(GENERIC_OUTAGE);
  });

  test('MODE 6 — a successful patch is untouched: no not-applied message', async () => {
    const result = await replayPatchTurn({ patch: PATCH_ATTEMPT_3 });

    expect(result.status).toBe('complete');
    expect(result.artifactFulfillment.fulfilled).toBe(true);
    expect(result.response.text).not.toMatch(NOT_APPLIED);
    expect(result.response.text).not.toMatch(GENERIC_OUTAGE);
    expect(result.canonicalPlan).not.toBeNull();
  });

  test('the complete-but-degraded copy is unchanged and still points at the plan', () => {
    // The pre-existing `status === 'complete'` contract keeps its own wording.
    const shown = buildArtifactNotAppliedMessage('Swap the Lost Mine hike for the Window View trail.');
    expect(shown).toMatch(/the plan below has not been changed/);
    expect(shown).toContain('Window View');
    expect(shown).not.toMatch(/\b(saved|updated) (?:your|the) (?:trip|plan)\b/i);
  });

  test('an OPTIONAL artifact failure is not dressed as a failed mutation', () => {
    // Guard against over-reach: the envelope is for REQUIRED mutations only.
    expect(buildArtifactNotAppliedMessage('', { planShown: false })).toMatch(NOT_APPLIED);
    expect(buildArtifactNotAppliedMessage('')).not.toMatch(NOT_APPLIED);
  });
});

// ---------------------------------------------------------------------------
// 5. ISOLATION
// ---------------------------------------------------------------------------

describe('provider isolation across the whole replay', () => {
  test('no live provider was constructed or dispatched', () => {
    const summary = getProviderTestSummary();
    expect(summary.liveOpenAiConstructors).toBe(0);
    expect(summary.liveAnthropicConstructors).toBe(0);
    expect(summary.liveProviderDispatches).toBe(0);
    expect(summary.externalProviderHttpRequests).toBe(0);
  });
});
