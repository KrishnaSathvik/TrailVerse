const {
  resolveActiveTripContext,
  finalizeActiveTripContextForClient,
  resolveOrdinalOrNamedPick,
  isParkSwitchMessage,
  extractRecommendationListFromMessages,
} = require('../activeTripContextService');

describe('activeTripContextService', () => {
  test('follow-up inherits stored Yellowstone destination', () => {
    const stored = {
      primaryDestination: {
        name: 'Yellowstone National Park',
        parkCode: 'yell',
        type: 'nps',
        lat: 44.428,
        lon: -110.588,
        source: 'user_message',
        confidence: 'high',
      },
      lastRecommendationList: [],
    };

    const result = resolveActiveTripContext({
      lastUserMessage: 'Any good restaurants?',
      storedContext: stored,
    });

    expect(result.activeTripContext.primaryDestination.parkCode).toBe('yell');
    expect(result.activeTripContext.resolutionSource).toBe('stored_follow_up');
    expect(result.allExtractedParks[0].parkCode).toBe('yell');
    expect(result.inheritedDestination).toBe(true);
  });

  test('park switch overrides stored destination', () => {
    const stored = {
      primaryDestination: {
        name: 'Yellowstone National Park',
        parkCode: 'yell',
        type: 'nps',
        confidence: 'high',
      },
    };

    const result = resolveActiveTripContext({
      lastUserMessage: 'Actually switch to Glacier National Park instead',
      storedContext: stored,
    });

    expect(result.activeTripContext.primaryDestination.parkCode).toBe('glac');
    expect(result.activeTripContext.resolutionSource).toBe('park_switch');
    expect(isParkSwitchMessage('Actually switch to Glacier National Park instead', stored.primaryDestination)).toBe(true);
  });

  test('ordinal pick resolves from last recommendation list', () => {
    const list = [
      { name: 'Zion National Park', parkCode: 'zion', confidence: 'high' },
      { name: 'Bryce Canyon National Park', parkCode: 'brca', confidence: 'high' },
    ];

    const picked = resolveOrdinalOrNamedPick('Tell me more about the second one', list);
    expect(picked.parkCode).toBe('brca');

    const result = resolveActiveTripContext({
      lastUserMessage: 'Tell me more about the second one',
      storedContext: { lastRecommendationList: list },
    });
    expect(result.activeTripContext.primaryDestination.parkCode).toBe('brca');
    expect(result.activeTripContext.resolutionSource).toBe('ordinal_pick');
  });

  test('named pick resolves Sedona option from recommendations', () => {
    const list = [
      { name: 'Sedona red rock country', confidence: 'medium' },
      { name: 'Grand Canyon National Park', parkCode: 'grca', confidence: 'high' },
    ];

    const result = resolveActiveTripContext({
      lastUserMessage: 'Yes, the Sedona option sounds best',
      storedContext: { lastRecommendationList: list },
    });

    expect(result.activeTripContext.primaryDestination.name).toMatch(/Sedona/i);
    expect(result.activeTripContext.resolutionSource).toBe('named_pick');
  });

  test('extracts recommendation list from assistant numbered reply', () => {
    const content = `Here are three strong picks:
1. Zion National Park — dramatic canyon hikes
2. Bryce Canyon National Park — hoodoos and stargazing
3. Capitol Reef National Park — quieter option`;

    const list = extractRecommendationListFromMessages([{ role: 'assistant', content }]);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((item) => item.parkCode === 'zion')).toBe(true);
  });

  test('low-confidence clarification when logistics follow-up has no destination', () => {
    const result = resolveActiveTripContext({
      lastUserMessage: 'Any good restaurants?',
      storedContext: null,
    });

    expect(result.activeTripContext.primaryDestination).toBeNull();
    expect(result.activeTripContext.lowConfidenceClarification).toMatch(/Which park/i);
  });

  test('finalize context updates recommendations after assistant reply', () => {
    const finalized = finalizeActiveTripContextForClient({
      activeTripContext: {
        primaryDestination: null,
        lastRecommendationList: [],
        resolutionSource: 'open_ended_discovery',
      },
      assistantContent: '1. Yosemite National Park\n2. Sequoia National Park',
      resolvedMetadata: {},
      openEndedDiscovery: true,
    });

    expect(finalized.lastRecommendationList.length).toBeGreaterThanOrEqual(2);
    expect(finalized.primaryDestination).toBeNull();
  });
});
