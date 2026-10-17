'use strict';

const { buildEvidenceRequirement } = require('../utils/evidenceRequirement');
const {
  resolveRuntimeActivityPreference,
  resolveRuntimeHasOlderTravelers,
  resolveRuntimeMobility,
} = require('../utils/canonicalRuntimeProjection');
const { isAvoidExposureActive } = require('../utils/planningInputContract');
const { resolveTravelerVehicle } = require('../utils/vehicleDimensionContract');
const { resolveDrivingMinimization } = require('../utils/constraintFamilies');
const { drivingRouteScopesFromTripScope } = require('../utils/roadTripContract');
const { CHOICE_RELATIONSHIPS } = require('../utils/destinationRelationship');
const { resolveOriginFromMessage } = require('../utils/genericDestinationResolver');
const {
  isAccessParkingDecision,
  isPriorityContingencyAdvice,
} = require('../utils/priorityContingencyAdvice');
const { detectRequestedExperienceDimensions } = require('../utils/requestedExperienceCoverage');

const TOPIC_POLICY = Object.freeze({
  destination_identity: { evidenceTypes: ['fact', 'relationship'], freshnessClass: 'stable', maxAgeSeconds: 90 * 86400, maxStaleSeconds: 365 * 86400, authority: 'official_owner', providers: ['nps'], fallbacks: ['direct_official_page'] },
  overview: { evidenceTypes: ['description'], freshnessClass: 'stable', maxAgeSeconds: 30 * 86400, maxStaleSeconds: 90 * 86400, authority: 'official_owner', providers: ['nps'], fallbacks: ['direct_official_page', 'brave'] },
  activities: { evidenceTypes: ['fact', 'description', 'relationship'], freshnessClass: 'stable', maxAgeSeconds: 30 * 86400, maxStaleSeconds: 90 * 86400, authority: 'official_owner', providers: ['nps'], fallbacks: ['direct_official_page', 'brave'] },
  fees: { evidenceTypes: ['fact', 'rule'], freshnessClass: 'daily', maxAgeSeconds: 12 * 3600, maxStaleSeconds: 48 * 3600, authority: 'official_owner', providers: ['nps'], fallbacks: ['direct_official_page'] },
  hours: { evidenceTypes: ['fact', 'rule'], freshnessClass: 'daily', maxAgeSeconds: 12 * 3600, maxStaleSeconds: 48 * 3600, authority: 'official_owner', providers: ['nps'], fallbacks: ['direct_official_page'] },
  alerts_closures: { evidenceTypes: ['live_state', 'rule'], freshnessClass: 'live', maxAgeSeconds: 15 * 60, maxStaleSeconds: 30 * 60, authority: 'official_owner', providers: ['nps'], fallbacks: ['direct_official_page', 'brave'] },
  roads: { evidenceTypes: ['live_state', 'rule'], freshnessClass: 'live', maxAgeSeconds: 15 * 60, maxStaleSeconds: 30 * 60, authority: 'official_owner', providers: ['nps'], fallbacks: ['direct_official_page', 'brave'] },
  trail_conditions: { evidenceTypes: ['live_state', 'rule'], freshnessClass: 'live', maxAgeSeconds: 15 * 60, maxStaleSeconds: 30 * 60, authority: 'official_owner', providers: ['nps'], fallbacks: ['direct_official_page', 'brave'] },
  weather_current: { evidenceTypes: ['live_state'], freshnessClass: 'live', maxAgeSeconds: 10 * 60, maxStaleSeconds: 20 * 60, authority: 'official_structured', providers: ['weather'], fallbacks: [] },
  weather_forecast: { evidenceTypes: ['fact'], freshnessClass: 'hourly', maxAgeSeconds: 30 * 60, maxStaleSeconds: 2 * 3600, authority: 'official_structured', providers: ['weather'], fallbacks: [] },
  climate_normals: { evidenceTypes: ['fact'], freshnessClass: 'stable', maxAgeSeconds: 30 * 86400, maxStaleSeconds: 365 * 86400, authority: 'trusted_specialist', providers: ['weather'], fallbacks: [] },
  permits_reservations: { evidenceTypes: ['rule', 'fact'], freshnessClass: 'hourly', maxAgeSeconds: 3600, maxStaleSeconds: 6 * 3600, authority: 'official_operator', providers: ['nps', 'ridb'], fallbacks: ['direct_official_page'] },
  campgrounds: { evidenceTypes: ['fact', 'rule'], freshnessClass: 'daily', maxAgeSeconds: 86400, maxStaleSeconds: 7 * 86400, authority: 'official_structured', providers: ['ridb', 'nps'], fallbacks: ['direct_official_page'] },
  // NPS exposes an events endpoint, but no per-park events evidence operation is
  // implemented, so `nps` cannot serve this topic. Declared as what actually serves it.
  events: { evidenceTypes: ['fact'], freshnessClass: 'hourly', maxAgeSeconds: 3600, maxStaleSeconds: 6 * 3600, authority: 'official_owner', providers: ['brave'], fallbacks: ['direct_official_page'] },
  // No NPS transit endpoint exists; shuttle/transit information lives on park pages.
  transit: { evidenceTypes: ['fact', 'live_state'], freshnessClass: 'hourly', maxAgeSeconds: 3600, maxStaleSeconds: 6 * 3600, authority: 'official_operator', providers: ['brave'], fallbacks: ['direct_official_page'] },
  parking: { evidenceTypes: ['fact', 'rule'], freshnessClass: 'daily', maxAgeSeconds: 86400, maxStaleSeconds: 7 * 86400, authority: 'official_owner', providers: ['nps'], fallbacks: ['direct_official_page', 'brave'] },
  // P0-5 — official vehicle size/dimension rules (e.g. Going-to-the-Sun Road's
  // 21-ft length limit). Stable park policy, structured NPS prose first, then
  // the bounded official-page chain. Planned ONLY on the traveler's own demand
  // signal — a stated dimensional vehicle — never universally.
  vehicle_restrictions: { evidenceTypes: ['rule', 'fact'], freshnessClass: 'stable', maxAgeSeconds: 30 * 86400, maxStaleSeconds: 90 * 86400, authority: 'official_owner', providers: ['nps'], fallbacks: ['direct_official_page', 'brave'] },
  driving_time: { evidenceTypes: ['fact'], freshnessClass: 'hourly', maxAgeSeconds: 30 * 60, maxStaleSeconds: 6 * 3600, authority: 'commercial_structured', providers: ['google_maps'], fallbacks: [] },
  lodging_strategy: { evidenceTypes: ['relationship', 'recommendation_signal'], freshnessClass: 'daily', maxAgeSeconds: 86400, maxStaleSeconds: 7 * 86400, authority: 'official_owner', providers: ['serper'], fallbacks: ['direct_official_page'] },
  visitor_services: { evidenceTypes: ['fact', 'description'], freshnessClass: 'stable', maxAgeSeconds: 30 * 86400, maxStaleSeconds: 90 * 86400, authority: 'official_owner', providers: ['nps'], fallbacks: ['direct_official_page'] },
  accessibility: { evidenceTypes: ['fact', 'rule'], freshnessClass: 'stable', maxAgeSeconds: 30 * 86400, maxStaleSeconds: 90 * 86400, authority: 'official_owner', providers: ['nps'], fallbacks: ['direct_official_page', 'tavily'] },
  hotel_live: { evidenceTypes: ['live_state'], freshnessClass: 'request_time', maxAgeSeconds: 300, maxStaleSeconds: 0, authority: 'commercial_structured', providers: [], fallbacks: [], unsupported: true },
  // NO PROVIDER EXISTS. `google_maps` only routes; nothing implements airport
  // discovery and there is no web query template for this topic, so declaring
  // `google_maps` meant every airport turn planned a requirement that could only
  // ever resolve `unsupported` — degrading reported coverage forever. This uses
  // the same `unsupported: true` declaration the other unbuilt capabilities use;
  // the airport recommendation itself is model-authored from the park profile.
  flight_strategy: { evidenceTypes: ['relationship', 'recommendation_signal'], freshnessClass: 'daily', maxAgeSeconds: 86400, maxStaleSeconds: 7 * 86400, authority: 'commercial_structured', providers: [], fallbacks: [], unsupported: true },
  flight_live: { evidenceTypes: ['live_state'], freshnessClass: 'request_time', maxAgeSeconds: 300, maxStaleSeconds: 0, authority: 'commercial_structured', providers: [], fallbacks: [], unsupported: true },
  local_business: { evidenceTypes: ['fact', 'recommendation_signal'], freshnessClass: 'daily', maxAgeSeconds: 86400, maxStaleSeconds: 7 * 86400, authority: 'commercial_structured', providers: ['serper'], fallbacks: ['direct_official_page'] },
  wildfire_smoke: { evidenceTypes: ['live_state'], freshnessClass: 'live', maxAgeSeconds: 5 * 60, maxStaleSeconds: 0, authority: 'official_owner', providers: ['nps'], fallbacks: ['brave'] },
  astronomy: { evidenceTypes: ['fact'], freshnessClass: 'daily', maxAgeSeconds: 86400, maxStaleSeconds: 7 * 86400, authority: 'trusted_specialist', providers: ['astronomy_compute'], fallbacks: [] },
  fee_free_dates: { evidenceTypes: ['fact', 'rule'], freshnessClass: 'stable', maxAgeSeconds: 30 * 86400, maxStaleSeconds: 365 * 86400, authority: 'official_owner', providers: ['fee_free_calendar'], fallbacks: ['direct_official_page'] },
});

