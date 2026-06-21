const {
  needsWebSearch,
  classifyQuery,
  shouldAppendAnonymousWebSearchUpsell,
  fetchRelevantFacts,
  hasExplicitNonNpsDestinationSignal,
  formatWebResults,
} = require('../factsService');

describe('factsService web search policy (NPS vs web)', () => {
  test('NPS-authoritative only — no web', () => {
    expect(needsWebSearch('Do I need a permit for The Narrows in Zion?')).toBe(false);
    expect(needsWebSearch('When was Yellowstone National Park established?')).toBe(false);
    expect(needsWebSearch('How do I book a campsite at Yosemite?')).toBe(false);
  });

  test('park discovery and compare — NPS/catalog only, no web', () => {
    expect(
      needsWebSearch(
        'so which is best to visit in July for cool summer vibes with lakes or beach'
      )
    ).toBe(false);
    expect(
      needsWebSearch(
        'Best national parks for a couples getaway with ocean views and easy shoreline walks?'
      )
    ).toBe(false);
    expect(needsWebSearch('Zion vs Bryce for first timers')).toBe(false);
    expect(needsWebSearch('Is Angels Landing open right now in Zion National Park?')).toBe(false);
  });

  test('logistics and roads — web', () => {
    expect(needsWebSearch('good restaurants and hotels near Zion')).toBe(true);
    expect(needsWebSearch('is the road to Glacier open today')).toBe(true);
    expect(
      needsWebSearch('Best hotels and dinner spots in Jackson Hole near Grand Teton National Park?')
    ).toBe(true);
  });

  test('mixed NPS + non-NPS — web', () => {
    expect(
      needsWebSearch('Do I need a permit for The Narrows and where should we stay in Springdale?')
    ).toBe(true);
    expect(
      needsWebSearch('Plan 3 days in Zion and where should we stay in Springdale?', { parkCode: 'zion' })
    ).toBe(true);
  });

  test('non-travel — no web', () => {
    expect(needsWebSearch('write me python code')).toBe(false);
    expect(needsWebSearch('hi')).toBe(false);
  });

  test('itinerary planning — NPS + weather only, no web', () => {
    const itinerary =
      'Plan a 3-day itinerary for Grand Canyon National Park in October for two adults who like moderate hikes.';
    expect(needsWebSearch(itinerary)).toBe(false);
    expect(needsWebSearch(itinerary, { parkCode: 'grca' })).toBe(false);
    expect(shouldAppendAnonymousWebSearchUpsell(itinerary)).toEqual({ append: false });
    expect(shouldAppendAnonymousWebSearchUpsell('good restaurants and hotels near Zion')).toEqual({
      append: true,
      variant: 'local',
    });
  });

  describe('explicit non-NPS destination override (logged-in gate)', () => {
    const noPark = { parkCode: null };
    const yose = { parkCode: 'yose' };

    test('hasExplicitNonNpsDestinationSignal is conservative', () => {
      expect(hasExplicitNonNpsDestinationSignal('Plan a 2-day weekend at Custer State Park')).toBe(true);
      expect(hasExplicitNonNpsDestinationSignal('Plan a relaxed weekend at Valley of Fire')).toBe(true);
      expect(hasExplicitNonNpsDestinationSignal('Best state parks near Chicago for waterfalls')).toBe(false);
      expect(hasExplicitNonNpsDestinationSignal('romantic weekend trip near Chicago')).toBe(false);
    });

    test('named non-NPS itinerary, compare, status, and logistics — web when no parkCode', () => {
      expect(
        needsWebSearch(
          'Plan a 2-day weekend at Custer State Park with easy hikes and wildlife.',
          noPark
        )
      ).toBe(true);
      expect(
        needsWebSearch('Plan a relaxed weekend at Valley of Fire from Las Vegas.', noPark)
      ).toBe(true);
      expect(needsWebSearch('Is Custer State Park open right now?', noPark)).toBe(true);
      expect(
        needsWebSearch('Compare Hocking Hills vs Red River Gorge for a fall weekend.', noPark)
      ).toBe(true);
      expect(needsWebSearch('restaurants and hotels near Zion national park', noPark)).toBe(true);
    });

    test('open-ended discovery and NPS itinerary — no override', () => {
      expect(
        needsWebSearch('Best state parks near Chicago for waterfalls and easy hikes.', noPark)
      ).toBe(false);
      expect(needsWebSearch('Plan 3 days in Yosemite with easy hikes', yose)).toBe(false);
      expect(needsWebSearch('Plan 3 days in Yosemite with easy hikes', noPark)).toBe(false);
    });

    test('anonymous fetch still skips web even when needsWebSearch would be true', async () => {
      const msg = 'Plan a 2-day weekend at Custer State Park with easy hikes and wildlife.';
      expect(needsWebSearch(msg, noPark)).toBe(true);

      const result = await fetchRelevantFacts({
        userMessage: msg,
        parkCode: null,
        isAnonymous: true,
      });

      expect(result.factsMeta.webSearch.status).toBe('not_requested');
      expect(result.webSearchAttempted).toBe(false);
      expect(result.webSearchFacts).toBeNull();
    });
  });

  test('anonymous upsell skips discovery, compare, couples, and permits', () => {
    expect(
      shouldAppendAnonymousWebSearchUpsell(
        'best national parks to visit in July with cool weather lakes or beaches'
      )
    ).toEqual({ append: false });
    expect(
      shouldAppendAnonymousWebSearchUpsell(
        'Best national parks for a couples getaway with ocean views and easy shoreline walks?'
      )
    ).toEqual({ append: false });
    expect(shouldAppendAnonymousWebSearchUpsell('Zion vs Bryce for first timers')).toEqual({
      append: false,
    });
    expect(
      shouldAppendAnonymousWebSearchUpsell('Do I need a permit to hike The Narrows top-down in Zion?')
    ).toEqual({ append: false });
  });

  test('classifyQuery avoids substring false positives', () => {
    const julyLakes =
      'best national parks to visit in July with cool weather lakes or beaches';
    expect(classifyQuery(julyLakes)).toBe('planning');
    expect(classifyQuery('good restaurants and hotels near Zion')).toBe('local-business');
    expect(classifyQuery('kayaking workshop class near Acadia')).toBe('local-business');
    expect(classifyQuery('is Angels Landing open right now')).toBe('operational-status');
  });
});

describe('formatWebResults', () => {
  test('includes Link URL for google-places entries', () => {
    const out = formatWebResults(
      [
        {
          title: 'Jackson Lake Lodge',
          snippet: '123 Main · Rating: 4.5/5',
          url: 'https://www.gtlodge.com/',
          source: 'google-places',
        },
      ],
      null,
      'local-business'
    );
    expect(out).toContain('Jackson Lake Lodge');
    expect(out).toContain('Link: https://www.gtlodge.com/');
    expect(out).toMatch(/link the business name to its Link/i);
  });
});
