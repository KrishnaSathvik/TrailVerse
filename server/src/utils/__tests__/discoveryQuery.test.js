const {
  isBroadDiscoveryQuery,
  isHeadToHeadCompareQuery,
  isOpenEndedDestinationQuery,
  shouldInjectParkDiscovery,
  isDiscoveryRefinementReply,
  buildDiscoverySearchQuery,
  userMessageHasRefinementConstraints,
  isSpecificItineraryRequest,
  shouldRequestItineraryJson,
  shouldShowDayByDayPlanCta,
} = require('../discoveryQuery');

describe('discoveryQuery (principle-based routing)', () => {
  test('open-ended when no park is named in the message', () => {
    const julyBeach =
      'so which is best to visit in July for cool not so hot summer vibes with lakes or beach or even hot springs';
    expect(isOpenEndedDestinationQuery(julyBeach, { namedParkCount: 0 })).toBe(true);
    expect(shouldInjectParkDiscovery(julyBeach, { namedParkCount: 0 })).toBe(true);
    expect(isBroadDiscoveryQuery(julyBeach)).toBe(true);

    expect(
      shouldInjectParkDiscovery(
        'need peaceful trip with my girlfriend she just wants to relax and swim',
        { namedParkCount: 0 }
      )
    ).toBe(true);
  });

  test('head-to-head compare skips catalog discovery when two parks are named', () => {
    const compareMsg = 'Zion vs Bryce for first timers';
    expect(shouldInjectParkDiscovery(compareMsg, { namedParkCount: 2 })).toBe(false);
    expect(isHeadToHeadCompareQuery(compareMsg, 2)).toBe(true);
  });

  test('single named park is a focused question, not destination discovery', () => {
    expect(
      shouldInjectParkDiscovery('what are the best hikes in Yosemite', { namedParkCount: 1 })
    ).toBe(false);
  });

  test('rejects specific itinerary planning', () => {
    const planMsg = 'plan a 3 day trip to yellowstone with kids';
    expect(isBroadDiscoveryQuery(planMsg)).toBe(false);
    expect(shouldInjectParkDiscovery(planMsg, { namedParkCount: 0 })).toBe(false);
  });

  test('rejects very short or non-travel messages', () => {
    expect(isBroadDiscoveryQuery('hi')).toBe(false);
    expect(shouldInjectParkDiscovery('hi')).toBe(false);
  });

  test('detects discovery refinement follow-up with conversation context', () => {
    const discoveryQ =
      'What are the best national parks to visit in July with cool weather, lakes or beaches?';
    const assistantReply =
      '**Olympic** is your top pick for cool July coast and lakes. Acadia and Crater Lake are strong alternates.\n\n**To personalize this:**\n- Where are you starting from?\n- How many days do you have?\n- Road trip only, or okay flying?';
    const refinement = "We're in Boston, have 5 days, and we're fine flying.";

    expect(userMessageHasRefinementConstraints(refinement)).toBe(true);

    const messages = [
      { role: 'user', content: discoveryQ },
      { role: 'assistant', content: assistantReply },
      { role: 'user', content: refinement },
    ];

    expect(isDiscoveryRefinementReply(messages)).toBe(true);
    expect(buildDiscoverySearchQuery(messages)).toContain('Boston');
    expect(buildDiscoverySearchQuery(messages)).toContain('July');
  });

  test('does not treat a fresh discovery question as refinement', () => {
    expect(
      isDiscoveryRefinementReply([
        { role: 'user', content: 'Best parks for couples with ocean views?' },
      ])
    ).toBe(false);
  });

  test('shouldRequestItineraryJson distinguishes discovery from day-by-day plans', () => {
    const discoveryMsg = 'Weekend hiking trip from Denver under $500';
    expect(shouldRequestItineraryJson({
      userMessage: discoveryMsg,
      openEndedDiscovery: true,
    })).toBe(false);
    expect(isSpecificItineraryRequest(discoveryMsg)).toBe(false);

    const planMsg = 'plan a 3 day trip to yellowstone with kids';
    expect(shouldRequestItineraryJson({
      userMessage: planMsg,
      openEndedDiscovery: false,
      metadata: { parkCode: 'yell' },
      constraints: { dates: { numDays: 3 }, hasChildren: true, groupSize: 4 },
      allExtractedParks: [{ parkCode: 'yell' }],
      conversationUserText: planMsg,
    })).toBe(true);
    expect(isSpecificItineraryRequest(planMsg)).toBe(true);

    expect(shouldRequestItineraryJson({
      userMessage: 'best hikes in Yosemite',
      openEndedDiscovery: false,
      metadata: { parkCode: 'yose' },
    })).toBe(false);

    expect(shouldRequestItineraryJson({
      userMessage: 'plan my 2 day Yosemite itinerary',
      openEndedDiscovery: false,
      metadata: { parkCode: 'yose' },
      constraints: { dates: { numDays: 2 }, groupSize: 2 },
      allExtractedParks: [{ parkCode: 'yose' }],
      conversationUserText: 'plan my 2 day Yosemite itinerary for two of us',
    })).toBe(true);
  });

  test('shouldShowDayByDayPlanCta only on first open-ended discovery answer', () => {
    const discoveryMsg = 'Weekend hiking trip from Denver under $500';

    expect(
      shouldShowDayByDayPlanCta({
        openEndedDiscovery: true,
        lastUserMessage: discoveryMsg,
        namedParkCount: 0,
      })
    ).toBe(true);

    expect(
      shouldShowDayByDayPlanCta({
        openEndedDiscovery: true,
        discoveryRefinement: true,
        lastUserMessage: "We're in Boston, have 5 days, and we're fine flying.",
        namedParkCount: 0,
      })
    ).toBe(false);

    expect(
      shouldShowDayByDayPlanCta({
        openEndedDiscovery: false,
        lastUserMessage: 'what are the best hikes in Yosemite',
        namedParkCount: 1,
      })
    ).toBe(false);

    expect(
      shouldShowDayByDayPlanCta({
        openEndedDiscovery: true,
        dayByDayPlanIntake: true,
        lastUserMessage: "I'd like a day-by-day plan for Rocky Mountain National Park.",
        namedParkCount: 1,
      })
    ).toBe(false);

    expect(
      shouldShowDayByDayPlanCta({
        openEndedDiscovery: true,
        hasItinerary: true,
        lastUserMessage: discoveryMsg,
        namedParkCount: 0,
      })
    ).toBe(false);
  });
});
