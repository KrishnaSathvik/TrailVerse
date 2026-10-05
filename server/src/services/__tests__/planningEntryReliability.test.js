'use strict';

/**
 * PLANNING ENTRY RELIABILITY — regression suite for the deterministic entry path.
 *
 * Every case below is real traveler wording taken from a live gate transcript
 * (2026-08-17 broad gate, 2026-08-23 anything-question gate). None of it is
 * rewritten to be easier to parse; the parsing is the thing under test.
 *
 * Offline only: pure functions, no network, no model, no provider.
 */

const {
  buildTurnUnderstanding,
  resolveTemporalScope,
} = require('../turnUnderstanding');
const { resolveDestinationRelationship } = require('../../utils/destinationRelationship');
const { buildTripScopeFromMessage } = require('../../utils/roadTripContract');

const crla = { entityId: 'nps:park:crla', parkCode: 'crla', displayName: 'Crater Lake', entityType: 'national_park', latitude: 42.944, longitude: -122.109 };
const noca = { entityId: 'nps:park:noca', parkCode: 'noca', displayName: 'North Cascades', entityType: 'national_park', latitude: 48.771, longitude: -121.298 };
const jotr = { entityId: 'nps:park:jotr', parkCode: 'jotr', displayName: 'Joshua Tree', entityType: 'national_park', latitude: 33.873, longitude: -115.9 };
const sagu = { entityId: 'nps:park:sagu', parkCode: 'sagu', displayName: 'Saguaro', entityType: 'national_park', latitude: 32.25, longitude: -110.5 };
const brca = { entityId: 'nps:park:brca', parkCode: 'brca', displayName: 'Bryce', entityType: 'national_park', latitude: 37.593, longitude: -112.187 };
const care = { entityId: 'nps:park:care', parkCode: 'care', displayName: 'Capitol Reef', entityType: 'national_park', latitude: 38.367, longitude: -111.262 };
const arch = { entityId: 'nps:park:arch', parkCode: 'arch', displayName: 'Arches', entityType: 'national_park', latitude: 38.733, longitude: -109.592 };

// ---------------------------------------------------------------------------
// A — destination relationship
// ---------------------------------------------------------------------------

describe('A1 — indecision between two parks is a CHOICE, not a combined trip', () => {
  // Gate 2026-08-23 conversation B turn 1. Produced `combine` @0.85 and a
  // stonewall: the model was never called.
  test('"going back and forth between A and B" resolves to alternative_choice', () => {
    const text = "We've got four days in September and I keep going back and forth between Crater Lake and North Cascades. We care more about scenery and easy walks than knocking out big hikes.";
    const result = resolveDestinationRelationship(text, [crla, noca]);
    expect(result.relationship).toBe('alternative_choice');
  });

  test.each([
    ["I can't decide between Acadia and Shenandoah.", 'cannot decide'],
    ["I'm on the fence between Olympic and Rainier.", 'on the fence'],
    ["We keep flip-flopping between Bryce and Zion.", 'flip-flopping'],
    ["Still undecided between Arches and Canyonlands.", 'undecided'],
  ])('%s is a choice (%s)', (text) => {
    const result = resolveDestinationRelationship(text, [crla, noca]);
    expect(result.relationship).toBe('alternative_choice');
  });

  test('distribution language still means COMBINE, not choice', () => {
    const result = resolveDestinationRelationship(
      'Split five days between Yellowstone and Grand Teton.',
      [crla, noca],
    );
    expect(result.relationship).toBe('combine');
  });
});

