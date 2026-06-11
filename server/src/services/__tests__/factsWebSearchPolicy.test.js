const { needsWebSearch, classifyQuery, shouldAppendAnonymousWebSearchUpsell } = require('../factsService');

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
  });

  test('non-travel — no web', () => {
    expect(needsWebSearch('write me python code')).toBe(false);
    expect(needsWebSearch('hi')).toBe(false);
  });

  test('itinerary planning — NPS + weather only, no web', () => {
    const itinerary =
      'Plan a 3-day itinerary for Grand Canyon National Park in October for two adults who like moderate hikes.';
    expect(needsWebSearch(itinerary)).toBe(false);
    expect(shouldAppendAnonymousWebSearchUpsell(itinerary)).toEqual({ append: false });
    expect(shouldAppendAnonymousWebSearchUpsell('good restaurants and hotels near Zion')).toEqual({
      append: true,
      variant: 'local',
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
