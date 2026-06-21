const {
  planTrailieFetches,
  summarizeFetchPlan,
  getBlockedReason,
  needsLiveData,
  hasLocalLogisticsIntent,
  isShortFollowUp,
  resolveFactFetchMessage,
  shouldAppendGuestLiveUpsell,
} = require('../trailieFetchPlanner');
const { needsWebSearch, shouldAppendAnonymousWebSearchUpsell, fetchRelevantFacts } = require('../factsService');

describe('trailieFetchPlanner', () => {
  test('needsLiveData detects time-sensitive logistics', () => {
    expect(needsLiveData('Best restaurants near Zion tonight?')).toBe(true);
    expect(needsLiveData('Smoke at Yosemite today')).toBe(true);
    expect(needsLiveData('Plan 3 days in Yosemite with easy hikes')).toBe(false);
  });

  test('mixed itinerary + logistics enables web for logged-in users', () => {
    const msg = 'Plan 3 days in Zion and where should we stay in Springdale?';
    expect(hasLocalLogisticsIntent(msg)).toBe(true);
    expect(
      needsWebSearch(msg, {
        parkCode: 'zion',
        conversationUserText: msg,
        resolvedMetadata: { parkName: 'Zion National Park' },
      })
    ).toBe(true);
  });

  test('itinerary-only still skips web', () => {
    const itinerary =
      'Plan a 3-day itinerary for Grand Canyon National Park in October for two adults who like moderate hikes.';
    expect(needsWebSearch(itinerary, { parkCode: 'grca' })).toBe(false);
  });

  test('follow-up inherits destination context for fetch message', () => {
    const resolved = resolveFactFetchMessage({
      lastUserMessage: 'Any good restaurants?',
      conversationUserText: 'Planning Yellowstone in August.\nAny good restaurants?',
      resolvedMetadata: { parkName: 'Yellowstone National Park', parkCode: 'yell' },
    });
    expect(resolved).toMatch(/Yellowstone National Park/i);
    expect(
      planTrailieFetches({
        userMessage: 'Any good restaurants?',
        parkCode: 'yell',
        lat: 44.6,
        lon: -110.5,
        isAnonymous: false,
        conversationUserText: 'Planning Yellowstone in August.',
        resolvedMetadata: { parkName: 'Yellowstone National Park', parkCode: 'yell' },
      }).shouldFetch.web
    ).toBe(true);
  });

  test('guest live boundary flag for restaurants', () => {
    const plan = planTrailieFetches({
      userMessage: 'Best restaurants near Zion tonight?',
      parkCode: 'zion',
      lat: 37.2,
      lon: -112.9,
      isAnonymous: true,
      resolvedMetadata: { parkName: 'Zion National Park' },
    });
    expect(plan.guestNeedsLiveBoundary).toBe(true);
    expect(plan.shouldFetch.web).toBe(false);
    expect(getBlockedReason(plan, 'web')).toBe('guest_mode');
  });

  test('guest mixed itinerary + logistics gets upsell', () => {
    const msg = 'Plan 3 days Zion and where to stay in Springdale';
    expect(
      shouldAppendAnonymousWebSearchUpsell(msg, {
        resolvedMetadata: { parkCode: 'zion', parkName: 'Zion National Park' },
      })
    ).toEqual({ append: true, variant: 'local' });
    expect(shouldAppendGuestLiveUpsell(msg)).toEqual({ append: true, variant: 'local' });
  });

  test('isShortFollowUp recognizes pronoun-style turns', () => {
    expect(isShortFollowUp('Any good restaurants?')).toBe(true);
    expect(
      isShortFollowUp(
        'Actually I want to switch the whole trip to Glacier National Park instead of Yellowstone because of the smoke'
      )
    ).toBe(false);
  });

  test('plan shape includes destinations and blocked fetches', () => {
    const plan = planTrailieFetches({
      userMessage: 'Ranger program at Grand Canyon next Saturday',
      parkCode: 'grca',
      parkName: 'Grand Canyon National Park',
      lat: 36.1,
      lon: -112.1,
      allExtractedParks: [{ parkCode: 'grca', parkName: 'Grand Canyon National Park', lat: 36.1, lon: -112.1 }],
    });

    expect(plan.authTier).toBe('logged_in');
    expect(plan.queryTypes).toContain('events');
    expect(plan.destinations).toHaveLength(1);
    expect(plan.destinations[0].parkCode).toBe('grca');
    expect(plan.shouldFetch.nps).toBe(true);
    expect(plan.shouldFetch.weather).toBe(true);
    expect(plan.shouldFetch.events).toBe(false);
    expect(plan.intentFlags.events).toBe(true);
    expect(getBlockedReason(plan, 'events')).toBe('not_implemented_v1');
    expect(summarizeFetchPlan(plan)).toMatchObject({
      confidence: plan.confidence,
      shouldFetch: plan.shouldFetch,
    });
  });

  test('no park code blocks nps and weather without coords', () => {
    const plan = planTrailieFetches({
      userMessage: 'good restaurants and hotels near Zion',
      parkCode: null,
      lat: null,
      lon: null,
    });
    expect(plan.shouldFetch.nps).toBe(false);
    expect(plan.shouldFetch.weather).toBe(false);
    expect(plan.shouldFetch.web).toBe(true);
    expect(getBlockedReason(plan, 'nps')).toBe('no_park_code');
    expect(getBlockedReason(plan, 'weather')).toBe('no_coordinates');
  });

  test('fetchRelevantFacts attaches fetch plan to factsMeta', async () => {
    const result = await fetchRelevantFacts({
      userMessage: 'Plan 3 days in Yosemite with easy hikes',
      parkCode: 'yose',
      lat: 37.865,
      lon: -119.538,
      parkName: 'Yosemite National Park',
      isAnonymous: true,
    });

    expect(result.fetchPlan).toBeTruthy();
    expect(result.fetchPlan.shouldFetch.nps).toBe(true);
    expect(result.factsMeta.fetchPlan.data.queryTypes).toContain('itinerary');
    expect(result.factsMeta.fetchPlan.source).toBe('trailieFetchPlanner');
  });
});
