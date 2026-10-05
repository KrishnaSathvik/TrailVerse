'use strict';

/**
 * Every topic a planner or provider can emit must have a freshness policy.
 *
 * THE DEFECT THIS PREVENTS
 * ------------------------
 * Ten granular topics — `parking`, `transit`, `accessibility`, `trail_conditions`,
 * `pet_policy`, `local_business`, `lodging_strategy`, `hotel_live`, `flight_live`,
 * `flight_strategy` — had no entry in TOPIC_ALIASES. getEvidencePolicy() threw
 * `unknown_evidence_freshness_topic` inside materializeCandidate(), the broker
 * caught it and reported the generic `provider_response_invalid`, and EVERY
 * candidate for those topics was discarded before storage — from first-party NPS
 * as well as web providers. A live parking turn retrieved correct, authoritative,
 * ownership-verified official pages and delivered `normalized: 5, persisted: 0`.
 *
 * Four of the policy groups those topics needed already existed and were simply
 * unreachable, so the failure was pure alias drift: the topic vocabulary grew and
 * the mapping did not.
 *
 * Offline: pure table comparison, no I/O.
 */

const { getEvidencePolicy } = require('../evidencePolicies');
const { TOPIC_POLICY } = require('../../services/evidencePlannerService');
const { WEB_PROVIDER_BY_TOPIC } = require('../../services/webEvidencePolicyService');
const { SUPPORTED_TOPICS: NPS_TOPICS } = require('../../services/providers/npsEvidenceProvider');
const { BRAVE_TOPICS } = require('../../services/providers/braveEvidenceProvider');

/** Every topic the system can put on a candidate. */
function emittableTopics() {
  const topics = new Set();
  for (const topic of Object.keys(TOPIC_POLICY || {})) topics.add(topic);
  for (const topic of Object.keys(WEB_PROVIDER_BY_TOPIC)) topics.add(topic);
  for (const topic of NPS_TOPICS || []) topics.add(topic);
  for (const topic of BRAVE_TOPICS || []) topics.add(topic);
  return [...topics].sort();
}

describe('evidence topic freshness policy coverage', () => {
  const topics = emittableTopics();

  test('the emittable topic set is non-trivial', () => {
    expect(topics.length).toBeGreaterThan(20);
  });

  test.each(emittableTopics())('%s resolves to a freshness policy', (topic) => {
    const policy = getEvidencePolicy(topic);
    expect(policy).toBeTruthy();
    expect(typeof policy.freshSeconds).toBe('number');
    expect(typeof policy.maxStaleSeconds).toBe('number');
    expect(policy.freshnessClass).toEqual(expect.any(String));
  });

  test('no emittable topic is rejected as unknown', () => {
    const rejected = topics.filter((topic) => {
      try { getEvidencePolicy(topic); return false; } catch { return true; }
    });
    expect(rejected).toEqual([]);
  });

  test('the topics that caused the live parking failure all resolve', () => {
    for (const topic of ['parking', 'transit', 'roads', 'permits_reservations', 'alerts_closures']) {
      expect(() => getEvidencePolicy(topic)).not.toThrow();
    }
  });

  test('the mobility/accessibility topics resolve before that path is exercised', () => {
    for (const topic of ['accessibility', 'visitor_services', 'activities', 'overview']) {
      expect(() => getEvidencePolicy(topic)).not.toThrow();
    }
  });

  test('an genuinely unknown topic still fails closed', () => {
    expect(() => getEvidencePolicy('not_a_real_topic')).toThrow(/Unknown evidence freshness topic/);
    try { getEvidencePolicy('not_a_real_topic'); } catch (error) {
      expect(error.code).toBe('unknown_evidence_freshness_topic');
    }
  });

  test('park-access topics share the transit operational cadence', () => {
    expect(getEvidencePolicy('parking').topic).toBe('transit_schedule');
    expect(getEvidencePolicy('transit').topic).toBe('transit_schedule');
  });

  test('trail conditions inherit the live road/trail cadence', () => {
    expect(getEvidencePolicy('trail_conditions').topic).toBe('road_trail_state');
    expect(getEvidencePolicy('roads').topic).toBe('road_trail_state');
  });
});
