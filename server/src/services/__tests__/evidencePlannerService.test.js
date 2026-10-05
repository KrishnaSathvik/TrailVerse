'use strict';

const fixtures = require('../../eval/trailieEvidencePlanGoldenFixtures');
const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const {
  planEvidenceRequirements,
} = require('../evidencePlannerService');
const { validateEvidenceRequirement } = require('../../utils/evidenceRequirement');

const NOW = new Date('2026-08-09T12:00:00.000Z');

describe('WP4 golden evidence plans', () => {
  test.each(fixtures)('$id maps intent to the exact evidence plan', (fixture) => {
    const intent = classifyTrailieIntent({ userPrompt: fixture.prompt, priorTripState: fixture.priorTripState });
    expect(intent.primaryIntent).toBe(fixture.intent);
    const requirements = planEvidenceRequirements({
      turnId: `turn-${fixture.id}`,
      userPrompt: fixture.prompt,
      intent,
      resolvedEntities: fixture.entities,
      dates: fixture.dates || null,
      priorTripState: fixture.priorTripState || null,
      now: NOW,
      timezone: 'America/Los_Angeles',
    });

    for (const requirement of requirements) {
      expect({ id: fixture.id, ...validateEvidenceRequirement(requirement) })
        .toEqual({ id: fixture.id, valid: true, errors: [] });
    }
    const topics = requirements.map((item) => item.topic);
    if (fixture.topics) expect(topics).toEqual(fixture.topics);
    for (const topic of fixture.requiredTopics || []) expect(topics).toContain(topic);
    for (const topic of fixture.forbidden || []) expect(topics).not.toContain(topic);
    if (fixture.topicCounts) {
      for (const [topic, count] of Object.entries(fixture.topicCounts)) {
        expect(topics.filter((value) => value === topic)).toHaveLength(count);
      }
    }
    if (fixture.assert) expect(requirements.find((item) => item.topic === fixture.assert.topic)).toMatchObject(fixture.assert);
  });

  test('duration-qualified options remain discovery, not an itinerary evidence plan', () => {
    const intent = classifyTrailieIntent({ userPrompt: 'What can we do in Yosemite for 3 days?' });
    expect(intent.primaryIntent).toBe('place_discovery');
  });

  test('planner is deterministic and does not retain private input context', () => {
    const fixture = fixtures.find((item) => item.id === 'simple');
    const intent = classifyTrailieIntent({ userPrompt: fixture.prompt });
    expect(intent.primaryIntent).toBe('simple_itinerary');
    const input = {
      turnId: 'turn-deterministic', userPrompt: fixture.prompt, intent,
      resolvedEntities: fixture.entities, now: NOW, timezone: 'America/Los_Angeles',
      constraints: { budget: 250, accessibilityNeeds: 'private narrative' },
    };
    const first = planEvidenceRequirements(input);
    expect(planEvidenceRequirements(input)).toEqual(first);
    // Privacy: private constraint payloads must not leak into requirements.
    // Do NOT ban the substring "budget" — Pass #4 intentionally emits public
    // reasonCodes like budget_cost_evidence and fields like renderBudgetTokens.
    const serialized = JSON.stringify(first);
    expect(serialized).not.toMatch(/250|private narrative|accessibilityNeeds/);
    expect(serialized).not.toMatch(/"budget"\s*:/);
    expect(first.some((req) => (req.reasonCodes || []).includes('budget_cost_evidence'))).toBe(true);
  });

  test('safety-critical smoke never permits stale evidence', () => {
    const prompt = 'How bad is the wildfire smoke near Yosemite today?';
    const intent = classifyTrailieIntent({ userPrompt: prompt });
    const requirements = planEvidenceRequirements({
      turnId: 'turn-smoke', userPrompt: prompt, intent,
      resolvedEntities: fixtures[0].entities, now: NOW,
    });
    expect(requirements.find((item) => item.topic === 'wildfire_smoke')).toMatchObject({
      freshnessClass: 'live', maxStaleSeconds: 0, criticality: 'hard',
      reasonCodes: expect.arrayContaining(['safety_critical_signal']),
    });
  });

  test('future itinerary access requirements use seasonal rules, not current live state', () => {
    const fixture = fixtures.find((item) => item.id === 'future-simple');
    const intent = classifyTrailieIntent({ userPrompt: fixture.prompt });
    const requirements = planEvidenceRequirements({
      turnId: 'turn-future-freshness', userPrompt: fixture.prompt, intent,
      resolvedEntities: fixture.entities, dates: fixture.dates, now: NOW,
    });
    for (const topic of ['roads', 'alerts_closures']) {
      expect(requirements.find((item) => item.topic === topic)).toMatchObject({
        temporalScope: { mode: 'season' },
        evidenceTypes: ['rule'],
        freshnessClass: 'daily',
      });
    }
    expect(requirements.some((item) => ['live', 'request_time'].includes(item.freshnessClass))).toBe(false);
  });
});

