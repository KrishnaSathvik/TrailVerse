'use strict';

/**
 * Phase 9B.2B — evidence-bound authoritative coordinate resolution.
 *
 * Resolves coordinates for stops that are ALREADY identity-grounded
 * (evidenceRef + canonicalPlaceName from stopIdentityResolution.js) and
 * still lack authoritative coordinates. Never establishes identity from
 * arbitrary model text; never geocodes non-experiential or unbound stops.
 * Produces an immutable, attempt-scoped artifact fingerprinted over the
 * CANDIDATE stop set (not only successfully resolved identities) so a
 * retry with a different stop set cannot reuse a prior attempt's geography.
 */

const {
  fingerprintCandidateStops,
  planGeoResolution,
  resolveGeoArtifactForAttempt,
} = require('../geoResolutionArtifact');

function plan(stops, overrides = {}) {
  return {
    parkName: 'Yellowstone National Park',
    days: [{ dayNumber: 1, stops }],
    ...overrides,
  };
}

function experientialStop(overrides = {}) {
  return {
    id: 's1', order: 0, type: 'geothermal', name: 'Grand Prismatic Spring',
    note: 'n', duration: 60,
    ...overrides,
  };
}

describe('fingerprintCandidateStops — attempt isolation', () => {
  test('is deterministic for the same candidate stop set', () => {
    const a = plan([experientialStop()]);
    const b = plan([experientialStop()]);
    expect(fingerprintCandidateStops(a)).toBe(fingerprintCandidateStops(b));
  });

  test('changes when the stop set differs between attempts', () => {
    const attempt1 = plan([experientialStop({ name: 'Norris Geyser Basin', evidenceRef: 'ev:norris' })]);
    const attempt2 = plan([experientialStop({ name: 'West Thumb Geyser Basin', evidenceRef: 'ev:westthumb' })]);
    expect(fingerprintCandidateStops(attempt1)).not.toBe(fingerprintCandidateStops(attempt2));
  });

  test('is computed from candidate INPUT fields, not only resolved identity', () => {
    // Same name/position, but one has an evidenceRef already and one doesn't —
    // still different candidate inputs, so still a different fingerprint.
    const unbound = plan([experientialStop()]);
    const bound = plan([experientialStop({ evidenceRef: 'ev:gps', canonicalPlaceName: 'Grand Prismatic Spring' })]);
    expect(fingerprintCandidateStops(unbound)).not.toBe(fingerprintCandidateStops(bound));
  });
});

describe('planGeoResolution — eligibility gate', () => {
  test('requests resolution only for an evidence-bound experiential stop lacking authoritative coordinates', () => {
    const data = plan([
      experientialStop({ evidenceRef: 'ev:gps', canonicalPlaceName: 'Grand Prismatic Spring' }),
    ]);
    const { entries } = planGeoResolution(data);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('requested');
    expect(entries[0].query).toMatch(/Grand Prismatic Spring/);
  });

  test('skips a stop that already has authoritative coordinates', () => {
    const data = plan([
      experientialStop({
        evidenceRef: 'ev:gps', canonicalPlaceName: 'Grand Prismatic Spring',
        latitude: 44.5, longitude: -110.8, coordinateSource: 'resolved_metadata',
      }),
    ]);
    const { entries } = planGeoResolution(data);
    expect(entries[0].status).toBe('skipped_already_authoritative');
  });

  test('skips a stop with only tool-authored coordinates and requests resolution', () => {
    const data = plan([
      experientialStop({
        evidenceRef: 'ev:gps', canonicalPlaceName: 'Grand Prismatic Spring',
        latitude: 1, longitude: 1, coordinateSource: 'tool',
      }),
    ]);
    const { entries } = planGeoResolution(data);
    expect(entries[0].status).toBe('requested');
  });

  test('never requests resolution for a non-experiential stop, even if it has a name', () => {
    const data = plan([
      { id: 's1', order: 0, type: 'meal', name: 'Lunch near Old Faithful', duration: 45 },
    ]);
    const { entries } = planGeoResolution(data);
    expect(entries[0].status).toBe('skipped_non_experiential');
  });

  test('never requests resolution for an experiential stop with no evidenceRef (unbound identity)', () => {
    const data = plan([experientialStop({ evidenceRef: null, canonicalPlaceName: null })]);
    const { entries } = planGeoResolution(data);
    expect(entries[0].status).toBe('skipped_unbound_identity');
  });

  test('the plan fingerprint matches fingerprintCandidateStops for the same itinerary', () => {
    const data = plan([experientialStop({ evidenceRef: 'ev:gps', canonicalPlaceName: 'Grand Prismatic Spring' })]);
    expect(planGeoResolution(data).fingerprint).toBe(fingerprintCandidateStops(data));
  });
});

