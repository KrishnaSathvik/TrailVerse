'use strict';

/**
 * Planning Readiness Pass #5 — durable normalized planning-state snapshot.
 * Provider-neutral. No evidence / weather / model payloads.
 */

const { deriveTripCeiling, emptyBudgetConstraint } = require('./budgetContract');
const { normalizeInterestList, normalizeTravelParty } = require('./planningInputContract');
const {
  buildRouteLegs,
  parseMaxDailyDriveMinutes,
  buildTripScopeFromMessage,
  detectDrivingFeasibilityConstraint,
} = require('./roadTripContract');
const {
  refineTripScopeAddDestination,
  refineTripScopeRemoveDestination,
  refineTripScopeRouteShape,
} = require('./roadTripValidators');
const { resolveDestinationsFromMessage } = require('./genericDestinationResolver');
const { mapStayPreference } = require('./stayPreferenceMapper');
const { resolveCanonicalStateConsistency } = require('./canonicalStateConsistency');

const PLANNING_STATE_SCHEMA_VERSION = 'trailie-planning-state-v1';
const KNOWN_SCHEMA_VERSIONS = new Set([PLANNING_STATE_SCHEMA_VERSION]);

const ROUTE_SHAPES = new Set(['one_way', 'loop', 'unknown']);
const TRIP_SCOPE_TYPES = new Set(['single_destination', 'comparison_set', 'multi_destination', 'road_trip']);
const TRAVEL_PARTIES = new Set(['solo', 'couple', 'friends', 'family', 'group']);
const PACE_VALUES = new Set(['relaxed', 'moderate', 'packed']);
const HIKING_VALUES = new Set(['none', 'easy', 'easy-to-moderate', 'moderate', 'hard']);
const PHOTOGRAPHY_TIMING = new Set(['sunrise', 'sunset', 'golden_hour']);
const {
  normalizeDrivingPolicyFields,
  reconcileTransportationDrivingPolicy,
} = require('./transportConstraintContract');
const BUDGET_KINDS = new Set(['numeric', 'tier']);
const BUDGET_SCOPES = new Set([
  'trip_total',
  'per_person_total',
  'per_day_total',
  'per_person_per_day',
  'unknown',
]);
const TIERS = new Set(['budget', 'moderate', 'luxury']);

function emptyPlanningState() {
  return {
    schemaVersion: PLANNING_STATE_SCHEMA_VERSION,
    destination: { parkCode: null, parkName: null, region: null, state: null },
    // durationDays is the requested itinerary length, never the calendar span.
    dates: { startDate: null, endDate: null, durationDays: null },
    pendingTemporalResolution: null,
    temporalResolutionStatus: 'unknown',
    temporalProvenance: null,
    planDayCalendarBindings: [],
    travelers: {
      count: null,
      travelParty: null,
      hasChildren: null,
      childrenCount: null,
      pets: null,
      accessibilityNeeds: [],
      hasOlderTravelers: null,
    },
    lodging: {
      type: null,
      stayPreference: null,
      baseTown: null,
      booked: null,
      // Optional geographic enrichment from contextual place resolution.
      // Bare baseTown remains valid when these are unset.
      stateOrRegion: null,
      country: null,
      lat: null,
      lon: null,
      resolutionStatus: null,
      resolutionSource: null,
    },
    transportation: {
      mode: null,
      startLocation: null,
      airport: null,
      departureCity: null,
      departureAirportCode: null,
      rentalCar: null,
      // Phase 9C.1F.1 — see transportConstraintContract.js. null = nothing
      // explicit was said; it is NOT "driving allowed".
      drivingPolicy: null,
      drivingPolicyReason: null,
    },
    preferences: {
      // null = field absent (legacy / never set) — NOT the same as []
      // [] = authoritative explicit empty interest set
      interests: null,
      fitness: null,
      pace: null,
      riskTolerance: null,
      avoidExposure: null,
      maxDailyDriveMinutes: null,
      minimizeDriving: null,
    },
    budgetConstraint: null,
    tripScope: null,
    userSuppliedCosts: [],
    lastTravelerJob: null,
    mobility: {
      maxWalkMilesPerSegment: null,
      maxWalkMinutesPerSegment: null,
      // 'limited' when the traveler asked for less walking without giving a
      // number. Distinct from maxWalkMilesPerSegment on purpose: inventing a
      // mileage from "keep the walking light" would be a fabricated capability.
      walkingTolerance: null,
      requiresFrequentBreaks: null,
      wheelchair: null,
      stroller: null,
      avoidStairs: null,
    },
    time: { availableHours: null },
    activityPreferences: {
      hiking: null,
      photography: null,
      photographyTiming: null,
      excludedPhotographyTimings: [],
      wildlife: null,
    },
    activeDecision: null,
    // Day shells created before live evidence. A generated canonical plan
    // replaces this. Absent means no skeleton was committed.
    draftPlan: null,
    updatedAt: null,
  };
}

function asPositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n);
}

function asNonNegInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 50) return null;
  return Math.round(n);
}

function asDriveMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 24 * 60) return null;
  return Math.round(n);
}

function normalizeDestinationEntity(raw, order) {
  if (!raw || typeof raw !== 'object') return null;
  const parkCode = raw.parkCode ? String(raw.parkCode).toLowerCase() : null;
  let entityId = raw.entityId ? String(raw.entityId) : null;
  if (!entityId && parkCode) entityId = `nps:park:${parkCode}`;
  if (!entityId && !raw.displayName && !raw.canonicalName && !raw.parkName) return null;

  const latitude = Number.isFinite(Number(raw.latitude ?? raw.lat))
    ? Number(raw.latitude ?? raw.lat)
    : null;
  const longitude = Number.isFinite(Number(raw.longitude ?? raw.lon))
    ? Number(raw.longitude ?? raw.lon)
    : null;

  return {
    entityId,
    entityType: raw.entityType || (parkCode ? 'national_park' : 'place'),
    parkCode,
    displayName: raw.displayName || raw.canonicalName || raw.parkName || null,
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : order,
    latitude,
    longitude,
    status: raw.status || (latitude != null && longitude != null ? 'resolved' : 'unresolved_coords'),
    ...(Array.isArray(raw.mentionedPlaces) && raw.mentionedPlaces.length > 0
      ? {
        mentionedPlaces: raw.mentionedPlaces
          .map((p) => {
            if (!p || typeof p !== 'object') return null;
            const name = String(p.name || '').trim();
            if (!name) return null;
            return {
              name,
              key: p.key ? String(p.key) : null,
              role: p.role || 'subordinate_place',
            };
          })
          .filter(Boolean),
      }
      : {}),
    ...(raw.focalPlace === true ? { focalPlace: true } : {}),
    ...(raw.focalPlace === false ? { focalPlace: false } : {}),
  };
}

