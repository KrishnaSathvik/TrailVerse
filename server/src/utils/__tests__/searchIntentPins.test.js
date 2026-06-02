const { resolveSearchPinsFromQuery } = require('../searchIntentPins');

describe('searchIntentPins', () => {
  test('quiet + couples merges editorial pins', () => {
    const pins = resolveSearchPinsFromQuery('quiet parks for couples');
    expect(pins.length).toBeGreaterThanOrEqual(5);
    expect(pins).toContain('noca');
    expect(pins).toContain('acad');
  });

  test('couples only uses couples pins', () => {
    const pins = resolveSearchPinsFromQuery('best parks for couples');
    expect(pins[0]).toBe('acad');
  });
});
