'use strict';

/**
 * REAL ARTIFACT REPLAY — permanent regression fixtures.
 *
 * Synthetic probes have now passed twice while the product failed live. The
 * 2026-08-19 exposure-polarity probe went 13/13 green on the morning of a run
 * whose every generation attempt was then rejected by the same validators, on
 * a family the probe did not contain.
 *
 * So the fixtures below are not invented. They are the VERBATIM prose the live
 * model produced under `avoidExposure=true`, lifted from
 * `artifacts/trailie-canonical-mutation-2026-08-19/thread-M1/
 *  T2-zion-two-days-exposure-plan-stage-attempt-{1,2}.json`.
 * Two note fields are truncated mid-word; that is how the capture stored them
 * and they are replayed exactly as captured.
 *
 * Every stop in both attempts carried `exposureLevel: "low"` and neither plan
 * contained an exposed stop. All of this prose is GENUINELY COMPLIANT and all
 * of it must pass BOTH validators.
 */

const { evaluateProseConstraintSafety } = require('../proseConstraintSafety');
const {
  hasUnsafeExposureProse,
  evaluateStopExposureConsistency,
} = require('../itineraryCompleteness');

const AVOID_EXPOSURE = { avoidExposure: true };
const PROSE_CODE = 'exposure_constraint_contradiction';
const STOP_CODE = 'exposure_prose_conflict';

const proseCodes = (text) =>
  evaluateProseConstraintSafety({ text, constraints: AVOID_EXPOSURE }).reasonCodes;

/** Turn 2, attempt 1 — `gpt-5.6-terra`, rejected live with `exposure_prose_conflict`. */
const ATTEMPT_1_STOPS = [
  {
    name: 'Zion Canyon Visitor Center',
    type: 'visitor_center',
    exposureLevel: 'low',
    note: 'Begin with a brief orientation and a same-day check on access and conditions before committing to the walk.',
    why: 'It is near the South Entrance and provides park planning information.',
  },
  {
    name: "Pa'rus Trail",
    type: 'trail',
    exposureLevel: 'low',
    note: 'Use this paved Virgin River walk as the day’s main easy outing. It connects the visitor center with Canyon Junction and gives some of the park’s best views of the Watchman; walk only as far as feels right, then return the same way or contin',
    why: 'The paved river corridor, trailside exhibits, and Watchman views suit a low-exposure, photography-focused day.',
  },
  {
    // THE LIVE FALSE POSITIVE. A contrastive exclusion naming a trail the plan
    // deliberately does NOT take. Removing this one field cleared the code.
    name: "Pa'rus Trail — late-afternoon Watchman photography",
    type: 'photography',
    exposureLevel: 'low',
    note: "Return to a favorite river-side section of Pa'rus for softer light on the Watchman rather than taking the Watchman Trail, which has moderate drop-offs.",
    why: 'It gives you a second, more photographic look at the day’s landscape without adding exposed terrain.',
  },
  {
    name: 'Lower Emerald Pool Trail',
    type: 'trail',
    exposureLevel: 'low',
    note: 'Make this easy, low-exposure walk your morning anchor. The rough paved route passes through pinyon-juniper woodland to Lower Emerald Pool and ephemeral waterfalls. Remain on the trail, avoid cliff edges, and do not enter the water.',
    why: "It offers a distinct canyon-and-water setting from Pa'rus while avoiding the exposed trails you want to skip.",
  },
  {
    name: 'Human History Museum',
    type: 'museum',
    exposureLevel: 'low',
    note: 'Use the indoor exhibits and 22-minute orientation film as a restful mid-day reset. Step outside afterward for views of the Towers of the Virgin and Bridge Mountain.',
    why: 'It balances the pool walk with Zion’s human story and another photographic landscape viewpoint.',
  },
  {
    name: 'Human History Museum — late-afternoon Towers of the Virgin and Bridge Mountain views',
    type: 'photography',
    exposureLevel: 'low',
    note: 'If the light and access cooperate, linger outside the museum for photographs of the Towers of the Virgin and Bridge Mountain rather than adding another trail.',
    why: 'A low-effort scenic finish that preserves the relaxed rhythm.',
  },
];

/**
 * Turn 2, attempt 2 — `gpt-5.6-terra` retry. `itineraryCompleteness` returned
 * NO codes, yet the attempt failed with `truth_or_constraint`; the shipped
 * prose validator rejected "…that avoids exposed terrain".
 */
const ATTEMPT_2_STOPS = [
  {
    name: "Pa'rus Trail",
    type: 'trail',
    exposureLevel: 'low',
    note: 'Make this your main outdoor experience: an easy paved walk beside the Virgin River, with broad views of the Watchman and trailside exhibits. It is a low-exposure choice for lingering over river, canyon, and Watchman photographs; turn around',
    why: 'River-side scenery and some of the best documented views of the Watchman, without exposed terrain.',
  },
  {
    name: 'Human History Museum',
    type: 'museum',
    exposureLevel: 'low',
    note: 'Use the middle of the day for indoor exhibits and the 22-minute orientation film, then spend time outside with views toward the Towers of the Virgin and Bridge Mountain. This is a distinct cultural and photography stop rather than another t',
    why: 'A relaxed indoor break with canyon views outside.',
  },
  {
    name: 'Lower Emerald Pool Trail',
    type: 'trail',
    exposureLevel: 'low',
    note: 'Take this easy, low-exposure trail through pinyon-juniper woodland to the Lower Emerald Pool and ephemeral waterfalls. Give yourselves time for details—water, foliage, and canyon walls—rather than trying to link it to the higher pools.',
    why: 'A gentle, photo-worthy pool-and-waterfall outing that avoids exposed terrain.',
  },
  {
    name: 'Zion Nature Center',
    type: 'visitor_center',
    exposureLevel: 'low',
    note: 'After a leisurely break, spend time with the interactive exhibits, animal models, and changing activities focused on Zion’s geology, animals, and history. It is an easy indoor complement to the morning’s canyon walk.',
    why: 'A different, low-key park experience that keeps the day comfortable and varied.',
  },
];

