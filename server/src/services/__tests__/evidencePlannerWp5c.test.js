'use strict';

const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { planEvidenceRequirements } = require('../evidencePlannerService');

const NOW = new Date('2026-08-09T12:34:56.000Z');
const YOSEMITE = {
  entityId: 'nps:park:yose', entityType: 'national_park', displayName: 'Yosemite National Park',
  latitude: 37.7459, longitude: -119.5332, resolutionConfidence: 1,
};
const SEQUOIA = {
  entityId: 'nps:park:sequ', entityType: 'national_park', displayName: 'Sequoia National Park',
  latitude: 36.4864, longitude: -118.5658, resolutionConfidence: 1,
};

const YELLOWSTONE = {
  entityId: 'nps:park:yell', entityType: 'national_park', displayName: 'Yellowstone National Park',
  latitude: 44.428, longitude: -110.588, resolutionConfidence: 1,
};
const GRAND_TETON = {
  entityId: 'nps:park:grte', entityType: 'national_park', displayName: 'Grand Teton National Park',
  latitude: 43.790, longitude: -110.681, resolutionConfidence: 1,
};
const DEATH_VALLEY = {
  entityId: 'nps:park:deva', entityType: 'national_park', displayName: 'Death Valley National Park',
  latitude: 36.5054, longitude: -117.0794, resolutionConfidence: 1,
};

function hardDrivingTimes(requirements) {
  return requirements.filter((item) => item.topic === 'driving_time' && item.criticality === 'hard');
}

