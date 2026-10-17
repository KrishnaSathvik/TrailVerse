'use strict';

const { buildTurnUnderstanding } = require('../turnUnderstanding');
const { getProviderTestSummary, resetProviderTestSummary } = require('../../config/providerTestPolicy');

const understand = (userPrompt, priorTripState = null) =>
  buildTurnUnderstanding({ userPrompt, priorTripState });

const PLAN_WITH_DAYS = { hasItinerary: true, existingCanonicalPlan: { days: [{ dayNumber: 1 }, { dayNumber: 2 }] } };

beforeEach(() => resetProviderTestSummary());

describe('destination relationship is not destination count', () => {
  test.each([
    ['Would you pick Acadia or Great Smoky Mountains?'],
    ['Which one would you choose, Acadia or Great Smoky Mountains?'],
    ["I'm deciding between Acadia and Great Smoky Mountains."],
    ['Acadia versus Great Smoky Mountains for this trip?'],
    ['Which fits us better, Acadia or Great Smoky Mountains?'],
    ['Acadia or Yosemite?'],
  ])('%s → choice, never a route', (prompt) => {
    const u = understand(prompt);
    expect(['compare', 'alternative_choice']).toContain(u.destinationRelationship);
    expect(u.taskFamily).toBe('comparison');
    expect(u.destinationRelationship).not.toBe('route');
  });

  test.each([
    ['Can I visit Yellowstone and Grand Teton in the same trip?', ['combine']],
    ['Plan a road trip from Yellowstone to Glacier.', ['route']],
    ['How should I split a week between Yellowstone and Grand Teton?', ['combine']],
  ])('%s → travel relationship', (prompt, expected) => {
    const u = understand(prompt);
    expect(expected).toContain(u.destinationRelationship);
  });

  test('a single destination is single', () => {
    expect(understand('Plan two full days in Olympic National Park.').destinationRelationship).toBe('single');
  });
});

describe('artifact request vs prohibition', () => {
  test.each([
    "Don't make an itinerary yet.",
    'Don’t make an itinerary yet.',
    'No day-by-day plan yet.',
    'I want logistics first, not a daily schedule.',
    "Help me figure out which parks make sense together. Don't build the daily itinerary yet.",
    'Don’t build the daily itinerary yet.',
  ])('%s → itinerary forbidden', (prompt) => {
    const u = understand(prompt);
    expect(u.forbiddenArtifacts).toContain('itinerary');
    expect(u.requestedArtifact).not.toBe('itinerary');
    expect(u.structurePolicy).toBe('optional');
    expect(u.taskFamily).not.toBe('itinerary');
  });

  test.each([
    'Build me a realistic day-by-day plan.',
    'Okay, build me a realistic day-by-day itinerary.',
    'Create a 3-day itinerary for Zion.',
    'Plan two full days in Olympic National Park for us.',
    'Plan me a day in Glacier National Park.',
    "Plan me a day in Zion National Park including the Pa'rus Trail and Canyon Overlook. We'll have a rental car, and keep them as separate stops.",
    'Plan me one day in Zion National Park.',
    'Plan me a day in Yosemite Valley.',
  ])('%s → itinerary requested and required', (prompt) => {
    const u = understand(prompt);
    expect(u.requestedArtifact).toBe('itinerary');
    expect(u.structurePolicy).toBe('required');
    expect(u.taskFamily).toBe('itinerary');
  });

  test('article-form "a day" is a one-day produce object', () => {
    const u = understand('Plan me a day in Glacier National Park.');
    expect(u.temporalScope.durationDays).toBe(1);
    expect(u.askedToProduceTripArtifact).toBe(true);
    expect(u.requestedArtifact).toBe('itinerary');
  });

  test('a prohibition overrides the word "itinerary" appearing positively', () => {
    const u = understand('I want about a week in southern Utah. Help me figure out where to base myself. Don’t build the daily itinerary yet.');
    expect(u.forbiddenArtifacts).toContain('itinerary');
    expect(u.structurePolicy).toBe('optional');
  });

  test('refinement of an existing plan requests a patch', () => {
    const u = understand('Keep the trip, but cut anything that requires much walking.', PLAN_WITH_DAYS);
    expect(u.requestedArtifact).toBe('itinerary_patch');
    expect(u.taskFamily).toBe('itinerary_refinement');
    expect(u.structurePolicy).toBe('required');
  });
});