function normalizeBudgetConstraint(raw, { groupSize = null, tripDays = null } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.cleared === true) {
    return {
      ...emptyBudgetConstraint(),
      cleared: true,
      explicit: true,
      derivationBasis: 'explicit_budget_cleared',
    };
  }
  const kind = BUDGET_KINDS.has(raw.kind) ? raw.kind : null;
  if (!kind) return null;

  const amount = kind === 'numeric' && Number.isFinite(Number(raw.amount)) && Number(raw.amount) > 0
    ? Number(raw.amount)
    : null;
  const qualitativeTier = kind === 'tier' && TIERS.has(raw.qualitativeTier)
    ? raw.qualitativeTier
    : null;
  if (kind === 'numeric' && amount == null) return null;
  if (kind === 'tier' && !qualitativeTier) return null;

  const scope = BUDGET_SCOPES.has(raw.scope) ? raw.scope : (kind === 'numeric' ? 'trip_total' : 'unknown');
  return deriveTripCeiling({
    kind,
    amount,
    currency: raw.currency === 'USD' || amount != null ? 'USD' : null,
    scope,
    qualitativeTier,
    explicit: raw.explicit !== false,
    cleared: false,
    derivedTripCeiling: null,
    derivationBasis: null,
  }, { groupSize, tripDays });
}

function normalizeTripScope(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = TRIP_SCOPE_TYPES.has(raw.type) ? raw.type : 'single_destination';
  const destinations = Array.isArray(raw.destinations)
    ? raw.destinations.map((d, i) => normalizeDestinationEntity(d, i)).filter(Boolean)
    : [];
  const origin = raw.origin ? normalizeDestinationEntity(raw.origin, -1) : null;
  const routeShape = ROUTE_SHAPES.has(raw.routeShape) ? raw.routeShape : 'unknown';
  const maxDailyDriveMinutes = asDriveMinutes(raw.maxDailyDriveMinutes);

  // Rebuild structural legs from endpoints — never trust stale stored transitions.
  const needsLegs = type === 'road_trip' || (type === 'multi_destination' && destinations.length > 1);
  const { routeLegs, unresolvedRouteLegs } = needsLegs
    ? buildRouteLegs({
      origin: type === 'road_trip' ? origin : null,
      destinations,
      routeShape: type === 'road_trip' ? routeShape : 'unknown',
    })
    : { routeLegs: [], unresolvedRouteLegs: [] };

  return {
    type,
    origin: type === 'road_trip' ? origin : null,
    destinations,
    destinationOrderExplicit: raw.destinationOrderExplicit !== false && destinations.length > 1,
    userSuppliedOrder: raw.userSuppliedOrder !== false,
    optimizationRequested: raw.optimizationRequested === true,
    transportMode: raw.transportMode === 'drive' || type === 'road_trip' ? 'drive' : (raw.transportMode || null),
    routeShape: type === 'road_trip' ? routeShape : 'unknown',
    maxDailyDriveMinutes,
    drivingFeasibilityRequired: raw.drivingFeasibilityRequired === true,
    routeLegs,
    unresolvedRouteLegs,
  };
}

function normalizeUserSuppliedCosts(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    if (c.basis !== 'user_supplied') continue;
    if (c.status === 'unknown') continue;
    const amount = Number(c.amountMin ?? c.amount);
    if (!Number.isFinite(amount) || amount < 0) continue;
    out.push({
      category: c.category || 'other',
      label: c.label || 'User-supplied cost',
      amountMin: amount,
      amountMax: Number.isFinite(Number(c.amountMax)) ? Number(c.amountMax) : amount,
      currency: 'USD',
      status: 'verified',
      basis: 'user_supplied',
      appliesTo: c.appliesTo || 'trip',
      quantity: 1,
    });
  }
  return out;
}

/**
 * Validate + normalize persisted JSON. Never throws for malformed input.
 */
function normalizeDraftPlan(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.days)) return null;
  if (raw.days.length === 0 || raw.days.length > 21) return null;
  const days = [];
  for (const day of raw.days) {
    const dayNumber = asPositiveInt(day?.dayNumber);
    if (!dayNumber) return null;
    const id = typeof day.id === 'string' && day.id.trim() ? day.id.trim() : `draft-day-${dayNumber}`;
    const label = typeof day.label === 'string' && day.label.trim() ? day.label.trim() : `Day ${dayNumber}`;
    days.push({
      id,
      dayNumber,
      label,
      stops: Array.isArray(day.stops) ? day.stops : [],
      status: 'draft',
    });
  }
  return { days };
}