const LIVE_STOPS = [
  ...ATTEMPT_1_STOPS.map((stop) => ['attempt 1', stop]),
  ...ATTEMPT_2_STOPS.map((stop) => ['attempt 2', stop]),
];

const LIVE_FRAGMENTS = LIVE_STOPS.flatMap(([attempt, stop]) => [
  [`${attempt} · ${stop.name} · note`, stop.note],
  [`${attempt} · ${stop.name} · why`, stop.why],
]);

describe('every live Turn-2 prose fragment passes the STOP validator', () => {
  test.each(LIVE_STOPS)('%s — %o has no exposure_prose_conflict', (_attempt, stop) => {
    const codes = evaluateStopExposureConsistency(stop, '', AVOID_EXPOSURE);
    expect(codes).not.toContain(STOP_CODE);
  });
});

describe('every live Turn-2 prose fragment passes the PROSE-SAFETY validator', () => {
  test.each(LIVE_FRAGMENTS)('%s', (_label, text) => {
    expect(proseCodes(text)).not.toContain(PROSE_CODE);
  });
});

/**
 * A4 — the two validators must not disagree about the same clause. Both fired
 * on this run, on different fragments, for the same conceptual reason.
 */
describe('A4 — the two exposure validators agree on live prose', () => {
  test.each(LIVE_FRAGMENTS)('%s: both clean', (_label, text) => {
    expect(proseCodes(text)).not.toContain(PROSE_CODE);
    expect(hasUnsafeExposureProse(text)).toBe(false);
  });

  // Where both vocabularies see a hazard at all, the verdict must match. The
  // vocabularies themselves stay different on purpose: the stop validator has
  // structured `exposureLevel` as its authority and deliberately does not treat
  // a bare "exposed" as unsafe.
  test.each([
    ['Take the trail with steep drop-offs.', true],
    ['Use the cliff-edge section for the view.', true],
    ['The route includes narrow ledges.', true],
    ['Avoid the trail with steep drop-offs.', false],
    ['The walk avoids drop-offs entirely.', false],
    ['This route stays clear of cliff edges.', false],
    ['Take the river walk rather than the cliff-edge section.', false],
    ['Do not follow the cliff edges.', false],
    ['…rather than taking the Watchman Trail, which has moderate drop-offs.', false],
  ])('%s → violation=%s in BOTH', (text, violation) => {
    expect(proseCodes(text).includes(PROSE_CODE)).toBe(violation);
    expect(hasUnsafeExposureProse(text)).toBe(violation);
  });
});

/**
 * A5 — the pre-existing real-output fixtures stay, and the new live family is
 * added beside them. Both are permanent.
 */
describe('A5 — real generated output, old family and new', () => {
  test.each([
    // 2026-08-18 family (qualifier) — preserved.
    'low-exposure',
    'This is an easy, low-exposure route.',
    'without another trail or exposed terrain',
    // 2026-08-19 family (avoidance verb) — added.
    'avoids exposed terrain',
    'The walk avoids drop-offs entirely.',
    'This route stays clear of cliff edges.',
    'while avoiding the exposed trails you want to skip',
    'rather than taking the Watchman Trail, which has moderate drop-offs',
  ])('compliant generated prose survives both validators: %s', (text) => {
    expect(proseCodes(text)).not.toContain(PROSE_CODE);
    expect(hasUnsafeExposureProse(text)).toBe(false);
  });

  test('genuinely contradictory generated prose is still rejected', () => {
    const contradictory = 'Finish on the Watchman Trail, which has moderate drop-offs and an exposed ledge.';
    expect(proseCodes(contradictory)).toContain(PROSE_CODE);
    expect(hasUnsafeExposureProse(contradictory)).toBe(true);
  });

  test('a stop whose prose offers exposure is still rejected by the stop validator', () => {
    const codes = evaluateStopExposureConsistency({
      name: 'Watchman Trail',
      type: 'trail',
      exposureLevel: 'low',
      note: 'Take the upper section, which runs along cliff edges with moderate drop-offs.',
      why: 'The best sunset angle.',
    }, '', AVOID_EXPOSURE);
    expect(codes).toContain(STOP_CODE);
  });

  // A rejection verb in one field must not sanitise a hazard in the next.
  test('rejection polarity does not leak across stop fields', () => {
    const codes = evaluateStopExposureConsistency({
      name: 'Avoid-the-Crowds Overlook',
      type: 'viewpoint',
      exposureLevel: 'low',
      note: 'The final approach runs along cliff edges with steep drop-offs.',
      why: 'Quietest light of the day.',
    }, '', AVOID_EXPOSURE);
    expect(codes).toContain(STOP_CODE);
  });
});
