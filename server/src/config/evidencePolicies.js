'use strict';

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

const POLICIES = Object.freeze({
  identity_geography: { freshnessClass: 'stable', freshSeconds: 90 * DAY, maxStaleSeconds: 365 * DAY },
  overview_activities: { freshnessClass: 'stable', freshSeconds: 30 * DAY, maxStaleSeconds: 90 * DAY },
  accessibility_pet_policy: { freshnessClass: 'daily', freshSeconds: DAY, maxStaleSeconds: 7 * DAY },
  fees_standard_hours: { freshnessClass: 'daily', freshSeconds: 12 * HOUR, maxStaleSeconds: 48 * HOUR },
  permits_rules: { freshnessClass: 'hourly', freshSeconds: HOUR, maxStaleSeconds: 6 * HOUR },
  campgrounds_facilities: { freshnessClass: 'daily', freshSeconds: DAY, maxStaleSeconds: 7 * DAY },
  events: { freshnessClass: 'hourly', freshSeconds: HOUR, maxStaleSeconds: 6 * HOUR },
  transit_schedule: { freshnessClass: 'hourly', freshSeconds: HOUR, maxStaleSeconds: 6 * HOUR },
  road_trail_state: { freshnessClass: 'live', freshSeconds: 15 * 60, maxStaleSeconds: 30 * 60 },
  weather_observation: { freshnessClass: 'live', freshSeconds: 10 * 60, maxStaleSeconds: 20 * 60 },
  weather_forecast: { freshnessClass: 'hourly', freshSeconds: 30 * 60, maxStaleSeconds: 2 * HOUR },
  climate_normals: { freshnessClass: 'stable', freshSeconds: 30 * DAY, maxStaleSeconds: 365 * DAY },
  wildfire_smoke: { freshnessClass: 'live', freshSeconds: 5 * 60, maxStaleSeconds: 0 },
  driving_time: { freshnessClass: 'hourly', freshSeconds: 30 * 60, maxStaleSeconds: 6 * HOUR },
  local_business_discovery: { freshnessClass: 'daily', freshSeconds: DAY, maxStaleSeconds: 7 * DAY },
  hotel_flight_availability_price: { freshnessClass: 'request_time', freshSeconds: 5 * 60, maxStaleSeconds: 0 },
  astronomy: { freshnessClass: 'daily', freshSeconds: DAY, maxStaleSeconds: 7 * DAY },
  fee_free_dates: { freshnessClass: 'stable', freshSeconds: 30 * DAY, maxStaleSeconds: 365 * DAY },
});

/**
 * Planner/provider topic → freshness policy group.
 *
 * A topic with no entry here throws `unknown_evidence_freshness_topic` inside
 * materializeCandidate(), which the broker catches and reports as the generic
 * `provider_response_invalid` with `persisted: 0`. Ten granular topics were
 * missing, so EVERY candidate for them — from first-party NPS as well as web
 * providers — was silently discarded before it could be stored, and the
 * requirements they served resolved `missing` no matter what was retrieved.
 *
 * Four of the groups below (`transit_schedule`, `accessibility_pet_policy`,
 * `local_business_discovery`, `hotel_flight_availability_price`) were defined in
 * POLICIES but unreachable: the policies had been written for exactly these
 * topics, and only the alias wiring was absent.
 *
 * Every topic any planner or provider can emit MUST appear here; asserted by
 * evidenceTopicPolicyCoverage.test.js so this cannot silently drift again.
 */
const TOPIC_ALIASES = Object.freeze({
  destination_identity: 'identity_geography',
  overview: 'overview_activities',
  activities: 'overview_activities',
  alerts_closures: 'road_trail_state',
  roads: 'road_trail_state',
  trails: 'road_trail_state',
  trail_conditions: 'road_trail_state',
  permits: 'permits_rules',
  permits_reservations: 'permits_rules',
  rules: 'permits_rules',
  fees: 'fees_standard_hours',
  hours: 'fees_standard_hours',
  campgrounds: 'campgrounds_facilities',
  facilities: 'campgrounds_facilities',
  visitor_services: 'campgrounds_facilities',
  weather_current: 'weather_observation',
  // Park access operations. Parking availability turns over on the same cadence
  // as shuttle/transit operations, and the web policy already routes the two
  // together, so they share the transit group rather than the 15-minute
  // road/trail live class.
  transit: 'transit_schedule',
  parking: 'transit_schedule',
  // P0-5 — official vehicle size limits are stable park policy (Going-to-the-
  // Sun Road's 21-ft rule changes when the road does, not hourly).
  vehicle_restrictions: 'overview_activities',
  accessibility: 'accessibility_pet_policy',
  pet_policy: 'accessibility_pet_policy',
  local_business: 'local_business_discovery',
  lodging_strategy: 'local_business_discovery',
  hotel_live: 'hotel_flight_availability_price',
  flight_live: 'hotel_flight_availability_price',
  flight_strategy: 'hotel_flight_availability_price',
});

const normalizeTopic = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

function getEvidencePolicy(topic) {
  const normalized = normalizeTopic(topic);
  const key = TOPIC_ALIASES[normalized] || normalized;
  const policy = POLICIES[key];
  if (!policy) {
    const error = new Error(`Unknown evidence freshness topic: ${topic}`);
    error.code = 'unknown_evidence_freshness_topic';
    throw error;
  }
  return { topic: key, ...policy };
}

function evaluateEvidenceFreshness(evidence, { now = new Date(), critical = false } = {}) {
  const expiresAt = new Date(evidence?.observation?.expiresAt);
  const staleUntil = new Date(evidence?.observation?.staleUntil);
  if (Number.isNaN(expiresAt.getTime()) || Number.isNaN(staleUntil.getTime())) {
    const error = new TypeError('Evidence freshness requires valid expiresAt and staleUntil');
    error.code = 'invalid_evidence_freshness_boundary';
    throw error;
  }
  const at = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(at.getTime())) throw new TypeError('Freshness evaluation requires a valid now');
  if (at <= expiresAt) return { status: 'fresh', usable: true, ageMs: 0 };
  if (at <= staleUntil) {
    return {
      status: critical ? 'stale_unsafe' : 'stale_safe',
      usable: !critical,
      ageMs: at.getTime() - expiresAt.getTime(),
    };
  }
  return { status: 'expired', usable: false, ageMs: at.getTime() - expiresAt.getTime() };
}

module.exports = {
  EVIDENCE_POLICIES: POLICIES,
  getEvidencePolicy,
  evaluateEvidenceFreshness,
};
