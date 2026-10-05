'use strict';

/**
 * Phase 9B.2C / 9B.2C.1 — provider-source + result-corroboration authority
 * policy.
 *
 * A geocoder returning coordinates does not by itself prove authority:
 * (a) not every underlying source is precise enough for a specific in-park
 *     POI (Open-Meteo targets city/town-level places), and
 * (b) even a trustworthy source's result must corroborate the SPECIFIC
 *     GROUNDED PLACE we asked about — not merely the park it's in.
 *
 * 9B.2C.1 correction: park-name agreement is supporting context only. It can
 * reject an out-of-park/conflicting-park result, or strengthen an
 * already place-matched one, but it can NEVER independently establish
 * authority. A wrong POI inside the right park (e.g. "Old Faithful" when the
 * grounded stop is "Grand Prismatic Spring") must be rejected even though
 * the park name matches.
 */

const {
  evaluateGeocodeAuthority,
  isCorroborated,
  isPlaceCorroborated,
  hasConflictingParkMention,
} = require('../geocodeAuthorityPolicy');
const { COORDINATE_SOURCE } = require('../coordinateValidation');

describe('evaluateGeocodeAuthority — provider-source policy', () => {
  test('the curated known-place catalog is always authoritative (CATALOG)', () => {
    const r = evaluateGeocodeAuthority({
      providerSource: 'trailverse-known-place', resolvedName: 'Mono Lake, California',
      canonicalPlaceName: 'Mono Lake', parkName: null,
    });
    expect(r.authoritative).toBe(true);
    expect(r.coordinateSource).toBe(COORDINATE_SOURCE.CATALOG);
  });

  test('Open-Meteo can never establish authoritative POI coordinates, even with a matching name', () => {
    const r = evaluateGeocodeAuthority({
      providerSource: 'open-meteo', resolvedName: 'Grand Prismatic Spring, Wyoming, United States',
      canonicalPlaceName: 'Grand Prismatic Spring', parkName: 'Yellowstone National Park',
    });
    expect(r.authoritative).toBe(false);
    expect(r.reason).toBe('source_insufficient_for_poi');
  });

  test('an unrecognized provider source is never treated as authoritative', () => {
    const r = evaluateGeocodeAuthority({
      providerSource: 'some_future_provider', resolvedName: 'Grand Prismatic Spring, Yellowstone',
      canonicalPlaceName: 'Grand Prismatic Spring', parkName: 'Yellowstone National Park',
    });
    expect(r.authoritative).toBe(false);
    expect(r.reason).toBe('unrecognized_source');
  });

  // (1) canonical POI match + correct park context → authoritative
  test('canonical place match + agreeing park context is authoritative', () => {
    const r = evaluateGeocodeAuthority({
      providerSource: 'google',
      resolvedName: 'Grand Prismatic Spring, Yellowstone National Park, WY 82190, USA',
      canonicalPlaceName: 'Grand Prismatic Spring', parkName: 'Yellowstone National Park',
    });
    expect(r.authoritative).toBe(true);
    expect(r.coordinateSource).toBe(COORDINATE_SOURCE.GEOCODER);
    expect(r.reason).toBe('corroborated_google_result');
  });

  // (2) canonical POI match without park text, provider response legitimately
  // identifies the POI → authoritative. Absence of park text is not a
  // conflict — there is simply nothing to disagree with.
  test('canonical place match with no park text present is still authoritative', () => {
    const r = evaluateGeocodeAuthority({
      providerSource: 'google',
      resolvedName: 'Grand Prismatic Spring, Fountain Flat Dr, WY 82190, USA',
      canonicalPlaceName: 'Grand Prismatic Spring', parkName: 'Yellowstone National Park',
    });
    expect(r.authoritative).toBe(true);
  });

  // (3) THE CORE 9B.2C.1 FIX — wrong POI + correct park name → NOT authoritative.
  // Park agreement alone must never establish identity.
  test('wrong POI inside the right park is NOT authoritative merely because the park matches', () => {
    const r = evaluateGeocodeAuthority({
      providerSource: 'google',
      resolvedName: 'Old Faithful, Yellowstone National Park, WY 82190, USA',
      canonicalPlaceName: 'Grand Prismatic Spring', parkName: 'Yellowstone National Park',
    });
    expect(r.authoritative).toBe(false);
    expect(r.reason).toBe('uncorroborated_place');
  });

  // (4) generic Yellowstone address, no canonical-place corroboration at all
  test('a generic park-level address with no place corroboration is NOT authoritative', () => {
    const r = evaluateGeocodeAuthority({
      providerSource: 'google',
      resolvedName: 'Yellowstone National Park, WY, USA',
      canonicalPlaceName: 'Grand Prismatic Spring', parkName: 'Yellowstone National Park',
    });
    expect(r.authoritative).toBe(false);
    expect(r.reason).toBe('uncorroborated_place');
  });

  // (6) correct canonical phrase but a DIFFERENT, conflicting park context —
  // rejected because the park mismatch is deterministically detectable.
  test('a place-name match paired with an explicitly conflicting park mention is rejected', () => {
    const r = evaluateGeocodeAuthority({
      providerSource: 'google',
      resolvedName: 'Grand Prismatic Spring, Yosemite National Park, CA',
      canonicalPlaceName: 'Grand Prismatic Spring', parkName: 'Yellowstone National Park',
    });
    expect(r.authoritative).toBe(false);
    expect(r.reason).toBe('conflicting_park_context');
  });

  test('a Google result matching neither the place nor a real park mention is NOT authoritative', () => {
    const r = evaluateGeocodeAuthority({
      providerSource: 'google',
      resolvedName: 'Springfield, Missouri, USA',
      canonicalPlaceName: 'Grand Prismatic Spring', parkName: 'Yellowstone National Park',
    });
    expect(r.authoritative).toBe(false);
    expect(r.reason).toBe('uncorroborated_place');
    expect(r.coordinateSource).toBe(COORDINATE_SOURCE.UNKNOWN);
  });

  test('a missing/empty resolvedName can never corroborate', () => {
    const r = evaluateGeocodeAuthority({
      providerSource: 'google', resolvedName: '',
      canonicalPlaceName: 'Grand Prismatic Spring', parkName: 'Yellowstone National Park',
    });
    expect(r.authoritative).toBe(false);
    expect(r.reason).toBe('uncorroborated_place');
  });
});

