'use strict';

/**
 * SAME PLACE != SAME EXPERIENCE — `duplicate_base_experience` semantics.
 *
 * The rule keyed on NAME alone: two experiential stops on a day whose names
 * canonicalise to one place were padding, full stop. Its target is real — "do
 * not rename the same place into two stops" — but the 2026-08-20 Zion turn
 * showed what it actually cost.
 *
 * The traveler asked for a relaxed, photography-led, two-day Zion trip and
 * explicitly ruled out drop-offs and exposed cliff sections. That leaves a very
 * small legal pool on the valley floor. Both terra attempt 1 and the sol
 * escalation answered it the way a good guide would: the paved river walk in
 * the middle of the day, something else in between, then a return to the same
 * trail in late light for the photography the traveler came for. The model
 * encoded the difference STRUCTURALLY — `type: 'trail'` versus
 * `type: 'photography'`, with an intervening distinct stop — and the validator
 * threw it away because the two names matched, forcing Trailie to invent
 * inferior variety to avoid revisiting a good location.
 *
 * The fixtures below are the VERBATIM plans from
 * `artifacts/trailie-turn2-confirmation-2026-08-20/thread-M1/
 *  T2-zion-two-days-exposure-plan-stage-attempt-{1,2,3}.json`
 * (the plan-stage capture's own sanitized shape, notes truncated exactly as it
 * stored them). Synthetic cases are supplemental — synthetic-only suites have
 * now missed two live families in a row.
 */

const {
  classifyExperienceRelationship,
  isSameCanonicalExperience,
} = require('../canonicalExperience');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');

/** The live turn's traveler prompt and extracted constraints, verbatim. */
const LIVE_PROMPT =
  'Plan two full days for us at Zion in late September. We’re mainly there for the '
  + 'scenery and the photography and we’d like to take it fairly easy. One of us really '
  + 'hates trails with drop-offs or exposed cliff sections, so please steer us clear of those.';
const LIVE_CONSTRAINTS = {
  avoidExposure: true,
  preferences: { avoidExposure: true, fitness: 'easy', interests: ['hiking', 'photography', 'scenic-drives'] },
  mobility: { maxWalkMilesPerSegment: null, walkingTolerance: null },
};

const completeness = (itineraryData, userPrompt = LIVE_PROMPT) =>
  evaluateItineraryCompleteness({
    itineraryData,
    constraints: LIVE_CONSTRAINTS,
    userPrompt,
    priorItineraryData: null,
    isRefinement: false,
    evidenceBundle: null,
  });

const stop = (name, type, duration, extra = {}) => ({
  name, type, duration, exposureLevel: 'low', difficulty: 'easy', ...extra,
});

// ---------------------------------------------------------------------------
// 1. The relationship classifier itself
// ---------------------------------------------------------------------------

