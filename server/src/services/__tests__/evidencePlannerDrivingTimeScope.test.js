'use strict';

/**
 * §E / §F — DRIVING TIME IS PLANNED ONLY WHEN A ROUTE EXISTS.
 *
 * Ordinary single-park plan creation asked for `driving_time` before any stop
 * existed. No `routeScope` could be built, `google_maps.supports()` is false
 * without one, and the topic has no fallback provider — so the requirement was
 * planned, cache-looked-up and coverage-evaluated every turn, could never be
 * satisfied, and permanently forced `coverage: 'partial'`.
 *
 * That is not an evidence miss. It is an impossible question asked at the wrong
 * phase: stop-to-stop routes do not exist until stops do, and
 * `routeEvidenceDriveBridge` already computes them AFTER generation.
 *
 * A traveler who supplies real endpoints is a different case and keeps it.
 */

const { planEvidenceRequirements } = require('../evidencePlannerService');
const { evaluateEvidenceGate } = require('../trailieV2ExecutionService');
const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { createMapsEvidenceProvider } = require('../providers/mapsEvidenceProvider');

const NOW = new Date('2026-08-26T12:00:00.000Z');

const THRO = {
  entityId: 'nps:park:thro',
  entityType: 'national_park',
  displayName: 'Theodore Roosevelt National Park',
  latitude: 46.979,
  longitude: -103.538,
  resolutionConfidence: 1,
};
const YELLOWSTONE = {
  entityId: 'nps:park:yell',
  entityType: 'national_park',
  displayName: 'Yellowstone National Park',
  latitude: 44.6,
  longitude: -110.5,
  resolutionConfidence: 1,
};
const GRAND_TETON = {
  entityId: 'nps:park:grte',
  entityType: 'national_park',
  displayName: 'Grand Teton National Park',
  latitude: 43.79,
  longitude: -110.68,
  resolutionConfidence: 1,
};

function plan(prompt, resolvedEntities, extra = {}) {
  return planEvidenceRequirements({
    turnId: 'turn:driving-scope',
    userPrompt: prompt,
    intent: classifyTrailieIntent({ userPrompt: prompt }),
    resolvedEntities,
    now: NOW,
    ...extra,
  });
}

const drivingTimes = (requirements) => requirements.filter((r) => r.topic === 'driving_time');