describe('resolveGeoArtifactForAttempt — execution', () => {
  const grounded = () => experientialStop({ evidenceRef: 'ev:gps', canonicalPlaceName: 'Grand Prismatic Spring' });

  test('with no resolver dependency supplied, makes zero calls and leaves coordinates unresolved (fail-safe default)', async () => {
    const data = plan([grounded()]);
    const artifact = await resolveGeoArtifactForAttempt({ itineraryData: data });
    expect(artifact.resolvedCount).toBe(0);
    expect(artifact.entries[0].status).toBe('unresolved_no_provider');
    // No mutation of the input, and the returned itinerary is unchanged.
    expect(artifact.itineraryData.days[0].stops[0].latitude).toBeUndefined();
  });

  test('an already-authoritative stop triggers ZERO resolver dispatch', async () => {
    const data = plan([{
      ...grounded(), latitude: 44.5, longitude: -110.8, coordinateSource: 'resolved_metadata',
    }]);
    const resolveStopCoordinates = jest.fn();
    await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });
    expect(resolveStopCoordinates).not.toHaveBeenCalled();
  });

  test('a successful resolution replaces tool-only candidate geography with authoritative coordinates', async () => {
    const data = plan([{ ...grounded(), latitude: 1, longitude: 1, coordinateSource: 'tool' }]);
    const resolveStopCoordinates = jest.fn().mockResolvedValue({
      latitude: 44.525, longitude: -110.838, coordinateSource: 'geocoder', providerSource: 'google',
    });
    const artifact = await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });
    expect(artifact.resolvedCount).toBe(1);
    const stop = artifact.itineraryData.days[0].stops[0];
    expect(stop.latitude).toBeCloseTo(44.525);
    expect(stop.coordinateSource).toBe('geocoder');
    expect(artifact.entries[0].status).toBe('resolved');
    expect(artifact.entries[0].providerSource).toBe('google');
    // The original input itinerary is never mutated.
    expect(data.days[0].stops[0].latitude).toBe(1);
  });

  test('a missing coordinate may also be resolved (not only tool-only)', async () => {
    const data = plan([grounded()]);
    const resolveStopCoordinates = jest.fn().mockResolvedValue({
      latitude: 44.525, longitude: -110.838, coordinateSource: 'geocoder', providerSource: 'google',
    });
    const artifact = await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });
    expect(artifact.resolvedCount).toBe(1);
  });

  test('provider no-result leaves identity intact and coordinates unresolved, not fabricated', async () => {
    const data = plan([grounded()]);
    const resolveStopCoordinates = jest.fn().mockResolvedValue(null);
    const artifact = await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });
    expect(artifact.resolvedCount).toBe(0);
    expect(artifact.entries[0].status).toBe('unresolved_no_result');
    const stop = artifact.itineraryData.days[0].stops[0];
    expect(stop.latitude).toBeUndefined();
    expect(stop.evidenceRef).toBe('ev:gps'); // identity untouched
  });

  test('provider failure yields a bounded failure state, never a fabricated coordinate', async () => {
    const data = plan([grounded()]);
    const resolveStopCoordinates = jest.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: 'provider_timeout' }));
    const artifact = await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });
    expect(artifact.resolvedCount).toBe(0);
    expect(artifact.entries[0].status).toBe('provider_failure');
    expect(artifact.entries[0].errorCode).toBe('provider_timeout');
    expect(artifact.itineraryData.days[0].stops[0].latitude).toBeUndefined();
  });

  test('a resolver result with an untrusted/unspecified source is never treated as authoritative', async () => {
    const data = plan([{ ...grounded(), latitude: 1, longitude: 1, coordinateSource: 'tool' }]);
    const resolveStopCoordinates = jest.fn().mockResolvedValue({
      latitude: 44.5, longitude: -110.8, coordinateSource: 'tool',
    });
    const artifact = await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });
    expect(artifact.resolvedCount).toBe(0);
    expect(artifact.entries[0].status).toBe('unresolved_untrusted_source');
    // Tool-only candidate geography is not overwritten by another unverified value.
    expect(artifact.itineraryData.days[0].stops[0].coordinateSource).toBe('tool');
  });

  test('non-experiential and unbound stops are never passed to the resolver', async () => {
    const data = plan([
      { id: 's1', order: 0, type: 'meal', name: 'Lunch', duration: 30 },
      experientialStop({ id: 's2', order: 1, evidenceRef: null, canonicalPlaceName: null }),
    ]);
    const resolveStopCoordinates = jest.fn().mockResolvedValue({
      latitude: 1, longitude: 1, coordinateSource: 'geocoder',
    });
    await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });
    expect(resolveStopCoordinates).not.toHaveBeenCalled();
  });

  test('a failed/no-result geocode never promotes stale tool coordinates to authoritative', async () => {
    // Distinct from the "no coordinates at all" no-result case: here the stop
    // already carries tool-only candidate geography, resolution is attempted
    // and fails, and that candidate geography must remain exactly as
    // untrustworthy as before — never silently upgraded because "we tried."
    const { isAuthoritativeCoordinateSource } = require('../coordinateValidation');
    const data = plan([{ ...grounded(), latitude: 1, longitude: 1, coordinateSource: 'tool' }]);
    const resolveStopCoordinates = jest.fn().mockResolvedValue(null);
    const artifact = await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });
    const stop = artifact.itineraryData.days[0].stops[0];
    expect(stop.latitude).toBe(1);
    expect(stop.coordinateSource).toBe('tool');
    expect(isAuthoritativeCoordinateSource(stop.coordinateSource)).toBe(false);
  });

  test('two attempts with different stop sets never share resolution results (attempt isolation)', async () => {
    const attempt1Data = plan([experientialStop({
      name: 'Norris Geyser Basin', evidenceRef: 'ev:norris', canonicalPlaceName: 'Norris Geyser Basin',
    })]);
    const attempt2Data = plan([experientialStop({
      name: 'West Thumb Geyser Basin', evidenceRef: 'ev:westthumb', canonicalPlaceName: 'West Thumb Geyser Basin',
    })]);
    const resolveStopCoordinates = jest.fn(async ({ query }) => (
      query.includes('Norris')
        ? { latitude: 44.73, longitude: -110.7, coordinateSource: 'geocoder', providerSource: 'google' }
        : { latitude: 44.42, longitude: -110.57, coordinateSource: 'geocoder', providerSource: 'google' }
    ));

    const artifact1 = await resolveGeoArtifactForAttempt({ itineraryData: attempt1Data, resolveStopCoordinates });
    const artifact2 = await resolveGeoArtifactForAttempt({ itineraryData: attempt2Data, resolveStopCoordinates });

    expect(artifact1.fingerprint).not.toBe(artifact2.fingerprint);
    expect(artifact1.itineraryData.days[0].stops[0].latitude).toBeCloseTo(44.73);
    expect(artifact2.itineraryData.days[0].stops[0].latitude).toBeCloseTo(44.42);
    // Applying attempt 2's artifact never touched attempt 1's already-returned data.
    expect(artifact1.itineraryData.days[0].stops[0].latitude).toBeCloseTo(44.73);
  });

  test('the artifact fingerprint is bound to the input candidate set, not the resolved output', async () => {
    const data = plan([grounded()]);
    const resolveStopCoordinates = jest.fn().mockResolvedValue({
      latitude: 44.5, longitude: -110.8, coordinateSource: 'geocoder',
    });
    const artifact = await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });
    expect(artifact.fingerprint).toBe(fingerprintCandidateStops(data));
  });
});
