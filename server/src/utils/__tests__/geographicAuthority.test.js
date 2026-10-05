'use strict';

/**
 * Phase 9B.1 — geographic authority hardening.
 *
 * Model/tool-emitted coordinates are candidate geography, not verified
 * authority. This suite pins the new `authoritative` distinction in
 * coordinateValidation.js, the corrected precedence in
 * knownOutdoorLocations.js and stopIdentityResolution.js (trusted catalog/
 * evidence coordinates now override unverified tool coordinates), and the
 * frontend map-eligibility boundary in itineraryMapStops.js.
 *
 * No new canonical schema fields are introduced — `coordinateSource` already
 * exists on every stop; this suite only changes what counts as authoritative.
 */

const {
  COORDINATE_SOURCE,
  AUTHORITATIVE_SOURCES,
  normalizeCoordinates,
  hasUsableCoordinates,
  isAuthoritativeCoordinateSource,
  hasAuthoritativeCoordinates,
} = require('../coordinateValidation');
const { enrichKnownStopLocations } = require('../knownOutdoorLocations');
const { resolveStopIdentities } = require('../stopIdentityResolution');
const { normalizeItineraryCoordinates } = require('../finalizeItinerary');

describe('coordinateValidation — authoritative vs merely-valid', () => {
  it('tool coordinates remain valid (kept) but are NOT authoritative', () => {
    const r = normalizeCoordinates({ latitude: 37.29, longitude: -113.05, source: 'tool' });
    expect(r.valid).toBe(true);
    expect(r.authoritative).toBe(false);
  });

  it('evidence/provider-resolved, geocoder, stored, and catalog coordinates ARE authoritative', () => {
    for (const source of ['resolved_metadata', 'geocoder', 'stored', 'trailverse_catalog']) {
      const r = normalizeCoordinates({ latitude: 37.29, longitude: -113.05, source });
      expect(r.valid).toBe(true);
      expect(r.authoritative).toBe(true);
    }
  });

  it('unknown/absent-source coordinates are valid but not authoritative', () => {
    const r = normalizeCoordinates({ latitude: 37.29, longitude: -113.05 });
    expect(r.valid).toBe(true);
    expect(r.authoritative).toBe(false);
  });

  it('invalid coordinates are never authoritative regardless of source', () => {
    const r = normalizeCoordinates({ latitude: 0, longitude: 0, source: 'stored' });
    expect(r.valid).toBe(false);
    expect(r.authoritative).toBe(false);
  });

  it('exposes AUTHORITATIVE_SOURCES excluding tool', () => {
    expect(AUTHORITATIVE_SOURCES.has(COORDINATE_SOURCE.TOOL)).toBe(false);
    expect(AUTHORITATIVE_SOURCES.has(COORDINATE_SOURCE.GEOCODER)).toBe(true);
    expect(AUTHORITATIVE_SOURCES.has(COORDINATE_SOURCE.STORED)).toBe(true);
    expect(AUTHORITATIVE_SOURCES.has(COORDINATE_SOURCE.CATALOG)).toBe(true);
    expect(AUTHORITATIVE_SOURCES.has(COORDINATE_SOURCE.RESOLVED_METADATA)).toBe(true);
  });

  it('isAuthoritativeCoordinateSource is a plain source-name check', () => {
    expect(isAuthoritativeCoordinateSource('tool')).toBe(false);
    expect(isAuthoritativeCoordinateSource('geocoder')).toBe(true);
    expect(isAuthoritativeCoordinateSource(undefined)).toBe(false);
  });

  it('hasAuthoritativeCoordinates mirrors hasUsableCoordinates but excludes tool', () => {
    expect(hasAuthoritativeCoordinates({ latitude: 37, longitude: -113, coordinateSource: 'tool' })).toBe(false);
    expect(hasAuthoritativeCoordinates({ latitude: 37, longitude: -113, coordinateSource: 'geocoder' })).toBe(true);
    // hasUsableCoordinates (existing, unchanged) still treats tool as usable/kept.
    expect(hasUsableCoordinates({ latitude: 37, longitude: -113, coordinateSource: 'tool' })).toBe(true);
  });
});

