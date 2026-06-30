const {
  resolveActiveTripContext,
  finalizeActiveTripContextForClient,
  resolveOrdinalOrNamedPick,
  isParkSwitchMessage,
  extractRecommendationListFromMessages,
  extractUserOrderedCompareOptions,
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

  test('"tell me more about it" inherits stored primary destination', () => {
    const stored = {
      primaryDestination: {
        name: 'Zion National Park',
        parkCode: 'zion',
        type: 'nps',
        confidence: 'high',
      },
      lastRecommendationList: [
        { name: 'Zion National Park', parkCode: 'zion', confidence: 'high' },
        { name: 'Bryce Canyon National Park', parkCode: 'brca', confidence: 'high' },
      ],
    };

    const result = resolveActiveTripContext({
      lastUserMessage: 'tell me more about it',
      storedContext: stored,
    });

    expect(result.activeTripContext.primaryDestination.parkCode).toBe('zion');
    expect(result.activeTripContext.resolutionSource).toBe('itinerary_refinement');
    expect(result.inheritedDestination).toBe(true);
  });

  test('"what about the second one?" resolves to second recommendation', () => {
    const list = [
      { name: 'Zion National Park', parkCode: 'zion', confidence: 'high' },
      { name: 'Bryce Canyon National Park', parkCode: 'brca', confidence: 'high' },
    ];

    const result = resolveActiveTripContext({
      lastUserMessage: 'what about the second one?',
      storedContext: { lastRecommendationList: list },
    });

    expect(result.activeTripContext.primaryDestination.parkCode).toBe('brca');
    expect(result.activeTripContext.resolutionSource).toBe('ordinal_pick');
  });

  test('ordinal pick resolves from last recommendation list', () => {
    const list = [
      { name: 'Zion National Park', parkCode: 'zion', confidence: 'high' },
      { name: 'Bryce Canyon National Park', parkCode: 'brca', confidence: 'high' },
    ];

    const picked = resolveOrdinalOrNamedPick('Tell me more about the second one', {
      lastRecommendationList: list,
    });
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

  test('zion itinerary refinement inherits destination from conversation history', () => {
    const conversationUserText =
      'Plan a realistic 2-day Zion trip for a couple who wants scenic views, easy-to-moderate hikes, and no exposed scary trails.\n' +
      'Actually make it more relaxed, avoid shuttle-heavy parts if possible, and add one good sunset spot.';

    const result = resolveActiveTripContext({
      lastUserMessage:
        'Actually make it more relaxed, avoid shuttle-heavy parts if possible, and add one good sunset spot.',
      conversationUserText,
      filteredMessages: [
        {
          role: 'user',
          content:
            'Plan a realistic 2-day Zion trip for a couple who wants scenic views, easy-to-moderate hikes, and no exposed scary trails.',
        },
        { role: 'assistant', content: 'At a glance — Zion weekend plan...' },
        {
          role: 'user',
          content:
            'Actually make it more relaxed, avoid shuttle-heavy parts if possible, and add one good sunset spot.',
        },
      ],
      storedContext: null,
    });

    expect(result.activeTripContext.primaryDestination.parkCode).toBe('zion');
    expect(result.activeTripContext.resolutionSource).toBe('itinerary_refinement');
    expect(result.inheritedDestination).toBe(true);
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

  test('extracts user compare list in original order (Acadia, Shenandoah, Smokies)', () => {
    const compareMsg =
      'For a first national park trip with my wife, should we choose Acadia, Shenandoah, or Great Smoky Mountains?';
    const options = extractUserOrderedCompareOptions(compareMsg);
    expect(options).toHaveLength(3);
    expect(options[0].parkCode).toBe('acad');
    expect(options[1].parkCode).toBe('shen');
    expect(options[2].parkCode).toBe('grsm');
  });

  test('"second one" resolves to Shenandoah using user compare order, not winner', () => {
    const compareMsg =
      'For a first national park trip with my wife, should we choose Acadia, Shenandoah, or Great Smoky Mountains?';
    const lastComparedOptions = extractUserOrderedCompareOptions(compareMsg);
    const storedContext = {
      lastComparedOptions,
      recommendedOption: lastComparedOptions[0],
      primaryDestination: lastComparedOptions[0],
    };

    const result = resolveActiveTripContext({
      lastUserMessage: 'Tell me more about the second one and make it a 2-day plan.',
      storedContext,
    });

    expect(result.activeTripContext.primaryDestination.parkCode).toBe('shen');
    expect(result.activeTripContext.resolutionSource).toBe('ordinal_pick');
  });

  test('"third one" resolves to Great Smoky Mountains from user order', () => {
    const compareMsg =
      'For a first national park trip with my wife, should we choose Acadia, Shenandoah, or Great Smoky Mountains?';
    const lastComparedOptions = extractUserOrderedCompareOptions(compareMsg);
    const storedContext = {
      lastComparedOptions,
      recommendedOption: lastComparedOptions[0],
    };

    const picked = resolveOrdinalOrNamedPick('Tell me about the third one', {
      lastComparedOptions,
      recommendedOption: lastComparedOptions[0],
    });
    expect(picked.parkCode).toBe('grsm');
  });

  test('"your pick" resolves to recommended winner (Acadia)', () => {
    const compareMsg =
      'For a first national park trip with my wife, should we choose Acadia, Shenandoah, or Great Smoky Mountains?';
    const lastComparedOptions = extractUserOrderedCompareOptions(compareMsg);
    const recommendedOption = lastComparedOptions[0];

    const picked = resolveOrdinalOrNamedPick('Plan a trip for your pick', {
      lastComparedOptions,
      recommendedOption,
    });
    expect(picked.parkCode).toBe('acad');
    expect(picked.source).toBe('recommended_pick');
  });

  test('finalize preserves lastComparedOptions and sets recommendedOption separately', () => {
    const compareMsg =
      'For a first national park trip with my wife, should we choose Acadia, Shenandoah, or Great Smoky Mountains?';
    const lastComparedOptions = extractUserOrderedCompareOptions(compareMsg);
    const assistantContent =
      'For a first-timer couple, I would go with Acadia National Park — ocean views and manageable trails.';

    const finalized = finalizeActiveTripContextForClient({
      activeTripContext: {
        primaryDestination: null,
        lastComparedOptions,
        recommendedOption: null,
        lastRecommendationList: [],
        resolutionSource: 'open_ended_discovery',
      },
      assistantContent,
      resolvedMetadata: {},
      openEndedDiscovery: false,
    });

    expect(finalized.lastComparedOptions).toHaveLength(3);
    expect(finalized.lastComparedOptions[1].parkCode).toBe('shen');
    expect(finalized.recommendedOption.parkCode).toBe('acad');
    expect(finalized.lastRecommendationList[0].parkCode).toBe('acad');
  });

  test('itinerary refinement keeps locked North Cascades destination', () => {
    const lockedPlan = {
      name: 'North Cascades National Park',
      parkCode: 'noca',
      type: 'nps',
      confidence: 'high',
    };
    const storedContext = {
      primaryDestination: lockedPlan,
      lockedPlanDestination: lockedPlan,
      lastComparedOptions: [
        { name: 'Mount Rainier National Park', parkCode: 'mora', ordinal: 1 },
        { name: 'Olympic National Park', parkCode: 'olym', ordinal: 2 },
        { name: 'North Cascades National Park', parkCode: 'noca', ordinal: 3 },
      ],
      recommendedOption: lockedPlan,
    };

    const rainResult = resolveActiveTripContext({
      lastUserMessage: 'What if it rains one day?',
      conversationUserText:
        'Should I pick Mount Rainier, Olympic, or North Cascades?\nWhat if it rains one day?',
      filteredMessages: [
        { role: 'user', content: 'Should I pick Mount Rainier, Olympic, or North Cascades?' },
        { role: 'assistant', content: 'Go with North Cascades for easy alpine lakes.' },
        { role: 'user', content: 'What if it rains one day?' },
      ],
      storedContext,
      openEndedDiscovery: false,
    });

    expect(rainResult.activeTripContext.primaryDestination.parkCode).toBe('noca');
    expect(rainResult.activeTripContext.resolutionSource).toBe('locked_plan_refinement');
  });

  test('locked plan destination set after itinerary generation', () => {
    const primary = {
      name: 'North Cascades National Park',
      parkCode: 'noca',
      type: 'nps',
      confidence: 'high',
    };

    const finalized = finalizeActiveTripContextForClient({
      activeTripContext: {
        primaryDestination: primary,
        lockedPlanDestination: null,
        lastComparedOptions: [],
        recommendedOption: primary,
        lastRecommendationList: [],
        resolutionSource: 'itinerary_commit',
      },
      assistantContent: '## At a glance — relaxed North Cascades weekend',
      resolvedMetadata: { parkCode: 'noca', parkName: 'North Cascades National Park' },
      openEndedDiscovery: false,
      hasItinerary: true,
    });

    expect(finalized.lockedPlanDestination.parkCode).toBe('noca');
    expect(finalized.primaryDestination.parkCode).toBe('noca');
  });
});
