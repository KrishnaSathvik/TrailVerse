'use strict';

const {
  canonicalExperienceKey,
  isSameCanonicalExperience,
} = require('../canonicalExperience');

describe('canonicalExperience', () => {
  test('treats a renamed suffix of the same place as one experience', () => {
    expect(isSameCanonicalExperience("Pa'rus Trail", "Pa'rus Trail riverside exhibits")).toBe(true);
    expect(isSameCanonicalExperience('Pa’rus Trail', "Pa'rus Trail out-and-back")).toBe(true);
    expect(canonicalExperienceKey("Pa'rus Trail riverside exhibits")).toBe('pa rus trail');
  });

  test('keeps distinct places distinct', () => {
    expect(isSameCanonicalExperience('Lower Emerald Pool', 'Upper Emerald Pool')).toBe(false);
    expect(isSameCanonicalExperience("Pa'rus Trail", 'Lower Emerald Pool')).toBe(false);
    expect(isSameCanonicalExperience('Zion Lodge', 'Zion Canyon Visitor Center')).toBe(false);
  });
});
