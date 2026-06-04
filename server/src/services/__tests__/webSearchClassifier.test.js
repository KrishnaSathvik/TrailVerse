const {
  classifyQueryRegex,
  shouldRefineCategoryWithLlm,
  FRESHNESS_SIGNALS,
} = require('../webSearchClassifier');

describe('webSearchClassifier', () => {
  test('operational-status for open/closed today without road keywords', () => {
    expect(classifyQueryRegex('is Angels Landing open right now in Zion?')).toBe('operational-status');
    expect(classifyQueryRegex('is the Narrows still closed today')).toBe('operational-status');
  });

  test('trail-conditions wins over operational when trail is explicit', () => {
    expect(
      classifyQueryRegex('The Narrows trail conditions muddy or closed this week')
    ).toBe('trail-conditions');
  });

  test('planning without false positives from weather or campfire', () => {
    const july =
      'best national parks to visit in July with cool weather lakes or beaches';
    expect(classifyQueryRegex(july)).toBe('planning');
    expect(classifyQueryRegex('campfire rules in Yellowstone')).not.toBe('wildfire-smoke');
  });

  test('substring guards on local and wildlife', () => {
    expect(classifyQueryRegex('good restaurants near Zion')).toBe('local-business');
    expect(classifyQueryRegex('kayaking workshop class near Acadia')).toBe('local-business');
    expect(classifyQueryRegex('bird watching in Everglades')).toBe('wildlife-seasonal');
  });

  test('LLM refine triggers for planning + freshness', () => {
    expect(shouldRefineCategoryWithLlm('planning', 'best parks in July')).toBe(false);
    expect(
      shouldRefineCategoryWithLlm('planning', 'is Yosemite valley open today')
    ).toBe(true);
    expect(FRESHNESS_SIGNALS.test('open today')).toBe(true);
  });
});
