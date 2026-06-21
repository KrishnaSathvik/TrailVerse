'use strict';

const { fetchAstroFacts, needsAstroFacts } = require('../factsService');
const { extractPlaceFromMessage } = require('../geocodePlaceService');

describe('astro facts pipeline', () => {
  test('needsAstroFacts detects astrophotography prompts', () => {
    expect(needsAstroFacts('can I shoot astrophotography in Sierraville, CA?')).toBe(true);
    expect(needsAstroFacts('best hikes in Yosemite')).toBe(false);
  });

  test('extractPlaceFromMessage finds Sierraville', () => {
    expect(
      extractPlaceFromMessage('can I shoot astrophotography in Sierraville, CA? like July First week?')
    ).toBe('Sierraville, CA');
  });

  test('fetchAstroFacts returns waning gibbous for July 1 2026 window', () => {
    const text = fetchAstroFacts({
      lat: 39.5896,
      lon: -120.3674,
      userMessage: 'astrophotography in Sierraville, CA? July first week',
      locationName: 'Sierraville, CA',
    });
    expect(text).toMatch(/Waning Gibbous/);
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/Very poor|Poor/);
    expect(text).not.toMatch(/2025/);
  });
});
