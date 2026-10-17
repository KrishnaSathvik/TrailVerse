'use strict';

/**
 * GATE #5 BLOCKER B — an apostrophe silently destroyed a destination.
 *
 * Live Turn C sent "Give us three relaxed days at Hawai'i Volcanoes" with the
 * ORDINARY ASCII apostrophe (U+0027) and got:
 *
 *   extractAllParksFromMessage(...)  →  []
 *
 * Cascade: no destination → destinationRelationship "unknown" → the legacy
 * classifier called it activity_advice → `legacy_artifact_escalation_blocked`
 * → an explicit three-day itinerary request was silently answered as prose,
 * with nothing persisted and no notice to the traveller.
 *
 * `collectCatalogKeyMatches` tested `message.toLowerCase().includes(key)` against
 * catalog keys like 'hawaii volcanoes'. "hawai'i volcanoes" is simply not a
 * substring of that. The fix folds apostrophe-like punctuation for MATCHING only
 * — display names are untouched.
 */

const {
  extractAllParksFromMessage,
  foldApostrophes,
} = require('../parkExtractor');

const APOSTROPHES = [
  ['ASCII U+0027', "'"],
  ["right single quote U+2019", '’'],
  ["okina U+02BB", 'ʻ'],
  ["left single quote U+2018", '‘'],
  ["acute accent U+00B4", '´'],
  ["backtick U+0060", '`'],
];

describe('B3 — every apostrophe spelling resolves to the same park', () => {
  it.each(APOSTROPHES)('Hawai%si Volcanoes resolves to havo (%s)', (_label, mark) => {
    const message = `Give us three relaxed days at Hawai${mark}i Volcanoes. We care about volcanic landscapes.`;
    const parks = extractAllParksFromMessage(message);
    expect(parks.map((p) => p.parkCode)).toEqual(['havo']);
  });

  it('the plain "Hawaii Volcanoes" spelling still resolves', () => {
    expect(extractAllParksFromMessage('three days at Hawaii Volcanoes').map((p) => p.parkCode))
      .toEqual(['havo']);
  });

  it('the full canonical name resolves in every spelling', () => {
    for (const [, mark] of APOSTROPHES) {
      expect(extractAllParksFromMessage(`a week at Hawai${mark}i Volcanoes National Park`).map((p) => p.parkCode))
        .toEqual(['havo']);
    }
  });

  it('the EXACT Gate #5 Turn C message resolves', () => {
    const TURN_C = "Give us three relaxed days at Hawai'i Volcanoes. We care about volcanic "
      + 'landscapes, viewpoints, photography, and cultural/history stops more than long hikes.';
    expect(extractAllParksFromMessage(TURN_C).map((p) => p.parkCode)).toEqual(['havo']);
  });
});

describe('B2 — matching form vs display form', () => {
  it('folding is for matching only; the display name keeps its proper spelling', () => {
    const parks = extractAllParksFromMessage("three days at Hawaiʻi Volcanoes National Park");
    expect(parks[0].parkName).toMatch(/Hawaii Volcanoes National Park/i);
    // The traveller's own text is never rewritten by the matcher.
    expect(foldApostrophes("Hawaiʻi")).toBe('Hawaii');
    expect(foldApostrophes('Hawaii')).toBe('Hawaii');
  });

  it('folding removes ONLY apostrophe-like marks, not other punctuation', () => {
    expect(foldApostrophes('Great Sand Dunes National Park & Preserve'))
      .toBe('Great Sand Dunes National Park & Preserve');
    expect(foldApostrophes('Theodore Roosevelt National Park')).toBe('Theodore Roosevelt National Park');
    expect(foldApostrophes('Sequoia & Kings Canyon')).toBe('Sequoia & Kings Canyon');
    expect(foldApostrophes('Wrangell - St Elias')).toBe('Wrangell - St Elias');
  });
});

describe('offsets survive folding — spans stay aligned with the original message', () => {
  it('resolves a park that appears after an apostrophe earlier in the sentence', () => {
    const message = "We're taking a break; give us two days at Hawai’i Volcanoes and then Haleakala.";
    const codes = extractAllParksFromMessage(message).map((p) => p.parkCode).sort();
    expect(codes).toContain('havo');
  });

  it('still distinguishes two parks named in one message', () => {
    const codes = extractAllParksFromMessage('four days across Zion and Bryce Canyon')
      .map((p) => p.parkCode).sort();
    expect(codes).toEqual(['brca', 'zion']);
  });
});

describe('B1 controls — the other gate destinations are unaffected', () => {
  it.each([
    ['Great Sand Dunes', 'Give us two relaxed days at Great Sand Dunes.', 'grsa'],
    ['Theodore Roosevelt', 'Plan three easygoing days in Theodore Roosevelt National Park.', 'thro'],
    ['Canyonlands', 'Give us three relaxed days in Canyonlands.', 'cany'],
  ])('%s still resolves', (_label, message, code) => {
    expect(extractAllParksFromMessage(message).map((p) => p.parkCode)).toEqual([code]);
  });

  it('an unrelated message still resolves nothing', () => {
    expect(extractAllParksFromMessage("What's the weather like tomorrow?")).toEqual([]);
  });
});

describe('the DYNAMIC NPS catalog is the real production path', () => {
  const {
    setDynamicMapForTests,
    clearDynamicMapForTests,
  } = require('../parkExtractor');

  afterEach(() => clearDynamicMapForTests());

  /**
   * The live catalog is loaded from NPS, whose canonical spelling uses the
   * ʻokina: "Hawaiʻi Volcanoes National Park". Folding is applied to BOTH sides,
   * so an ʻokina catalog key must match an ASCII-apostrophe traveller message
   * and vice versa. Only exercising the hardcoded map would miss this entirely.
   */
  it('an okina catalog key matches every traveller spelling', () => {
    setDynamicMapForTests([
      { key: 'hawaiʻi volcanoes national park', code: 'havo', lat: 19.432, lon: -155.257 },
    ]);
    for (const [, mark] of APOSTROPHES) {
      const codes = extractAllParksFromMessage(`three days at Hawai${mark}i Volcanoes National Park`)
        .map((p) => p.parkCode);
      expect(codes).toContain('havo');
    }
    expect(extractAllParksFromMessage('three days at Hawaii Volcanoes National Park')
      .map((p) => p.parkCode)).toContain('havo');
  });

  it('a dynamic key with no apostrophe is unaffected', () => {
    setDynamicMapForTests([
      { key: 'kobuk valley national park', code: 'kova', lat: 67.55, lon: -159.28 },
    ]);
    expect(extractAllParksFromMessage('a trip to Kobuk Valley National Park').map((p) => p.parkCode))
      .toContain('kova');
  });
});