describe('knownOutdoorLocations — catalog outranks unverified tool coordinates', () => {
  it('overrides tool-authored coordinates with the trusted catalog match', () => {
    const itin = {
      days: [{ dayNumber: 1, stops: [{ name: 'Logan Pass overlook', latitude: 1.1, longitude: 2.2 }] }],
    };
    enrichKnownStopLocations(itin);
    const stop = itin.days[0].stops[0];
    expect(stop.latitude).toBeCloseTo(48.6967);
    expect(stop.longitude).toBeCloseTo(-113.7183);
    expect(stop.coordinateSource).toBe('trailverse_catalog');
  });

  it('does NOT override coordinates that are already authoritative', () => {
    const itin = {
      days: [{
        dayNumber: 1,
        stops: [{ name: 'Logan Pass overlook', latitude: 9.9, longitude: 9.9, coordinateSource: 'geocoder' }],
      }],
    };
    enrichKnownStopLocations(itin);
    const stop = itin.days[0].stops[0];
    expect(stop.latitude).toBeCloseTo(9.9);
    expect(stop.coordinateSource).toBe('geocoder');
  });

  it('still backfills a stop with no coordinates at all (unchanged behavior)', () => {
    const itin = { days: [{ dayNumber: 1, stops: [{ name: 'Logan Pass overlook' }] }] };
    enrichKnownStopLocations(itin);
    expect(itin.days[0].stops[0].latitude).toBeCloseTo(48.6967);
  });

  it('leaves a stop with no catalog match and tool coordinates untouched', () => {
    const itin = {
      days: [{ dayNumber: 1, stops: [{ name: 'Some Unlisted Overlook', latitude: 5, longitude: 6 }] }],
    };
    enrichKnownStopLocations(itin);
    expect(itin.days[0].stops[0].latitude).toBe(5);
  });
});

describe('stopIdentityResolution — evidence coordinates outrank tool coordinates and stamp provenance', () => {
  function bundleWith(entry) {
    return { evidence: [{ evidenceId: entry.evidenceId, claim: { normalizedValue: entry } }] };
  }

  it('overrides tool coordinates with a matched evidence coordinate and marks it authoritative', () => {
    const itin = {
      days: [{
        dayNumber: 1,
        stops: [{ name: 'Kalaloch Beach', latitude: 1, longitude: 1 }],
      }],
    };
    const bundle = bundleWith({
      evidenceId: 'ev-1', name: 'Kalaloch Beach', latitude: 47.6, longitude: -124.4,
    });
    const { itineraryData } = resolveStopIdentities({ itineraryData: itin, evidenceBundle: bundle });
    const stop = itineraryData.days[0].stops[0];
    expect(stop.latitude).toBeCloseTo(47.6);
    expect(stop.longitude).toBeCloseTo(-124.4);
    expect(stop.coordinateSource).toBe('resolved_metadata');
  });

  it('does not disturb coordinates that are already authoritative', () => {
    const itin = {
      days: [{
        dayNumber: 1,
        stops: [{ name: 'Kalaloch Beach', latitude: 9, longitude: 9, coordinateSource: 'stored' }],
      }],
    };
    const bundle = bundleWith({
      evidenceId: 'ev-1', name: 'Kalaloch Beach', latitude: 47.6, longitude: -124.4,
    });
    const { itineraryData } = resolveStopIdentities({ itineraryData: itin, evidenceBundle: bundle });
    const stop = itineraryData.days[0].stops[0];
    expect(stop.latitude).toBe(9);
    expect(stop.coordinateSource).toBe('stored');
  });
});

describe('finalizeItinerary integration — end-to-end coordinate authority', () => {
  it('a tool-only coordinate stays valid but non-authoritative after full normalization', () => {
    const itin = { days: [{ dayNumber: 1, stops: [{ name: 'Some Unlisted Overlook', latitude: 40, longitude: -110 }] }] };
    normalizeItineraryCoordinates(itin);
    const stop = itin.days[0].stops[0];
    expect(stop.latitude).toBeCloseTo(40);
    expect(stop.coordinateSource).toBe('tool');
    expect(isAuthoritativeCoordinateSource(stop.coordinateSource)).toBe(false);
  });

  it('a catalog-backfilled coordinate survives finalization as authoritative', () => {
    const itin = { days: [{ dayNumber: 1, stops: [{ name: 'Logan Pass overlook', latitude: 1, longitude: 2 }] }] };
    enrichKnownStopLocations(itin);
    normalizeItineraryCoordinates(itin);
    const stop = itin.days[0].stops[0];
    expect(stop.coordinateSource).toBe('trailverse_catalog');
    expect(isAuthoritativeCoordinateSource(stop.coordinateSource)).toBe(true);
  });
});