function normalizePersistedPlanningState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not_object', state: null };
  }

  const version = raw.schemaVersion || raw.version || null;
  if (version && !KNOWN_SCHEMA_VERSIONS.has(version)) {
    return { ok: false, reason: 'unknown_schema_version', state: null, schemaVersion: version };
  }

  const state = emptyPlanningState();
  state.schemaVersion = PLANNING_STATE_SCHEMA_VERSION;
  state.updatedAt = raw.updatedAt || null;

  if (raw.destination && typeof raw.destination === 'object') {
    state.destination.parkCode = raw.destination.parkCode
      ? String(raw.destination.parkCode).toLowerCase()
      : null;
    state.destination.parkName = raw.destination.parkName || null;
    state.destination.region = raw.destination.region || null;
    state.destination.state = raw.destination.state || null;
  }

  if (raw.dates && typeof raw.dates === 'object') {
    state.dates.startDate = raw.dates.startDate || null;
    state.dates.endDate = raw.dates.endDate || null;
    state.dates.durationDays = asPositiveInt(raw.dates.durationDays);
    state.dates.tripWindowDays = require('./tripDateParser').calendarWindowDays(state.dates.startDate, state.dates.endDate);
  }

  state.pendingTemporalResolution = raw.pendingTemporalResolution || null;
  state.temporalResolutionStatus = state.pendingTemporalResolution ? 'pending_confirmation' : state.dates.startDate ? 'confirmed' : 'unknown';
  state.temporalProvenance = raw.temporalProvenance || null;
  state.planDayCalendarBindings = Array.isArray(raw.planDayCalendarBindings) ? raw.planDayCalendarBindings.filter(b => b?.confirmed === true && Number.isInteger(b.dayNumber) && require('./tripDateParser').calendarWindowDays(b.date,b.date)) : [];
  require('./temporalState').assertTemporalConsistency(state);

  if (raw.travelers && typeof raw.travelers === 'object') {
    state.travelers.count = asPositiveInt(raw.travelers.count);
    const party = normalizeTravelParty(raw.travelers.travelParty);
    state.travelers.travelParty = TRAVEL_PARTIES.has(party) ? party : null;
    if (raw.travelers.hasChildren === true) state.travelers.hasChildren = true;
    if (raw.travelers.hasChildren === false) state.travelers.hasChildren = false;
    state.travelers.childrenCount = asNonNegInt(raw.travelers.childrenCount);
    if (raw.travelers.pets === true) state.travelers.pets = true;
    if (raw.travelers.hasOlderTravelers === true) state.travelers.hasOlderTravelers = true;
    if (raw.travelers.hasOlderTravelers === false) state.travelers.hasOlderTravelers = false;
    if (Array.isArray(raw.travelers.accessibilityNeeds)) {
      state.travelers.accessibilityNeeds = raw.travelers.accessibilityNeeds
        .map((x) => String(x))
        .filter(Boolean)
        .slice(0, 20);
    }
  }

  if (raw.lodging && typeof raw.lodging === 'object') {
    state.lodging.type = raw.lodging.type ? String(raw.lodging.type).toLowerCase() : null;
    state.lodging.stayPreference = raw.lodging.stayPreference
      ? String(raw.lodging.stayPreference).toLowerCase()
      : null;
    state.lodging.baseTown = raw.lodging.baseTown || null;
    if (raw.lodging.booked === true || raw.lodging.booked === false) {
      state.lodging.booked = raw.lodging.booked;
    }
    state.lodging.stateOrRegion = raw.lodging.stateOrRegion
      ? String(raw.lodging.stateOrRegion)
      : null;
    state.lodging.country = raw.lodging.country ? String(raw.lodging.country) : null;
    // Do not coerce missing coords through Number(null) → 0.
    const lodgingLat = raw.lodging.lat == null || raw.lodging.lat === ''
      ? null
      : Number(raw.lodging.lat);
    const lodgingLon = raw.lodging.lon == null || raw.lodging.lon === ''
      ? null
      : Number(raw.lodging.lon);
    state.lodging.lat = Number.isFinite(lodgingLat) ? lodgingLat : null;
    state.lodging.lon = Number.isFinite(lodgingLon) ? lodgingLon : null;
    state.lodging.resolutionStatus = raw.lodging.resolutionStatus
      ? String(raw.lodging.resolutionStatus)
      : null;
    state.lodging.resolutionSource = raw.lodging.resolutionSource
      ? String(raw.lodging.resolutionSource)
      : null;
  }

  if (raw.transportation && typeof raw.transportation === 'object') {
    state.transportation.mode = raw.transportation.mode || null;
    state.transportation.startLocation = raw.transportation.startLocation || null;
    state.transportation.airport =
      raw.transportation.airport || raw.transportation.departureAirportCode || null;
    state.transportation.departureCity = raw.transportation.departureCity || null;
    state.transportation.departureAirportCode =
      raw.transportation.departureAirportCode || raw.transportation.airport || null;
    if (raw.transportation.rentalCar === true || raw.transportation.rentalCar === false) {
      state.transportation.rentalCar = raw.transportation.rentalCar;
    }
    Object.assign(state.transportation, normalizeDrivingPolicyFields(raw.transportation));
    reconcileTransportationDrivingPolicy(state.transportation);
  }

  if (raw.preferences && typeof raw.preferences === 'object') {
    // Presence-aware: missing interests ≠ explicit empty list.
    if (Object.prototype.hasOwnProperty.call(raw.preferences, 'interests')) {
      if (raw.preferences.interests == null) {
        state.preferences.interests = null;
      } else {
        state.preferences.interests = normalizeInterestList(
          Array.isArray(raw.preferences.interests) ? raw.preferences.interests : []
        );
      }
    } else {
      state.preferences.interests = null;
    }
    state.preferences.fitness = raw.preferences.fitness
      ? String(raw.preferences.fitness).toLowerCase()
      : null;
    const pace = raw.preferences.pace ? String(raw.preferences.pace).toLowerCase() : null;
    state.preferences.pace = PACE_VALUES.has(pace) ? pace : null;
    state.preferences.riskTolerance = raw.preferences.riskTolerance || null;
    if (raw.preferences.avoidExposure === true || raw.preferences.avoidExposure === false) {
      state.preferences.avoidExposure = raw.preferences.avoidExposure;
    }
    state.preferences.maxDailyDriveMinutes = asDriveMinutes(raw.preferences.maxDailyDriveMinutes);
    if (raw.preferences.minimizeDriving === true) state.preferences.minimizeDriving = true;
  }

  state.tripScope = normalizeTripScope(raw.tripScope || raw.roadTrip);
  if (state.tripScope?.maxDailyDriveMinutes != null) {
    state.preferences.maxDailyDriveMinutes = state.tripScope.maxDailyDriveMinutes;
  }

  state.budgetConstraint = normalizeBudgetConstraint(raw.budgetConstraint, {
    groupSize: state.travelers.count,
    tripDays: state.dates.durationDays,
  });

  state.userSuppliedCosts = normalizeUserSuppliedCosts(raw.userSuppliedCosts);
  if (typeof raw.lastTravelerJob === 'string' && raw.lastTravelerJob.trim()) {
    state.lastTravelerJob = raw.lastTravelerJob.trim();
  }

  if (raw.mobility && typeof raw.mobility === 'object') {
    const miles = Number(raw.mobility.maxWalkMilesPerSegment);
    state.mobility.maxWalkMilesPerSegment =
      Number.isFinite(miles) && miles > 0 && miles <= 30 ? miles : null;
    const minutes = Number(raw.mobility.maxWalkMinutesPerSegment);
    state.mobility.maxWalkMinutesPerSegment =
      Number.isFinite(minutes) && minutes > 0 && minutes <= 12 * 60 ? minutes : null;
    if (raw.mobility.walkingTolerance === 'limited') state.mobility.walkingTolerance = 'limited';
    if (raw.mobility.requiresFrequentBreaks === true) state.mobility.requiresFrequentBreaks = true;
    if (raw.mobility.wheelchair === true) state.mobility.wheelchair = true;
    if (raw.mobility.stroller === true) state.mobility.stroller = true;
    if (raw.mobility.avoidStairs === true) state.mobility.avoidStairs = true;
  }

  if (raw.time && typeof raw.time === 'object') {
    const hours = Number(raw.time.availableHours);
    state.time.availableHours = Number.isFinite(hours) && hours > 0 && hours <= 24 ? hours : null;
  }

  if (raw.activityPreferences && typeof raw.activityPreferences === 'object') {
    const hiking = raw.activityPreferences.hiking
      ? String(raw.activityPreferences.hiking).toLowerCase()
      : null;
    state.activityPreferences.hiking = HIKING_VALUES.has(hiking) ? hiking : null;
    if (typeof raw.activityPreferences.photography === 'boolean') state.activityPreferences.photography = raw.activityPreferences.photography;
    state.activityPreferences.excludedPhotographyTimings = (Array.isArray(raw.activityPreferences.excludedPhotographyTimings) ? raw.activityPreferences.excludedPhotographyTimings : []).filter(value => PHOTOGRAPHY_TIMING.has(value));
    const timing = raw.activityPreferences.photographyTiming
      ? String(raw.activityPreferences.photographyTiming).toLowerCase()
      : null;
    state.activityPreferences.photographyTiming = PHOTOGRAPHY_TIMING.has(timing) ? timing : null;
    if (raw.activityPreferences.wildlife === true) state.activityPreferences.wildlife = true;
  }

  if (raw.activeDecision && typeof raw.activeDecision === 'object' && raw.activeDecision.kind) {
    state.activeDecision = {
      kind: String(raw.activeDecision.kind),
      destinationParkCode: raw.activeDecision.destinationParkCode
        ? String(raw.activeDecision.destinationParkCode).toLowerCase()
        : null,
    };
  }

  state.draftPlan = normalizeDraftPlan(raw.draftPlan);

  // Strip forbidden evidence / provider keys if somehow present (defense in depth).
  const forbidden = [
    'evidenceBundle', 'weather', 'alerts', 'npsFacts', 'providerPayload',
    'budgetAssessment', 'modelMetadata', 'tokens', 'routingDecision',
  ];
  for (const key of forbidden) {
    if (key in state) delete state[key];
  }

  return { ok: true, reason: null, state };
}

