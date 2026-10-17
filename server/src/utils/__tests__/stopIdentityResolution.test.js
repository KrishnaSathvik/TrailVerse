'use strict';

/**
 * STRUCTURED-STOP IDENTITY BOUNDARY (2026-09-02).
 *
 * In structured itinerary generation, every named experiential stop must
 * resolve to an identity the frozen evidence catalogue actually holds — the
 * model authors time/duration/description/why/ordering, but place identity is
 * machine-owned. Observed escapes this closes:
 *   - Badlands: the model back-filled real-world stop names the catalogue
 *     never offered (out-of-catalogue authoring);
 *   - Olympic exposure: the model could author an exposure-relevant stop that
 *     directive filtering had explicitly removed;
 *   - audit-era "Flexible {Park}…" invented place identities.
 *
 * The boundary REJECTS what it cannot resolve — it never silently rewrites or
 * silently accepts. Legitimate non-place blocks (rest, meals, logistics) stay
 * allowed and are already barred from anchoring days by completeness.
 */

const { resolveStopIdentities } = require('../stopIdentityResolution');

const candidate = (evidenceId, name, extra = {}) => ({
  evidenceId,
  topic: 'activities',
  claim: { identity: `place:${name}`, text: `${name}.`, normalizedValue: { name, ...extra } },
});

const BUNDLE = {
  requestId: 'req-test',
  evidence: [
    candidate('ev:mounds', 'Yellow Mounds Overlook', { latitude: 43.9, longitude: -102.3 }),
    candidate('ev:cirque', 'Cirque Rim Overlook'),
    candidate('ev:glines', 'Glines Canyon Dam Overlook'),
    candidate('ev:kalaloch', 'Kalaloch', { latitude: 47.6, longitude: -124.37 }),
    candidate('ev:narrows', 'The Narrows Riverside Walk'),
    candidate('ev:vc', 'Ben Reifel Visitor Center'),
  ],
};

const plan = (stops, dayNumber = 1) => ({
  days: [{ dayNumber, label: `Day ${dayNumber}`, stops }],
});
const stop = (name, extra = {}) => ({
  id: `s-${name}`, order: 1, type: 'trail', name, note: 'n', why: 'w',
  startTime: '', timeWindow: 'Morning', duration: 90, ...extra,
});

describe('named stops resolve to catalogue identities (machine-owned binding)', () => {
  test('an exact catalogue name binds and inherits missing coordinates', () => {
    const result = resolveStopIdentities({
      itineraryData: plan([stop('Yellow Mounds Overlook', { latitude: null, longitude: null })]),
      evidenceBundle: BUNDLE,
    });
    expect(result.violations).toEqual([]);
    const bound = result.itineraryData.days[0].stops[0];
    expect(bound.evidenceRef).toBe('ev:mounds');
    expect(bound.canonicalPlaceName).toBe('Yellow Mounds Overlook');
    expect(bound.latitude).toBe(43.9);
    expect(bound.longitude).toBe(-102.3);
  });

  test('model-decorated names still resolve to their catalogue place', () => {
    const result = resolveStopIdentities({
      itineraryData: plan([
        stop('Early-light pause at Cirque Rim Overlook'),
        stop('Glines Canyon Dam Overlook — late-day views'),
        stop('Sunset at Kalaloch'),
      ]),
      evidenceBundle: BUNDLE,
    });
    expect(result.violations).toEqual([]);
    const [a, b, c] = result.itineraryData.days[0].stops;
    expect(a.evidenceRef).toBe('ev:cirque');
    expect(b.evidenceRef).toBe('ev:glines');
    expect(c.evidenceRef).toBe('ev:kalaloch');
  });

  test('Phase 9B.1 — an authoritative stop coordinate is never overwritten by binding', () => {
    const result = resolveStopIdentities({
      itineraryData: plan([
        stop('Yellow Mounds Overlook', { latitude: 43.91, longitude: -102.31, coordinateSource: 'stored' }),
      ]),
      evidenceBundle: BUNDLE,
    });
    const bound = result.itineraryData.days[0].stops[0];
    expect(bound.latitude).toBe(43.91);
    expect(bound.coordinateSource).toBe('stored');
  });

  test('Phase 9B.1 — an unverified (tool-only) stop coordinate IS overwritten by evidence binding', () => {
    // Before 9B.1 this stayed 43.91 regardless of provenance — that was the
    // authority inversion this phase fixes. A bare model-authored number is
    // candidate geography, not authority, so the evidence-bound coordinate
    // (verified geographic authority) now wins.
    const result = resolveStopIdentities({
      itineraryData: plan([stop('Yellow Mounds Overlook', { latitude: 43.91, longitude: -102.31 })]),
      evidenceBundle: BUNDLE,
    });
    const bound = result.itineraryData.days[0].stops[0];
    expect(bound.latitude).not.toBe(43.91);
    expect(bound.coordinateSource).toBe('resolved_metadata');
  });
});

describe('invented place identities are rejected, never silently canonical', () => {
  test('a fabricated named place fails with stop_identity_unresolved', () => {
    const result = resolveStopIdentities({
      itineraryData: plan([stop('Flexible Badlands Scenic Return')]),
      evidenceBundle: BUNDLE,
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      reasonCode: 'stop_identity_unresolved',
      stopName: 'Flexible Badlands Scenic Return',
    });
  });

  test('a real-world name the catalogue never held is equally rejected', () => {
    const result = resolveStopIdentities({
      itineraryData: plan([stop('Sheep Mountain Table Overlook')]),
      evidenceBundle: BUNDLE,
    });
    expect(result.violations[0].reasonCode).toBe('stop_identity_unresolved');
  });
});