describe('WP5C planner provider and route scope policy', () => {
  test('a multi-destination trip emits an exact inter-destination Maps scope', () => {
    const prompt = 'Plan a full trip through Yosemite and Sequoia';
    const requirements = planEvidenceRequirements({
      turnId: 'turn:wp5c:route', userPrompt: prompt,
      intent: classifyTrailieIntent({ userPrompt: prompt }), resolvedEntities: [YOSEMITE, SEQUOIA],
      now: NOW, timezone: 'America/Los_Angeles',
    });
    const route = requirements.find((item) => item.topic === 'driving_time' && item.entity.entityId === SEQUOIA.entityId);
    expect(route).toMatchObject({
      preferredProviders: ['google_maps'], minimumAuthorityClass: 'commercial_structured',
      routeScope: {
        origin: {
          entityId: YOSEMITE.entityId, displayName: YOSEMITE.displayName,
          latitude: YOSEMITE.latitude, longitude: YOSEMITE.longitude,
        },
        destination: {
          entityId: SEQUOIA.entityId, displayName: SEQUOIA.displayName,
          latitude: SEQUOIA.latitude, longitude: SEQUOIA.longitude,
        },
        travelMode: 'driving',
        departureTimeBucket: '2026-08-09T13:00:00.000Z',
      },
    });
  });

  test('route departure bucket is never in the past relative to planner now', () => {
    const prompt = 'Plan a full trip through Yosemite and Sequoia';
    const requirements = planEvidenceRequirements({
      turnId: 'turn:wp5c:departure-future',
      userPrompt: prompt,
      intent: classifyTrailieIntent({ userPrompt: prompt }),
      resolvedEntities: [YOSEMITE, SEQUOIA],
      now: NOW,
    });
    const route = requirements.find((item) => item.topic === 'driving_time' && item.routeScope);
    expect(new Date(route.routeScope.departureTimeBucket).getTime()).toBeGreaterThanOrEqual(NOW.getTime());
  });

  // 2026-08-26: the rule this test protects is "never guess an origin". It used
  // to be satisfied by emitting an UNSCOPED driving_time; the evidence audit
  // showed that requirement is unserviceable by construction (Maps needs a
  // routeScope, and the topic has no fallback), so not planning it at all is the
  // stronger form of the same rule.
  test('a route with no known origin plans no driving_time rather than guessing', () => {
    const prompt = 'Plan a Yosemite itinerary';
    const requirements = planEvidenceRequirements({
      turnId: 'turn:wp5c:no-origin', userPrompt: prompt,
      intent: classifyTrailieIntent({ userPrompt: prompt }), resolvedEntities: [YOSEMITE], now: NOW,
    });
    expect(requirements.find((item) => item.topic === 'driving_time')).toBeUndefined();
    // And nothing invented an origin to make one.
    expect(requirements.some((item) => item.routeScope)).toBe(false);
  });

  // WP11B — driving_time is only legal when a real inter-destination routeScope exists.
  // Phase 12D: uncapped full trips keep that scoped requirement as `required`, not `hard`,
  // so a Distance Matrix outage cannot fail-close ordinary multi-park planning.
  describe('WP11B — hard driving_time requires routeScope', () => {
    test('two-destination full trip: only the inter-destination leg is planned, and it is not hard without a cap', () => {
      const prompt = 'Plan a realistic 7-day Yellowstone and Grand Teton trip for two adults';
      const requirements = planEvidenceRequirements({
        turnId: 'turn:wp11b:yell-grte',
        userPrompt: prompt,
        intent: classifyTrailieIntent({ userPrompt: prompt }),
        resolvedEntities: [YELLOWSTONE, GRAND_TETON],
        now: NOW,
      });
      const drives = requirements.filter((item) => item.topic === 'driving_time');
      expect(drives).toHaveLength(1);
      expect(drives[0].criticality).toBe('required');
      expect(drives[0].entity.entityId).toBe(GRAND_TETON.entityId);
      expect(drives[0].routeScope).toMatchObject({
        origin: { entityId: YELLOWSTONE.entityId, latitude: YELLOWSTONE.latitude, longitude: YELLOWSTONE.longitude },
        destination: { entityId: GRAND_TETON.entityId, latitude: GRAND_TETON.latitude, longitude: GRAND_TETON.longitude },
        travelMode: 'driving',
      });
      expect(drives[0].routeScope.departureTimeBucket).toBeTruthy();
      expect(requirements.filter((item) => (
        item.topic === 'driving_time' && item.entity.entityId === YELLOWSTONE.entityId
      ))).toHaveLength(0);
      expect(hardDrivingTimes(requirements)).toHaveLength(0);
    });

    test('three-destination full trip: each transition is scoped; none are hard without a numeric cap', () => {
      const prompt = 'Plan a full trip through Yosemite, Sequoia, and Death Valley';
      const requirements = planEvidenceRequirements({
        turnId: 'turn:wp11b:three-park',
        userPrompt: prompt,
        intent: classifyTrailieIntent({ userPrompt: prompt }),
        resolvedEntities: [YOSEMITE, SEQUOIA, DEATH_VALLEY],
        now: NOW,
      });
      const drives = requirements.filter((item) => item.topic === 'driving_time');
      expect(drives).toHaveLength(2);
      expect(drives.every((item) => item.criticality === 'required')).toBe(true);
      expect(drives.every((item) => item.routeScope?.origin?.entityId && item.routeScope?.destination?.entityId)).toBe(true);
      expect(drives.map((item) => [
        item.routeScope.origin.entityId,
        item.routeScope.destination.entityId,
      ])).toEqual([
        [YOSEMITE.entityId, SEQUOIA.entityId],
        [SEQUOIA.entityId, DEATH_VALLEY.entityId],
      ]);
      expect(drives.every((item) => (
        Number.isFinite(item.routeScope.origin.latitude)
        && Number.isFinite(item.routeScope.origin.longitude)
        && Number.isFinite(item.routeScope.destination.latitude)
        && Number.isFinite(item.routeScope.destination.longitude)
        && item.routeScope.travelMode === 'driving'
        && Boolean(item.routeScope.departureTimeBucket)
      ))).toBe(true);
      expect(hardDrivingTimes(requirements)).toHaveLength(0);
    });

    test('single-destination full/deep trip does not invent a hard cross-destination driving_time', () => {
      const prompt = 'Do deep research on a 7-day trip to Yellowstone National Park';
      const requirements = planEvidenceRequirements({
        turnId: 'turn:wp11b:single',
        userPrompt: prompt,
        intent: classifyTrailieIntent({ userPrompt: prompt }),
        resolvedEntities: [YELLOWSTONE],
        now: NOW,
      });
      expect(hardDrivingTimes(requirements)).toHaveLength(0);
    });
  });

  test('astronomy and fee-free requirements select the additive WP5C adapters', () => {
    const prompt = 'Plan a Yosemite itinerary';
    const requirements = planEvidenceRequirements({
      turnId: 'turn:wp5c:providers', userPrompt: prompt,
      intent: classifyTrailieIntent({ userPrompt: prompt }), resolvedEntities: [YOSEMITE],
      dates: { mode: 'date_range', validFrom: '2026-08-10T00:00:00.000Z', validThrough: '2026-08-11T23:59:59.999Z' },
      now: NOW,
    });
    expect(requirements.find((item) => item.topic === 'astronomy')).toMatchObject({
      preferredProviders: ['astronomy_compute'], minimumAuthorityClass: 'trusted_specialist',
    });
    expect(requirements.find((item) => item.topic === 'fee_free_dates')).toMatchObject({
      preferredProviders: ['fee_free_calendar'], minimumAuthorityClass: 'official_owner', freshnessClass: 'stable',
    });
  });
});