/**
 * Build a durable planningState from runtime sources (constraints + tripState).
 */
function buildPlanningStateFromRuntime({
  constraints = null,
  tripState = null,
  previous = null,
  formData = null,
  parkCode = null,
  parkName = null,
  userSuppliedCosts = null,
  messageText = '',
} = {}) {
  const base = previous
    ? (normalizePersistedPlanningState(previous).state || emptyPlanningState())
    : emptyPlanningState();

  const next = { ...base, travelers: { ...base.travelers }, dates: { ...base.dates },
    lodging: { ...base.lodging }, transportation: { ...base.transportation },
    preferences: {
      ...base.preferences,
      interests: Array.isArray(base.preferences.interests)
        ? [...base.preferences.interests]
        : base.preferences.interests,
    },
    destination: { ...base.destination },
    mobility: { ...base.mobility },
    time: { ...base.time },
    activityPreferences: { ...base.activityPreferences },
  };

  const c = constraints || {};
  const ts = tripState || {};
  const fd = formData || {};

  next.destination.parkCode =
    c.parkCode || ts.destination?.parkCode || parkCode || fd.parkCode || next.destination.parkCode;
  next.destination.parkName =
    ts.destination?.parkName || parkName || fd.parkName || next.destination.parkName;

  next.dates.startDate = c.dates?.start || ts.dates?.startDate || fd.startDate || next.dates.startDate;
  next.dates.endDate = c.dates?.end || ts.dates?.endDate || fd.endDate || next.dates.endDate;
  next.dates.durationDays =
    asPositiveInt(c.dates?.numDays) ||
    asPositiveInt(ts.durationDays) ||
    asPositiveInt(fd.numDays) ||
    next.dates.durationDays;

  if (c.temporalResolution) {
    Object.assign(next, require('./temporalState').applyTemporalState(next, c.temporalResolution));
    if (base.dates.startDate !== next.dates.startDate || base.dates.endDate !== next.dates.endDate) next.planDayCalendarBindings = [];
  }
  else {
    next.dates.tripWindowDays = require('./tripDateParser').calendarWindowDays(next.dates.startDate, next.dates.endDate);
    require('./temporalState').assertTemporalConsistency(next);
  }

  if (c.groupSize != null) next.travelers.count = asPositiveInt(c.groupSize);
  else if (ts.travelers?.count != null) next.travelers.count = asPositiveInt(ts.travelers.count);
  else if (fd.groupSize != null) next.travelers.count = asPositiveInt(fd.groupSize);

  if (c.travelParty) next.travelers.travelParty = normalizeTravelParty(c.travelParty);
  else if (ts.travelers?.groupType) next.travelers.travelParty = normalizeTravelParty(ts.travelers.groupType);

  if (c.hasChildren === true || c.hasChildren === false) next.travelers.hasChildren = c.hasChildren;
  else if (ts.travelers?.kids === true || ts.travelers?.kids === false) next.travelers.hasChildren = ts.travelers.kids;

  if (c.childrenCount != null) next.travelers.childrenCount = asNonNegInt(c.childrenCount);
  else if (ts.travelers?.childrenCount != null) next.travelers.childrenCount = asNonNegInt(ts.travelers.childrenCount);

  if (ts.travelers?.pets === true) next.travelers.pets = true;
  if (c.hasOlderTravelers === true || ts.travelers?.hasOlderTravelers === true) {
    next.travelers.hasOlderTravelers = true;
  }
  if (ts.travelers?.accessibilityNeeds?.length) {
    next.travelers.accessibilityNeeds = [...ts.travelers.accessibilityNeeds];
  }

  const rawAccommodation =
    c.accommodation || ts.lodging?.type || fd.accommodation || next.lodging.type;
  if (rawAccommodation || ts.lodging?.stayPreference || messageText) {
    const mappedStay = mapStayPreference({
      rawAccommodation,
      messageText,
      previousStayPreference:
        ts.lodging?.stayPreference || next.lodging.stayPreference,
    });
    next.lodging.type = mappedStay.accommodationClass !== 'unknown'
      ? mappedStay.accommodationClass
      : rawAccommodation;
    if (mappedStay.stayPreference !== 'unknown') {
      next.lodging.stayPreference = mappedStay.stayPreference;
    }
  }
  if (ts.lodging?.baseTown) next.lodging.baseTown = ts.lodging.baseTown;

  // Phase 9C.1F.2 — `transportation.mode='drive'` is durable AUTHORITY for
  // edge drive intent, so it may only be sourced from an explicit road-trip
  // contract, never from `tripScope.transportMode`'s broad regex (which says
  // 'drive' for "no more than 3 hours of driving" or "keep the driving
  // realistic"). Non-drive scope modes and `fly` pass through unchanged.
  const scopeMode = c.tripScope?.transportMode === 'drive'
    ? (c.tripScope?.type === 'road_trip' ? 'drive' : null)
    : (c.tripScope?.transportMode || null);
  next.transportation.mode = ts.transportation?.mode || scopeMode || next.transportation.mode;
  next.transportation.startLocation =
    ts.transportation?.startLocation || c.tripScope?.origin?.displayName || next.transportation.startLocation;
  next.transportation.departureCity =
    ts.transportation?.departureCity || next.transportation.departureCity;
  next.transportation.airport =
    ts.transportation?.airport
    || ts.transportation?.departureAirportCode
    || next.transportation.airport;
  next.transportation.departureAirportCode =
    ts.transportation?.departureAirportCode
    || ts.transportation?.airport
    || next.transportation.departureAirportCode;
  if (ts.transportation?.rentalCar === true || ts.transportation?.rentalCar === false) {
    next.transportation.rentalCar = ts.transportation.rentalCar;
  }

  // Phase 9C.1F.1 — newest EXPLICIT traveler statement is authority:
  //   this turn prohibits        → set policy + reason (replaces any older one)
  //   this turn restores the car → clear policy (only on explicit restoration)
  //   this turn is silent        → whatever the merged tripState / previous
  //                                state carried survives untouched
  const tc = c.transportConstraint || null;
  if (tc?.rentalCar === true) next.transportation.rentalCar = true;
  if (tc?.drivingPolicy === 'prohibited') {
    Object.assign(next.transportation, normalizeDrivingPolicyFields(tc));
  } else if (tc?.clearDrivingPolicy === true) {
    next.transportation.drivingPolicy = null;
    next.transportation.drivingPolicyReason = null;
  } else if (ts.transportation && Object.prototype.hasOwnProperty.call(ts.transportation, 'drivingPolicy')) {
    Object.assign(next.transportation, normalizeDrivingPolicyFields(ts.transportation));
  }
  // A prohibition and an unconditional drive assumption never coexist
  // (stale `mode='drive'` / `rentalCar=true` are withdrawn, `fly` is kept).
  reconcileTransportationDrivingPolicy(next.transportation);

  // Presence-aware interests: Array (including []) is authoritative.
  // Do NOT treat [] as missing and fill from stale formData.
  if (Array.isArray(c.interests)) {
    next.preferences.interests = normalizeInterestList(c.interests);
  } else if (Array.isArray(ts.preferences?.interests)) {
    next.preferences.interests = normalizeInterestList(ts.preferences.interests);
  } else if (fd.interests) {
    next.preferences.interests = normalizeInterestList(
      typeof fd.interests === 'string' ? fd.interests.split(',') : fd.interests
    );
  }

  next.preferences.fitness = c.fitnessLevel || ts.preferences?.fitness || fd.fitnessLevel || next.preferences.fitness;
  if (c.pace && PACE_VALUES.has(c.pace)) {
    next.preferences.pace = c.pace;
  } else if (ts.preferences?.pace && PACE_VALUES.has(ts.preferences.pace)) {
    next.preferences.pace = ts.preferences.pace;
  }

  if (c.avoidExposure === true) next.preferences.avoidExposure = true;
  else if (c.avoidExposure === false) next.preferences.avoidExposure = false;

  if (c.maxDailyDriveMinutes != null) {
    next.preferences.maxDailyDriveMinutes = asDriveMinutes(c.maxDailyDriveMinutes);
  } else if (ts.preferences?.maxDailyDriveMinutes != null) {
    next.preferences.maxDailyDriveMinutes = asDriveMinutes(ts.preferences.maxDailyDriveMinutes);
  }
  if (c.preferences?.minimizeDriving === true || c.minimizeDriving === true) {
    next.preferences.minimizeDriving = true;
  } else if (ts.preferences?.minimizeDriving === true) {
    next.preferences.minimizeDriving = true;
  }

  if (c.budgetConstraint?.cleared) {
    next.budgetConstraint = {
      ...emptyBudgetConstraint(),
      cleared: true,
      explicit: true,
      derivationBasis: 'explicit_budget_cleared',
    };
  } else if (c.budgetConstraint) {
    next.budgetConstraint = normalizeBudgetConstraint(c.budgetConstraint, {
      groupSize: next.travelers.count,
      tripDays: next.dates.durationDays,
    });
  } else if (ts.preferences?.budgetConstraint) {
    next.budgetConstraint = normalizeBudgetConstraint(ts.preferences.budgetConstraint, {
      groupSize: next.travelers.count,
      tripDays: next.dates.durationDays,
    });
  } else if (c.budget != null || fd.budget != null) {
    const legacy = c.budget ?? fd.budget;
    if (/^\d+(\.\d+)?$/.test(String(legacy).trim())) {
      next.budgetConstraint = normalizeBudgetConstraint({
        kind: 'numeric',
        amount: Number(legacy),
        scope: 'trip_total',
        currency: 'USD',
        explicit: true,
      }, { groupSize: next.travelers.count, tripDays: next.dates.durationDays });
    } else if (TIERS.has(String(legacy).toLowerCase())) {
      next.budgetConstraint = normalizeBudgetConstraint({
        kind: 'tier',
        qualitativeTier: String(legacy).toLowerCase(),
        explicit: true,
      });
    }
  }

  const scope = c.tripScope || ts.tripScope || ts.roadTrip;
  if (scope) next.tripScope = normalizeTripScope(scope);

  if (Array.isArray(userSuppliedCosts)) {
    next.userSuppliedCosts = normalizeUserSuppliedCosts(userSuppliedCosts);
  } else if (Array.isArray(c.costComponents)) {
    next.userSuppliedCosts = normalizeUserSuppliedCosts(
      c.costComponents.filter((x) => x?.basis === 'user_supplied')
    );
  }

  const travelerJob = c.travelerJob || c.lastTravelerJob || ts.lastTravelerJob || next.lastTravelerJob;
  if (typeof travelerJob === 'string' && travelerJob.trim()) {
    next.lastTravelerJob = travelerJob.trim();
    const decisionOwner = activeDecisionOwnerForJob(next.lastTravelerJob);
    if (decisionOwner) {
      next.activeDecision = {
        kind: decisionOwner,
        destinationParkCode: next.destination.parkCode || null,
      };
    }
  }

  const mobilitySrc = c.mobility || ts.mobility || null;
  if (mobilitySrc && typeof mobilitySrc === 'object') {
    if (mobilitySrc.maxWalkMilesPerSegment != null) {
      next.mobility.maxWalkMilesPerSegment = Number(mobilitySrc.maxWalkMilesPerSegment) || next.mobility.maxWalkMilesPerSegment;
    }
    if (mobilitySrc.maxWalkMinutesPerSegment != null) {
      next.mobility.maxWalkMinutesPerSegment = Number(mobilitySrc.maxWalkMinutesPerSegment) || next.mobility.maxWalkMinutesPerSegment;
    }
    if (mobilitySrc.walkingTolerance === 'limited') next.mobility.walkingTolerance = 'limited';
    if (mobilitySrc.requiresFrequentBreaks === true) next.mobility.requiresFrequentBreaks = true;
    if (mobilitySrc.wheelchair === true) next.mobility.wheelchair = true;
    if (mobilitySrc.stroller === true) next.mobility.stroller = true;
    if (mobilitySrc.avoidStairs === true) next.mobility.avoidStairs = true;
  }
  if (c.time?.availableHours != null) {
    next.time.availableHours = Number(c.time.availableHours) || next.time.availableHours;
  }
  if (c.activityPreferences?.hiking) {
    next.activityPreferences.hiking = c.activityPreferences.hiking;
  }
  if (c.activityPreferences?.photography === true) {
    next.activityPreferences.photography = true;
  }
  if (c.activityPreferences?.photographyTiming) {
    next.activityPreferences.photographyTiming = c.activityPreferences.photographyTiming;
  }
  if (c.activityPreferences?.wildlife === true) {
    next.activityPreferences.wildlife = true;
  }

  // Hard constraints and planning state are two representations of the same
  // facts, assembled by different code. Nothing previously asserted they agree,
  // which is how `accommodation: lodging` and `lodging.type: camping` both
  // survived into generation. Reconcile toward the constraint before anything
  // downstream reads the state.
  const reconciled = resolveCanonicalStateConsistency({ constraints: c, planningState: next });
  const state = reconciled.state;
  if (reconciled.contradictions.length > 0) {
    state.stateConsistencyRepairs = reconciled.contradictions.map((entry) => entry.id);
  }

  state.updatedAt = new Date().toISOString();
  state.schemaVersion = PLANNING_STATE_SCHEMA_VERSION;

  // Final normalize pass for enums / leg rebuild
  const validated = normalizePersistedPlanningState(state);
  return validated.ok ? validated.state : state;
}

