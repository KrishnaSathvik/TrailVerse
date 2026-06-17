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
});
