'use strict';

const { createHash } = require('crypto');

const SCHEMA_VERSION = 'trailie-evidence-requirement-v1';
const PLANNER_VERSION = 'evidence-planner-v1.0.0';
const TOPICS = Object.freeze([
  'destination_identity', 'overview', 'activities', 'fees', 'hours', 'alerts_closures',
  'roads', 'trail_conditions', 'weather_current', 'weather_forecast', 'climate_normals',
  'permits_reservations', 'campgrounds', 'visitor_services', 'events', 'transit', 'parking',
  'driving_time', 'lodging_strategy', 'hotel_live', 'flight_strategy', 'flight_live',
  'local_business', 'wildfire_smoke', 'astronomy', 'fee_free_dates', 'accessibility',
  'pet_policy',
  // P0-5 — official vehicle size/dimension rules, planned only on the
  // traveler's own vehicle demand signal.
  'vehicle_restrictions',
]);
const EVIDENCE_TYPES = Object.freeze(['fact', 'live_state', 'rule', 'description', 'relationship', 'recommendation_signal']);
const TEMPORAL_MODES = Object.freeze(['timeless', 'current', 'instant', 'date_range', 'season']);
const FRESHNESS_CLASSES = Object.freeze(['stable', 'daily', 'hourly', 'live', 'request_time']);
const CRITICALITIES = Object.freeze(['hard', 'required', 'optional']);
const ABSENCE_SEMANTICS = Object.freeze(['proves_absent', 'unknown', 'not_applicable']);
const AUTHORITY_CLASSES = Object.freeze([
  'official_owner', 'official_structured', 'official_operator', 'government_partner',
  'trusted_specialist', 'commercial_structured', 'reputable_web', 'listing_only', 'model_prior',
]);
const SLUG = /^[a-z0-9][a-z0-9_.:-]{0,79}$/;
const ROUTE_MODES = Object.freeze(['driving', 'walking', 'bicycling', 'transit']);