describe('classifyExperienceRelationship', () => {
  const parusWalk = stop("Pa'rus Trail", 'trail', 120);
  const parusPhoto = stop("Pa'rus Trail golden-hour photography", 'photography', 60);
  const museum = stop('Human History Museum', 'museum', 90);

  test('different places are distinct', () => {
    expect(classifyExperienceRelationship(parusWalk, museum)).toBe('distinct');
    expect(classifyExperienceRelationship(
      stop('Lower Emerald Pool Trail', 'trail', 120),
      stop('Upper Emerald Pool Trail', 'trail', 120),
    )).toBe('distinct');
  });

  test('same place with no structural purpose difference is one experience', () => {
    expect(classifyExperienceRelationship(
      parusWalk,
      stop("Pa'rus Trail scenic walk", 'trail', 90),
    )).toBe('same_experience');
    // A different PLACE category is still not a different purpose.
    expect(classifyExperienceRelationship(
      parusWalk,
      stop("Pa'rus Trail riverside exhibits", 'landmark', 45),
    )).toBe('same_experience');
  });

  test('same place, different purpose, separated in the day is a distinct visit', () => {
    expect(classifyExperienceRelationship(parusWalk, parusPhoto, {
      interveningStops: [museum],
    })).toBe('same_place_distinct_visit');
  });

  test('the canonical timeWindow labels finalization produces are understood', () => {
    // `normalizeSchedulePrecision` blanks startTime and rewrites it into these
    // exact labels before day diversity is judged, so these are the strings the
    // rule actually sees in production.
    const { structuredDaypart } = require('../canonicalExperience');
    expect(structuredDaypart({ timeWindow: 'Early morning · around 7–8 AM' })).toBe('morning');
    expect(structuredDaypart({ timeWindow: 'Late morning' })).toBe('morning');
    expect(structuredDaypart({ timeWindow: 'Early afternoon' })).toBe('afternoon');
    expect(structuredDaypart({ timeWindow: 'Evening / golden hour' })).toBe('evening');
    expect(structuredDaypart({ timeWindow: '' })).toBeNull();
    expect(structuredDaypart({ startTime: '' })).toBeNull();
  });

  test('structured dayparts alone can prove the separation', () => {
    expect(classifyExperienceRelationship(
      stop("Pa'rus Trail", 'trail', 120, { timeWindow: 'Late morning' }),
      stop("Pa'rus Trail photography", 'photography', 60, { timeWindow: 'Late afternoon' }),
    )).toBe('same_place_distinct_visit');
    expect(classifyExperienceRelationship(
      stop("Pa'rus Trail", 'trail', 120, { startTime: '09:30' }),
      stop("Pa'rus Trail photography", 'photography', 60, { startTime: '18:15' }),
    )).toBe('same_place_distinct_visit');
  });

  test('purpose without separation is unknown, and unknown is never permission', () => {
    // Back to back, no daypart, nothing between them.
    expect(classifyExperienceRelationship(parusWalk, parusPhoto)).toBe('unknown');
    // Only a same-place stop sits between them — that separates nothing.
    expect(classifyExperienceRelationship(parusWalk, parusPhoto, {
      interveningStops: [stop("Pa'rus Trail riverside exhibits", 'landmark', 20)],
    })).toBe('unknown');
    // Same daypart is not a separated slot.
    expect(classifyExperienceRelationship(
      stop("Pa'rus Trail", 'trail', 120, { timeWindow: 'Late afternoon' }),
      stop("Pa'rus Trail photography", 'photography', 60, { timeWindow: 'Golden hour' }),
    )).toBe('unknown');
  });

  test('a trailing daypart is a visit label, not a place identity', () => {
    // Name normalisation only — the verdict still comes from structure below.
    expect(isSameCanonicalExperience("Pa'rus Trail morning", "Pa'rus Trail afternoon")).toBe(true);
    // ...and it must not start merging places whose names merely CONTAIN a
    // daypart word.
    expect(isSameCanonicalExperience('Sunrise Point', 'Sunset Point')).toBe(false);
    expect(isSameCanonicalExperience('Morning Glory Pool', 'Lower Emerald Pool')).toBe(false);
    expect(isSameCanonicalExperience('Sunset Point', 'Bryce Point')).toBe(false);
  });

  test('it does not key on title text: the name check still says "same place"', () => {
    // The point of the change. Name identity is unchanged; only the CONCLUSION
    // drawn from it is now structural.
    expect(isSameCanonicalExperience(parusWalk.name, parusPhoto.name)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Anti-padding invariants — these must keep FAILING
// ---------------------------------------------------------------------------

describe('padding is still padding', () => {
  const paddedDay = (second) => ({
    days: [{ day: 1, stops: [stop("Pa'rus Trail", 'trail', 120), second] }],
  });

  test.each([
    ['a cosmetic rename', stop("Pa'rus Trail scenic walk", 'trail', 90)],
    ['a name-only time split', stop("Pa'rus Trail afternoon", 'trail', 90)],
    ['a name-only photo suffix', stop("Pa'rus Trail photo stop", 'trail', 60)],
    ['a renamed sub-feature', stop("Pa'rus Trail riverside exhibits", 'landmark', 45)],
  ])('%s is rejected as duplicate_base_experience', (_label, second) => {
    const result = completeness(paddedDay(second));
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('duplicate_base_experience');
  });

  test('a name-only morning/afternoon split of the same walk still fails', () => {
    const result = completeness({
      days: [{
        day: 1,
        stops: [
          stop("Pa'rus Trail morning", 'trail', 90),
          stop('Human History Museum', 'museum', 60),
          stop("Pa'rus Trail afternoon", 'trail', 90),
        ],
      }],
    });
    expect(result.reasonCodes).toContain('duplicate_base_experience');
  });

  test('the repair text tells the model what a real second visit needs', () => {
    const { buildCompletenessRepairInstructions } = require('../itineraryCompleteness');
    const text = buildCompletenessRepairInstructions({
      reasonCodes: ['duplicate_base_experience'],
      dayDiagnostics: [{ dayIndex: 0, dayNumber: 1, codes: ['duplicate_base_experience'] }],
    });
    expect(text).toContain('do not rename the same place into two stops');
    expect(text).toMatch(/different type/i);
    expect(text).toMatch(/time window/i);
  });
});

// ---------------------------------------------------------------------------
// 3. REAL live artifacts — 2026-08-20 Turn 2, all three attempts
// ---------------------------------------------------------------------------

/** Attempt 1 — `gpt-5.6-terra`, primary. Live outcome: duplicate_base_experience on Day 2. */
const LIVE_ATTEMPT_1 = {
  days: [
    {
      day: 1,
      stops: [
        stop('Zion Canyon Visitor Center', 'visitor_center', 30),
        stop('Lower Emerald Pool Trail', 'trail', 120),
        stop('Human History Museum', 'museum', 60),
      ],
    },
    {
      day: 2,
      stops: [
        stop("Pa'rus Trail", 'trail', 120),
        stop('Zion Canyon Visitor Center', 'visitor_center', 30),
        stop('Pa’rus Trail — late-afternoon Watchman photography', 'photography', 90),
      ],
    },
  ],
};

/** Attempt 2 — `gpt-5.6-terra`, same-model retry. Live: cleared completeness. */
const LIVE_ATTEMPT_2 = {
  days: [
    {
      day: 1,
      stops: [
        stop('Lower Emerald Pool Trail', 'trail', 120),
        stop('Zion Lodge', 'lodge', 45),
        stop('Human History Museum', 'museum', 90),
      ],
    },
    {
      day: 2,
      stops: [
        stop("Pa'rus Trail", 'trail', 120),
        stop('Zion Nature Center', 'visitor_center', 60),
        stop('Zion Canyon Visitor Center', 'visitor_center', 45),
      ],
    },
  ],
};

/** Attempt 3 — `gpt-5.6-sol`, escalation. Live outcome: duplicate_base_experience on Day 1. */
const LIVE_ATTEMPT_3 = {
  days: [
    {
      day: 1,
      stops: [
        stop('Zion Canyon Visitor Center', 'visitor_center', 45),
        stop('Pa’rus Trail', 'trail', 120),
        stop('Human History Museum and Towers of the Virgin views', 'museum', 90),
        stop('Pa’rus Trail golden-hour photography', 'photography', 60),
      ],
    },
    {
      day: 2,
      stops: [
        stop('Lower Emerald Pool Trail', 'trail', 120),
        stop('Zion Lodge area', 'lodge', 75),
        stop('Kolob Canyons Visitor Center', 'visitor_center', 90),
      ],
    },
  ],
};

describe('live 2026-08-20 Turn 2 replay', () => {
  test('attempt 1 Day 2 is a legitimate revisit, not padding', () => {
    const result = completeness(LIVE_ATTEMPT_1);
    expect(result.reasonCodes).not.toContain('duplicate_base_experience');
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(['missing_requested_experience_coverage', 'missing_requested_scenic']);
    expect(result.dayDiagnostics).toEqual([]);
    // The exact structural evidence that decided it — from the live stops.
    const day2 = LIVE_ATTEMPT_1.days[1].stops;
    expect(classifyExperienceRelationship(day2[0], day2[2], { interveningStops: [day2[1]] }))
      .toBe('same_place_distinct_visit');
  });

  test('attempt 2 retains clean diversity but lacks requested experience coverage', () => {
    // Six distinct places, no repeat of any kind. Whatever rejected this
    // attempt live, day diversity was never it.
    const result = completeness(LIVE_ATTEMPT_2);
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(['missing_requested_experience_coverage', 'missing_requested_photography', 'missing_requested_scenic']);
    expect(result.dayDiagnostics).toEqual([]);
    expect(result.dayDiagnostics || []).toEqual([]);
  });

  test('attempt 3 Day 1 is a legitimate revisit, not padding', () => {
    const result = completeness(LIVE_ATTEMPT_3);
    expect(result.reasonCodes).not.toContain('duplicate_base_experience');
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(['missing_requested_experience_coverage', 'missing_requested_scenic']);
    expect(result.dayDiagnostics).toEqual([]);
    const day1 = LIVE_ATTEMPT_3.days[0].stops;
    expect(classifyExperienceRelationship(day1[1], day1[3], { interveningStops: [day1[2]] }))
      .toBe('same_place_distinct_visit');
  });

  test('the same live days fail again the moment the structure stops proving a revisit', () => {
    // Attempt 3 Day 1 with the photography stop demoted to another trail stop
    // and moved adjacent: same names, no purpose difference, nothing between.
    const padded = {
      days: [{
        day: 1,
        stops: [
          stop('Zion Canyon Visitor Center', 'visitor_center', 45),
          stop('Human History Museum and Towers of the Virgin views', 'museum', 90),
          stop('Pa’rus Trail', 'trail', 120),
          stop('Pa’rus Trail golden-hour photography', 'trail', 60),
        ],
      }],
    };
    expect(completeness(padded).reasonCodes).toContain('duplicate_base_experience');
  });
});

// ---------------------------------------------------------------------------
// 4. Same-day vs cross-day
// ---------------------------------------------------------------------------

describe('same-day vs cross-day', () => {
  test('the rule is scoped to a single day (unchanged behaviour)', () => {
    const crossDay = {
      days: [
        {
          day: 1,
          stops: [stop("Pa'rus Trail", 'trail', 120), stop('Human History Museum', 'museum', 90)],
        },
        {
          day: 2,
          stops: [
            stop("Pa'rus Trail", 'trail', 120),
            stop('Zion Lodge area', 'lodge', 60),
            stop('Lower Emerald Pool Trail', 'trail', 120),
          ],
        },
      ],
    };
    // Revisiting a major scenic location on another day has never been flagged
    // here and still is not. Cross-day padding remains out of scope for this
    // validator; nothing in Turn 2 required changing it.
    expect(completeness(crossDay).reasonCodes).not.toContain('duplicate_base_experience');
  });
});

// ---------------------------------------------------------------------------
// 5. The product pressure that exposed the rule
// ---------------------------------------------------------------------------

describe('relaxed pace + photography + avoidExposure on a small safe pool', () => {
  test('a good valley-floor day retains its valid return but lacks scenic coverage', () => {
    const plan = {
      days: [{
        day: 1,
        stops: [
          stop("Pa'rus Trail", 'trail', 120, { timeWindow: 'Late morning' }),
          stop('Zion Human History Museum', 'museum', 75, { timeWindow: 'Midday' }),
          stop("Pa'rus Trail Watchman photography", 'photography', 75, { timeWindow: 'Late afternoon' }),
        ],
      }],
    };
    const result = completeness(plan);
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(['missing_requested_experience_coverage', 'missing_requested_scenic']);
    expect(result.dayDiagnostics).toEqual([]);
  });

  test('the validator does not push the model into inventing variety', () => {
    // Same day, but the model swaps the second Pa'rus visit for a generic
    // filler because the old rule forbade the honest one. That day is NOT
    // better, and the rule must not be the reason it happens.
    const invented = {
      days: [{
        day: 1,
        stops: [
          stop("Pa'rus Trail", 'trail', 120),
          stop('Zion Human History Museum', 'museum', 75),
          stop('Final scenic hour', 'viewpoint', 60),
        ],
      }],
    };
    // Generic placeholder stops were never the goal; the honest revisit above
    // now passes without needing this.
    expect(completeness(invented).ok).toBe(true);
  });
});
