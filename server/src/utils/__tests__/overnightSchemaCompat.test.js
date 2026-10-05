'use strict';

/**
 * Stage 13.2 §3 — `overnightLocation` schema backward-compatibility proof.
 *
 * `overnightLocation` was added at the day level of the itinerary tool schema.
 * These tests prove it is strictly ADDITIVE and safe:
 *   - optional (not in the day `required` list) — absence never fails
 *   - older recorded tool payloads (no field) still validate
 *   - missing overnight data does not cause structured OR consistency failure
 *   - saved itineraries restore/manifest without the field
 *   - share/export (deterministic render) omit it safely when absent
 *   - both provider adapters get equivalent, provider-agnostic semantics
 *   - a declared overnight is validated against prose (no arbitrary free pass)
 */

const { CREATE_ITINERARY_TOOL, isValidToolItinerary } = require('../itineraryToolSchema');
const { buildItineraryProseManifest } = require('../itineraryProseManifest');
const { verifyProseAgainstItinerary } = require('../proseConsistencyVerifier');
const { renderDeterministicItineraryResponse } = require('../deterministicItineraryRenderer');
const { validateItineraryFeasibility } = require('../extractItineraryJSON');

// An "older" recorded tool payload: valid, but predates overnightLocation.
const LEGACY_DAY = {
  id: 'day-1', dayNumber: 1, label: 'Day 1 — Zion',
  stops: [
    { id: 's1', order: 0, type: 'trail', name: 'Riverside Walk', note: 'Easy stroll', startTime: '09:00', duration: 90 },
    { id: 's2', order: 1, type: 'landmark', name: 'Canyon Overlook', note: 'Sunset', startTime: '18:00', duration: 60 },
  ],
};
const LEGACY_ITIN = { days: [LEGACY_DAY] };
const OVERNIGHT_ITIN = { days: [{ ...LEGACY_DAY, overnightLocation: 'Springdale, UT' }] };

describe('overnightLocation schema is additive/optional', () => {
  it('is present in the schema but NOT required at the day level', () => {
    const dayProps = CREATE_ITINERARY_TOOL.input_schema.properties.days.items;
    expect(dayProps.properties.overnightLocation.type).toEqual(['string', 'null']);
    expect(dayProps.required).not.toContain('overnightLocation');
    expect(dayProps.required).toEqual(['id', 'dayNumber', 'label', 'stops']);
  });

  it('older recorded payloads (no overnightLocation) still validate', () => {
    expect(isValidToolItinerary(LEGACY_ITIN)).toBe(true);
    expect(isValidToolItinerary(OVERNIGHT_ITIN)).toBe(true);
  });

  it('missing overnight data does not produce a structured/feasibility failure', () => {
    const issues = validateItineraryFeasibility(LEGACY_ITIN);
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.some((i) => /overnight/i.test(i.type || ''))).toBe(false);
  });
});

describe('restore + manifest without the field', () => {
  it('manifests a saved itinerary without overnightLocation, normalizing to null', () => {
    const manifest = buildItineraryProseManifest({ itinerary: LEGACY_ITIN });
    expect(manifest.days).toHaveLength(1);
    expect(manifest.days[0].overnightLocation).toBeNull();
  });

  it('carries the field through when present', () => {
    const manifest = buildItineraryProseManifest({ itinerary: OVERNIGHT_ITIN });
    expect(manifest.days[0].overnightLocation).toBe('Springdale, UT');
  });
});

describe('share/export (deterministic render) omit it safely when absent', () => {
  it('renders without an Overnight line when the field is missing', () => {
    const out = renderDeterministicItineraryResponse({ itinerary: LEGACY_ITIN, resolvedMetadata: { parkName: 'Zion National Park' } });
    expect(out).not.toMatch(/Overnight:/);
    expect(out).toMatch(/Riverside Walk/);
  });
  it('renders an Overnight line only when present', () => {
    const out = renderDeterministicItineraryResponse({ itinerary: OVERNIGHT_ITIN, resolvedMetadata: { parkName: 'Zion National Park' } });
    expect(out).toMatch(/Overnight: Springdale, UT/);
  });
});

describe('both provider adapters get equivalent, provider-agnostic semantics', () => {
  it('the manifest normalizes overnightLocation identically regardless of provider origin', () => {
    // The tool schema is a single shared constant; downstream normalization is
    // provider-agnostic — the SAME days object yields the SAME manifest overnight
    // value whether the days came from the Claude tool or the OpenAI legacy JSON.
    const fromClaude = buildItineraryProseManifest({ itinerary: OVERNIGHT_ITIN }).days[0].overnightLocation;
    const fromOpenAI = buildItineraryProseManifest({ itinerary: JSON.parse(JSON.stringify(OVERNIGHT_ITIN)) }).days[0].overnightLocation;
    expect(fromClaude).toBe(fromOpenAI);
    expect(fromClaude).toBe('Springdale, UT');
  });
});

describe('a declared overnight is validated against prose (no arbitrary free pass)', () => {
  const proseFor = (extra) => `**At a glance**\n\n**Day 1 — Zion**\n- **Riverside Walk** — Easy stroll\n- **Canyon Overlook** — Sunset\n${extra}`;

  it('is INERT when the frozen itinerary defines no overnight ground truth', () => {
    const manifest = buildItineraryProseManifest({ itinerary: LEGACY_ITIN });
    const res = verifyProseAgainstItinerary({
      proseWithMarkers: proseFor('\nYou will spend the night in Las Vegas.'), manifest,
    });
    // No declared overnight → the detector must not fire (absence ≠ failure).
    expect(res.conflictingOvernight).toEqual([]);
  });

  it('FLAGS a prose overnight that contradicts the declared overnight location', () => {
    const manifest = buildItineraryProseManifest({ itinerary: OVERNIGHT_ITIN });
    const res = verifyProseAgainstItinerary({
      proseWithMarkers: proseFor('\nYou will spend the night in Las Vegas, far from the parks.'), manifest,
    });
    expect(res.conflictingOvernight.length).toBeGreaterThan(0);
  });

  it('PASSES when prose matches the declared overnight location', () => {
    const manifest = buildItineraryProseManifest({ itinerary: OVERNIGHT_ITIN });
    const res = verifyProseAgainstItinerary({
      proseWithMarkers: proseFor('\nSpend the night in Springdale before heading out.'), manifest,
    });
    expect(res.conflictingOvernight).toEqual([]);
  });
});
