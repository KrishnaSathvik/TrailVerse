'use strict';

/**
 * §B / §C — SAFETY-CURRENTNESS TOPICS MUST HAVE A SERVICEABLE PLANNED PATH.
 *
 * `trail_conditions` and `wildfire_smoke` become `hard` on
 * `live_in_trip_assistance` — the only criticality that terminates a turn. Both
 * declared `nps` as preferred provider, and `nps.supports()` was false for both,
 * so the structured wave could never satisfy them. An unmet hard requirement
 * returns `evidence_incomplete` BEFORE any model dispatch.
 *
 * That means "is this trail open right now?" — the most time-critical question a
 * traveler can ask — was the one guaranteed to depend on a slow discovery chain,
 * and to answer with nothing at all if any link in it failed.
 *
 * NPS publishes road closures, trail closures and fire/smoke notices as ALERTS,
 * which the provider already fetches. These topics are now served from that same
 * call — same dedupe key, so zero additional provider calls.
 *
 * Offline: only pure provider functions are exercised.
 */

const { planEvidenceRequirements, TOPIC_POLICY } = require('../evidencePlannerService');
const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { createNpsEvidenceProvider } = require('../providers/npsEvidenceProvider');

const NOW = new Date('2026-08-26T12:00:00.000Z');
const THRO = {
  entityId: 'nps:park:thro',
  entityType: 'national_park',
  displayName: 'Theodore Roosevelt National Park',
  latitude: 46.979,
  longitude: -103.538,
  resolutionConfidence: 1,
};

function plan(prompt) {
  return planEvidenceRequirements({
    turnId: 'turn:safety',
    userPrompt: prompt,
    intent: classifyTrailieIntent({ userPrompt: prompt }),
    resolvedEntities: [THRO],
    now: NOW,
  });
}

const nps = createNpsEvidenceProvider({});

const ALERTS = [
  { id: 'a1', title: 'Scenic Loop Drive closed at Peaceful Valley', category: 'Closure', description: 'The road is closed between mile 4 and mile 9 for repairs.' },
  { id: 'a2', title: 'Wind Canyon Trail temporarily closed', category: 'Closure', description: 'Trail damage after storms; the trail is closed until further notice.' },
  { id: 'a3', title: 'Smoke from regional wildfires', category: 'Caution', description: 'Air quality may be reduced due to wildfire smoke drifting into the park.' },
  { id: 'a4', title: 'Entrance fees increase in October', category: 'Information', description: 'New fee schedule takes effect.' },
];

function normalizeAlerts(items = ALERTS) {
  const request = nps.buildRequest({ topic: 'alerts_closures', entity: THRO });
  return nps.normalize(items, request, { observedAt: NOW.toISOString(), parkCode: 'thro', operation: 'alerts' });
}

describe('the NPS alerts feed serves the live operational topics', () => {
  test('nps now supports roads, trail_conditions and wildfire_smoke', () => {
    for (const topic of ['roads', 'trail_conditions', 'wildfire_smoke', 'alerts_closures']) {
      expect({ topic, supported: nps.supports({ topic, entity: THRO }) })
        .toEqual({ topic, supported: true });
    }
  });

  test('they share the alerts call — no additional provider dispatch', () => {
    const keys = ['alerts_closures', 'roads', 'trail_conditions', 'wildfire_smoke']
      .map((topic) => nps.buildRequest({ topic, entity: THRO }).dedupeKey);
    expect(new Set(keys)).toEqual(new Set(['nps|alerts|thro']));
  });

  test('a road-closure alert becomes roads evidence as well as an alert', () => {
    const byTopic = {};
    for (const candidate of normalizeAlerts()) {
      (byTopic[candidate.topic] ||= []).push(candidate.claim.identity);
    }
    // Every alert is still alerts_closures, exactly as before.
    expect(byTopic.alerts_closures).toHaveLength(4);
    expect(byTopic.roads).toHaveLength(1);
    expect(byTopic.trail_conditions).toHaveLength(1);
    expect(byTopic.wildfire_smoke).toHaveLength(1);
  });

  test('an unrelated alert is not classified into a live topic', () => {
    const feeOnly = normalizeAlerts([ALERTS[3]]);
    expect(feeOnly.map((c) => c.topic)).toEqual(['alerts_closures']);
  });

  test('the derived candidates carry official authority and live state', () => {
    for (const candidate of normalizeAlerts().filter((c) => c.topic !== 'alerts_closures')) {
      expect(candidate.evidenceType).toBe('live_state');
      expect(candidate.source.sourceClass).toBe('official_owner');
      expect(candidate.claim.status).toBe('active');
    }
  });
});

describe('a hard currentness requirement has a serviceable planned path', () => {
  test('"is this trail open right now" plans hard trail_conditions that nps can serve', () => {
    const requirements = plan('Is the Wind Canyon Trail open right now?');
    const trail = requirements.find((r) => r.topic === 'trail_conditions');
    expect(trail).toBeDefined();
    expect(trail.criticality).toBe('hard');
    expect(trail.preferredProviders).toContain('nps');
    expect(nps.supports(trail)).toBe(true);
  });

  test('"is there wildfire smoke" plans hard wildfire_smoke that nps can serve', () => {
    const requirements = plan('Is there wildfire smoke near Theodore Roosevelt right now?');
    const smoke = requirements.find((r) => r.topic === 'wildfire_smoke');
    expect(smoke).toBeDefined();
    expect(smoke.criticality).toBe('hard');
    expect(nps.supports(smoke)).toBe(true);
  });

  test('both remain blocking and current — not backgrounded, not downgraded', () => {
    for (const topic of ['trail_conditions', 'wildfire_smoke', 'roads', 'alerts_closures']) {
      expect(TOPIC_POLICY[topic].freshnessClass).toBe('live');
      expect(TOPIC_POLICY[topic].maxAgeSeconds).toBeLessThanOrEqual(15 * 60);
    }
  });

  test('a complete alert feed with no matching alert PROVES absence', () => {
    // "No official alert reports smoke" is the honest answer to "is there smoke",
    // and it must be reachable without a web round trip.
    const requirements = plan('Is there wildfire smoke near Theodore Roosevelt right now?');
    const smoke = requirements.find((r) => r.topic === 'wildfire_smoke');
    expect(smoke.absenceSemantics).toBe('proves_absent');
  });
});