describe('operational language is semantic, not noun-form only', () => {
  test.each([
    'What do I need to reserve?',
    'Do I need reservations?',
    'Anything I should book?',
    'Do I need permits?',
    'What needs to be secured before we go?',
    "If I'm going to Rocky Mountain National Park next weekend, what do I actually need to reserve or check before I leave?",
  ])('%s → reservation/permit family', (prompt) => {
    const u = understand(prompt);
    expect(u.operationalSubjects).toContain('reservations_permits');
    expect(u.taskFamily).toBe('permits_reservations');
    expect(u.structurePolicy).toBe('optional');
  });
});

describe('temporal semantics — a date is not a duration', () => {
  test('"next weekend" is a visit window, not a trip length', () => {
    const u = understand('What do I need to reserve for Rocky Mountain next weekend?');
    expect(u.temporalScope.visitWindow).toMatch(/next weekend/);
    expect(u.temporalScope.durationDays).toBeNull();
    expect(u.taskFamily).toBe('permits_reservations');
  });

  test('"we have the whole weekend there" is a duration', () => {
    const u = understand('We have the whole weekend at Zion; plan both days.');
    expect(u.temporalScope.durationDays).toBe(2);
  });

  test('a bare weekend trip request still reads as a two-day trip', () => {
    const u = understand('Plan a romantic weekend in Yosemite.');
    expect(u.temporalScope.durationDays).toBe(2);
  });

  test('explicit day counts win', () => {
    expect(understand('Plan two full days in Olympic.').temporalScope.durationDays).toBe(2);
    expect(understand('I want about a week in southern Utah next spring.').temporalScope.durationDays).toBe(7);
    expect(understand('four days in early October').temporalScope.durationDays).toBe(4);
  });

  test('a season reference is a window, not a duration', () => {
    const u = understand('We are thinking about Zion next spring.');
    expect(u.temporalScope.visitWindow).toMatch(/next spring/);
    expect(u.temporalScope.durationDays).toBeNull();
  });
});

