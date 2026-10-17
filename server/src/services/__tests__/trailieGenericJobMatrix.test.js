'use strict';

const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { planEvidenceRequirements } = require('../evidencePlannerService');
const { buildPublicWebQuery } = require('../webEvidencePolicyService');
const { TOPIC_POLICY } = require('../evidencePlannerService');

const yose = {
  entityId: 'nps:park:yose',
  entityType: 'national_park',
  displayName: 'Yosemite National Park',
  latitude: 37.86,
  longitude: -119.53,
  resolutionConfidence: 1,
};

function topicsFor(prompt, extra = {}) {
  const intent = classifyTrailieIntent({ userPrompt: prompt, priorTripState: extra.priorTripState });
  const requirements = planEvidenceRequirements({
    turnId: `turn-${prompt.slice(0, 12)}`,
    userPrompt: prompt,
    intent,
    resolvedEntities: extra.entities || [yose],
    constraints: extra.constraints || null,
    now: new Date('2026-08-12T12:00:00.000Z'),
  });
  return { intent, topics: requirements.map((item) => item.topic), requirements };
}

describe('generic offline question matrix — job paths', () => {
  test.each([
    ['Is three days enough for Yosemite?', 'trip_duration_advice', 'general_qa'],
    ['Compare Yosemite and Sequoia for hiking.', 'destination_compare', 'compare'],
    ['Plan logistics for 10 days in Yosemite, but do not build a day-by-day itinerary yet.', 'trip_skeleton', 'general_qa'],
    ['Plan me one day in Yosemite.', 'day_by_day_itinerary', 'simple_itinerary'],
    ['Where should I stay near Yosemite?', 'lodging_strategy', 'lodging_strategy'],
    ['Which Airbnb area should we use for Yosemite?', 'lodging_strategy', 'lodging_strategy'],
    ['How do campground reservations work at Yosemite?', 'campground_strategy', 'permit_camping'],
    ['Do I need a permit for Half Dome?', 'permits_reservations', 'permit_camping'],
    ['Which airport should I fly into for Yosemite?', 'airport_strategy', 'flight_strategy'],
    ['What is the weather in Yosemite this week?', 'general_advice', 'general_qa'],
    ['How much does Yosemite cost?', 'budget_cost', 'general_qa'],
    ['We have six hours in Yosemite.', 'day_by_day_itinerary', 'simple_itinerary'],
    ['Best wildlife photography in Yosemite?', 'place_discovery', 'place_discovery'],
    ['We hate hiking. What should we do in Yosemite?', 'place_discovery', 'place_discovery'],
    ['Plan a romantic weekend in Yosemite.', 'day_by_day_itinerary', 'simple_itinerary'],
  ])('%s', (prompt, job, primary) => {
    const { intent } = topicsFor(prompt);
    expect(intent.travelerJob).toBe(job);
    expect(intent.primaryIntent).toBe(primary);
  });

  test('hard hike does not query easy hikes', () => {
    const { requirements } = topicsFor('We want difficult hikes in Yosemite.');
    const activity = requirements.find((item) => item.topic === 'activities');
    const query = buildPublicWebQuery(activity || {
      topic: 'activities',
      entity: yose,
      reasonCodes: ['requested_hard_hike'],
    });
    expect(String(query || '')).not.toMatch(/easy hikes/i);
    expect(String(query || '')).toMatch(/strenuous|difficult|challenging/i);
  });

  test('parking-full retrieves access mechanics', () => {
    const { topics } = topicsFor('Parking is full — what do I do at Yosemite?');
    expect(topics).toEqual(expect.arrayContaining(['parking', 'roads', 'transit', 'alerts_closures']));
  });

  test('short backup-plan parking question is access contingency, not transport', () => {
    const { intent, topics } = topicsFor("What's a good backup plan if Yosemite parking is full?");
    expect(intent.travelerJob).toBe('access_contingency');
    expect(intent.primaryIntent).toBe('general_qa');
    expect(topics).toEqual(expect.arrayContaining(['parking', 'roads', 'transit']));
  });

  test('family/accessibility retrieves suitability evidence', () => {
    const { topics } = topicsFor('Yosemite with a toddler and a wheelchair.');
    expect(topics).toEqual(expect.arrayContaining(['accessibility', 'visitor_services']));
  });

  test('live hotel and flight inventory topics are marked unsupported', () => {
    expect(TOPIC_POLICY.hotel_live.unsupported).toBe(true);
    expect(TOPIC_POLICY.flight_live.unsupported).toBe(true);
    expect(TOPIC_POLICY.hotel_live.providers).toEqual([]);
    expect(TOPIC_POLICY.flight_live.providers).toEqual([]);
  });

  test('every topic is either wired to providers or explicitly unsupported', () => {
    for (const [topic, policy] of Object.entries(TOPIC_POLICY)) {
      if (policy.unsupported) {
        expect({ topic, providers: policy.providers }).toEqual({ topic, providers: [] });
      } else {
        expect({ topic, providers: policy.providers.length }).toEqual({
          topic,
          providers: expect.any(Number),
        });
        expect(policy.providers.length).toBeGreaterThan(0);
      }
    }
  });

  test('weather questions retrieve weather evidence, not a live-in-trip alert default', () => {
    const { intent, topics } = topicsFor('What is the weather in Yosemite this week?');
    expect(intent.travelerJob).toBe('general_advice');
    expect(topics).toEqual(expect.arrayContaining(['weather_forecast']));
  });

  test('winter questions retrieve seasonal climate evidence', () => {
    const { topics } = topicsFor('Is winter a good time for Yosemite?');
    expect(topics).toEqual(expect.arrayContaining(['climate_normals']));
  });

  test('mid-trip closure retrieves operational access evidence', () => {
    const { intent, topics } = topicsFor('The road just closed. What do we do in Yosemite?');
    expect(['current_conditions', 'access_contingency']).toContain(intent.travelerJob);
    expect(topics).toEqual(expect.arrayContaining(['alerts_closures']));
  });
});
