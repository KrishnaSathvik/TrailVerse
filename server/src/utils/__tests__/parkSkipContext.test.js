'use strict';

const {
  stripSkipOnlyParkSentences,
  filterParksNotSkipOnly,
} = require('../parkSkipContext');

describe('stripSkipOnlyParkSentences', () => {
  test('removes paragraph that leads with Skip + park name', () => {
    const input =
      'Olympic is great.\n\nSkip Great Sand Dunes for this trip — Medano Creek dries up by July.\n\n**To personalize this:**';
    expect(stripSkipOnlyParkSentences(input)).not.toMatch(/great sand dunes/i);
    expect(stripSkipOnlyParkSentences(input)).toMatch(/olympic is great/i);
  });

  test('removes paragraph that names park then dismisses with "I\'d skip it"', () => {
    const input = `For alternates:

- **Acadia National Park** (ME) — beaches and carriage roads.

Great Sand Dunes (Colorado) has Medano Creek for wading in late spring, but it typically dries up by July — so I'd skip it for your water-access goal.

**To personalize this:**`;
    const out = stripSkipOnlyParkSentences(input);
    expect(out).not.toMatch(/great sand dunes/i);
    expect(out).toMatch(/acadia national park/i);
    expect(out).toMatch(/to personalize this/i);
  });

  test('removes linkified park name with skip dismissal', () => {
    const input =
      '[Great Sand Dunes](https://example.com/parks/grsa) has Medano Creek, but it dries up by July — so I would skip it for your water-access goal.';
    expect(stripSkipOnlyParkSentences(input)).toBe('');
  });

  test('keeps compare-style pick that mentions saving another park for later', () => {
    const input =
      'Go with Bryce for October. Save Zion for when you can plan around crowds and permits.';
    expect(stripSkipOnlyParkSentences(input)).toBe(input);
  });

  test('keeps bullet alternate recommendations', () => {
    const input =
      '- **Glacier National Park** (MT) — alpine lakes; book early in July.';
    expect(stripSkipOnlyParkSentences(input)).toBe(input);
  });
});

describe('filterParksNotSkipOnly', () => {
  test('drops park mentioned only in skip-dismissal paragraph', () => {
    const text =
      'Olympic is the pick. Great Sand Dunes (Colorado) dries up by July — so I\'d skip it for your water-access goal.';
    const parks = [
      { parkCode: 'olym', parkName: 'Olympic National Park' },
      { parkCode: 'grsa', parkName: 'Great Sand Dunes National Park' },
    ];
    const filtered = filterParksNotSkipOnly(text, parks);
    expect(filtered.map((p) => p.parkCode)).toEqual(['olym']);
  });
});