const MONTH_OR_SEASON = /\b(january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|fall|autumn|winter|next year)\b/i;
const CURRENT_SIGNAL = /\b(now|right now|currently|today|tonight|open|closed|active alert)\b/i;
const FORECAST_HORIZON_MS = 5 * 24 * 60 * 60 * 1000;
const SUNSET_SIGNAL = /\b(sunset|sunrise|golden hour|stargaz|night sky|astronomy)\b/i;
/**
 * DEMAND SIGNALS FOR PRE-GENERATION ENRICHMENT.
 *
 * Measured on the 2026-08-27 THRO benchmark: `transit` and `events` were planned
 * on EVERY itinerary turn, had no structured provider, and therefore forced both
 * sequential web waves — 3,378 ms, 75% of the evidence wall. For that turn they
 * bought nothing: `events` never met its own authority floor, and the `transit`
 * official-page follow returned the park's ACCESSIBILITY page, because Theodore
 * Roosevelt has no shuttle system.
 *
 * Neither is universally required for itinerary feasibility, so neither is
 * planned universally. The capability is unchanged — only the demand for it.
 */
const TRANSIT_SIGNAL = /\b(shuttle|transit|bus|buses|public transport(?:ation)?|without a car|no car|car[- ]free)\b/i;
const EVENTS_SIGNAL = /\b(events?|ranger[- ]?(?:program|talk|walk|led)|programs?|guided tours?|tours?|festival|star part(?:y|ies)|demonstrations?)\b/i;
const HIKE_SIGNAL = /\b(easy hikes?|easy(?:[- ]to[- ]moderate)? (?:hike|walk|trail)|hikes?|hiking|walks?|trails?)\b/i;
const VIEWPOINT_SIGNAL = /\b(scenic views?|viewpoints?|overlooks?|vistas?|photography)\b/i;
const BACKUP_SIGNAL =
  /\b(backup|fall[- ]?back|if .{0,60}(?:doesn'?t|does not|won'?t|cannot|can'?t|fails?|doesn'?t work)|alternative plan|plan b|what if)\b/i;