describe('A2 — a choice between two parks is not a multi-destination trip', () => {
  // Gate 2026-08-23 conversation I turn 1: relationship was ALREADY correct
  // (`alternative_choice`) and the turn still blocked, because trip scope type
  // was assigned from destination COUNT.
  test('choice scope is comparison_set, not multi_destination', () => {
    const contract = buildTripScopeFromMessage("Long weekend in March, and we're deciding between Joshua Tree and Saguaro. Which one?", {
      destinations: [jotr, sagu],
    });
    expect(contract.type).toBe('comparison_set');
    expect(contract.type).not.toBe('multi_destination');
  });

  test('a choice never generates inter-destination route legs', () => {
    const contract = buildTripScopeFromMessage("I'm torn between Crater Lake and North Cascades.", {
      destinations: [crla, noca],
    });
    expect(contract.routeLegs).toHaveLength(0);
  });

  test('both candidates survive as comparison candidates', () => {
    const contract = buildTripScopeFromMessage("I'm torn between Crater Lake and North Cascades.", {
      destinations: [crla, noca],
    });
    expect(contract.destinations.map((d) => d.parkCode)).toEqual(['crla', 'noca']);
  });

  test('a genuine three-park trip is still multi_destination', () => {
    const contract = buildTripScopeFromMessage("We've got six nights for Bryce, Capitol Reef and Arches. How would you divide the time?", {
      destinations: [brca, care, arch],
    });
    expect(contract.type).toBe('multi_destination');
  });

  test('an explicit road trip is still road_trip', () => {
    const contract = buildTripScopeFromMessage("We're driving from Crater Lake to North Cascades on a road trip.", {
      destinations: [crla, noca],
    });
    expect(contract.type).toBe('road_trip');
  });
});

// ---------------------------------------------------------------------------
// B — duration / visit window
// ---------------------------------------------------------------------------

describe('B1 — duration parser understands natural duration language', () => {
  test.each([
    ['three days in Big Bend', 3],
    ['three relaxed days in Big Bend', 3],
    ['three full days in Big Bend', 3],
    ['about three days in the park', 3],
    ['four days in September', 4],
    ['a five-day trip', 5],
    ['one week in Utah', 7],
    ['about a week in southern Utah', 7],
    ['Long weekend in March', 3],
    ['just a weekend', 2],
  ])('%s -> durationDays %i', (text, expected) => {
    expect(resolveTemporalScope(text).durationDays).toBe(expected);
  });
});

describe('B2 — nights are not days', () => {
  // Gate 2026-08-23 conversation G turn 1. "six nights" produced null, which
  // left G2 with no day target and failed the whole itinerary.
  test.each([
    ["we've got six nights for Bryce", 6, 7],
    ['we have 6 nights', 6, 7],
    ['a six-night trip', 6, 7],
  ])('%s -> %i nights / %i days', (text, nights, days) => {
    const scope = resolveTemporalScope(text);
    expect(scope.lodgingNights).toBe(nights);
    expect(scope.durationDays).toBe(days);
  });

  test('a day-stated duration reports no lodging nights', () => {
    expect(resolveTemporalScope('three days in Big Bend').lodgingNights).toBeNull();
  });
});

describe('B3 — a visit window is not a trip duration', () => {
  // Gate 2026-08-23 conversation D: "somewhere in October" became a 31-day trip.
  test('a bare month never becomes a trip duration', () => {
    const scope = resolveTemporalScope('We want to take a trip somewhere in October');
    expect(scope.durationDays).toBeNull();
    expect(scope.visitWindow).toBeTruthy();
  });

  test('duration and window coexist without overwriting each other', () => {
    const scope = resolveTemporalScope('three days next month');
    expect(scope.durationDays).toBe(3);
    expect(scope.visitWindow).toBeTruthy();
  });

  test.each(['next month', 'late October', 'early May', 'next weekend'])(
    '%s is captured as a visit window',
    (text) => {
      expect(resolveTemporalScope(`We are going ${text}.`).visitWindow).toBeTruthy();
    },
  );
});

// ---------------------------------------------------------------------------
// C — required plan creation
// ---------------------------------------------------------------------------

describe('C1 — "N days in <park>" is an itinerary request', () => {
  // Gate 2026-08-23 H1 and gate 2026-08-17 T3-1 both produced place_discovery
  // and no canonical plan while writing a Day 1/Day 2/Day 3 answer in prose.
  test.each([
    'Give us three relaxed days in Big Bend. We like wildlife, easy walks and the night sky.',
    'Give us three days in Big Bend.',
    'Plan three days in Olympic.',
    'Plan two full days in Olympic National Park for us. We like scenery and photography, but one of us hates exposed trails and we want a relaxed pace.',
    'Build us a 3-day trip in Big Bend.',
    'Put together six nights across Bryce, Capitol Reef and Arches.',
    'Plan me a day in Glacier National Park.',
    "Plan me a day in Zion National Park including the Pa'rus Trail and Canyon Overlook. We'll have a rental car, and keep them as separate stops.",
  ])('%s requests an itinerary', (prompt) => {
    const u = buildTurnUnderstanding({ userPrompt: prompt });
    expect(u.requestedArtifact).toBe('itinerary');
    expect(u.structurePolicy).toBe('required');
  });
});

