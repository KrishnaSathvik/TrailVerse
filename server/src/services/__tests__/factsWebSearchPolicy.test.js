const { needsWebSearch, classifyQuery, shouldAppendAnonymousWebSearchUpsell } = require('../factsService');

describe('factsService web search policy (NPS vs web)', () => {
  test('NPS-authoritative only — no web', () => {
    expect(needsWebSearch('Do I need a permit for The Narrows in Zion?')).toBe(false);
    expect(needsWebSearch('When was Yellowstone National Park established?')).toBe(false);
    expect(needsWebSearch('How do I book a campsite at Yosemite?')).toBe(false);
  });

  test('non-NPS travel — web', () => {
    expect(
      needsWebSearch(
        'so which is best to visit in July for cool summer vibes with lakes or beach'
      )
    ).toBe(true);
    expect(needsWebSearch('good restaurants and hotels near Zion')).toBe(true);
    expect(needsWebSearch('is the road to Glacier open today')).toBe(true);
    expect(needsWebSearch('Zion vs Bryce for first timers')).toBe(true);
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

  test('anonymous upsell skips pure itinerary planning', () => {
    const itinerary =
      'Plan a 3-day itinerary for Grand Canyon National Park in October for two adults who like moderate hikes.';
    expect(shouldAppendAnonymousWebSearchUpsell(itinerary)).toEqual({ append: false });
    expect(shouldAppendAnonymousWebSearchUpsell('good restaurants and hotels near Zion')).toEqual({
      append: true,
      variant: 'local',
    });
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