function selectWeatherTopic({ prompt, dates, now }) {
  if (/\b(weather|temperature|rain|snow|conditions?)\b/i.test(prompt) && CURRENT_SIGNAL.test(prompt)) {
    return 'weather_current';
  }
  const start = dates?.validFrom || dates?.start;
  const startDate = start ? new Date(start) : null;
  if (dates?.mode === 'season'
    || (startDate && !Number.isNaN(startDate.getTime()) && startDate.getTime() > new Date(now).getTime() + FORECAST_HORIZON_MS)
    || (!startDate && MONTH_OR_SEASON.test(prompt))) {
    return 'climate_normals';
  }
  return 'weather_forecast';
}

function normalizedEntity(entity = {}) {
  let entityId = entity.entityId || entity.canonicalId || null;
  if (/^park:nps:/i.test(entityId || '')) entityId = `nps:park:${String(entityId).split(':').pop()}`;
  return {
    entityId: entityId ? String(entityId).toLowerCase() : null,
    entityType: entity.entityType || (entityId ? 'national_park' : 'unresolved_destination'),
    displayName: entity.displayName || entity.name || '',
    parentEntityId: entity.parentEntityId || null,
    latitude: entity.latitude ?? entity.lat ?? null,
    longitude: entity.longitude ?? entity.lon ?? null,
    resolutionConfidence: Number(entity.resolutionConfidence ?? entity.confidence ?? (entityId ? 1 : 0)),
  };
}

function temporalScope({ topic, dates, now, timezone, prompt }) {
  let mode = dates?.mode || null;
  if (!mode) {
    if (['hotel_live', 'flight_live'].includes(topic)) mode = 'instant';
    else if (CURRENT_SIGNAL.test(prompt) || ['alerts_closures', 'roads', 'trail_conditions', 'weather_current', 'wildfire_smoke'].includes(topic)) mode = 'current';
    else if (MONTH_OR_SEASON.test(prompt)) mode = 'season';
    else mode = 'timeless';
  }
  return {
    mode,
    requestedAt: now,
    validFrom: dates?.validFrom || dates?.start || null,
    validThrough: dates?.validThrough || dates?.end || null,
    timezone: timezone || 'UTC',
  };
}