describe('driving_time is only planned when a route scope exists', () => {
  test('ordinary single-park creation plans no driving_time at all', () => {
    const requirements = plan(
      'Plan three easygoing days in Theodore Roosevelt National Park. We care most about '
      + 'wildlife, scenery, photography, and relaxed drives with some easy walking.',
      [THRO]
    );
    expect(drivingTimes(requirements)).toEqual([]);
    // Everything else the turn genuinely needs is still planned.
    // `transit` dropped from this list 2026-08-27: it is demand-driven now, and
    // this traveler asked about wildlife, scenery, photography and easy walking.
    expect(requirements.map((r) => r.topic)).toEqual(expect.arrayContaining([
      'destination_identity', 'activities', 'alerts_closures', 'roads',
      'fees', 'hours', 'visitor_services',
    ]));
  });

  test('a single-destination deep trip plans no driving_time either', () => {
    const requirements = plan('Do deep research on a 7-day trip to Yellowstone National Park', [YELLOWSTONE]);
    expect(drivingTimes(requirements)).toEqual([]);
  });

  test('an explicit transport question with a real origin plans a scoped drive', () => {
    const requirements = plan(
      'We are driving from Las Vegas to Valley of Fire for a day trip.',
      [{
        entityId: 'place:known:valley-of-fire',
        entityType: 'known_place',
        displayName: 'Valley of Fire State Park',
        latitude: 36.43,
        longitude: -114.51,
        resolutionConfidence: 0.9,
      }]
    );
    const drives = drivingTimes(requirements);
    expect(drives).toHaveLength(1);
    expect(drives[0].routeScope.origin.displayName).toMatch(/las vegas/i);
    expect(drives[0].routeScope.destination.entityId).toBe('place:known:valley-of-fire');
    expect(drives[0].routeScope.travelMode).toBe('driving');
  });

  test('a plan request naming an origin keeps the itinerary origin-drive leg', () => {
    const requirements = plan(
      'Plan a three day trip to Valley of Fire from Las Vegas with easy walks.',
      [{
        entityId: 'place:known:valley-of-fire',
        entityType: 'known_place',
        displayName: 'Valley of Fire State Park',
        latitude: 36.43,
        longitude: -114.51,
        resolutionConfidence: 0.9,
      }]
    );
    const drives = drivingTimes(requirements);
    expect(drives).toHaveLength(1);
    expect(drives[0].reasonCodes).toContain('origin_drive_logistics');
    expect(drives[0].routeScope.origin.displayName).toMatch(/las vegas/i);
  });

  test('a multi-destination trip still plans the inter-destination leg', () => {
    const requirements = plan(
      'Plan a realistic 7-day Yellowstone and Grand Teton trip for two adults',
      [YELLOWSTONE, GRAND_TETON]
    );
    const drives = drivingTimes(requirements);
    expect(drives).toHaveLength(1);
    expect(drives[0].routeScope.origin.entityId).toBe('nps:park:yell');
    expect(drives[0].routeScope.destination.entityId).toBe('nps:park:grte');
  });

  /**
   * The invariant behind the whole change: whenever `driving_time` IS planned,
   * the provider that would serve it must actually be able to.
   */
  test('every planned driving_time is serviceable by google_maps', () => {
    const maps = createMapsEvidenceProvider({});
    const cases = [
      plan('Plan three easygoing days in Theodore Roosevelt National Park.', [THRO]),
      plan('Do deep research on a 7-day trip to Yellowstone National Park', [YELLOWSTONE]),
      plan('Plan a realistic 7-day Yellowstone and Grand Teton trip', [YELLOWSTONE, GRAND_TETON]),
      plan('We are driving from Las Vegas to Valley of Fire for a day trip.', [{
        entityId: 'place:known:valley-of-fire', entityType: 'known_place',
        displayName: 'Valley of Fire State Park', latitude: 36.43, longitude: -114.51,
        resolutionConfidence: 0.9,
      }]),
    ];
    for (const requirements of cases) {
      for (const drive of drivingTimes(requirements)) {
        expect({ topic: drive.topic, serviceable: maps.supports(drive) })
          .toEqual({ topic: 'driving_time', serviceable: true });
      }
    }
  });
});

describe('§F — coverage no longer reports partial for an impossible requirement', () => {
  function bundleSatisfying(requirements, { unsatisfied = [] } = {}) {
    return {
      resolutions: requirements.map((r) => ({
        requirementId: r.requirementId,
        status: unsatisfied.includes(r.topic) ? 'unsupported' : 'satisfied_fresh',
      })),
    };
  }

  test('a fully served single-park plan reports complete coverage', () => {
    const requirements = plan('Plan three easygoing days in Theodore Roosevelt National Park.', [THRO]);
    const gate = evaluateEvidenceGate(requirements, bundleSatisfying(requirements));
    expect(gate).toMatchObject({ hardComplete: true, coverage: 'complete' });
  });

  test('coverage still degrades honestly when something real is unmet', () => {
    const requirements = plan('Plan three easygoing days in Theodore Roosevelt National Park.', [THRO]);
    const gate = evaluateEvidenceGate(
      requirements,
      bundleSatisfying(requirements, { unsatisfied: ['alerts_closures'] })
    );
    expect(gate.coverage).toBe('partial');
    expect(gate.hardComplete).toBe(true);
  });

  test('an unmet hard requirement still blocks the turn', () => {
    const requirements = plan('Plan three easygoing days in Theodore Roosevelt National Park.', [THRO]);
    const gate = evaluateEvidenceGate(
      requirements,
      bundleSatisfying(requirements, { unsatisfied: ['destination_identity'] })
    );
    expect(gate.hardComplete).toBe(false);
    expect(gate.coverage).toBe('incomplete');
    expect(gate.unmetHardReasons).toContain('unmet_hard_destination_identity');
  });
});
