'use strict';

/**
 * Prose constraint stance / polarity — offline fixtures.
 *
 * Mentions of a prohibited experience are not contradictions when the
 * assistant REJECTS, WARNS ABOUT, or CONTRASTS AGAINST them. Only a positive
 * recommendation or direction toward the conflicting experience fails.
 *
 * No destination-specific rules live in production code. Place names below are
 * fixture text only.
 */

const {
  evaluateProseConstraintSafety,
} = require('../proseConstraintSafety');
const {
  hasRecommendedHazard,
  analyzeHazardStances,
} = require('../hazardRejectionSemantics');
const {
  commitUnderstoodTripChange,
} = require('../../services/tripMutationCommit');
const { emptyPlanningState } = require('../planningState');

const EXPOSURE = { avoidExposure: true };
const CONTRADICTION = 'exposure_constraint_contradiction';

const CAPTURED_SUNRISE_PROSE =
  "I'd make **Pa'rus–Diversion Dam** your first sunrise photography stop. "
  + 'NPS lists it as an easy, low-exposure walk with a viewpoint, so it fits '
  + 'your preference to avoid scary exposed hikes. I can’t verify the sunrise '
  + 'light there for your September 2027 dates, but it’s a better fit for you '
  + 'than Canyon Overlook, which NPS describes as rocky, uneven, and near long '
  + 'drop-offs.';

/** Exact Sol prose from the 2026-09-28 sunrise paid rerun (colon false positive). */
const CAPTURED_SUNRISE_PROSE_RERUN =
  "I'd make an early visit to **Pa'rus–Diversion Dam** your photography priority. "
  + 'The NPS lists it as an easy, low-exposure walk and viewpoint, so it fits '
  + "your preference to avoid scary hikes. I couldn't verify its sunrise "
  + "sightline, though, so I wouldn't count on a particular shot.\n\n"
  + "I'd keep Canyon Overlook off your photo plan: the NPS describes long "
  + 'drop-offs there, even though most are fenced.';

function codes(text, constraints = EXPOSURE) {
  return evaluateProseConstraintSafety({ text, constraints }).reasonCodes;
}

function result(text, constraints = EXPOSURE) {
  return evaluateProseConstraintSafety({ text, constraints });
}

describe('prose stance — safe recommendation + exposed alternative rejected', () => {
  test('1. safe pick contrasted with exposed alternative → PASS', () => {
    const text =
      "I'd use the riverside viewpoint instead of Canyon Overlook because the latter has exposed drop-offs.";
    const r = result(text);
    expect(r.ok).toBe(true);
    expect(r.reasonCodes).not.toContain(CONTRADICTION);
    const dropOff = r.stanceDiagnostics.find((d) => /drop-?offs?/i.test(d.phrase));
    expect(dropOff).toMatchObject({
      assistantStance: 'EXPLICIT_AVOIDANCE',
      contradiction: false,
    });
  });

  test('2. exposed alternative recommended → FAIL', () => {
    expect(codes('Canyon Overlook has exposed drop-offs, but I\'d still make it your sunrise stop.'))
      .toContain(CONTRADICTION);
    expect(codes('Go to the exposed ridge at sunrise.')).toContain(CONTRADICTION);
  });

  test('3. skip X because it is exposed → PASS', () => {
    expect(codes('I would skip that trail because the ledge is exposed.')).not.toContain(CONTRADICTION);
    expect(codes('Skip the exposed ridge.')).not.toContain(CONTRADICTION);
  });

  test('4. X is exposed but worth it → FAIL', () => {
    expect(codes('The overlook is exposed but worth it.')).toContain(CONTRADICTION);
    expect(codes('B has exposure, but I still recommend hiking it.')).toContain(CONTRADICTION);
  });

  test('5. comparative A instead of B because B violates preference → PASS', () => {
    expect(codes('Choose A rather than B because B has drop-offs.')).not.toContain(CONTRADICTION);
    expect(codes('Pick the river walk over the ridge because the ridge has drop-offs.'))
      .not.toContain(CONTRADICTION);
  });

  test('6. neutral/non-offer mention of exposed option → PASS when rejection-framed', () => {
    // Unqualified "there are drop-offs" still fails closed (default = offer).
    // Architecture permits a non-offer when rejection/absence framing is clear.
    expect(codes(
      'I am not offering the overlook with drop-offs; it stays off your plan.',
    )).not.toContain(CONTRADICTION);
    expect(codes('Some overlooks have drop-offs.')).toContain(CONTRADICTION);
  });

  test('7. ambiguous recommendation of exposed option → fail closed', () => {
    expect(codes('The exposed ridge is also an option.')).toContain(CONTRADICTION);
    expect(codes('You could try the ledge with drop-offs if you want.')).toContain(CONTRADICTION);
  });

  test('8. mixed list — only safe options currently recommended → PASS', () => {
    const text =
      'A is my recommendation for sunrise. Skip B — it has drop-offs. '
      + 'C stays off the plan unless you change your exposure preference later; '
      + 'I am not recommending it now.';
    expect(codes(text)).not.toContain(CONTRADICTION);
  });
});