function planEvidenceRequirements({
  turnId,
  userPrompt = '',
  intent,
  resolvedEntities = [],
  dates = null,
  priorTripState = null,
  constraints = null,
  tripScope = null,
  now = new Date(),
  timezone = 'UTC',
} = {}) {
  if (!intent?.primaryIntent || !turnId) throw new TypeError('Evidence planning requires turnId and IntentClassification');
  if (['meta_help', 'unsupported_non_travel'].includes(intent.primaryIntent)) return [];
  const prompt = String(userPrompt || '');
  const requestedExperience = detectRequestedExperienceDimensions({ userPrompt: prompt, constraints });
  const wantsDimension = (id) => requestedExperience.includes(id);
  const scope = tripScope || constraints?.tripScope || priorTripState?.tripScope || null;
  const interestSet = new Set(
    Array.isArray(constraints?.interests)
      ? constraints.interests.map((i) => String(i).toLowerCase())
      : []
  );
  const wantsInterest = (...ids) => ids.some((id) => interestSet.has(id));
  // A declared car-free trip is the same demand signal as saying "no car".
  const transportation = constraints?.transportation || priorTripState?.transportation || null;
  const travelerHasNoCar = transportation?.hasCar === false
    || /^(no_car|none|transit|public)$/i.test(String(transportation?.mode || ''));
  const hasNumericBudget =
    constraints?.budgetConstraint?.kind === 'numeric' ||
    (constraints?.budget != null && /^\d+(\.\d+)?$/.test(String(constraints.budget).trim()));
  // P0-5 — canonical vehicle state first, the current turn's own words second.
  const travelerVehicle = resolveTravelerVehicle({ constraints, userPrompt: prompt });
  const intentEntities = (intent.entities || []).filter((entity) => entity.type === 'destination');
  const entities = (resolvedEntities.length ? resolvedEntities : intentEntities).map(normalizedEntity);
  if (entities.length === 0) entities.push(normalizedEntity());
  const requirements = [];
  const seen = new Set();

  const add = (topic, criticality, reasonCodes, entity = entities[0], overrides = {}) => {
    const routeOriginId = overrides.routeScope?.origin?.entityId;
    const key = topic === 'driving_time' && routeOriginId
      ? `${routeOriginId}->${entity.entityId || 'unresolved'}:driving_time`
      : `${entity.entityId || 'unresolved'}:${topic}`;
    if (seen.has(key)) {
      const existingIndex = requirements.findIndex((item) => {
        const originId = item.routeScope?.origin?.entityId;
        const itemKey = item.topic === 'driving_time' && originId
          ? `${originId}->${item.entity?.entityId || 'unresolved'}:driving_time`
          : `${item.entity?.entityId || 'unresolved'}:${item.topic}`;
        return itemKey === key;
      });
      if (existingIndex >= 0) {
        const existing = requirements[existingIndex];
        const rank = (value) => (value === 'hard' ? 3 : value === 'required' ? 2 : 1);
        const nextCriticality = rank(criticality) > rank(existing.criticality)
          ? criticality
          : existing.criticality;
        requirements[existingIndex] = {
          ...existing,
          criticality: nextCriticality,
          reasonCodes: [...new Set([...(existing.reasonCodes || []), ...(reasonCodes || [])])],
        };
      }
      return;
    }
    seen.add(key);
    const policy = TOPIC_POLICY[topic];
    if (!policy) throw new Error(`Unknown planner topic: ${topic}`);
    if (policy.unsupported) return;
    // PLANNER↔PROVIDER INVARIANT. A topic with no declared provider cannot be
    // acquired by anything, so planning it buys a cache lookup and a permanent
    // `unsupported` resolution that degrades reported coverage. `unsupported:
    // true` above is the primary declaration; this is the structural guard that
    // makes an empty provider list impossible to plan by accident. Overrides may
    // still supply providers (known-place entities do exactly that).
    const declaredProviders = overrides.preferredProviders || policy.providers || [];
    if (declaredProviders.length === 0) return;
    const requirement = buildEvidenceRequirement({
      turnId,
      ordinal: requirements.length,
      entity,
      topic,
      evidenceTypes: overrides.evidenceTypes || policy.evidenceTypes,
      temporalScope: temporalScope({ topic, dates, now, timezone, prompt }),
      freshnessClass: overrides.freshnessClass || policy.freshnessClass,
      maxAgeSeconds: overrides.maxAgeSeconds ?? policy.maxAgeSeconds,
      maxStaleSeconds: overrides.maxStaleSeconds ?? policy.maxStaleSeconds,
      criticality,
      absenceSemantics: overrides.absenceSemantics || 'unknown',
      minimumAuthorityClass: overrides.minimumAuthorityClass || policy.authority,
      acceptedSourceClasses: overrides.acceptedSourceClasses || [policy.authority],
      preferredProviders: overrides.preferredProviders || policy.providers,
      allowedFallbackProviders: overrides.allowedFallbackProviders || policy.fallbacks,
      privacyScope: 'public',
      renderBudgetTokens: criticality === 'optional' ? 100 : 180,
      reasonCodes,
      ...(overrides.routeScope ? { routeScope: overrides.routeScope } : {}),
    });
    requirements.push(requirement);
  };

  const isKnownPlaceEntity = (entity) => String(entity?.entityId || '').startsWith('place:');
  const knownPlaceProviderOverrides = {
    minimumAuthorityClass: 'trusted_specialist',
    acceptedSourceClasses: ['trusted_specialist', 'official_owner'],
    preferredProviders: ['known_place'],
    allowedFallbackProviders: ['direct_official_page', 'tavily', 'brave'],
  };
  const job = intent.travelerJob;
  const GEO_IDENTITY_TYPES = new Set([
    'state', 'region', 'park_group', 'route_area', 'gateway_city', 'unresolved_destination',
  ]);
  const identityCriticality = (entity, requested = 'hard') => {
    const type = String(entity?.entityType || '');
    const operationalHard = job === 'permits_reservations'
      || job === 'current_conditions'
      || intent.primaryIntent === 'permit_camping'
      || intent.primaryIntent === 'live_in_trip_assistance';
    if (operationalHard) return requested || 'hard';
    // A destination the traveler is still CHOOSING between is a candidate, not
    // a committed destination. Making each candidate's identity a hard (turn
    // blocking) requirement means one unresolved candidate stonewalls the whole
    // comparison before the model is called — the same failure this planner
    // already fixed for driving requirements. Degrade to `required` so the turn
    // answers with what is known and says what it could not verify.
    if (isDestinationChoice && entities.length > 1 && requested === 'hard') {
      return 'required';
    }
    if (!entity?.entityId || GEO_IDENTITY_TYPES.has(type)) {
      return requested === 'hard' ? 'required' : requested;
    }
    return requested;
  };
  const identity = (entity, criticality = 'hard') => {
    add(
      'destination_identity',
      identityCriticality(entity, criticality),
      ['destination_resolution'],
      entity,
      isKnownPlaceEntity(entity)
        ? { ...knownPlaceProviderOverrides, allowedFallbackProviders: [] }
        : {}
    );
  };
  const addActivities = (entity, criticality, reasonCodes) => {
    add(
      'activities',
      criticality,
      reasonCodes,
      entity,
      isKnownPlaceEntity(entity) ? knownPlaceProviderOverrides : {}
    );
  };
  const eachEntity = (callback) => entities.forEach(callback);
  const weatherTopic = selectWeatherTopic({ prompt, dates, now });
  const routeDepartureBucket = () => {
    const value = dates?.validFrom || dates?.start || now;
    const bucket = new Date(value);
    if (Number.isNaN(bucket.getTime())) return null;
    bucket.setUTCMinutes(0, 0, 0);
    // Google Distance Matrix rejects departure_time in the past. Flooring "now"
    // to the current hour is already past once we are past :00, so advance to the
    // next UTC hour whenever the bucket is strictly before the planner clock.
    const nowMs = new Date(now).getTime();
    if (bucket.getTime() < nowMs) bucket.setUTCHours(bucket.getUTCHours() + 1);
    return bucket.toISOString();
  };
  // WP-TU — a turn that asks the traveler to CHOOSE between destinations never
  // implies driving between them. Deriving a leg from destination adjacency
  // alone produced hard driving requirements for routes nobody intended, which
  // blocked the answer entirely.
  const relationship = scope?.destinationRelationship
    || (scope?.type === 'road_trip' ? 'route' : null);
  const isDestinationChoice = CHOICE_RELATIONSHIPS.includes(relationship);
  // Hardness must carry the confidence of the inference that created it.
  const weaklyInferredTask = Number.isFinite(intent?.understandingConfidence)
    && intent.understandingConfidence < 0.7;

  /**
   * A route the TRAVELER supplied: an origin named in the message (or carried on
   * the trip scope) plus a resolved destination. This is the only way an
   * origin→destination `driving_time` can be serviceable, because
   * `google_maps.supports()` requires a real `routeScope`.
   */
  const originRouteScopeFor = (entity) => {
    const origin = (scope?.origin && scope.origin.latitude != null && scope.origin.longitude != null)
      ? scope.origin
      : resolveOriginFromMessage(prompt);
    const originEntity = origin ? normalizedEntity(origin) : null;
    if (!originEntity?.entityId
      || originEntity.latitude == null || originEntity.longitude == null
      || !entity?.entityId || entity.latitude == null || entity.longitude == null
      || originEntity.entityId === entity.entityId) return null;
    return {
      origin: originEntity,
      destination: entity,
      travelMode: 'driving',
      departureTimeBucket: routeDepartureBucket(),
    };
  };

  /**
   * Plan `driving_time` ONLY when a route scope exists. Without one the
   * requirement is unserviceable by construction — Maps cannot route a journey
   * nobody described — and planning it anyway costs a cache lookup per turn and
   * permanently degrades reported coverage.
   */
  const addScopedDrivingTime = (entity, criticality, reasonCodes) => {
    const routeScope = originRouteScopeFor(entity);
    if (!routeScope) return;
    add('driving_time', criticality, reasonCodes, entity, { routeScope });
  };

  const routeScopeFor = (entity, index) => {
    if (index < 1) return null;
    if (isDestinationChoice) return null;
    const origin = entities[index - 1];
    if (!origin?.entityId || !entity?.entityId
      || origin.latitude == null || origin.longitude == null
      || entity.latitude == null || entity.longitude == null) return null;
    return { origin, destination: entity, travelMode: 'driving', departureTimeBucket: routeDepartureBucket() };
  };
  const itineraryFor = (entity, full = false, index = 0) => {
    const seasonalAccessPolicy = weatherTopic === 'climate_normals'
      ? { evidenceTypes: ['rule'], freshnessClass: 'daily', maxAgeSeconds: 12 * 3600, maxStaleSeconds: 7 * 86400 }
      : {};
    identity(entity);
    const activityReasons = ['itinerary_activity_support'];
    if (HIKE_SIGNAL.test(prompt) || wantsInterest('hiking') || wantsDimension('hiking')) {
      activityReasons.push('requested_named_hike_or_walk');
    }
    if (VIEWPOINT_SIGNAL.test(prompt) || wantsInterest('scenic-drives', 'photography') || wantsDimension('viewpoint')) {
      activityReasons.push('requested_viewpoint_or_scenic');
    }
    if (SUNSET_SIGNAL.test(prompt) || wantsInterest('stargazing')) {
      activityReasons.push('requested_sunset_place_candidate');
    }
    if (wantsInterest('wildlife') || wantsDimension('wildlife')) activityReasons.push('requested_wildlife_candidates');
    if (wantsDimension('geothermal')) activityReasons.push('requested_geothermal_candidates');
    if (wantsDimension('scenic_drive')) activityReasons.push('requested_scenic_drive_candidates');
    if (wantsDimension('waterfall')) activityReasons.push('requested_waterfall_candidates');
    if (wantsDimension('beach')) activityReasons.push('requested_beach_candidates');
    if (wantsInterest('history') || wantsDimension('historic')) activityReasons.push('requested_history_culture_candidates');
    if (BACKUP_SIGNAL.test(prompt)) activityReasons.push('contingency_alternate_activities');
    if (isAvoidExposureActive(constraints, prompt)) activityReasons.push('requested_low_exposure_candidates');
    addActivities(entity, 'required', activityReasons);
    add('alerts_closures', 'required', [weatherTopic === 'climate_normals' ? 'seasonal_operations_rule' : 'itinerary_operational_support'], entity, seasonalAccessPolicy);
    add('roads', 'required', [weatherTopic === 'climate_normals' ? 'seasonal_access_rule' : 'itinerary_access_support'], entity, seasonalAccessPolicy);
    add(weatherTopic, 'required', [weatherTopic === 'climate_normals' ? 'future_trip_climate_mode' : 'near_term_forecast_mode'], entity);
    add('permits_reservations', 'required', ['itinerary_permit_dependency'], entity);
    add('fees', 'required', hasNumericBudget ? ['itinerary_entry_cost', 'budget_cost_evidence'] : ['itinerary_entry_cost'], entity);
    add('hours', 'required', ['itinerary_operating_hours'], entity);
    add('visitor_services', 'required', ['itinerary_facility_candidates'], entity);
    // Transit blocks generation only when the traveler's own request or trip
    // state makes ground transport decision-critical. A self-drive plan does
    // not wait on shuttle evidence that may not exist.
    if (TRANSIT_SIGNAL.test(prompt) || travelerHasNoCar) {
      add('transit', 'required', ['itinerary_parking_transit'], entity);
    }
    // P0-5 — the demand signal is the traveler's own vehicle, not the park.
    // A stated RV/trailer/motorhome (with or without a length — an unstated
    // length still needs the official limit surfaced) requires the official
    // dimension rules; an ordinary car plans nothing here.
    if (travelerVehicle) {
      add('vehicle_restrictions', 'required', ['traveler_vehicle_dimension'], entity);
    }
    const numericDriveCap = Number(
      constraints?.maxDailyDriveMinutes
      ?? constraints?.tripScope?.maxDailyDriveMinutes
      ?? constraints?.planningState?.preferences?.maxDailyDriveMinutes
      ?? resolveDrivingMinimization(prompt).maxDailyDriveMinutes
    );
    const hasNumericDriveCap = Number.isFinite(numericDriveCap) && numericDriveCap > 0;
    // Hard driving_time is only legal when a real inter-destination routeScope
    // exists AND the traveler supplied an explicit numeric drive cap, or when
    // the asked action is a duration/route-time question. Ordinary multi-park
    // planning must not fail closed solely because Distance Matrix is down.
    const routeScope = routeScopeFor(entity, index);
    const originDrive = originRouteScopeFor(entity);
    // ROUTES DO NOT EXIST YET.
    //
    // Before generation there are no stops, so there is no stop-to-stop route to
    // ask Maps about. An unscoped `driving_time` was planned anyway: it is
    // cache-looked-up and coverage-evaluated on every turn, `google_maps.supports()`
    // is false without a `routeScope`, and the topic declares no fallback
    // provider — so it could never be satisfied and permanently reported
    // `coverage: 'partial'` on ordinary plan creation.
    //
    // `routeEvidenceDriveBridge` already computes real legs AFTER generation,
    // from the canonical stops, and Maps minutes remain authoritative there.
    // A requirement is planned here only when a REAL route scope exists:
    // an inter-destination leg, or an origin the traveler actually supplied.
    if (routeScope) {
      // Explicit numeric cap → hard (must verify minutes). Ordinary multi-park
      // logistics stay required so a Maps outage cannot kill the itinerary.
      const hardLegal = hasNumericDriveCap && !isDestinationChoice;
      add('driving_time', hardLegal ? 'hard' : 'required', [hardLegal ? 'inter_destination_logistics' : 'route_support'], entity, {
        routeScope,
      });
    } else if (originDrive) {
      add('driving_time', 'required', ['origin_drive_logistics'], entity, { routeScope: originDrive });
    }
    // Ranger programming enriches a plan; it does not decide one. It has no
    // consumer beyond the prompt, and the product has no "events" interest id,
    // so explicit wording is the only honest trigger.
    if (EVENTS_SIGNAL.test(prompt)) {
      add('events', 'optional', ['itinerary_optional_events'], entity);
    }
    // Sunset/sunrise asks need astronomy timing AND place/viewpoint candidates.
    if (SUNSET_SIGNAL.test(prompt) || wantsInterest('stargazing')) {
      add('astronomy', 'required', ['requested_astronomy_or_sunset'], entity);
    } else {
      add('astronomy', 'optional', ['itinerary_optional_astronomy'], entity);
    }
    add('fee_free_dates', 'optional', ['itinerary_optional_fee_free'], entity);
    if (full || wantsInterest('camping') || /\bcamp/i.test(prompt)) {
      if (wantsInterest('camping') || /\bcamp/i.test(prompt)) {
        add('campgrounds', 'required', ['campground_listing_support'], entity);
      }
    }
    if (full) {
      add('lodging_strategy', 'required', ['overnight_geography'], entity);
      add('local_business', 'optional', ['lodging_food_enrichment'], entity);
    }
    // Pass #4 — numeric budget asks for available cost evidence (fees/permits/camping).
    // Do NOT invent hotel_live inventory; lodging price may remain UNKNOWN.
    if (hasNumericBudget) {
      add('fees', 'required', ['budget_cost_evidence'], entity);
      add('permits_reservations', 'required', ['budget_permit_cost_evidence'], entity);
      if (wantsInterest('camping') || /\bcamp/i.test(prompt) || /camp/i.test(String(constraints?.accommodation || ''))) {
        add('campgrounds', 'required', ['budget_camping_cost_evidence'], entity);
      }
      if (/hotel|lodge|cabin|motel|airbnb|lodging/i.test(String(constraints?.accommodation || '')) || /\bhotel|lodg/i.test(prompt)) {
        add('lodging_strategy', 'required', ['budget_lodging_strategy_no_invented_prices'], entity);
      }
    }
  };

  switch (intent.primaryIntent) {
    case 'general_qa':
      identity(entities[0]);
      if (isAccessParkingDecision(prompt) || isPriorityContingencyAdvice(prompt) || job === 'access_contingency') {
        break;
      }
      if (/\bfee|cost|entrance\b/i.test(prompt)) add('fees', 'required', ['requested_fee_topic']);
      else if (/\bweather\b/i.test(prompt)) {
        if (weatherTopic === 'weather_current') {
          add(weatherTopic, 'hard', ['requested_weather_topic', 'explicit_current_weather_request'], entities[0], {
            maxStaleSeconds: 0,
          });
        } else add(weatherTopic, 'required', ['requested_weather_topic']);
      }
      else {
        add('overview', 'required', ['requested_overview_topic']);
        if (MONTH_OR_SEASON.test(prompt)) add('climate_normals', 'required', ['seasonal_suitability_question']);
      }
      // An explicit ask for closures/alerts/road status must fetch operational
      // evidence even when the top-level intent is general_qa — otherwise the
      // answer under-covers exactly what the traveler asked about.
      if (/\b(closures?|alerts?|road status|trail conditions?|is\b.{0,30}\b(?:open|closed))\b/i.test(prompt)) {
        add('alerts_closures', 'required', ['requested_operational_status'], entities[0]);
        if (/\broad|route|drive|access\b/i.test(prompt)) add('roads', 'required', ['requested_road_status'], entities[0]);
      }
      break;
    case 'destination_discovery':
      eachEntity((entity) => { identity(entity, 'required'); add('overview', 'required', ['destination_candidate_support'], entity); addActivities(entity, 'required', ['destination_candidate_activities']); });
      break;
    case 'place_discovery':
      eachEntity((entity) => { identity(entity); addActivities(entity, 'required', ['requested_activity_discovery']); });
      break;
    case 'compare':
      eachEntity((entity) => {
        identity(entity);
        add('overview', 'required', ['normalized_comparison_topic'], entity);
        const compareReasons = ['normalized_comparison_topic'];
        if (HIKE_SIGNAL.test(prompt)) compareReasons.push('compare_named_hike_parity');
        if (VIEWPOINT_SIGNAL.test(prompt)) compareReasons.push('compare_scenic_parity');
        addActivities(entity, 'required', compareReasons);
      });
      break;
    case 'lodging_strategy':
      identity(entities[0]);
      add('lodging_strategy', 'required', ['gateway_geography'], entities[0]);
      addScopedDrivingTime(entities[0], 'optional', ['lodging_access_support']);
      break;
    case 'hotel_live_search':
      identity(entities[0]);
      add('lodging_strategy', 'required', ['live_inventory_unsupported', 'gateway_geography'], entities[0]);
      break;
    case 'flight_live_search':
      identity(entities[0]);
      add('flight_strategy', 'required', ['live_inventory_unsupported', 'airport_strategy'], entities[0]);
      addScopedDrivingTime(entities[0], 'required', ['airport_ground_access']);
      break;
    case 'flight_strategy':
      identity(entities[0]);
      add('flight_strategy', 'required', ['airport_strategy'], entities[0]);
      addScopedDrivingTime(entities[0], 'required', ['airport_ground_access']);
      break;
    case 'transport':
      identity(entities[0]);
      if (/\bshuttle|transit|bus|without a car\b/i.test(prompt)) {
        add('transit', 'required', ['requested_transport_topic'], entities[0]);
      } else if (/\bpark(?:ing)?\b/i.test(prompt)) {
        add('parking', 'required', ['requested_parking_mechanics'], entities[0]);
        add('roads', 'required', ['requested_parking_mechanics'], entities[0]);
        add('transit', 'required', ['requested_parking_mechanics'], entities[0]);
        add('alerts_closures', 'required', ['requested_parking_mechanics'], entities[0]);
        add('permits_reservations', 'required', ['requested_parking_mechanics'], entities[0]);
      } else {
        const durationAsk = /\bhow (?:long|far)\b|\bdrive time\b/i.test(prompt);
        const driveCriticality = durationAsk ? 'hard' : 'required';
        if (entities.length >= 2) {
          const routeScope = routeScopeFor(entities[1], 1);
          if (routeScope) {
            add('driving_time', driveCriticality, ['requested_transport_topic'], entities[1], { routeScope });
          } else {
            addScopedDrivingTime(entities[0], driveCriticality, ['requested_transport_topic']);
          }
        } else {
          addScopedDrivingTime(entities[0], driveCriticality, ['requested_transport_topic']);
        }
      }
      break;
    case 'local_business_food':
      identity(entities[0]); add('local_business', 'required', [CURRENT_SIGNAL.test(prompt) ? 'current_local_business_request' : 'local_business_discovery'], entities[0], CURRENT_SIGNAL.test(prompt) ? { freshnessClass: 'request_time', maxAgeSeconds: 300, maxStaleSeconds: 0 } : {});
      break;
    case 'activities_tours_events':
      identity(entities[0]); addActivities(entities[0], 'required', ['requested_activity_topic']);
      if (/\bevent|happening|ranger program|this weekend|today\b/i.test(prompt)) add('events', 'required', ['date_bound_event_request'], entities[0]);
      add('weather_forecast', 'optional', ['activity_weather_support'], entities[0]);
      add('permits_reservations', 'optional', ['activity_permit_support'], entities[0]);
      break;
    case 'permit_camping':
      identity(entities[0]); add('permits_reservations', 'hard', ['explicit_permit_question'], entities[0]);
      if (/\bcamp/i.test(prompt)) add('campgrounds', 'required', ['campground_listing_support'], entities[0]);
      break;
    case 'simple_itinerary':
      eachEntity((entity, index) => itineraryFor(entity, false, index));
      break;
    case 'full_trip':
    case 'deep_research':
      eachEntity((entity, index) => itineraryFor(entity, true, index));
      break;
    case 'live_in_trip_assistance': {
      const entity = entities[0]; identity(entity);
      const safety = intent.freshness === 'safety_critical';
      // ABSENCE IS AN ANSWER. A COMPLETE official alert feed that contains no
      // fire notice proves there is no official fire notice, and that is the
      // honest reply to "is there smoke". Without this, a hard requirement goes
      // unmet whenever nothing is wrong, and the turn returns
      // `evidence_incomplete` — no answer at all — precisely when the park is fine.
      const provesAbsent = { absenceSemantics: 'proves_absent' };
      const liveReason = safety ? 'safety_critical_signal' : 'explicit_open_now_question';

      // LIVE-STATE TOPICS COMPOSE.
      //
      // This used to be an if/else-if chain with the wildfire test first, so
      // "is the trail open AND is there smoke" planned only the smoke half and
      // dropped the trail question entirely. Those are two independent
      // live-state concerns and a traveler may reasonably ask both at once.
      //
      // Every applicable topic is planned. None suppresses another, none is
      // downgraded, and `alerts_closures` still accompanies any specific ask
      // because a park-wide closure answers the specific question too.
      const liveTopics = [];
      if (/\bwildfire|smoke|air quality|haze\b/i.test(prompt)) liveTopics.push('wildfire_smoke');
      if (/\btrails?\b|\btrailheads?\b/i.test(prompt)) liveTopics.push('trail_conditions');
      if (/\broad|route\b/i.test(prompt)) liveTopics.push('roads');
      if (/\bshuttle|transit|bus\b/i.test(prompt)) liveTopics.push('transit');

      for (const liveTopic of liveTopics) {
        if (liveTopic === 'transit') {
          add('transit', 'hard', [liveReason], entity, {
            freshnessClass: 'live', maxAgeSeconds: 900, maxStaleSeconds: 0,
          });
        } else {
          add(liveTopic, 'hard', [liveReason], entity, { maxStaleSeconds: 0, ...provesAbsent });
        }
      }

      // The park-wide alert feed: the dependency for any specific live topic,
      // and the whole answer when the traveler named none.
      add(
        'alerts_closures',
        'hard',
        [liveTopics.length ? 'operational_alert_dependency' : liveReason],
        entity,
        { maxStaleSeconds: 0, ...provesAbsent }
      );
      break;
    }
    case 'trip_refinement':
      identity(entities[0]);
      if (/\bdrive|road|route\b/i.test(prompt)) {
        addScopedDrivingTime(entities[0], 'required', ['refinement_affected_logistics']);
      }
      if (/\bpermit|camp\b/i.test(prompt)) add('permits_reservations', 'hard', ['refinement_affected_permit'], entities[0]);
      if (/\bweather|rain|snow\b/i.test(prompt)) add(weatherTopic, 'required', ['refinement_affected_weather'], entities[0]);
      if (
        requirements.length === 1
        || /\bhike|easier|relaxed|activity|stop|trail|walk|viewpoint|overlook|sunset|sunrise\b/i.test(prompt)
      ) {
        const refinementReasons = ['refinement_affected_activities'];
        if (SUNSET_SIGNAL.test(prompt)) refinementReasons.push('requested_sunset_place_candidate');
        if (HIKE_SIGNAL.test(prompt)) refinementReasons.push('requested_named_hike_or_walk');
        if (isAvoidExposureActive(constraints, prompt)) refinementReasons.push('requested_low_exposure_candidates');
        addActivities(entities[0], 'required', refinementReasons);
      }
      if (SUNSET_SIGNAL.test(prompt)) {
        add('astronomy', 'required', ['refinement_requested_sunset'], entities[0]);
      }
      if (priorTripState?.requiresRoadAccess === true) add('roads', 'hard', ['active_hard_dependency'], entities[0]);
      break;
    default:
      break;
  }

  if (isAccessParkingDecision(prompt) || isPriorityContingencyAdvice(prompt) || job === 'access_contingency') {
    const entity = entities[0];
    identity(entity);
    add('roads', 'required', ['access_decision_support'], entity);
    add('alerts_closures', 'required', ['access_decision_support'], entity);
    add('transit', 'required', ['access_decision_support'], entity);
    add('parking', 'required', ['access_decision_support'], entity);
    add('permits_reservations', 'required', ['access_decision_support'], entity);
    add(weatherTopic, 'required', ['access_decision_support'], entity);
    addActivities(
      entity,
      'required',
      job === 'access_contingency'
        ? ['access_decision_support', 'contingency_fallback_activities']
        : ['access_decision_support'],
    );
    add('fees', 'required', ['access_execution_support'], entity);
  }

  const entity0 = entities[0];
  if (job === 'trip_duration_advice') {
    identity(entity0);
    add('overview', 'required', ['duration_advice_overview'], entity0);
    if (MONTH_OR_SEASON.test(prompt) || weatherTopic === 'climate_normals') {
      add('climate_normals', 'required', ['duration_advice_season'], entity0);
    }
    addActivities(entity0, 'optional', ['duration_advice_representative_activities']);
  }
  if (job === 'trip_skeleton') {
    eachEntity((entity, index) => {
      identity(entity);
      add('overview', 'required', ['skeleton_destination_identity'], entity);
      add('roads', 'required', ['skeleton_access'], entity);
      add('alerts_closures', 'required', ['skeleton_access'], entity);
      add('permits_reservations', 'required', ['skeleton_permits'], entity);
      add(weatherTopic, 'required', ['skeleton_season'], entity);
      addActivities(entity, 'required', ['skeleton_places']);
      add('lodging_strategy', 'required', ['skeleton_base_strategy'], entity);
      const routeScope = routeScopeFor(entity, index);
      if (routeScope) add('driving_time', 'required', ['skeleton_route'], entity, { routeScope });
    });
  }
  if (job === 'origin_refinement' || job === 'airport_strategy') {
    identity(entity0);
    add('flight_strategy', 'required', ['airport_strategy'], entity0);
    // Ground access from an airport nobody has named yet has no route scope, so
    // Maps cannot serve it. The airport itself is chosen in the answer.
    addScopedDrivingTime(entity0, 'required', ['airport_ground_access']);
  }
  // Canonical projection: `constraints.mobility` is re-extracted from the
  // current message every turn, so reading it alone lost the traveller's stated
  // mobility on every refinement and every restored trip.
  const mobility = resolveRuntimeMobility(constraints);
  const hasMobilityConstraint = Number(mobility.maxWalkMilesPerSegment) > 0
    || mobility.wheelchair === true
    || mobility.stroller === true
    || mobility.avoidStairs === true
    || mobility.requiresFrequentBreaks === true
    || resolveRuntimeHasOlderTravelers(constraints);
  const hikingPref = resolveRuntimeActivityPreference(constraints, 'hiking');
  if (
    hasMobilityConstraint
    || /\b(toddler|kids?|children|family|wheelchair|accessible|accessibility|older parents|late \d0s|limited walking|about a mile)\b/i.test(prompt)
    || (Array.isArray(constraints?.travelers?.accessibilityNeeds) && constraints.travelers.accessibilityNeeds.length)
  ) {
    add('accessibility', 'required', ['family_or_access_suitability', 'mobility_short_experience'], entity0);
    add('visitor_services', 'required', ['family_or_access_suitability', 'mobility_short_experience'], entity0);
    addActivities(entity0, 'required', ['mobility_short_experience', 'requested_low_walking_candidates']);
  }
  if (hikingPref === 'none' || /\b(hate hiking|no hiking|without hiking)\b/i.test(prompt)) {
    add('visitor_services', 'required', ['no_hiking_visitor_experiences'], entity0);
    addActivities(entity0, 'required', ['requested_viewpoint_or_scenic', 'no_hiking_visitor_experiences']);
  }
  if (hikingPref === 'hard' || /\b(strenuous|difficult|hard|challenging)\b.{0,24}\b(hike|trail|hiking)\b|\b(hike|trail|hiking)\b.{0,24}\b(strenuous|difficult|hard|challenging)\b/i.test(prompt)) {
    addActivities(entity0, 'required', ['requested_hard_hike']);
  }
  if (wantsInterest('photography') || resolveRuntimeActivityPreference(constraints, 'photography')) {
    addActivities(entity0, 'required', ['requested_viewpoint_or_scenic']);
  }
  if (wantsInterest('wildlife') || resolveRuntimeActivityPreference(constraints, 'wildlife')) {
    addActivities(entity0, 'required', ['requested_wildlife_candidates']);
  }

  // Pass #3 — emit adjacent driving_time requirements from normalized tripScope
  // route legs (origin→A, A→B, …). Never invent durations; evidence required.
  if (scope && ['multi_destination', 'road_trip'].includes(scope.type)) {
    const routeScopes = drivingRouteScopesFromTripScope(scope);
    for (const routeScope of routeScopes) {
      const destEntity = normalizedEntity(routeScope.destination);
      add(
        'driving_time',
        scope.type === 'road_trip' ? 'hard' : 'required',
        ['inter_destination_logistics', 'trip_scope_route_leg'],
        destEntity,
        {
          routeScope: {
            origin: normalizedEntity(routeScope.origin),
            destination: destEntity,
            travelMode: 'driving',
            departureTimeBucket: routeDepartureBucket(),
            legOrdinal: routeScope.legOrdinal,
            isLoopReturn: !!routeScope.isLoopReturn,
          },
        }
      );
    }
  }

  return requirements;
}

module.exports = {
  TOPIC_POLICY,
  planEvidenceRequirements,
};