describe('grounded constraint extraction', () => {
  test.each([
    'one of us hates exposed trails',
    'no cliff-edge hikes please',
    'avoid scary drop-offs',
    "we aren't comfortable with exposure",
    'nothing with scary exposure',
  ])('%s → avoidExposure', (prompt) => {
    const c = understand(prompt).explicitConstraints.find((x) => x.field === 'avoidExposure');
    expect(c?.value).toBe(true);
    expect(c?.span).toBeTruthy();
    expect(c?.source).toBe('current_message');
  });

  test('social-media exposure never arms trail exposure', () => {
    const u = understand('We want a break with no exposure to social media.');
    expect(u.explicitConstraints.find((x) => x.field === 'avoidExposure')).toBeUndefined();
  });

  test('numeric walking limits are captured as numbers', () => {
    const c = understand("They can't walk more than a mile at a time.")
      .explicitConstraints.find((x) => x.field === 'maxWalkMilesPerSegment');
    expect(c?.value).toBe(1);
  });

  test.each([
    'cut anything that requires much walking',
    'keep the walking light',
    "we can't do long walks",
    'minimal walking please',
  ])('%s → bounded non-numeric limitation', (prompt) => {
    const constraints = understand(prompt).explicitConstraints;
    const tolerance = constraints.find((x) => x.field === 'walkingTolerance');
    expect(tolerance?.value).toBe('limited');
    // Nothing numeric may be invented from non-numeric language.
    expect(constraints.find((x) => x.field === 'maxWalkMilesPerSegment')).toBeUndefined();
  });

  test('a bare medical mention invents no capability', () => {
    const constraints = understand('My knee has been bothering me lately.').explicitConstraints;
    expect(constraints.find((x) => x.field === 'maxWalkMilesPerSegment')).toBeUndefined();
    expect(constraints.find((x) => x.field === 'walkingTolerance')).toBeUndefined();
  });

  test('the explicit clause beside a medical mention still counts', () => {
    const constraints = understand(
      'Actually, my knee has been bothering me lately. Keep the trip, but cut anything that requires much walking.',
      PLAN_WITH_DAYS
    ).explicitConstraints;
    expect(constraints.find((x) => x.field === 'walkingTolerance')?.value).toBe('limited');
    expect(constraints.find((x) => x.field === 'maxWalkMilesPerSegment')).toBeUndefined();
  });

  test.each([
    ["My wife doesn't really hike.", 'none'],
    ['We hate hiking.', 'none'],
    ['some hiking but nothing intense', 'easy'],
  ])('%s → hiking preference %s', (prompt, expected) => {
    expect(understand(prompt).explicitConstraints.find((x) => x.field === 'hiking')?.value).toBe(expected);
  });

  test('soft preferences are separated from hard constraints', () => {
    const u = understand("We'd rather avoid spending half the trip in the car.");
    expect(u.softPreferences.find((x) => x.field === 'minimizeDriving')?.value).toBe(true);
    expect(u.explicitConstraints.find((x) => x.field === 'minimizeDriving')).toBeUndefined();
  });

  test('lodging stability is a soft preference', () => {
    const u = understand('I hate changing hotels every night. Simplify it.');
    expect(u.softPreferences.find((x) => x.field === 'minimizeLodgingChanges')?.value).toBe(true);
  });
});

describe('unicode punctuation cannot change meaning', () => {
  const pairs = [
    ["Don't build the daily itinerary yet.", 'Don’t build the daily itinerary yet.'],
    ["I can't walk more than a mile.", 'I can’t walk more than a mile.'],
    ["We don't hike.", 'We don’t hike.'],
  ];
  test.each(pairs)('%s ≡ %s', (ascii, typographic) => {
    const a = understand(ascii);
    const b = understand(typographic);
    expect(b.taskFamily).toBe(a.taskFamily);
    expect(b.requestedArtifact).toBe(a.requestedArtifact);
    expect(b.forbiddenArtifacts).toEqual(a.forbiddenArtifacts);
    expect(b.structurePolicy).toBe(a.structurePolicy);
    expect(b.explicitConstraints.map((c) => `${c.field}:${c.value}`))
      .toEqual(a.explicitConstraints.map((c) => `${c.field}:${c.value}`));
  });
});

describe('understanding contract hygiene', () => {
  test('original text is preserved for display; normalization is parse-only', () => {
    const raw = 'Don’t build the daily itinerary yet.';
    const u = understand(raw);
    expect(u.originalText).toBe(raw);
    expect(u.normalizedText).toBe("Don't build the daily itinerary yet.");
  });

  test('ambiguity is reported rather than guessed', () => {
    const u = understand('Yellowstone, Grand Teton.');
    expect(u.destinationRelationship).toBe('unknown');
    expect(u.needsSemanticResolution).toBe(true);
  });

  test('building understanding performs no provider work', () => {
    understand('Plan two full days in Olympic National Park.');
    understand('Would you pick Acadia or Great Smoky Mountains?');
    const summary = getProviderTestSummary();
    expect(summary.liveOpenAiConstructors).toBe(0);
    expect(summary.liveProviderDispatches).toBe(0);
    expect(summary.externalProviderHttpRequests).toBe(0);
  });
});

