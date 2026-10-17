'use strict';

const {
  normalizeUserText,
  withNormalizedText,
} = require('../lexicalNormalization');

describe('lexicalNormalization — semantic-equivalent typography', () => {
  test('typographic apostrophes normalize to ASCII', () => {
    expect(normalizeUserText('Don’t build the daily itinerary yet.'))
      .toBe("Don't build the daily itinerary yet.");
    expect(normalizeUserText('I‘m going Saturday')).toBe("I'm going Saturday");
    expect(normalizeUserText('we´re flying in')).toBe("we're flying in");
  });

  test('smart double quotes normalize to ASCII', () => {
    expect(normalizeUserText('he called it “exposed”')).toBe('he called it "exposed"');
  });

  test('non-breaking and exotic spaces collapse to plain spaces', () => {
    expect(normalizeUserText('three days in Zion')).toBe('three days in Zion');
  });

  test('en/em dashes normalize for phrase parsing', () => {
    expect(normalizeUserText('day–by—day')).toBe('day-by-day');
    expect(normalizeUserText('3–4 days')).toBe('3-4 days');
  });

  test('ellipsis and repeated whitespace are bounded', () => {
    expect(normalizeUserText('hmm…   maybe   two   days')).toBe('hmm... maybe two days');
    expect(normalizeUserText('  leading and trailing  ')).toBe('leading and trailing');
  });

  test('decomposed Unicode is composed before matching', () => {
    // "don’t" written with a combining acute elsewhere in the string must not
    // change the semantic content of the sentence.
    const decomposed = 'Don’t visit Bryce Cañon';
    expect(normalizeUserText(decomposed)).toBe("Don't visit Bryce Cañon");
  });

  test('is a no-op for already-plain ASCII', () => {
    const plain = "Don't build the daily itinerary yet.";
    expect(normalizeUserText(plain)).toBe(plain);
  });

  test('handles null/undefined/non-string input safely', () => {
    expect(normalizeUserText(null)).toBe('');
    expect(normalizeUserText(undefined)).toBe('');
    expect(normalizeUserText(42)).toBe('42');
  });

  test('withNormalizedText preserves the original for display/persistence', () => {
    const raw = 'Don’t build the daily itinerary yet.';
    const pair = withNormalizedText(raw);
    expect(pair.originalText).toBe(raw);
    expect(pair.normalizedText).toBe("Don't build the daily itinerary yet.");
    expect(pair.changed).toBe(true);

    const plain = withNormalizedText('two days in Zion');
    expect(plain.changed).toBe(false);
  });
});
