'use strict';

const {
  getEvidencePolicy,
  evaluateEvidenceFreshness,
} = require('../evidencePolicies');

describe('WP3 evidence freshness policies', () => {
  test.each([
    ['identity_geography', 90 * 86400, 365 * 86400],
    ['permits_rules', 3600, 6 * 3600],
    ['road_trail_state', 15 * 60, 30 * 60],
    ['weather_observation', 10 * 60, 20 * 60],
    ['wildfire_smoke', 5 * 60, 0],
    ['hotel_flight_availability_price', 5 * 60, 0],
  ])('defines %s freshness separately from max stale', (topic, freshSeconds, maxStaleSeconds) => {
    expect(getEvidencePolicy(topic)).toMatchObject({ freshSeconds, maxStaleSeconds });
  });

  test('classifies freshness from observation boundaries without deleting evidence', () => {
    const evidence = {
      topic: 'road_trail_state',
      observation: {
        expiresAt: new Date('2026-08-09T12:15:00.000Z'),
        staleUntil: new Date('2026-08-09T12:45:00.000Z'),
      },
    };

    expect(evaluateEvidenceFreshness(evidence, { now: new Date('2026-08-09T12:14:59.000Z') }).status)
      .toBe('fresh');
    expect(evaluateEvidenceFreshness(evidence, { now: new Date('2026-08-09T12:15:01.000Z') }).status)
      .toBe('stale_safe');
    expect(evaluateEvidenceFreshness(evidence, { now: new Date('2026-08-09T12:45:01.000Z') }).status)
      .toBe('expired');
  });

  test('critical requirements never permit stale evidence', () => {
    const evidence = {
      topic: 'road_trail_state',
      observation: {
        expiresAt: new Date('2026-08-09T12:15:00.000Z'),
        staleUntil: new Date('2026-08-09T12:45:00.000Z'),
      },
    };

    expect(evaluateEvidenceFreshness(evidence, {
      now: new Date('2026-08-09T12:20:00.000Z'),
      critical: true,
    }).status).toBe('stale_unsafe');
  });

  test.each([
    ['permits_reservations', 'permits_rules'],
    ['weather_current', 'weather_observation'],
    ['weather_forecast', 'weather_forecast'],
    ['climate_normals', 'climate_normals'],
  ])('maps WP5B topic %s to materialization policy %s', (topic, policyTopic) => {
    expect(getEvidencePolicy(topic).topic).toBe(policyTopic);
  });
});