describe('prose stance — polarity across other durable constraints', () => {
  const STAIRS = /\b(?:stairs?|stairways?|steps)\b/i;
  const STRENUOUS = /\b(?:strenuous|grueling|difficult hike|hard hike)\b/i;
  const LONG_DRIVE = /\b(?:long drives?|hours? of driving|lengthy drives?)\b/i;

  test('9. negative wheelchair/stairs comparison → PASS', () => {
    expect(hasRecommendedHazard(
      "I wouldn't choose that because it requires stairs.",
      STAIRS,
    )).toBe(false);
  });

  test('10. negative strenuous-hike comparison → PASS', () => {
    expect(hasRecommendedHazard(
      "I wouldn't choose that because it is a strenuous hike.",
      STRENUOUS,
    )).toBe(false);
    expect(codes(
      "I wouldn't choose that strenuous hike under your no-hiking preference.",
      { activityPreferences: { hiking: 'none' } },
    )).not.toContain('hiking_constraint_contradiction');
  });

  test('11. negative long-drive comparison → PASS', () => {
    expect(hasRecommendedHazard(
      "I wouldn't choose that because it needs a long drive.",
      LONG_DRIVE,
    )).toBe(false);
  });
});

describe('captured sunrise preference-only prose replay (offline)', () => {
  test('13–15. captured Sol contrastive sunrise prose passes; no model call', () => {
    const r = result(CAPTURED_SUNRISE_PROSE);
    expect(r.ok).toBe(true);
    expect(r.reasonCodes).not.toContain(CONTRADICTION);

    const dropOff = r.stanceDiagnostics.find((d) => /drop-?offs?/i.test(d.phrase));
    expect(dropOff).toMatchObject({
      constraint: 'avoidExposure',
      assistantStance: 'EXPLICIT_AVOIDANCE',
      contradiction: false,
    });
    const lowExposure = r.stanceDiagnostics.find(
      (d) => d.phrase.toLowerCase() === 'exposure' && d.assistantStance === 'NEUTRAL_DESCRIPTION',
    );
    expect(lowExposure?.contradiction).toBe(false);

    const avoided = r.stanceDiagnostics.find(
      (d) => d.phrase.toLowerCase() === 'exposed',
    );
    expect(avoided).toMatchObject({
      assistantStance: 'EXPLICIT_AVOIDANCE',
      contradiction: false,
    });
  });

  test('paid-rerun colon prose: keep-off rejection inherits across colon', () => {
    const r = result(CAPTURED_SUNRISE_PROSE_RERUN);
    expect(r.ok).toBe(true);
    expect(r.reasonCodes).not.toContain(CONTRADICTION);
    const dropOff = r.stanceDiagnostics.find((d) => /drop-?offs?/i.test(d.phrase));
    expect(dropOff).toMatchObject({
      assistantStance: 'EXPLICIT_AVOIDANCE',
      contradiction: false,
      boundary: 'colon',
      relation: 'EXPLANATION',
    });
  });

  test('diagnostics distinguish recommended vs rejected hazard targets', () => {
    const stances = analyzeHazardStances(
      'Take the river walk; skip the ridge with drop-offs.',
      /\b(?:drop[- ]?offs?|exposed)\b/i,
    );
    expect(stances.every((s) => s.contradiction === false)).toBe(true);
    expect(stances.some((s) => s.stance === 'EXPLICIT_AVOIDANCE')).toBe(true);
  });
});