describe('exposure escape — directive-excluded candidates cannot re-enter by name', () => {
  test('naming an excluded candidate fails with stop_identity_excluded', () => {
    const result = resolveStopIdentities({
      itineraryData: plan([stop('Walk The Narrows Riverside Walk at dawn')]),
      evidenceBundle: BUNDLE,
      excludedEvidenceIds: ['ev:narrows'],
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      reasonCode: 'stop_identity_excluded',
      stopName: 'Walk The Narrows Riverside Walk at dawn',
    });
  });

  test('at equal match strength a legitimate identity beats an excluded collision', () => {
    const bundle = {
      requestId: 'r',
      evidence: [
        candidate('ev:allowed', 'Ruby Beach'),
        candidate('ev:blocked', 'Ruby Beach Vista'),
      ],
    };
    const result = resolveStopIdentities({
      itineraryData: plan([stop('Morning at Ruby Beach')]),
      evidenceBundle: bundle,
      excludedEvidenceIds: ['ev:blocked'],
    });
    expect(result.violations).toEqual([]);
    expect(result.itineraryData.days[0].stops[0].evidenceRef).toBe('ev:allowed');
  });

  test('the same stop binds normally when nothing is excluded', () => {
    const result = resolveStopIdentities({
      itineraryData: plan([stop('Walk The Narrows Riverside Walk at dawn')]),
      evidenceBundle: BUNDLE,
    });
    expect(result.violations).toEqual([]);
    expect(result.itineraryData.days[0].stops[0].evidenceRef).toBe('ev:narrows');
  });
});

describe('legitimate non-place blocks stay allowed and unbound', () => {
  test.each([
    ['Unhurried picnic or rest break', 'picnic'],
    ['Lunch near the lodge', 'restaurant'],
    ['Flexible downtime if weather turns', 'custom'],
  ])('%s', (name, type) => {
    const result = resolveStopIdentities({
      itineraryData: plan([stop(name, { type })]),
      evidenceBundle: BUNDLE,
    });
    expect(result.violations).toEqual([]);
    expect(result.itineraryData.days[0].stops[0].evidenceRef).toBeUndefined();
  });
});

describe('patch turns only enforce the days the patch touched', () => {
  test('a pre-existing unresolved stop on an untouched day does not fail the patch', () => {
    const result = resolveStopIdentities({
      itineraryData: {
        days: [
          { dayNumber: 1, label: 'Day 1', stops: [stop('Hurricane Ridge scenic afternoon')] },
          { dayNumber: 2, label: 'Day 2', stops: [stop('Cirque Rim Overlook')] },
        ],
      },
      evidenceBundle: BUNDLE,
      touchedDayNumbers: [2],
    });
    expect(result.violations).toEqual([]);
    expect(result.itineraryData.days[1].stops[0].evidenceRef).toBe('ev:cirque');
  });

  test('the same unresolved stop on a TOUCHED day still fails', () => {
    const result = resolveStopIdentities({
      itineraryData: plan([stop('Hurricane Ridge scenic afternoon')]),
      evidenceBundle: BUNDLE,
      touchedDayNumbers: [1],
    });
    expect(result.violations).toHaveLength(1);
  });
});

describe('safety of the matcher itself', () => {
  test('short generic tokens never bind by containment', () => {
    const trap = {
      requestId: 'r', evidence: [candidate('ev:beach', 'Beach')],
    };
    const result = resolveStopIdentities({
      itineraryData: plan([stop('Driftwood Beach Amphitheater Loop')]),
      evidenceBundle: trap,
    });
    // "Beach" (single short token) must not claim this stop; unresolved is the
    // honest answer.
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].reasonCode).toBe('stop_identity_unresolved');
  });

  test('an empty place catalogue fails closed on an ungrounded experience', () => {
    // Nothing offered ⇒ nothing could ever resolve; whether generation should
    // even run on an empty catalogue is the evidence gate's question.
    const result = resolveStopIdentities({
      itineraryData: plan([stop('Yellow Mounds Overlook')]),
      evidenceBundle: { requestId: 'r', evidence: [] },
    });
    expect(result.violations).toEqual([expect.objectContaining({ reasonCode: 'stop_identity_unresolved' })]);
  });
});

test('a destination centroid cannot anchor an itinerary day', () => {
  const result = resolveStopIdentities({ itineraryData: plan([stop('Seattle, Washington, United States')]), evidenceBundle: { evidence: [{ ...candidate('city', 'Seattle, Washington, United States'), topic: 'destination_identity' }] } });
  expect(result.violations[0].reasonCode).toBe('stop_identity_destination_only');
  expect(result.itineraryData.days[0].stops[0].resolutionStatus).toBe('unresolved');
});

test('duplicate owner records for one named facility do not make it ambiguous', () => {
  const evidence = ['visitor-feed', 'places-feed'].map((id, index) => ({
    ...candidate(id, 'River Museum', { entityId: `nps:park:test:${id}`, category: 'museum', latitude: 40, longitude: -110 }),
    evidenceType: 'fact', entityId: 'nps:park:test', source: { provider: 'nps', sourceClass: 'official_owner' },
  }));
  const result = resolveStopIdentities({ itineraryData: plan([stop('River Museum', { type: 'museum', parkCode: 'test' })]), evidenceBundle: { evidence } });
  expect(result.violations).toEqual([]);
  expect(result.itineraryData.days[0].stops[0].resolutionStatus).toBe('resolved');
  evidence[1].claim.normalizedValue.latitude = 41;
  const conflict = resolveStopIdentities({ itineraryData: plan([stop('River Museum', { type: 'museum', parkCode: 'test' })]), evidenceBundle: { evidence } });
  expect(conflict.itineraryData.days[0].stops[0].resolutionStatus).toBe('ambiguous');
});