// WP-TU Phase 1a (turn-understanding-implementation plan, Task 1a) — additive
// TurnTripContext material only: subjectDestinations/primaryDestination
// hydration and priorConversationalSubject pass-through. No continuity
// reasoning lives here; continuationOfActiveDecision/priorJob/topicShift are
// asserted UNCHANGED by the same change, not merely left alone by assertion.
describe('TurnTripContext Phase 1a — subjectDestinations/primaryDestination hydration', () => {
  test('a single resolved destination is hydrated with name/parkCode/lat/lon/source/confidence', () => {
    const u = understand('Plan two full days in Olympic National Park.');
    expect(u.subjectDestinations).toHaveLength(1);
    const [dest] = u.subjectDestinations;
    expect(dest.parkCode).toBe('olym');
    expect(typeof dest.name).toBe('string');
    expect(dest.name.length).toBeGreaterThan(0);
    expect(typeof dest.lat).toBe('number');
    expect(typeof dest.lon).toBe('number');
    expect(typeof dest.source).toBe('string');
    expect(typeof dest.confidence).toBe('number');
    expect(u.primaryDestination).toEqual(dest);
  });

  test('multiple named destinations all hydrate, in the same order as destinationRefs', () => {
    const u = understand('Acadia or Yosemite?');
    expect(u.subjectDestinations.length).toBe(u.destinationRefs.length);
    expect(u.subjectDestinations.length).toBeGreaterThanOrEqual(2);
    u.subjectDestinations.forEach((dest, i) => {
      expect(dest.parkCode).toBe(u.destinationRefs[i].parkCode);
      expect(dest.name).toBe(u.destinationRefs[i].displayName);
    });
    expect(u.primaryDestination).toEqual(u.subjectDestinations[0]);
  });

  test('no destination named → empty subjectDestinations and a null primaryDestination', () => {
    const u = understand('What can Trailie help me with?');
    expect(u.subjectDestinations).toEqual([]);
    expect(u.primaryDestination).toBeNull();
  });
});

describe('TurnTripContext Phase 1a — priorConversationalSubject pass-through', () => {
  test('round-trips priorTripState.lastConversationalSubject unchanged', () => {
    const subject = { name: 'Acadia National Park', parkCode: 'acad' };
    const u = understand('What about November?', { lastConversationalSubject: subject });
    expect(u.priorConversationalSubject).toEqual(subject);
  });

  test('is null when priorTripState carries no lastConversationalSubject', () => {
    expect(understand('What about November?', { lastTravelerJob: 'day_by_day_itinerary' }).priorConversationalSubject).toBeNull();
    expect(understand('What about November?').priorConversationalSubject).toBeNull();
  });
});

describe('TurnTripContext Phase 1a — continuationOfActiveDecision/topicShift/priorJob are untouched', () => {
  // Representative input: a short follow-up with an active decision open,
  // mirroring turnUnderstandingContinuity.test.js §10's origin-follow-up case.
  // This snapshot must be byte-for-byte identical whether captured against
  // the pre-Phase-1a code or the post-Phase-1a code — it is a proof, not a
  // TDD red/green pair: these three fields are never touched by this task.
  const REPRESENTATIVE_PRIOR_STATE = { lastTravelerJob: 'airport_strategy' };
  const REPRESENTATIVE_PROMPT = "I'm coming from Dallas.";

  test('continuity snapshot for the representative input', () => {
    const u = understand(REPRESENTATIVE_PROMPT, REPRESENTATIVE_PRIOR_STATE);
    expect({
      continuationOfActiveDecision: u.continuationOfActiveDecision,
      priorJob: u.priorJob,
      topicShift: u.topicShift,
    }).toEqual({
      continuationOfActiveDecision: true,
      priorJob: 'airport_strategy',
      topicShift: false,
    });
  });

  test('a second representative input covering the topicShift:true branch', () => {
    // Long enough / explicit enough to leave short-follow-up continuation,
    // and a different task family than the prior job's family.
    const u = understand(
      'Actually, what permits do I need for Rocky Mountain National Park?',
      { lastTravelerJob: 'day_by_day_itinerary' }
    );
    expect({
      continuationOfActiveDecision: u.continuationOfActiveDecision,
      priorJob: u.priorJob,
      topicShift: u.topicShift,
    }).toEqual({
      continuationOfActiveDecision: false,
      priorJob: 'day_by_day_itinerary',
      topicShift: true,
    });
  });
});