describe('discourse-boundary rejection inheritance', () => {
  test.each([
    ['1 colon skip', 'Skip B: it has drop-offs.'],
    ['2 colon keep-off', 'Keep B off your plan: the trail is exposed.'],
    ['3 dash', "I wouldn't choose B — it has exposed ledges."],
    ['4 semicolon', 'Avoid B; it is exposed.'],
    ['5 period anaphora', "I wouldn't choose B. It has exposed ledges."],
    ['6 bullets', 'Skip B:\n- exposed ledges\n- narrow footing'],
    ['7 choose over', 'Choose A over B: B has drop-offs.'],
    ['8 safer than', 'A is safer than B: B has exposed ledges.'],
  ])('%s → PASS', (_id, text) => {
    expect(codes(text)).not.toContain(CONTRADICTION);
  });

  test('9 avoid B then recommend C with hazard → FAIL for C', () => {
    expect(codes('Avoid B. C has drop-offs and I recommend C.')).toContain(CONTRADICTION);
  });

  test('10 reject then re-recommend same entity → FAIL', () => {
    expect(codes("Avoid B because it's exposed. But B is still my favorite sunrise option."))
      .toContain(CONTRADICTION);
  });

  test('11 neutral hazard mention → fail closed', () => {
    expect(codes('B has drop-offs.')).toContain(CONTRADICTION);
  });

  test('12–13 positive despite exposure → FAIL', () => {
    expect(codes('B is exposed but worth it.')).toContain(CONTRADICTION);
    expect(codes('B is exposed; just be careful.')).toContain(CONTRADICTION);
  });

  test('14 multiple rejected + one safe recommendation → PASS', () => {
    expect(codes(
      'Use the riverside walk for sunrise. Skip B — it has drop-offs. '
      + 'Keep C off the plan: exposed ledges.',
    )).not.toContain(CONTRADICTION);
  });

  test('15 pronoun continuation resolves → PASS', () => {
    expect(codes('Avoid the ridge. It has narrow ledges.')).not.toContain(CONTRADICTION);
  });

  test('16 ambiguous pronoun after new entity offer → fail closed', () => {
    // After recommending C, "it has drop-offs" is an offer of C's hazard.
    expect(codes('Avoid B. Visit C next. It has drop-offs.')).toContain(CONTRADICTION);
  });

  test('17 new paragraph explanation retains rejection', () => {
    expect(codes("I'd keep B off your list:\n\nThe route has exposed sections."))
      .not.toContain(CONTRADICTION);
  });

  test('18 clear discourse reset ends inheritance', () => {
    expect(codes('Avoid B because of drop-offs. However, take the exposed ledge at C.'))
      .toContain(CONTRADICTION);
  });

  test('19–21 other constraints inherit across boundaries', () => {
    expect(hasRecommendedHazard(
      "I wouldn't choose that: it requires stairs.",
      /\b(?:stairs?|steps)\b/i,
    )).toBe(false);
    expect(hasRecommendedHazard(
      "I wouldn't choose that — it is a strenuous hike.",
      /\b(?:strenuous|grueling)\b/i,
    )).toBe(false);
    expect(hasRecommendedHazard(
      "I wouldn't choose that. It needs a long drive.",
      /\b(?:long drives?|hours? of driving)\b/i,
    )).toBe(false);
  });
});

