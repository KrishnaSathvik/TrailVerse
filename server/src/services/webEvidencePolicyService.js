'use strict';

const WEB_PROVIDER_IDS = Object.freeze(new Set(['brave', 'serper', 'tavily', 'direct_official_page']));
const WEB_ELIGIBLE_STATUSES = Object.freeze(new Set(['missing', 'unsupported', 'conflicted']));
const WEB_PROVIDER_BY_TOPIC = Object.freeze({
  alerts_closures: 'brave',
  roads: 'brave',
  trail_conditions: 'brave',
  wildfire_smoke: 'brave',
  events: 'brave',
  transit: 'brave',
  parking: 'brave',
  permits_reservations: 'brave',
  vehicle_restrictions: 'brave',
  local_business: 'serper',
  lodging_strategy: 'serper',
  overview: 'tavily',
  activities: 'tavily',
  accessibility: 'tavily',
  pet_policy: 'tavily',
  visitor_services: 'tavily',
});
const PUBLIC_REQUIREMENT_KEYS = Object.freeze([
  'schemaVersion', 'requirementId', 'turnId', 'entity', 'topic', 'evidenceTypes',
  'temporalScope', 'freshnessClass', 'maxAgeSeconds', 'maxStaleSeconds', 'criticality',
  'absenceSemantics', 'minimumAuthorityClass', 'acceptedSourceClasses',
  'privacyScope', 'renderBudgetTokens', 'reasonCodes', 'plannerVersion',
]);
const QUERY_TERMS = Object.freeze({
  alerts_closures: 'current alerts closures official',
  roads: 'road conditions closures official',
  trail_conditions: 'trail conditions closures current',
  wildfire_smoke: 'wildfire smoke air quality current',
  events: 'events ranger programs current',
  transit: 'shuttle transit bus parking access official',
  parking: 'parking lots shuttle access official',
  permits_reservations: 'vehicle reservation timed entry permits recreation.gov official',
  vehicle_restrictions: 'vehicle length size restrictions RV limit road official',
  local_business: 'restaurants local businesses',
  lodging_strategy: 'lodging hotels near park',
  overview: 'official overview',
  activities: 'hikes trails viewpoints overlooks things to do official',
  accessibility: 'accessibility official',
  pet_policy: 'pet policy official',
  visitor_services: 'visitor services official',
});

function buildPublicWebQuery(requirement) {
  const displayName = String(requirement?.entity?.displayName || '').trim().replace(/\s+/g, ' ');
  const terms = QUERY_TERMS[requirement?.topic];
  if (!displayName || !terms) return null;
  const reasons = new Set(requirement?.reasonCodes || []);
  const extras = [];
  if (reasons.has('requested_named_hike_or_walk') || reasons.has('compare_named_hike_parity')) {
    extras.push('hikes trails walks');
  }
  if (reasons.has('requested_hard_hike')) {
    extras.push('strenuous difficult challenging hikes trails');
  }
  if (reasons.has('requested_sunset_place_candidate') || reasons.has('refinement_requested_sunset')) {
    extras.push('sunset viewpoint overlook');
  }
  if (reasons.has('contingency_alternate_activities')) {
    extras.push('alternative areas things to do if access limited');
  }
  if (reasons.has('requested_low_exposure_candidates')) {
    extras.push('easy flat trails no drop offs');
  }
  if (reasons.has('mobility_short_experience') || reasons.has('requested_low_walking_candidates')) {
    extras.push('accessible short walks visitor services');
  }
  if (reasons.has('access_decision_support') || reasons.has('access_execution_support')) {
    extras.push('shuttle parking vehicle reservation timed entry');
  }
  const temporal = requirement?.temporalScope || {};
  if (['current', 'instant', 'date_range', 'season'].includes(temporal.mode)) {
    const at = new Date(temporal.validFrom || temporal.requestedAt || '');
    if (!Number.isNaN(at.getTime())) extras.push(String(at.getUTCFullYear()));
  }
  const query = `${displayName} ${terms}${extras.length ? ` ${extras.join(' ')}` : ''}`.replace(/\s+/g, ' ').trim();
  return query.slice(0, 240);
}

const DECISION_CRITICAL_TOPICS = new Set([
  'alerts_closures', 'roads', 'trail_conditions', 'wildfire_smoke', 'transit',
  'parking', 'permits_reservations', 'accessibility', 'visitor_services',
  // P0-5 — planned only on the traveler's vehicle demand signal, and when it
  // is planned, an official size limit decides route validity.
  'vehicle_restrictions',
]);

