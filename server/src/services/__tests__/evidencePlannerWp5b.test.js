'use strict';

const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { planEvidenceRequirements } = require('../evidencePlannerService');

const NOW = new Date('2026-08-09T12:00:00.000Z');
const YOSEMITE = {
  entityId: 'nps:park:yose', entityType: 'national_park', displayName: 'Yosemite National Park',
  latitude: 37.7459, longitude: -119.5332, resolutionConfidence: 1,
};

function plan(prompt, dates = null) {
  return planEvidenceRequirements({
    turnId: `turn:wp5b:${prompt}`,
    userPrompt: prompt,
    intent: classifyTrailieIntent({ userPrompt: prompt }),
    resolvedEntities: [YOSEMITE],
    dates,
    now: NOW,
    timezone: 'America/Los_Angeles',
  });
}

describe('WP5B planner provider and weather scope policy', () => {
  test('right-now weather becomes a hard zero-stale current observation requirement', () => {
    const requirements = plan("What's the weather in Yosemite right now?");
    expect(requirements.find((item) => item.topic === 'weather_current')).toMatchObject({
      evidenceTypes: ['live_state'],
      temporalScope: { mode: 'current' },
      freshnessClass: 'live',
      maxStaleSeconds: 0,
      criticality: 'hard',
      preferredProviders: ['weather'],
      reasonCodes: expect.arrayContaining(['explicit_current_weather_request']),
    });
    expect(requirements.some((item) => item.topic === 'weather_forecast')).toBe(false);
  });

  test('a trip beyond the forecast horizon requests climate evidence, not current or forecast', () => {
    const dates = {
      mode: 'date_range',
      validFrom: '2027-10-10T00:00:00.000Z',
      validThrough: '2027-10-12T23:59:59.999Z',
    };
    const requirements = plan('Plan Yosemite October 10-12, 2027', dates);
    const topics = requirements.map((item) => item.topic);
    expect(topics).toContain('climate_normals');
    expect(topics).not.toContain('weather_current');
    expect(topics).not.toContain('weather_forecast');
    expect(requirements.find((item) => item.topic === 'climate_normals')).toMatchObject({
      preferredProviders: ['weather'],
      minimumAuthorityClass: 'trusted_specialist',
    });
  });

  test('RIDB is additive for structured campground and permit evidence', () => {
    const campground = plan('Do I need a permit and where can I camp in Yosemite?');
    expect(campground.find((item) => item.topic === 'permits_reservations').preferredProviders)
      .toEqual(['nps', 'ridb']);
    expect(campground.find((item) => item.topic === 'campgrounds').preferredProviders)
      .toEqual(['ridb', 'nps']);
  });
});