describe('C2 — plan-shaped requests stay non-itinerary when they should', () => {
  test('an explicit prohibition still wins', () => {
    const u = buildTurnUnderstanding({
      userPrompt: "Help me figure out which parks make sense together and how much driving I'm signing up for. Don't build the daily itinerary yet.",
    });
    expect(u.forbiddenArtifacts).toContain('itinerary');
    expect(u.requestedArtifact).not.toBe('itinerary');
  });

  test('a request for options is prose, not a plan', () => {
    const u = buildTurnUnderstanding({
      userPrompt: 'Lay out a couple of different ways we could play three days in Big Bend.',
    });
    expect(u.requestedArtifact).not.toBe('itinerary');
  });

  test('plain seasonal advice does not request a plan', () => {
    const u = buildTurnUnderstanding({
      userPrompt: "I'm thinking about Shenandoah in late October. Is that too late for it to be worth the drive, or is it still good then?",
    });
    expect(u.requestedArtifact).not.toBe('itinerary');
  });

  test('an operational question does not request a plan', () => {
    const u = buildTurnUnderstanding({
      userPrompt: "We're heading to Mount Rainier next month. What do I actually need to have booked or sorted before we show up?",
    });
    expect(u.requestedArtifact).not.toBe('itinerary');
  });
});

// ---------------------------------------------------------------------------
// C3/C4 — required artifacts must not be satisfiable by prose
// ---------------------------------------------------------------------------

const { validateArtifactFulfillment } = require('../artifactFulfillment');

describe('C3 — plan-shaped prose does not satisfy a required itinerary', () => {
  // H1 wrote "Day 1 / Day 2 / Day 3" in prose and reported fulfilled=true,
  // because structurePolicy had been resolved to `optional`. With the entry
  // path fixed the same turn is `required`, and prose alone must now fail.
  test('a required itinerary with no canonical plan is unfulfilled', () => {
    const result = validateArtifactFulfillment({
      requestedArtifact: 'itinerary',
      structurePolicy: 'required',
      resultingCanonicalPlan: null,
    });
    expect(result.fulfilled).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.reasonCode).toBe('canonical_plan_missing');
  });

  test('the Big Bend turn now resolves to a required canonical artifact', () => {
    const u = buildTurnUnderstanding({
      userPrompt: 'Give us three relaxed days in Big Bend. We like wildlife, easy walks and the night sky.',
    });
    const fulfillment = validateArtifactFulfillment({
      requestedArtifact: u.requestedArtifact,
      structurePolicy: u.structurePolicy,
      resultingCanonicalPlan: null, // prose only — what actually happened live
    });
    expect(fulfillment.required).toBe(true);
    expect(fulfillment.fulfilled).toBe(false);
  });
});

describe('C4 — refinement without a canonical plan never claims a patch', () => {
  test('a refinement turn with no prior plan does not request itinerary_patch', () => {
    const u = buildTurnUnderstanding({
      userPrompt: "Actually we're not getting in until pretty late the first day.",
      priorTripState: null,
    });
    expect(u.requestedArtifact).not.toBe('itinerary_patch');
  });

  test('a patch requested with no prior plan is reported unfulfilled, not applied', () => {
    const result = validateArtifactFulfillment({
      requestedArtifact: 'itinerary_patch',
      structurePolicy: 'required',
      priorCanonicalPlan: null,
      patchResult: null,
      resultingCanonicalPlan: null,
    });
    expect(result.fulfilled).toBe(false);
    expect(result.reasonCode).toBe('prior_plan_missing');
  });

  test('a refinement turn WITH a prior plan does request a patch', () => {
    const u = buildTurnUnderstanding({
      userPrompt: "Actually we're not getting in until pretty late the first day.",
      priorTripState: { hasItinerary: true, existingCanonicalPlan: { days: [{ dayNumber: 1 }, { dayNumber: 2 }] } },
    });
    expect(u.requestedArtifact).toBe('itinerary_patch');
  });
});