/**
 * Merge latest constraints onto persisted planning state (patch, don't erase untouched).
 */
function mergePlanningStateWithConstraints(persisted, constraints, {
  tripState = null,
  lastUserMessage = '',
} = {}) {
  if (!constraints) return persisted;
  return buildPlanningStateFromRuntime({
    constraints,
    tripState,
    previous: persisted,
    userSuppliedCosts: constraints.costComponents,
  });
}

/**
 * Apply planningState as the structured base for parseConstraints inputs.
 * Returns formData-like + constraint seed fields.
 */
function planningStateToConstraintSeed(planningState) {
  const n = normalizePersistedPlanningState(planningState);
  if (!n.ok || !n.state) return {};
  const s = n.state;
  const seed = {
    parkCode: s.destination.parkCode,
    startDate: s.dates.startDate,
    endDate: s.dates.endDate,
    numDays: s.dates.durationDays,
    tripWindowDays: s.dates.tripWindowDays,
    groupSize: s.travelers.count,
    travelParty: s.travelers.travelParty,
    hasChildren: s.travelers.hasChildren,
    childrenCount: s.travelers.childrenCount,
    accommodation: s.lodging.type,
    fitnessLevel: s.preferences.fitness,
    budgetConstraint: s.budgetConstraint,
    tripScope: s.tripScope,
    maxDailyDriveMinutes: s.preferences.maxDailyDriveMinutes,
    costComponents: s.userSuppliedCosts,
    mobility: { ...s.mobility },
    hasOlderTravelers: s.travelers.hasOlderTravelers,
    activityPreferences: { ...s.activityPreferences },
    pace: s.preferences.pace,
    avoidExposure: s.preferences.avoidExposure,
  };

  // Only seed interests when present as an array (including explicit []).
  // Absent/null → omit so parseConstraints may use formData compatibility.
  if (Array.isArray(s.preferences.interests)) {
    seed.interests = s.preferences.interests;
  }

  if (s.budgetConstraint?.cleared) {
    seed.budget = null;
    seed.clearBudget = true;
  } else if (s.budgetConstraint?.kind === 'numeric' && s.budgetConstraint.amount != null) {
    seed.budget = String(s.budgetConstraint.amount);
  } else if (s.budgetConstraint?.kind === 'tier') {
    seed.budget = s.budgetConstraint.qualitativeTier;
  }

  return seed;
}

