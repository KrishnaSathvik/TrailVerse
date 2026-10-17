'use strict';

const {
  extractDurationDays,
  resolveTravelerJob,
  jobToPrimaryIntent,
  TRAVELER_JOBS,
} = require('../../../../../src/services/trailieTravelerJobResolver');

describe('trailieTravelerJobResolver', () => {
  test('treats spelled and numeric durations as the same duration', () => {
    expect(extractDurationDays('Is three days enough for Yellowstone?')).toBe(3);
    expect(extractDurationDays('Is 3 days enough for Yellowstone?')).toBe(3);
    expect(extractDurationDays('Plan a weekend in Zion')).toBe(2);
  });

  test('duration-enough questions are advice, not day-by-day, for both spellings', () => {
    const spelled = resolveTravelerJob({
      userPrompt: 'Is three days enough for Yellowstone?',
    });
    const numeric = resolveTravelerJob({
      userPrompt: 'Is 3 days enough for Yellowstone?',
    });
    expect(spelled.job).toBe('trip_duration_advice');
    expect(numeric.job).toBe('trip_duration_advice');
    expect(jobToPrimaryIntent(spelled)).toBe('general_qa');
    expect(jobToPrimaryIntent(numeric)).toBe('general_qa');
  });

  test('explicit not-day-by-day logistics is a trip skeleton, not architect itinerary', () => {
    const resolved = resolveTravelerJob({
      userPrompt:
        'Plan logistics for a 10-day Alaska trip, but do not build a day-by-day itinerary yet.',
    });
    expect(resolved.job).toBe('trip_skeleton');
    expect(resolved.forbidsDayByDay).toBe(true);
    expect(jobToPrimaryIntent(resolved)).toBe('general_qa');
  });

  test('plan me one day is day-by-day itinerary', () => {
    const resolved = resolveTravelerJob({
      userPrompt: 'Plan me one day in Glacier.',
    });
    expect(resolved.job).toBe('day_by_day_itinerary');
    expect(jobToPrimaryIntent(resolved)).toBe('simple_itinerary');
  });

  test('backup plan does not automatically become an itinerary', () => {
    const resolved = resolveTravelerJob({
      userPrompt:
        "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
    });
    expect(resolved.job).toBe('access_contingency');
    expect(jobToPrimaryIntent(resolved)).not.toBe('simple_itinerary');
    expect(jobToPrimaryIntent(resolved)).not.toBe('full_trip');
  });

  test('short backup-plan parking question is access contingency, not a plan verb', () => {
    const resolved = resolveTravelerJob({
      userPrompt: "What's a good backup plan if Logan Pass parking is full?",
    });
    expect(resolved.job).toBe('access_contingency');
    expect(jobToPrimaryIntent(resolved)).toBe('general_qa');
  });

  test('airport then origin follow-up stays in the airport job', () => {
    const first = resolveTravelerJob({ userPrompt: 'Which airport should I use?' });
    expect(first.job).toBe('airport_strategy');

    const follow = resolveTravelerJob({
      userPrompt: "I'm coming from Dallas.",
      priorTripState: {
        hasActiveTrip: true,
        lastTravelerJob: first.job,
      },
    });
    expect(follow.job).toBe('origin_refinement');
    expect(jobToPrimaryIntent(follow)).toBe('flight_strategy');
  });

  test('origin follow-up inherits airport job even without hasActiveTrip', () => {
    const follow = resolveTravelerJob({
      userPrompt: "I'm coming from Dallas.",
      priorTripState: {
        hasActiveTrip: false,
        lastTravelerJob: 'airport_strategy',
      },
    });
    expect(follow.job).toBe('origin_refinement');
    expect(follow.inherited).toBe(true);
  });

  test('short airport follow-ups stay on the active airport decision', () => {
    const prior = { lastTravelerJob: 'airport_strategy', hasActiveTrip: false };
    expect(resolveTravelerJob({ userPrompt: 'What about Salt Lake City?', priorTripState: prior }).job)
      .toBe('airport_strategy');
    expect(resolveTravelerJob({ userPrompt: 'Which is cheaper?', priorTripState: prior }).job)
      .toBe('airport_strategy');
  });

  test('topic shift leaves the prior airport job', () => {
    const follow = resolveTravelerJob({
      userPrompt: 'Where should we stay near the entrance?',
      priorTripState: { lastTravelerJob: 'airport_strategy', hasActiveTrip: true },
    });
    expect(follow.job).toBe('lodging_strategy');
  });

  test('lodging and campground short follow-ups inherit the active decision', () => {
    expect(resolveTravelerJob({
      userPrompt: 'Closer to the entrance.',
      priorTripState: { lastTravelerJob: 'lodging_strategy' },
    }).job).toBe('lodging_strategy');
    expect(resolveTravelerJob({
      userPrompt: 'We have a 28-foot RV.',
      priorTripState: { lastTravelerJob: 'campground_strategy' },
    }).job).toBe('campground_strategy');
  });

  test('build the itinerary after airport/origin becomes day-by-day', () => {
    const resolved = resolveTravelerJob({
      userPrompt: 'Build the itinerary.',
      priorTripState: {
        hasActiveTrip: true,
        lastTravelerJob: 'origin_refinement',
        hasItinerary: false,
      },
    });
    expect(resolved.job).toBe('day_by_day_itinerary');
  });

  test('make the trip slower with an active itinerary is refinement', () => {
    const resolved = resolveTravelerJob({
      userPrompt: 'Make the trip slower.',
      priorTripState: { hasActiveTrip: true, hasItinerary: true, lastTravelerJob: 'day_by_day_itinerary' },
    });
    expect(resolved.job).toBe('itinerary_refinement');
    expect(jobToPrimaryIntent(resolved)).toBe('trip_refinement');
  });

  test('constraint-only follow-up with an active trip is a constraint update', () => {
    const resolved = resolveTravelerJob({
      userPrompt: "I don't like exposed trails.",
      priorTripState: { hasActiveTrip: true, hasItinerary: true, lastTravelerJob: 'day_by_day_itinerary' },
    });
    expect(resolved.job).toBe('constraint_update');
    expect(jobToPrimaryIntent(resolved)).toBe('trip_refinement');
  });

  test('two gateway cities for a park is generic airport strategy, not a named-park branch', () => {
    const resolved = resolveTravelerJob({
      userPrompt: 'Is Anchorage or Fairbanks better for Denali?',
    });
    expect(resolved.job).toBe('airport_strategy');
    expect(resolved.reasonCodes).toContain('gateway_city_strategy');
    expect(resolved.reasonCodes).not.toContain('denali_gateway_strategy');
  });

  test('exports a closed job taxonomy', () => {
    expect(TRAVELER_JOBS).toEqual(expect.arrayContaining([
      'trip_duration_advice',
      'trip_skeleton',
      'day_by_day_itinerary',
      'itinerary_refinement',
      'airport_strategy',
      'origin_refinement',
    ]));
  });
});