describe('WP11B — explicit operational-conditions requests', () => {
  test('general_qa asking about closures/alerts requires live alerts_closures evidence', () => {
    const prompt = 'What should I know about current conditions at Yosemite National Park right now, '
      + 'including weather, closures, alerts, and anything that could affect a visit?';
    const intent = classifyTrailieIntent({ userPrompt: prompt });
    expect(intent.primaryIntent).toBe('general_qa');
    const requirements = planEvidenceRequirements({
      turnId: 'turn-current-conditions',
      userPrompt: prompt,
      intent,
      resolvedEntities: [{ entityId: 'nps:park:yose', displayName: 'Yosemite', latitude: 37.8, longitude: -119.5 }],
      now: NOW,
    });
    const topics = requirements.map((item) => item.topic);
    // Weather was already fetched; the gap was closures/alerts despite an explicit ask.
    expect(topics).toContain('weather_current');
    expect(topics).toContain('alerts_closures');
    const alerts = requirements.find((item) => item.topic === 'alerts_closures');
    expect(alerts.freshnessClass).toBe('live');
  });

  test('general_qa without an operational ask does NOT add alerts_closures', () => {
    const prompt = 'What is the entrance fee at Yosemite National Park?';
    const intent = classifyTrailieIntent({ userPrompt: prompt });
    const requirements = planEvidenceRequirements({
      turnId: 'turn-fee', userPrompt: prompt, intent,
      resolvedEntities: [{ entityId: 'nps:park:yose', latitude: 37.8, longitude: -119.5 }], now: NOW,
    });
    expect(requirements.map((item) => item.topic)).not.toContain('alerts_closures');
  });
});

describe('itinerary trip-execution context', () => {
  test('a weekend from a named city requests origin drive plus fees, hours, transit, and visitor services', () => {
    const prompt = 'Plan a relaxed weekend at Valley of Fire from Las Vegas with easy hikes and sunset spots.';
    const intent = classifyTrailieIntent({ userPrompt: prompt });
    expect(intent.primaryIntent).toBe('simple_itinerary');
    const requirements = planEvidenceRequirements({
      turnId: 'turn-vof-weekend',
      userPrompt: prompt,
      intent,
      resolvedEntities: [{
        entityId: 'place:known:valley-of-fire',
        entityType: 'known_place',
        displayName: 'Valley of Fire State Park',
        latitude: 36.43,
        longitude: -114.51,
      }],
      now: NOW,
    });
    const topics = requirements.map((item) => item.topic);
    // `transit` is no longer universal (2026-08-27 demand-driven planning): this
    // traveler drives from Las Vegas and asks nothing about shuttles or buses.
    expect(topics).toEqual(expect.arrayContaining([
      'fees', 'hours', 'visitor_services', 'driving_time',
    ]));
    expect(topics).not.toContain('transit');
    const drive = requirements.find((item) => item.topic === 'driving_time');
    expect(drive.reasonCodes).toContain('origin_drive_logistics');
    expect(drive.routeScope.origin.displayName).toMatch(/las vegas/i);
    expect(drive.routeScope.destination.entityId).toBe('place:known:valley-of-fire');
  });

  test('mobility-constrained traveler requests accessibility and short-experience evidence', () => {
    const prompt = "Parents in their late 60s who can't comfortably walk more than about a mile at a time. Three days in Grand Teton.";
    const intent = classifyTrailieIntent({ userPrompt: prompt });
    const requirements = planEvidenceRequirements({
      turnId: 'turn-mobility',
      userPrompt: prompt,
      intent,
      resolvedEntities: [{
        entityId: 'nps:park:grte',
        entityType: 'national_park',
        displayName: 'Grand Teton National Park',
        latitude: 43.79,
        longitude: -110.68,
      }],
      constraints: {
        dates: { durationDays: 3 },
        mobility: { maxWalkMilesPerSegment: 1 },
        travelers: { hasOlderTravelers: true },
      },
      now: NOW,
    });
    const topics = requirements.map((item) => item.topic);
    expect(topics).toEqual(expect.arrayContaining(['accessibility', 'visitor_services', 'activities']));
    const reasons = requirements.flatMap((item) => item.reasonCodes || []);
    expect(reasons.some((code) => /mobility|access|short_experience|family_or_access/i.test(code))).toBe(true);
  });
});