const unique = (values = []) => [...new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
const ordered = (values, order) => unique(values).sort((left, right) => order.indexOf(left) - order.indexOf(right));
const iso = (value) => {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid evidence requirement date: ${value}`);
  return date.toISOString();
};

function routePoint(value = {}) {
  return {
    entityId: String(value.entityId || '').trim().toLowerCase(),
    displayName: String(value.displayName || '').trim(),
    latitude: Number.isFinite(Number(value.latitude)) ? Number(value.latitude) : null,
    longitude: Number.isFinite(Number(value.longitude)) ? Number(value.longitude) : null,
  };
}

function normalizeRouteScope(value) {
  if (value == null) return null;
  return {
    origin: routePoint(value.origin),
    destination: routePoint(value.destination),
    travelMode: String(value.travelMode || '').trim().toLowerCase(),
    departureTimeBucket: iso(value.departureTimeBucket),
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function buildEvidenceRequirement(input = {}) {
  const ordinal = Number(input.ordinal);
  if (!Number.isInteger(ordinal) || ordinal < 0) throw new TypeError('Evidence requirement ordinal must be non-negative');
  const turnId = String(input.turnId || '').trim();
  if (!turnId) throw new TypeError('Evidence requirement turnId is required');
  const entity = {
    entityId: input.entity?.entityId == null ? null : String(input.entity.entityId).trim().toLowerCase(),
    entityType: String(input.entity?.entityType || 'unknown').trim().toLowerCase(),
    displayName: String(input.entity?.displayName || '').trim(),
    parentEntityId: input.entity?.parentEntityId == null ? null : String(input.entity.parentEntityId).trim().toLowerCase(),
    latitude: Number.isFinite(Number(input.entity?.latitude)) ? Number(input.entity.latitude) : null,
    longitude: Number.isFinite(Number(input.entity?.longitude)) ? Number(input.entity.longitude) : null,
    resolutionConfidence: Number(input.entity?.resolutionConfidence ?? 0),
  };
  const temporalScope = {
    mode: String(input.temporalScope?.mode || 'timeless').trim().toLowerCase(),
    requestedAt: iso(input.temporalScope?.requestedAt),
    validFrom: iso(input.temporalScope?.validFrom),
    validThrough: iso(input.temporalScope?.validThrough),
    timezone: String(input.temporalScope?.timezone || 'UTC').trim(),
  };
  const body = {
    schemaVersion: SCHEMA_VERSION,
    turnId,
    entity,
    topic: String(input.topic || '').trim().toLowerCase(),
    evidenceTypes: ordered(input.evidenceTypes, EVIDENCE_TYPES),
    temporalScope,
    freshnessClass: String(input.freshnessClass || '').trim().toLowerCase(),
    maxAgeSeconds: Number(input.maxAgeSeconds),
    maxStaleSeconds: Number(input.maxStaleSeconds),
    criticality: String(input.criticality || '').trim().toLowerCase(),
    absenceSemantics: String(input.absenceSemantics || 'unknown').trim().toLowerCase(),
    minimumAuthorityClass: String(input.minimumAuthorityClass || '').trim().toLowerCase(),
    acceptedSourceClasses: ordered(input.acceptedSourceClasses, AUTHORITY_CLASSES),
    preferredProviders: unique(input.preferredProviders),
    allowedFallbackProviders: unique(input.allowedFallbackProviders),
    privacyScope: String(input.privacyScope || 'public').trim().toLowerCase(),
    renderBudgetTokens: Number(input.renderBudgetTokens),
    reasonCodes: unique(input.reasonCodes),
    plannerVersion: PLANNER_VERSION,
  };
  if (input.routeScope != null) body.routeScope = normalizeRouteScope(input.routeScope);
  const hash = createHash('sha256').update(JSON.stringify(stable({ ordinal, ...body }))).digest('hex').slice(0, 20);
  return {
    schemaVersion: body.schemaVersion,
    requirementId: `req:${turnId}:${ordinal}:${hash}`,
    ...Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'schemaVersion')),
  };
}

function validateEvidenceRequirement(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['requirement_not_object'] };
  const keys = Object.keys(value).sort();
  const expectedKeys = [
    'absenceSemantics', 'acceptedSourceClasses', 'allowedFallbackProviders', 'criticality',
    'entity', 'evidenceTypes', 'freshnessClass', 'maxAgeSeconds', 'maxStaleSeconds',
    'minimumAuthorityClass', 'plannerVersion', 'preferredProviders', 'privacyScope',
    'reasonCodes', 'renderBudgetTokens', 'requirementId', 'schemaVersion', 'temporalScope',
    'topic', 'turnId', ...(value.routeScope == null ? [] : ['routeScope']),
  ].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) errors.push('requirement_keys_invalid');
  if (value.schemaVersion !== SCHEMA_VERSION) errors.push('schema_version_invalid');
  if (value.plannerVersion !== PLANNER_VERSION) errors.push('planner_version_invalid');
  if (!TOPICS.includes(value.topic)) errors.push('topic_invalid');
  if (!Array.isArray(value.evidenceTypes) || value.evidenceTypes.length === 0 || value.evidenceTypes.some((item) => !EVIDENCE_TYPES.includes(item))) errors.push('evidence_types_invalid');
  if (!FRESHNESS_CLASSES.includes(value.freshnessClass)) errors.push('freshness_class_invalid');
  if (!CRITICALITIES.includes(value.criticality)) errors.push('criticality_invalid');
  if (!ABSENCE_SEMANTICS.includes(value.absenceSemantics)) errors.push('absence_semantics_invalid');
  if (!AUTHORITY_CLASSES.includes(value.minimumAuthorityClass)) errors.push('authority_class_invalid');
  if (!Number.isFinite(value.maxAgeSeconds) || value.maxAgeSeconds < 0) errors.push('max_age_invalid');
  if (!Number.isFinite(value.maxStaleSeconds) || value.maxStaleSeconds < 0) errors.push('max_stale_invalid');
  if (!Number.isFinite(value.renderBudgetTokens) || value.renderBudgetTokens < 1 || value.renderBudgetTokens > 1000) errors.push('render_budget_invalid');
  if (value.privacyScope !== 'public') errors.push('privacy_scope_invalid');
  for (const field of ['acceptedSourceClasses', 'preferredProviders', 'allowedFallbackProviders', 'reasonCodes']) {
    if (!Array.isArray(value[field]) || value[field].some((item) => !SLUG.test(item)) || new Set(value[field]).size !== value[field].length) errors.push(`${field}_invalid`);
  }
  if (value.acceptedSourceClasses?.some((item) => !AUTHORITY_CLASSES.includes(item))) errors.push('accepted_source_class_invalid');
  const entity = value.entity;
  if (!entity || JSON.stringify(Object.keys(entity).sort()) !== JSON.stringify([
    'displayName', 'entityId', 'entityType', 'latitude', 'longitude', 'parentEntityId', 'resolutionConfidence',
  ].sort())) errors.push('entity_invalid');
  else {
    if (entity.entityId !== null && !/^[a-z0-9]+:[a-z0-9_]+:[a-z0-9_-]+$/.test(entity.entityId)) errors.push('entity_id_invalid');
    if (!Number.isFinite(entity.resolutionConfidence) || entity.resolutionConfidence < 0 || entity.resolutionConfidence > 1) errors.push('entity_confidence_invalid');
    if (entity.latitude !== null && (!Number.isFinite(entity.latitude) || entity.latitude < -90 || entity.latitude > 90)) errors.push('entity_latitude_invalid');
    if (entity.longitude !== null && (!Number.isFinite(entity.longitude) || entity.longitude < -180 || entity.longitude > 180)) errors.push('entity_longitude_invalid');
  }
  const temporal = value.temporalScope;
  if (!temporal || JSON.stringify(Object.keys(temporal).sort()) !== JSON.stringify(['mode', 'requestedAt', 'timezone', 'validFrom', 'validThrough'].sort()) || !TEMPORAL_MODES.includes(temporal.mode) || !temporal.requestedAt) errors.push('temporal_scope_invalid');
  if (value.routeScope != null) {
    const route = value.routeScope;
    if (!route || JSON.stringify(Object.keys(route).sort()) !== JSON.stringify([
      'departureTimeBucket', 'destination', 'origin', 'travelMode',
    ].sort())) errors.push('route_scope_invalid');
    else {
      for (const [name, point] of [['origin', route.origin], ['destination', route.destination]]) {
        if (!point || JSON.stringify(Object.keys(point).sort()) !== JSON.stringify([
          'displayName', 'entityId', 'latitude', 'longitude',
        ].sort())) errors.push(`route_${name}_invalid`);
        else {
          if (!/^[a-z0-9]+:[a-z0-9_]+:[a-z0-9_-]+$/.test(point.entityId)) errors.push(`route_${name}_id_invalid`);
          if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) errors.push(`route_${name}_latitude_invalid`);
          if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) errors.push(`route_${name}_longitude_invalid`);
        }
      }
      if (!ROUTE_MODES.includes(route.travelMode)) errors.push('route_travel_mode_invalid');
      if (!route.departureTimeBucket || Number.isNaN(new Date(route.departureTimeBucket).getTime())) errors.push('route_departure_bucket_invalid');
    }
  }
  const safetySignal = value.reasonCodes?.some((code) => code === 'safety_critical_signal' || code === 'explicit_open_now_question');
  if (safetySignal && (value.freshnessClass !== 'live' || value.maxStaleSeconds !== 0 || value.criticality !== 'hard')) errors.push('safety_freshness_downgrade');
  if (!value.turnId || !String(value.requirementId || '').startsWith(`req:${value.turnId}:`)) errors.push('requirement_identity_invalid');
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

module.exports = {
  ABSENCE_SEMANTICS,
  AUTHORITY_CLASSES,
  CRITICALITIES,
  EVIDENCE_TYPES,
  FRESHNESS_CLASSES,
  PLANNER_VERSION,
  ROUTE_MODES,
  SCHEMA_VERSION,
  TEMPORAL_MODES,
  TOPICS,
  buildEvidenceRequirement,
  validateEvidenceRequirement,
};