/**
 * Convert planningState into a tripState layer (for buildTripState merge).
 */
function planningStateToTripStateLayer(planningState) {
  const n = normalizePersistedPlanningState(planningState);
  if (!n.ok || !n.state) return null;
  const s = n.state;
  return {
    destination: { ...s.destination },
    dates: {
      startDate: s.dates.startDate,
      endDate: s.dates.endDate,
      season: null,
      flexible: null,
    },
    durationDays: s.dates.durationDays,
    tripWindowDays: s.dates.tripWindowDays,
    planDayCalendarBindings: s.planDayCalendarBindings,
    travelers: {
      count: s.travelers.count,
      groupType: s.travelers.travelParty,
      kids: s.travelers.hasChildren,
      childrenCount: s.travelers.childrenCount,
      pets: s.travelers.pets,
      accessibilityNeeds: [...(s.travelers.accessibilityNeeds || [])],
      hasOlderTravelers: s.travelers.hasOlderTravelers,
    },
    mobility: { ...s.mobility },
    lodging: { ...s.lodging },
    transportation: { ...s.transportation },
    preferences: {
      fitness: s.preferences.fitness,
      interests: Array.isArray(s.preferences.interests) ? [...s.preferences.interests] : [],
      budget: s.budgetConstraint?.kind === 'numeric'
        ? String(s.budgetConstraint.amount)
        : s.budgetConstraint?.qualitativeTier || null,
      pace: s.preferences.pace,
      riskTolerance: s.preferences.riskTolerance,
      maxDailyDriveMinutes: s.preferences.maxDailyDriveMinutes,
      budgetConstraint: s.budgetConstraint,
    },
    tripScope: s.tripScope,
    roadTrip: s.tripScope,
    previousDecisions: [],
    openQuestions: [],
  };
}