/**
 * Did the structured wave already answer this, with authority a web wave
 * cannot improve on?
 *
 * ADEQUACY IS A PROPERTY OF WHAT WE SELECTED, NOT OF WHAT WE DISCARDED.
 *
 * This used to also fail on `candidateSummary.insufficientAuthority` and
 * `candidateSummary.conflicted`. Both count candidates the coverage evaluator
 * REJECTED while selecting; neither says anything about the evidence that was
 * actually selected. Reading them as a deficiency built a self-sustaining loop:
 *
 *   official evidence selected  ->  old reputable_web candidates also present
 *   -> rejected for weak authority  ->  read as an evidence gap
 *   -> web enrichment runs  ->  writes more reputable_web candidates
 *   -> next turn rejects even more  ->  enrichment runs again, forever.
 *
 * Every decision-critical topic floors at `official_owner`/`official_operator`
 * with `acceptedSourceClasses: [policy.authority]`, so the `reputable_web` rows
 * a web wave writes can never be selected for those requirements — they only
 * accumulate as permanent rejects. The loop had no exit.
 *
 * Genuinely unresolved coverage never reaches this function: when nothing is
 * selected the evaluator returns `missing` or `conflicted`, and
 * `shouldEnrichResolution` admits both before asking about adequacy. So by the
 * time we are here, `selected` is non-empty and the only real question is
 * whether a web wave could supply anything better.
 */
function structuredResultIsAdequate(requirement, resolution) {
  const authorities = resolution?.authorityClasses || [];
  if (authorities.length === 0) return false;
  // A web wave can only ever supply `reputable_web`, so it cannot improve on a
  // selection that is already better than that.
  return authorities.every((authority) => authority && authority !== 'reputable_web');
}

/**
 * IMPORTANT IS NOT THE SAME AS UNRESOLVED.
 *
 * This gate used to read "decision-critical topic" as "always ask the internet
 * again". On the 2026-08-27 THRO benchmark that sent `permits_reservations`
 * into the sequential web waves even though `ridb` had already answered it in
 * wave 1, at 234 ms, with official-operator authority — and the web waves cost
 * 3,378 ms of a 4,503 ms evidence wall.
 *
 * Importance decides whether a gap MATTERS. It does not by itself establish
 * that there is a gap. Enrichment now requires an actual deficiency: the
 * requirement is unresolved (`missing`/`unsupported`/`conflicted`), or the
 * evidence that resolved it is itself no better than what a web wave supplies.
 */
function shouldEnrichResolution(requirement, resolution) {
  if (WEB_ELIGIBLE_STATUSES.has(resolution?.status)) return true;
  if (!['satisfied_partial', 'satisfied_stale_safe'].includes(resolution?.status)) return false;
  if (requirement?.criticality === 'optional') return false;
  if (structuredResultIsAdequate(requirement, resolution)) return false;
  const current = ['current', 'instant', 'date_range', 'season'].includes(requirement?.temporalScope?.mode);
  const decisionReason = (requirement?.reasonCodes || []).some((reason) =>
    /(?:decision|parking|permit|reservation|mobility|access|closure|current|safety)/i.test(reason));
  return DECISION_CRITICAL_TOPICS.has(requirement?.topic) && (current || decisionReason);
}

function publicFallbackRequirement(requirement, provider) {
  const planned = {};
  for (const key of PUBLIC_REQUIREMENT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(requirement, key)) planned[key] = requirement[key];
  }
  planned.preferredProviders = [provider];
  planned.allowedFallbackProviders = [];
  return planned;
}

/**
 * P0-5 — PARSED-RULE TOPICS. For most topics, official page CONTENT answers
 * the requirement. A dimension topic is only answered by the PARSED RULE: a
 * fetched official page about vehicle reservations is authoritative and
 * fresh, yet says nothing about a 21-ft length limit — treating it as
 * adequate froze the topic forever without the fact. Until some evidence for
 * the entity carries the structured fact, the web chain re-enters (bounded:
 * one discovery search plus the multi-page official follow).
 */
const PARSED_RULE_TOPICS = Object.freeze(new Set(['vehicle_restrictions']));

function bundleCarriesParsedRule(requirement, structuredBundle) {
  if (!PARSED_RULE_TOPICS.has(requirement?.topic)) return true;
  // The fact may ride on a candidate of ANY topic (structured NPS facts live
  // inside activities-topic rows), so the check is entity-wide by content.
  return (structuredBundle?.evidence || []).some(
    (candidate) => candidate?.entityId === requirement?.entity?.entityId
      && (candidate?.claim?.normalizedValue?.operationalFacts || [])
        .some((fact) => fact?.type === 'vehicle_dimension')
  );
}

function planWebEvidenceFallbacks({ requirements = [], structuredBundle } = {}) {
  const resolutionById = new Map((structuredBundle?.resolutions || [])
    .map((resolution) => [resolution.requirementId, resolution]));
  return requirements.flatMap((requirement) => {
    const resolution = resolutionById.get(requirement.requirementId);
    const provider = WEB_PROVIDER_BY_TOPIC[requirement.topic];
    if (!provider) return [];
    const missingParsedRule = !bundleCarriesParsedRule(requirement, structuredBundle);
    if (!missingParsedRule && !shouldEnrichResolution(requirement, resolution)) return [];
    if (!buildPublicWebQuery(requirement)) return [];
    return [publicFallbackRequirement(requirement, provider)];
  });
}

module.exports = {
  WEB_PROVIDER_BY_TOPIC,
  structuredResultIsAdequate,
  WEB_PROVIDER_IDS,
  buildPublicWebQuery,
  planWebEvidenceFallbacks,
  shouldEnrichResolution,
};
