const {
  buildTripState,
  extractConversationSummaryFromMessages,
  computeTripStateCompleteness,
  layerFromAiContext,
  layerFromFormData,
  layerFromCurrentMessage,
} = require('../tripStateBuilder');

describe('tripState precedence', () => {
  const baseConstraints = {
    parkCode: 'zion',
    dates: { start: '2026-08-01', end: '2026-08-03', numDays: 3 },
    groupSize: 2,
    fitnessLevel: 'moderate',
    budget: '2000',
    accommodation: 'camping',
    interests: ['hiking'],
    hasChildren: false,
    hasConstraints: true,
  };

  test('current message overrides QuickFill formData for destination', () => {
    const state = buildTripState({
      metadata: {
        formData: { parkCode: 'yose', groupSize: 4, fitnessLevel: 'easy' },
        parkName: 'Yosemite National Park',
      },
      constraints: baseConstraints,
      resolvedMetadata: { parkCode: 'zion', parkName: 'Zion National Park' },
      allExtractedParks: [{ parkCode: 'zion', parkName: 'Zion National Park' }],
      lastUserMessage: 'Plan my Zion trip for 2 people, moderate hiker',
    });

    expect(state.destination.parkCode).toBe('zion');
    expect(state.travelers.count).toBe(2);
    expect(state.preferences.fitness).toBe('moderate');
  });

  test('QuickFill overrides saved aiContext preferences', () => {
    const state = buildTripState({
      metadata: {
        aiContext: {
          preferredFitness: 'easy',
          preferredBudget: 'luxury',
          topInterests: ['photography'],
        },
        formData: {
          parkCode: 'grca',
          fitnessLevel: 'moderate',
          budget: 'moderate',
          interests: ['hiking'],
        },
      },
      constraints: { parkCode: 'grca', hasConstraints: true },
      resolvedMetadata: { parkCode: 'grca', parkName: 'Grand Canyon' },
      lastUserMessage: 'Sounds good',
    });

    expect(state.preferences.fitness).toBe('moderate');
    expect(state.preferences.budget).toBe('moderate');
    expect(state.preferences.interests).toEqual(['hiking']);
  });

  test('conversation summary fills gaps but current message wins on conflict', () => {
    const messages = [
      { role: 'user', content: 'I want to visit Yellowstone with 4 people, budget $3000' },
      { role: 'assistant', content: 'Great choice!' },
      { role: 'user', content: 'Actually make it 2 people for Zion in August' },
    ];
    const summary = extractConversationSummaryFromMessages(messages);

    const state = buildTripState({
      metadata: {},
      constraints: {
        parkCode: 'zion',
        dates: { start: '2026-08-10', end: null, numDays: null },
        groupSize: 2,
        budget: null,
        hasConstraints: true,
      },
      resolvedMetadata: { parkCode: 'zion', parkName: 'Zion National Park' },
      allExtractedParks: [{ parkCode: 'zion', parkName: 'Zion National Park' }],
      conversationSummary: summary,
      lastUserMessage: 'Actually make it 2 people for Zion in August',
    });

    expect(state.destination.parkCode).toBe('zion');
    expect(state.travelers.count).toBe(2);
    expect(state.preferences.budget).toBe('3000');
  });

  test('saved TripPlan formData sits above aiContext', () => {
    const state = buildTripState({
      metadata: {
        aiContext: { preferredFitness: 'easy', topInterests: ['wildlife'] },
      },
      savedTripPlan: {
        parkCode: 'yell',
        parkName: 'Yellowstone',
        formData: { fitnessLevel: 'moderate', groupSize: 3, accommodation: 'lodge' },
      },
      constraints: { parkCode: 'yell', hasConstraints: true },
      resolvedMetadata: { parkCode: 'yell', parkName: 'Yellowstone' },
      lastUserMessage: 'Continue planning',
    });

    expect(state.destination.parkCode).toBe('yell');
    expect(state.travelers.count).toBe(3);
    expect(state.lodging.type).toBe('lodge');
    expect(state.preferences.fitness).toBe('moderate');
  });

  test('derives openQuestions for incomplete state', () => {
    const state = buildTripState({
      metadata: {},
      constraints: { hasConstraints: false },
      resolvedMetadata: {},
      lastUserMessage: 'What parks should I visit?',
    });

    expect(state.openQuestions).toContain('destination');
    expect(state.openQuestions).toContain('dates_or_duration');
  });
});

describe('layerFromCurrentMessage', () => {
  test('extracts pets and accessibility from message', () => {
    const layer = layerFromCurrentMessage({
      constraints: { hasConstraints: false },
      resolvedMetadata: {},
      allExtractedParks: [],
      userCity: { name: 'Denver, CO' },
      lastUserMessage: 'Dog-friendly accessible Zion trip, relaxed pace',
    });

    expect(layer.travelers.pets).toBe(true);
    expect(layer.travelers.accessibilityNeeds).toContain('accessible');
    expect(layer.preferences.pace).toBe('relaxed');
    expect(layer.transportation.startLocation).toBe('Denver, CO');
  });
});

describe('computeTripStateCompleteness', () => {
  test('returns ratio of filled core fields', () => {
    const partial = buildTripState({
      metadata: { formData: { parkCode: 'zion', groupSize: 2 } },
      constraints: { parkCode: 'zion', groupSize: 2, hasConstraints: true },
      resolvedMetadata: { parkCode: 'zion', parkName: 'Zion' },
      lastUserMessage: 'Zion for 2',
    });

    const score = computeTripStateCompleteness(partial);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('layerFromAiContext', () => {
  test('maps profile preferences without overwriting explicit form data in merge', () => {
    const aiLayer = layerFromAiContext({
      preferredFitness: 'easy',
      preferredBudget: 'budget',
      topInterests: ['astrophotography'],
      recentParks: [{ code: 'deva', name: 'Death Valley' }],
    });
    const formLayer = layerFromFormData({ fitnessLevel: 'moderate' }, {});

    expect(aiLayer.preferences.fitness).toBe('easy');
    expect(formLayer.preferences.fitness).toBe('moderate');
  });
});