function planningStateContainsEvidence(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const forbidden = [
    'evidenceBundle', 'weather', 'weatherFacts', 'npsFacts', 'alerts',
    'providerPayload', 'budgetAssessment', 'model', 'tokens', 'webSearchFacts',
  ];
  return forbidden.some((k) => Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null);
}

/**
 * Resolve planningState for an accepted trip write.
 * Prefer explicit body.planningState; else rebuild from conversation last
 * user message + previous + formData; else formData/previous alone.
 *
 * Write boundary: accepted create/update (response-coupled), not intermediate
 * model attempts. Conversation is used only to patch from the LATEST user
 * message onto previous structured state — never full-history re-extraction.
 */
function resolvePlanningStateForWrite({
  incomingPlanningState = null,
  formData = null,
  previousPlanningState = null,
  parkCode = null,
  parkName = null,
  conversation = null,
} = {}) {
  if (incomingPlanningState && typeof incomingPlanningState === 'object') {
    const cleaned = { ...incomingPlanningState };
    for (const key of [
      'evidenceBundle', 'weather', 'weatherFacts', 'npsFacts', 'alerts',
      'providerPayload', 'budgetAssessment', 'model', 'tokens', 'webSearchFacts',
    ]) {
      delete cleaned[key];
    }
    const n = normalizePersistedPlanningState(cleaned);
    if (n.ok && n.state) return n.state;
  }

  const lastUserMessage = extractLastUserMessage(conversation);
  const previous = previousPlanningState
    ? (normalizePersistedPlanningState(previousPlanningState).state || null)
    : null;

  // When we have a last user message and/or previous structured state, rebuild
  // via parseConstraints so refinements (remove interest, clear budget, etc.)
  // are captured without relying on the browser echoing planningState.
  //
  // Legacy trips (no previous planningState): allow full conversation user text
  // as compatibility fallback once. After that, last-message patch wins.
  if (lastUserMessage || previous || formData) {
    try {
      const { parseConstraints } = require('./constraintEngine');
      const parseText = previous
        ? (lastUserMessage || '')
        : (extractAllUserText(conversation) || lastUserMessage || '');
      const constraints = parseConstraints(
        {
          formData: formData || {},
          parkCode,
          planningState: previous,
        },
        parseText
      );
      return buildPlanningStateFromRuntime({
        constraints,
        previous,
        formData,
        parkCode: parkCode || formData?.parkCode,
        parkName: parkName || formData?.parkName,
        userSuppliedCosts: constraints.costComponents,
      });
    } catch (err) {
      // Fail safe — fall through to formData/previous
    }
  }

  if (formData && typeof formData === 'object') {
    return buildPlanningStateFromRuntime({
      formData,
      previous: previousPlanningState,
      parkCode: parkCode || formData.parkCode,
      parkName: parkName || formData.parkName,
    });
  }

  if (previousPlanningState) {
    const n = normalizePersistedPlanningState(previousPlanningState);
    return n.ok ? n.state : null;
  }

  return null;
}

function extractLastUserMessage(conversation) {
  if (!Array.isArray(conversation)) return '';
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    const m = conversation[i];
    if (m?.role === 'user' && m.content) return String(m.content);
  }
  return '';
}

function extractAllUserText(conversation) {
  if (!Array.isArray(conversation)) return '';
  return conversation
    .filter((m) => m?.role === 'user' && m.content)
    .map((m) => String(m.content))
    .join('\n');
}

/**
 * Patch persisted tripScope from the latest user message without full re-parse
 * of conversation history.
 */