describe('preference-only travelerJob observation guard', () => {
  test('sunrise preference message stays plain_answer ceiling; destination not cleared', () => {
    const { buildTurnUnderstanding } = require('../../services/turnUnderstanding');
    const { deriveExecutionContract } = require('../../services/trailieExecutionContract');
    const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');
    const { resolveTravelerJob } = require('../../services/trailieTravelerJobResolver');

    const prior = emptyPlanningState();
    prior.destination.parkCode = 'zion';
    prior.destination.parkName = 'Zion';
    prior.preferences.avoidExposure = true;
    prior.dates.startDate = '2027-09-12';
    prior.dates.endDate = '2027-09-17';
    prior.dates.durationDays = 4;
    prior.hasActiveTrip = true;
    prior.hasItinerary = true;
    prior.existingCanonicalPlan = { days: [{ dayNumber: 1, stops: [{ name: 'Pa\'rus Trail' }] }] };

    const message = 'I really like sunrise photography.';
    const understanding = buildTurnUnderstanding({
      userPrompt: message,
      priorTripState: prior,
    });
    const legacy = classifyTrailieIntent({ message, hasPriorPlan: true });
    const job = resolveTravelerJob({
      userPrompt: message,
      understanding,
      priorTripState: prior,
    });
    const contract = deriveExecutionContract({
      understanding,
      travelerJob: job.job,
      legacy,
      hasPriorPlan: true,
    });

    // Observation only: a broad place_discovery label must not raise the
    // artifact ceiling above plain_answer or clear the active destination.
    expect(contract.requiresCanonicalPlanArtifact).toBe(false);
    expect(contract.allowsCanonicalPlanArtifact).toBe(false);
    expect(['plain_answer', null]).toContain(contract.requestedArtifact);
    expect(prior.destination.parkCode).toBe('zion');

    const committed = commitUnderstoodTripChange({
      message,
      planningState: prior,
    });
    expect(committed.planningState.destination.parkCode).toBe('zion');
    expect(committed.planningState.preferences.avoidExposure).toBe(true);
    expect(committed.planningState.activityPreferences.photographyTiming).toBe('sunrise');
  });
});

describe('preference extraction succeeds independently of prose render failure', () => {
  function stateWithZion() {
    const state = emptyPlanningState();
    state.destination.parkName = 'Zion';
    state.dates.startDate = '2027-09-12';
    state.dates.endDate = '2027-09-17';
    state.dates.durationDays = 4;
    state.dates.tripWindowDays = 6;
    return state;
  }

  test('durable sunrise + avoidExposure persist even when a later prose check would fail', () => {
    // Existing transactional semantics: commitUnderstoodTripChange runs before
    // answer-render validation. Preference facts are durable user state; a
    // traveler-facing prose gate failure does not roll them back.
    const exposure = commitUnderstoodTripChange({
      message: "My girlfriend doesn't like scary exposed hikes.",
      planningState: stateWithZion(),
    });
    const photo = commitUnderstoodTripChange({
      message: 'I really like sunrise photography.',
      planningState: exposure.planningState,
    });
    expect(photo.planningState.preferences.avoidExposure).toBe(true);
    expect(photo.planningState.activityPreferences).toMatchObject({
      photography: true,
      photographyTiming: 'sunrise',
    });
    expect(photo.planningState.preferences.interests || []).toEqual(
      expect.arrayContaining(['photography']),
    );

    // Simulated unsafe render after successful extraction — state already committed.
    const unsafeRender = result(
      'Go to the exposed ridge at sunrise for the best shots.',
    );
    expect(unsafeRender.ok).toBe(false);
    expect(unsafeRender.reasonCodes).toContain(CONTRADICTION);
    expect(photo.planningState.preferences.avoidExposure).toBe(true);
    expect(photo.planningState.activityPreferences.photographyTiming).toBe('sunrise');
  });

  test('preference-only path does not require an itinerary patch to satisfy prose safety', () => {
    const r = result(CAPTURED_SUNRISE_PROSE);
    expect(r.ok).toBe(true);
    // No second model call / polarity correction dispatch is part of this
    // offline validator — stance is resolved deterministically in-process.
  });
});

describe('hard-constraint enforcement remains strict', () => {
  test('positive recommendation of moderate/high exposure still fails', () => {
    expect(codes('Take the moderately exposed scramble at sunrise.')).toContain(CONTRADICTION);
    expect(codes('The chain section is the fun part.')).toContain(CONTRADICTION);
  });

  test('encouraging the traveler to just be careful still fails when exposure is offered', () => {
    expect(codes('Take the exposed ledge — just be careful.')).toContain(CONTRADICTION);
  });

  test('offering the prohibited option as an equivalent choice still fails', () => {
    expect(codes(
      'Either the riverside walk or the exposed ridge works equally well for sunrise.',
    )).toContain(CONTRADICTION);
  });
});
