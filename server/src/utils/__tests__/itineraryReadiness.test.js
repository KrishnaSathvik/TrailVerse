const {
  assessItineraryReadiness,
  inferDurationFromText,
  inferGroupFromText,
} = require('../itineraryReadiness');
const { shouldRequestItineraryJson } = require('../discoveryQuery');

describe('itineraryReadiness', () => {
  test('infers weekend and couple from conversation text', () => {
    expect(inferDurationFromText('weekend hiking trip from Denver')).toBe(2);
    expect(inferGroupFromText('trip with my wife')).toBe(2);
  });

  test('infers hyphenated day count from message', () => {
    expect(inferDurationFromText('Plan a realistic 2-day Zion trip for a couple')).toBe(2);
  });

  test('ready for zion couple 2-day plan with skipUserContext', () => {
    const text =
      'Plan a realistic 2-day Zion trip for a couple who wants scenic views, easy-to-moderate hikes, and no exposed scary trails.';
    const result = assessItineraryReadiness({
      metadata: { parkCode: 'zion', skipUserContext: true },
      allExtractedParks: [{ parkCode: 'zion', parkName: 'Zion National Park' }],
      conversationUserText: text,
      skipUserContext: true,
    });
    expect(result.ready).toBe(true);
    expect(result.inferred.numDays).toBe(2);
    expect(result.inferred.groupSize).toBe(2);
  });

  test('ready for Valley of Fire weekend with skipUserContext defaults', () => {
    const text =
      'Plan a relaxed weekend at Valley of Fire from Las Vegas with easy hikes, sunset spots, and minimal rushing.';
    const result = assessItineraryReadiness({
      metadata: { resolvedPlaceName: 'Valley of Fire, Nevada', skipUserContext: true },
      conversationUserText: text,
      skipUserContext: true,
    });
    expect(result.ready).toBe(true);
    expect(result.inferred.numDays).toBe(2);
    expect(result.inferred.groupSize).toBe(2);
  });

  test('ready when destination, duration, and group are known', () => {
    const result = assessItineraryReadiness({
      metadata: { parkCode: 'romo', intakeParkName: 'Rocky Mountain National Park' },
      constraints: { dates: { numDays: 2 }, groupSize: 2 },
      conversationUserText: 'Weekend hiking trip from Denver under $500',
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  test('missing fields when only vague plan request', () => {
    const result = assessItineraryReadiness({
      conversationUserText: 'help me plan a trip',
    });
    expect(result.ready).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });
});

describe('shouldRequestItineraryJson with readiness', () => {
  test('CTA intake metadata does not force itinerary JSON', () => {
    expect(
      shouldRequestItineraryJson({
        userMessage: "I'd like a day-by-day plan for Rocky Mountain based on your recommendations.",
        metadata: { dayByDayPlanIntake: true, intakeParkName: 'Rocky Mountain National Park' },
        conversationUserText: 'Weekend hiking trip from Denver under $500',
      })
    ).toBe(false);
  });

  test('plan request with 2-day zion couple is ready for JSON', () => {
    const text =
      'Plan a realistic 2-day Zion trip for a couple who wants scenic views, easy-to-moderate hikes, and no exposed scary trails.';
    expect(
      shouldRequestItineraryJson({
        userMessage: text,
        metadata: { parkCode: 'zion', skipUserContext: true },
        allExtractedParks: [{ parkCode: 'zion' }],
        conversationUserText: text,
      })
    ).toBe(true);
  });

  test('Valley of Fire weekend plan is ready for JSON with skipUserContext', () => {
    const text =
      'Plan a relaxed weekend at Valley of Fire from Las Vegas with easy hikes, sunset spots, and minimal rushing.';
    expect(
      shouldRequestItineraryJson({
        userMessage: text,
        metadata: { resolvedPlaceName: 'Valley of Fire, Nevada', skipUserContext: true },
        conversationUserText: text,
      })
    ).toBe(true);
  });

  test('complete plan request is ready for JSON', () => {
    expect(
      shouldRequestItineraryJson({
        userMessage: 'plan a 3 day trip to yellowstone with kids',
        metadata: { parkCode: 'yell' },
        constraints: { dates: { numDays: 3 }, hasChildren: true, groupSize: 4 },
        allExtractedParks: [{ parkCode: 'yell' }],
        conversationUserText: 'plan a 3 day trip to yellowstone with kids',
      })
    ).toBe(true);
  });

  test('plan request without enough context waits for answers', () => {
    expect(
      shouldRequestItineraryJson({
        userMessage: 'plan a detailed itinerary for me',
        conversationUserText: 'plan a detailed itinerary for me',
      })
    ).toBe(false);
  });

  test('commit request with recommended destination assumes defaults and requests JSON', () => {
    expect(
      shouldRequestItineraryJson({
        userMessage: 'Okay choose one and make a relaxed itinerary.',
        metadata: {
          activeTripContext: {
            recommendedOption: {
              name: 'North Cascades National Park',
              parkCode: 'noca',
            },
          },
        },
        allExtractedParks: [],
        conversationUserText: 'Should I pick Mount Rainier, Olympic, or North Cascades?',
      })
    ).toBe(true);
  });
});