function applyTripScopeRefinement(persisted, message) {
  if (!persisted) return buildTripScopeFromMessage(message);
  let scope = normalizeTripScope(persisted);
  if (!scope) return buildTripScopeFromMessage(message);
  const text = String(message || '');
  if (!text.trim()) return scope;

  if (/\b(?:don'?t|do not)\s+return\b|\bone[- ]?way\b|\bnot return\b|\bfinish(?:ing)? at\b/i.test(text)) {
    scope = refineTripScopeRouteShape(scope, 'one_way');
  } else if (/\b(?:make\s+it\s+a\s+)?loop\b|\bround[- ]?trip\b|\breturn to\b/i.test(text)) {
    scope = refineTripScopeRouteShape(scope, 'loop');
  }

  const skipMatch = text.match(
    /\b(?:skip|remove|without|drop)\s+([A-Za-z0-9][A-Za-z0-9\s-]{0,40}?)(?:\s+and\b|[.,!]|$)/i
  );
  if (skipMatch && scope.destinations?.length) {
    const needle = skipMatch[1].trim().toLowerCase();
    const target = scope.destinations.find((d) => {
      const name = String(d.displayName || '').toLowerCase();
      const code = String(d.parkCode || '').toLowerCase();
      const id = String(d.entityId || '').toLowerCase();
      return name.includes(needle) || code === needle || id.endsWith(`:${needle}`) || id.includes(needle);
    });
    if (target?.entityId) {
      scope = refineTripScopeRemoveDestination(scope, target.entityId);
    }
  }

  if (/\badd\b|\balso\s+(?:visit|include|go|see)\b/i.test(text)) {
    const msgDests = resolveDestinationsFromMessage(text);
    for (const d of msgDests) {
      if (!scope.destinations.some((x) => x.entityId === d.entityId)) {
        scope = refineTripScopeAddDestination(scope, d);
      }
    }
  }

  const drive = parseMaxDailyDriveMinutes(text);
  if (drive != null) {
    scope = { ...scope, maxDailyDriveMinutes: drive };
  }

  // Sticky, like maxDailyDriveMinutes — once asked for, stays true for the trip.
  if (scope.drivingFeasibilityRequired || detectDrivingFeasibilityConstraint(text) || drive != null) {
    scope = { ...scope, drivingFeasibilityRequired: true };
  }

  return normalizeTripScope(scope) || scope;
}

/**
 * Attach departure city / hub airport onto planningState from extractUserCity.
 * Does not clear an already-set departure on refinement unless the new city differs.
 */
function applyDepartureContextToPlanningState(planningState, userCity, messageText = '') {
  if (!planningState || !userCity?.name) return planningState;

  const { getNearestAirports } = require('./airportCoordinates');
  const next = {
    ...planningState,
    transportation: { ...(planningState.transportation || {}) },
  };
  const transport = next.transportation;
  const msg = typeof messageText === 'string' ? messageText : '';

  const preferNotToFly =
    /\bprefer\s+not\s+to\s+fly\b|\b(?:do\s+not|don['’]?t)\s+(?:want|prefer)\s+to\s+fly\b|\bno\s+flights?\b/i.test(msg);
  if (!preferNotToFly && /\b(fly|flying|flight|airport)\b/i.test(msg) && !transport.mode) {
    transport.mode = 'fly';
  }

  const priorCity = transport.departureCity || transport.startLocation || null;
  const cityChanged = priorCity
    && String(priorCity).toLowerCase() !== String(userCity.name).toLowerCase();

  if (!transport.departureCity || cityChanged) {
    transport.departureCity = userCity.name;
  }
  if (!transport.startLocation || cityChanged) {
    transport.startLocation = userCity.name;
  }

  if (!transport.departureAirportCode || !transport.airport || cityChanged) {
    const nearest = getNearestAirports(userCity.lat, userCity.lon, 1)[0];
    if (nearest?.code) {
      transport.departureAirportCode = nearest.code;
      transport.airport = nearest.code;
    }
  }

  return next;
}

function activeDecisionOwnerForJob(travelerJob) {
  const job = typeof travelerJob === 'string' ? travelerJob.trim() : '';
  const decisionJobs = new Set([
    'trip_duration_advice',
    'airport_strategy',
    'lodging_strategy',
    'campground_strategy',
    'permits_reservations',
    'route_planning',
    'day_by_day_itinerary',
    'destination_compare',
    'destination_discovery',
    'budget_cost',
    'access_contingency',
  ]);
  if (decisionJobs.has(job)) return job;
  if (job === 'origin_refinement') return 'airport_strategy';
  if (job === 'itinerary_refinement' || job === 'constraint_update') return 'day_by_day_itinerary';
  return null;
}

function stampLastTravelerJob(planningState, travelerJob) {
  if (typeof travelerJob !== 'string' || !travelerJob.trim()) {
    return planningState || null;
  }
  const base = planningState && typeof planningState === 'object'
    ? { ...planningState }
    : emptyPlanningState();
  const job = travelerJob.trim();
  base.lastTravelerJob = job;

  const decisionOwner = activeDecisionOwnerForJob(job);
  if (decisionOwner) {
    base.activeDecision = {
      kind: decisionOwner,
      destinationParkCode: base.destination?.parkCode
        || base.activeDecision?.destinationParkCode
        || null,
    };
  }
  return base;
}

// All transports publish the same committed traveler state. An accepted plan
// replaces the draft; a failed answer never promotes or deletes it.
function finalizePlanningStateForTurn(current, result) {
  if (!current) return current;
  require('./temporalState').assertTemporalConsistency(current);
  const state = result?.status === 'complete' ? stampLastTravelerJob(current, result?.intent?.travelerJob) : current;
  if (result?.status === 'complete' && result?.canonicalPlan?.days?.length && state?.draftPlan) {
    const { draftPlan, ...accepted } = state;
    return accepted;
  }
  return state;
}

module.exports = {
  PLANNING_STATE_SCHEMA_VERSION,
  finalizePlanningStateForTurn,
  emptyPlanningState,
  normalizePersistedPlanningState,
  buildPlanningStateFromRuntime,
  stampLastTravelerJob,
  activeDecisionOwnerForJob,
  mergePlanningStateWithConstraints,
  planningStateToConstraintSeed,
  planningStateToTripStateLayer,
  planningStateContainsEvidence,
  resolvePlanningStateForWrite,
  applyTripScopeRefinement,
  applyDepartureContextToPlanningState,
  normalizeTripScope,
  normalizeBudgetConstraint,
};