describe('isPlaceCorroborated — canonical place identity only (park text is never sufficient)', () => {
  test('matches the canonical place phrase, case-insensitively', () => {
    expect(isPlaceCorroborated({
      resolvedName: 'OLD FAITHFUL, yellowstone NATIONAL PARK', canonicalPlaceName: 'Old Faithful',
    })).toBe(true);
  });

  test('a park name alone, with no place-name text, does not corroborate', () => {
    expect(isPlaceCorroborated({
      resolvedName: 'Yellowstone National Park, WY', canonicalPlaceName: 'Grand Prismatic Spring',
    })).toBe(false);
  });

  test('substring traps ("Spring" vs "Springfield") remain rejected', () => {
    expect(isPlaceCorroborated({
      resolvedName: 'Springfield, Missouri, USA', canonicalPlaceName: 'Grand Prismatic Spring',
    })).toBe(false);
  });
});

describe('hasConflictingParkMention — park context as secondary corroboration only', () => {
  test('no park mention in the address is never a conflict', () => {
    expect(hasConflictingParkMention('Grand Prismatic Spring, WY', 'Yellowstone National Park')).toBe(false);
  });

  test('an agreeing park mention is not a conflict', () => {
    expect(hasConflictingParkMention('Grand Prismatic Spring, Yellowstone National Park, WY', 'Yellowstone National Park')).toBe(false);
  });

  test('a different named park mention IS a conflict', () => {
    expect(hasConflictingParkMention('Grand Prismatic Spring, Yosemite National Park, CA', 'Yellowstone National Park')).toBe(true);
  });
});

describe('isCorroborated — general token-overlap utility (unchanged, still available)', () => {
  test('matches are case-insensitive and ignore generic park-type suffixes', () => {
    expect(isCorroborated({
      resolvedName: 'OLD FAITHFUL, yellowstone NATIONAL PARK',
      canonicalPlaceName: 'Old Faithful', parkName: 'Yellowstone National Park',
    })).toBe(true);
  });

  test('short/common tokens alone do not create a false-positive match', () => {
    expect(isCorroborated({
      resolvedName: 'Central Park, New York, USA',
      canonicalPlaceName: 'Old Faithful', parkName: 'Yellowstone National Park',
    })).toBe(false);
  });
});