// ---------------------------------------------------------------------------
// B4 — the two duration resolvers must not disagree
// ---------------------------------------------------------------------------

const { extractSpokenDuration } = require('../../utils/travelerStateExtraction');

describe('B4 — constraint-side and understanding-side parsers agree', () => {
  // These two resolvers used to carry independent phrase lists, so the same
  // sentence produced different durations depending on which one ran. The
  // constraint side feeds planningState.dates.durationDays, which is what an
  // itinerary is built against.
  test.each([
    "We've got six nights for Bryce, Capitol Reef and Arches.",
    'Give us three relaxed days in Big Bend.',
    'four days in September',
    'a six-night trip',
    'about a week in southern Utah',
    'Long weekend in March',
  ])('%s parses identically on both sides', (text) => {
    expect(extractSpokenDuration(text).durationDays).toBe(resolveTemporalScope(text).durationDays);
    expect(extractSpokenDuration(text).lodgingNights).toBe(resolveTemporalScope(text).lodgingNights);
  });

  test('the six-night regional trip yields a usable day target', () => {
    const text = "We've got six nights for Bryce, Capitol Reef and Arches.";
    expect(extractSpokenDuration(text).durationDays).toBe(7);
    expect(extractSpokenDuration(text).lodgingNights).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// B5 — a month window is never a trip length
// ---------------------------------------------------------------------------

const { parseTripDatesFromMessage } = require('../../utils/tripDateParser');

describe('B5 — bare months name a window, not a duration', () => {
  // Gate 2026-08-23 D1: "somewhere in October" became durationDays 31.
  test.each([
    'We want to take a trip somewhere in October',
    'thinking about going in September',
    'during March sometime',
  ])('%s yields a window with no trip length', (text) => {
    const parsed = parseTripDatesFromMessage(text);
    expect(parsed).toBeTruthy();
    expect(parsed.numDays).toBeNull();
    expect(parsed.windowOnly).toBe(true);
    expect(parsed.startDate).toBeTruthy();
    expect(parsed.endDate).toBeTruthy();
  });

  test('the span of the window is still available to anything that needs it', () => {
    expect(parseTripDatesFromMessage('somewhere in October').windowDays).toBe(31);
  });

  test('an explicit sub-month range still carries a real duration', () => {
    expect(parseTripDatesFromMessage('first week of July').numDays).toBe(7);
    expect(parseTripDatesFromMessage('last week of July').numDays).toBe(7);
  });

  test('a stated duration inside a month window survives', () => {
    // "four days in September" must be 4 days in September, not 30.
    expect(resolveTemporalScope('four days in September').durationDays).toBe(4);
    expect(parseTripDatesFromMessage('four days in September').windowOnly).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A6 — relationship must be independent of ENTITY SURFACE ORDER
// ---------------------------------------------------------------------------

describe('A6 — the choice cue may sit anywhere, including anaphorically', () => {
  // Gate #2 A1. The previous fix recognised the indecision cue but gated it
  // behind "between ... and" surface order, so naming the parks FIRST and
  // referring back ("between them") fell through to the conjunction rule and
  // returned `combine` @0.85 — a stonewall at attempts=0.
  const pair = [crla, noca];

  test.each([
    ['cue AFTER entities, anaphoric (gate #2 A1)', 'Crater Lake and North Cascades both sound good for February, and I keep changing my mind between them. We have four days and care more about scenery than hiking.'],
    ['cue AFTER entities, short', "Crater Lake and North Cascades both sound good; I can't decide between them."],
    ['cue BEFORE entities', "I can't decide between Crater Lake and North Cascades."],
    ['cue BETWEEN entities via disjunction', 'Crater Lake or North Cascades — which would you pick?'],
    ['either/or', 'Either Crater Lake or North Cascades could work for us.'],
    ['indecision with "and" joiner', 'Crater Lake and North Cascades are both options and I am unsure which one.'],
    ['anaphoric "the two"', 'I keep switching between the two; Crater Lake sounds easier but North Cascades looks prettier.'],
    ['single-selection framing', 'We were considering Crater Lake and North Cascades, but can probably only choose one.'],
  ])('%s -> alternative_choice', (_label, text) => {
    expect(resolveDestinationRelationship(text, pair).relationship).toBe('alternative_choice');
  });

  test.each([
    ['explicit same-trip commitment', 'We want to visit Crater Lake and North Cascades on the same trip.', 'combine'],
    ['distribution verb', 'Split six nights between Crater Lake and North Cascades.', 'combine'],
    ['fit both in', 'Can we fit Crater Lake and North Cascades into one weekend?', 'combine'],
    ['explicit route', 'We are driving from Crater Lake to North Cascades.', 'route'],
  ])('REGRESSION %s -> %s', (_label, text, expected) => {
    expect(resolveDestinationRelationship(text, pair).relationship).toBe(expected);
  });

  test('a same-trip commitment outranks indecision', () => {
    const text = "I keep changing my mind about the order, but we're doing Crater Lake and North Cascades on the same trip.";
    expect(resolveDestinationRelationship(text, pair).relationship).toBe('combine');
  });

  test('an anaphoric alternative with no locally resolved park is not a selection', () => {
    // "the other one" names a candidate set held in prior state. Claiming
    // `single` here would assert a choice the traveler has not made.
    const result = resolveDestinationRelationship('Actually the other one sounds more like us.', []);
    expect(result.relationship).toBe('unknown');
    expect(result.reasonCodes).toContain('anaphoric_alternative_without_local_entities');
  });
});

describe('A7 — a choice never produces a trip shape or route legs', () => {
  test.each([
    'Crater Lake and North Cascades both sound good, and I keep changing my mind between them.',
    "I can't decide between Crater Lake and North Cascades.",
    'Crater Lake or North Cascades — which would you pick?',
  ])('%s -> comparison_set with no legs', (text) => {
    const scope = buildTripScopeFromMessage(text, { destinations: [crla, noca] });
    expect(scope.type).toBe('comparison_set');
    expect(scope.routeLegs).toHaveLength(0);
  });

  test('selecting one candidate afterwards yields a clean single destination', () => {
    const scope = buildTripScopeFromMessage("Actually let's just do North Cascades.", { destinations: [noca] });
    expect(scope.type).toBe('single_destination');
    expect(scope.routeLegs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B6 — zero-duration stops must name themselves, not hide as "insufficient"
// ---------------------------------------------------------------------------

const { evaluateItineraryCompleteness } = require('../../utils/itineraryCompleteness');

const day = (n, stops) => ({ dayNumber: n, stops });
const stop = (name, type, duration) => ({ name, type, duration, order: 1, note: '', startTime: '' });

describe('B6 — a day of zero-duration stops reports the real defect', () => {
  // Gate #2 D1: three attempts, $0.256. Attempts 1 and 3 emitted every stop
  // with duration 0 and were told `insufficient_day_coverage` — which reads as
  // "add more stops", so attempt 3 added a third stop and left every duration
  // at 0. The vague code caused the wrong repair.
  const constraints = { dates: { durationDays: 3 }, pace: 'relaxed' };
  const userPrompt = 'Give us three relaxed days somewhere coastal. We love coast views and easy walks.';

  test('zero durations are reported as zero_duration_stops', () => {
    const plan = {
      days: [
        day(1, [stop('Shoreline overlook', 'scenic_drive', 0), stop('Visitor center', 'visitor_center', 0)]),
        day(2, [stop('Coast loop road', 'scenic_drive', 0), stop('Nature center', 'visitor_center', 0)]),
        day(3, [stop('Harbor museum', 'museum', 0), stop('Gateway center', 'visitor_center', 0)]),
      ],
    };
    const result = evaluateItineraryCompleteness({ itineraryData: plan, userPrompt, constraints });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('zero_duration_stops');
    expect(result.reasonCodes).not.toContain('insufficient_day_coverage');
  });

  test('the diagnostic names which stops carried no duration', () => {
    const plan = { days: [day(1, [stop('Shoreline overlook', 'scenic_drive', 0)])] };
    const result = evaluateItineraryCompleteness({ itineraryData: plan, userPrompt, constraints });
    const diag = result.dayDiagnostics.find((d) => d.dayNumber === 1);
    expect(diag.codes).toContain('zero_duration_stops');
    expect(diag.zeroDurationStopNames).toContain('Shoreline overlook');
  });

  test('a day with real durations is not flagged', () => {
    const plan = { days: [day(1, [stop('Shoreline overlook', 'scenic_drive', 120), stop('Visitor center', 'visitor_center', 45)])] };
    const result = evaluateItineraryCompleteness({ itineraryData: plan, userPrompt, constraints });
    expect(result.reasonCodes).not.toContain('zero_duration_stops');
  });

  test('a partially-timed day is not treated as zero-duration', () => {
    // Only a day where EVERY stop lacks a duration is the mechanical defect.
    const plan = { days: [day(1, [stop('Shoreline overlook', 'scenic_drive', 120), stop('Visitor center', 'visitor_center', 0)])] };
    const result = evaluateItineraryCompleteness({ itineraryData: plan, userPrompt, constraints });
    expect(result.reasonCodes).not.toContain('zero_duration_stops');
  });

  test('the generation contract states durations must be positive', () => {
    const { formatItineraryToolInstruction } = require('../../utils/itineraryToolSchema');
    expect(formatItineraryToolInstruction()).toMatch(/duration.*MUST be greater than zero/i);
  });
});

describe('A8 — explicit comparison lexicon (structural coverage)', () => {
  // The structural audit found no offline fixture using "versus"/"compare"
  // even though gate #2 exercised that path live. Recording it here so the
  // explicit-lexicon branch is covered without a paid run.
  const pair = [crla, noca];

  test.each([
    'How different would a spring trip feel at Crater Lake versus North Cascades if wildlife and scenic drives matter most?',
    'Crater Lake vs North Cascades for easy walks in September?',
    'Compare Crater Lake and North Cascades for a scenery-first trip.',
    'What are the tradeoffs between Crater Lake and North Cascades?',
  ])('%s is a comparison, never a trip shape', (text) => {
    const rel = resolveDestinationRelationship(text, pair).relationship;
    expect(['compare', 'alternative_choice']).toContain(rel);
    const scope = buildTripScopeFromMessage(text, { destinations: pair });
    expect(scope.type).toBe('comparison_set');
    expect(scope.routeLegs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// R — refinement recognition is CONTEXTUAL, not phrase-driven
// ---------------------------------------------------------------------------

const { resolveRefinementIntent } = require('../../utils/refinementSemantics');

const REDWOOD_PLAN = {
  days: [
    { dayNumber: 1, stops: [{ name: 'Crescent City Information Center' }, { name: 'Coastal Trail: Crescent Beach' }] },
    { dayNumber: 2, stops: [{ name: 'Hiouchi Visitor Center' }, { name: 'Jedediah Smith Visitor Center' }] },
    { dayNumber: 3, stops: [{ name: 'Islesford Historical Museum' }, { name: 'Newton B. Drury Scenic Parkway' }] },
  ],
};
const withPlan = { hasItinerary: true, existingCanonicalPlan: REDWOOD_PLAN };
const understandWithPlan = (userPrompt) => buildTurnUnderstanding({ userPrompt, priorTripState: withPlan });

describe('R1 — structural fixture matrix: every refinement shape', () => {
  // Gate #3 D failed because the day pattern knew only "second DAY" and the
  // verb family had no "easier". These fixtures vary the SHAPE of the cue, not
  // just its wording — the census gap that let that through.
  test.each([
    ['explicit verb + day', 'Change day two.', 'day'],
    ['no edit verb + day', 'Day two is too much walking.', 'day'],
    ['daypart (gate #3 D)', "Actually we'll probably be tired the second morning, so make that part of the trip easier.", 'daypart'],
    ['daypart imperative', 'Make the second morning easier.', 'daypart'],
    ['constraint change + daypart (gate #2 D2)', "Actually we're not getting in until pretty late the first day.", 'day'],
    ['preference shift', "I'd rather spend more time at the lake on day three.", 'day'],
    ['anaphoric', 'That part sounds exhausting.', 'anaphoric'],
    ['whole plan', 'Can we make the whole trip more relaxed?', 'whole_plan'],
    ['stop target', "I'd skip the museum.", 'stop'],
    ['time target', 'Let us start later that morning.', 'daypart'],
    ['ordinal daypart', 'The last morning should be lighter.', 'daypart'],
    ['quantity', 'More wildlife on the second day would be nice.', 'day'],
    ['traveler constraint + directive (Zion turn 3)', 'Actually my knee has been bothering me, so keep the walking pretty light.', 'whole_plan'],
  ])('%s -> itinerary_patch (target %s)', (_label, prompt, expectedTarget) => {
    const u = understandWithPlan(prompt);
    expect(u.requestedArtifact).toBe('itinerary_patch');
    expect(u.structurePolicy).toBe('required');
    const intent = resolveRefinementIntent({ text: prompt, priorPlan: REDWOOD_PLAN, hasPriorPlan: true });
    expect(intent.target).toBe(expectedTarget);
  });
});

describe('R2 — negative controls: discussing a plan is not changing it', () => {
  test.each([
    ['plan explanation', 'What is the second day like?'],
    ['plan question', 'Why did you put that on day two?'],
    ['crowd question', 'Is the first morning usually crowded?'],
    ['analysis', 'Which part is hardest?'],
    ['comparison between days', 'Would day two be easier than day one?'],
    ['bare constraint, no directive', 'My knee has been bothering me lately.'],
    ['bare weather remark', 'The weather looks bad.'],
  ])('%s stays a plain answer', (_label, prompt) => {
    expect(understandWithPlan(prompt).requestedArtifact).not.toBe('itinerary_patch');
  });
});

describe('R3 — context decides: the same sentence without a plan is advice', () => {
  test.each([
    "Actually we'll probably be tired the second morning, so make that part of the trip easier.",
    'Make the second morning easier.',
    'Actually my knee has been bothering me, so keep the walking pretty light.',
  ])('%s is not a patch when no canonical plan exists', (prompt) => {
    const u = buildTurnUnderstanding({ userPrompt: prompt });
    expect(u.requestedArtifact).not.toBe('itinerary_patch');
    const intent = resolveRefinementIntent({ text: prompt, hasPriorPlan: false });
    expect(intent.isRefinement).toBe(false);
    expect(intent.reasonCodes).toContain('no_active_canonical_plan');
  });
});

describe('R4 — the Zion chain no longer depends on its crutch clause', () => {
  // The proven 2026-08-21 mutation matched only because the traveler happened
  // to append "Keep the trip otherwise." Both forms must now work.
  test.each([
    'Actually my knee has been bothering me, so keep the walking pretty light. Keep the trip otherwise.',
    'Actually my knee has been bothering me, so keep the walking pretty light.',
  ])('%s is a refinement', (prompt) => {
    expect(understandWithPlan(prompt).requestedArtifact).toBe('itinerary_patch');
  });
});

describe('R5 — an unresolvable reference does not mutate an arbitrary stop', () => {
  test('a bare anaphor with no modification intent is not a refinement', () => {
    const intent = resolveRefinementIntent({ text: 'That one.', priorPlan: REDWOOD_PLAN, hasPriorPlan: true });
    expect(intent.isRefinement).toBe(false);
    expect(intent.reasonCodes).toContain('no_modification_intent');
  });

  test('modification intent with no plan reference at all is not a refinement', () => {
    const intent = resolveRefinementIntent({ text: 'Make it easier.', priorPlan: REDWOOD_PLAN, hasPriorPlan: true });
    // "make it" is the legacy edit family; the contextual resolver reports the
    // absence of a target rather than inventing one.
    expect(intent.target).not.toBe('stop');
  });
});