// WP-TU Phase 1b (turn-understanding-implementation plan, Task 1b) —
// resolveTravelerJob becomes the atomic TravelerJob + TurnTripContext
// composition site. `tripContext` is a new sibling key; every existing
// field must stay byte-for-byte intact (proved below, not just assumed).
describe('TurnTripContext Phase 1b — tripContext composition', () => {
  test('existing return fields are untouched by the addition of tripContext', () => {
    const resolved = resolveTravelerJob({
      userPrompt: 'Make the trip slower.',
      priorTripState: { hasActiveTrip: true, hasItinerary: true, lastTravelerJob: 'day_by_day_itinerary' },
    });
    const { tripContext, ...rest } = resolved;
    expect(rest).toEqual({
      job: 'itinerary_refinement',
      durationDays: null,
      forbidsDayByDay: false,
      inherited: false,
      understanding: resolved.understanding,
      structurePolicy: 'required',
      reasonCodes: ['pace_refinement'],
    });
    expect(tripContext).toBeDefined();
  });

  test('tripContext is a strict two-key shape with closed enums', () => {
    const resolved = resolveTravelerJob({ userPrompt: 'Plan 3 days in Zion.' });
    expect(Object.keys(resolved.tripContext).sort()).toEqual(['activeContextAction', 'relationship']);
    expect(['preserve', 'set']).toContain(resolved.tripContext.activeContextAction);
    expect(['new', 'continuation', 'historical_reference']).toContain(resolved.tripContext.relationship);
  });

  // The six pinned cases from the plan's Task 1b — the acceptance bar for
  // this task. Each priorTripState models "what was active before this
  // turn" via `primaryDestination` (the existing field this file already
  // reads at line ~167 for hasActiveTrip) and, where relevant, the Task 1a
  // `lastConversationalSubject` pass-through — never continuationOfActiveDecision/
  // topicShift/priorJob, which this task must not read for this purpose.
  test.each([
    [
      'No active context → "Plan 3 days in Zion"',
      'Plan 3 days in Zion',
      null,
      { relationship: 'new', activeContextAction: 'set' },
    ],
    [
      'Redwood active → "Is October good in Acadia?"',
      'Is October good in Acadia?',
      { primaryDestination: { name: 'Redwood National and State Parks', parkCode: 'redw' } },
      { relationship: 'new', activeContextAction: 'preserve' },
    ],
    [
      'Previous conversational subject Acadia → "What about November?"',
      'What about November?',
      {
        primaryDestination: { name: 'Redwood National and State Parks', parkCode: 'redw' },
        // WP-TU Phase 1c shape (subjectDestinations/primaryDestination/
        // destinationRelationship) — this specific case is a bare follow-up
        // with no destination of its own, so it resolves via the
        // no-destination shortcut regardless of this shape; kept accurate
        // to the real producer shape for anyone reading the fixture.
        lastConversationalSubject: {
          subjectDestinations: [{ name: 'Acadia National Park', parkCode: 'acad' }],
          primaryDestination: { name: 'Acadia National Park', parkCode: 'acad' },
          destinationRelationship: 'single',
        },
      },
      { relationship: 'continuation', activeContextAction: 'preserve' },
    ],
    [
      'Badlands plan active → "Make Day 2 easier"',
      'Make Day 2 easier',
      {
        primaryDestination: { name: 'Badlands National Park', parkCode: 'badl' },
        hasItinerary: true,
        existingCanonicalPlan: { days: [{ dayNumber: 1 }, { dayNumber: 2 }] },
      },
      { relationship: 'continuation', activeContextAction: 'preserve' },
    ],
    [
      'Redwood active → "Actually plan Badlands instead"',
      'Actually plan Badlands instead',
      {
        primaryDestination: { name: 'Redwood National and State Parks', parkCode: 'redw' },
        hasItinerary: true,
        existingCanonicalPlan: { days: [{ dayNumber: 1 }, { dayNumber: 2 }] },
      },
      { relationship: 'new', activeContextAction: 'set' },
    ],
    [
      'Badlands active → "For my Redwood trip, change Day 2"',
      'For my Redwood trip, change Day 2',
      {
        primaryDestination: { name: 'Badlands National Park', parkCode: 'badl' },
        hasItinerary: true,
        existingCanonicalPlan: { days: [{ dayNumber: 1 }, { dayNumber: 2 }] },
      },
      { relationship: 'historical_reference', activeContextAction: 'preserve' },
    ],
  ])('%s', (_label, userPrompt, priorTripState, expected) => {
    const resolved = resolveTravelerJob({ userPrompt, priorTripState });
    expect(resolved.tripContext).toEqual(expected);
  });

  // Adversarial regression: "plan" as a bare keyword must not become an
  // itinerary-build job. The distinguishing signal is what "plan" is doing
  // grammatically — its object is a trip/itinerary/duration+destination
  // (build frame) versus a condition/circumstance to navigate around
  // (advice frame) — never "is this a question?" (both frames ask
  // questions; "Can you plan me 3 days in Zion?" is a question AND a build
  // request). Redwood is active throughout; none of these may redirect it.
  const REDWOOD_ACTIVE = { primaryDestination: { name: 'Redwood National and State Parks', parkCode: 'redw' } };
  test.each([
    [
      "What's the best way to plan around crowds at Acadia in October?",
      'general_advice',
      { relationship: 'new', activeContextAction: 'preserve' },
    ],
    [
      'How should I plan my day if it rains in Acadia?',
      'general_advice',
      { relationship: 'new', activeContextAction: 'preserve' },
    ],
    [
      'Any tips to plan around sunset timing in Acadia?',
      'general_advice',
      { relationship: 'new', activeContextAction: 'preserve' },
    ],
    [
      'Plan me 3 days in Acadia.',
      'day_by_day_itinerary',
      { relationship: 'new', activeContextAction: 'set' },
    ],
    [
      'Can you plan me a 3-day Acadia trip?',
      'day_by_day_itinerary',
      { relationship: 'new', activeContextAction: 'set' },
    ],
    [
      'Actually plan Badlands instead.',
      'day_by_day_itinerary',
      { relationship: 'new', activeContextAction: 'set' },
    ],
  ])('%s → job %s', (userPrompt, expectedJob, expectedTripContext) => {
    const resolved = resolveTravelerJob({ userPrompt, priorTripState: REDWOOD_ACTIVE });
    expect(resolved.job).toBe(expectedJob);
    expect(resolved.tripContext).toEqual(expectedTripContext);
  });

  test('a recommendation-shaped "plan around" ask does not become an itinerary build merely because "plan" appears', () => {
    const resolved = resolveTravelerJob({
      userPrompt: 'What hikes should I plan around sunset in Acadia?',
      priorTripState: REDWOOD_ACTIVE,
    });
    // Whatever this taxonomy assigns for a recommendation-shaped ask — pinned
    // explicitly rather than assumed, and independently asserted never to be
    // the itinerary-build job.
    expect(resolved.job).toBe('general_advice');
    expect(resolved.job).not.toBe('day_by_day_itinerary');
    expect(resolved.tripContext).toEqual({ relationship: 'new', activeContextAction: 'preserve' });
  });

  // Bonus coverage beyond the six pinned cases: explicitly exercises the
  // "matches the prior conversational subject" branch of relationship
  // resolution (the six pinned cases only exercise it via the no-destination
  // bare-follow-up shortcut, since none of them re-name the prior subject).
  test('re-naming the prior conversational subject is still a continuation, even while a different trip is active', () => {
    const resolved = resolveTravelerJob({
      userPrompt: 'Is Acadia rainy in November too?',
      priorTripState: {
        primaryDestination: { name: 'Redwood National and State Parks', parkCode: 'redw' },
        // WP-TU Phase 1c shape: subjectDestinations/primaryDestination/destinationRelationship.
        lastConversationalSubject: {
          subjectDestinations: [{ name: 'Acadia National Park', parkCode: 'acad' }],
          primaryDestination: { name: 'Acadia National Park', parkCode: 'acad' },
          destinationRelationship: 'single',
        },
      },
    });
    expect(resolved.tripContext).toEqual({ relationship: 'continuation', activeContextAction: 'preserve' });
  });

  test('re-naming EITHER destination of a multi-destination prior subject is still a continuation', () => {
    const priorTripState = {
      lastConversationalSubject: {
        subjectDestinations: [
          { name: 'Yosemite', parkCode: 'yose' },
          { name: 'Sequoia', parkCode: 'sequ' },
        ],
        primaryDestination: { name: 'Yosemite', parkCode: 'yose' },
        destinationRelationship: 'alternative_choice',
      },
    };
    // Naming the SECOND-listed destination, not the primary one, still matches.
    const resolved = resolveTravelerJob({
      userPrompt: 'Is Sequoia less crowded in October?',
      priorTripState,
    });
    expect(resolved.tripContext).toEqual({ relationship: 'continuation', activeContextAction: 'preserve' });
  });

  test('continuationOfActiveDecision/topicShift/priorJob are unreinterpreted by tripContext (Task 1a discipline preserved)', () => {
    const resolved = resolveTravelerJob({
      userPrompt: "I'm coming from Dallas.",
      priorTripState: { lastTravelerJob: 'airport_strategy' },
    });
    expect({
      continuationOfActiveDecision: resolved.understanding.continuationOfActiveDecision,
      priorJob: resolved.understanding.priorJob,
      topicShift: resolved.understanding.topicShift,
    }).toEqual({
      continuationOfActiveDecision: true,
      priorJob: 'airport_strategy',
      topicShift: false,
    });
  });
});
