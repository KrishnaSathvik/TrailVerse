'use strict';

/**
 * Planning Readiness Pass #3 — multi-destination / road-trip validators.
 * Deterministic, offline. Uses entity ids — not loose name matching.
 */

const { buildRouteLegs } = require('./roadTripContract');
const { evaluateRouteLegsAgainstDailyDriveCap } = require('./routeEvidenceDriveBridge');

const GLOBAL_MAX_ACTIVE_MINUTES = 14 * 60;

function collectPlanDestinationIds(itineraryData) {
  // Prefer stop-level park/entity identity, collapsing consecutive repeats:
  //   A A A B B C C → [A, B, C]
  // Do NOT use day-level "majority park" when stops carry identity — a day can
  // legitimately be morning=A / evening=B.
  const ordered = [];
  const days = itineraryData?.days || [];

  const entityFrom = (obj) => {
    if (!obj) return null;
    return (
      obj.destinationEntityId ||
      obj.entityId ||
      obj.parkEntityId ||
      (obj.parkCode ? `nps:park:${String(obj.parkCode).toLowerCase()}` : null)
    );
  };

  const pushCollapsed = (entityId) => {
    if (!entityId) return;
    if (ordered.length === 0 || ordered[ordered.length - 1] !== entityId) {
      ordered.push(entityId);
    }
  };

  for (const day of days) {
    const stopEntities = (day?.stops || []).map(entityFrom).filter(Boolean);
    if (stopEntities.length > 0) {
      for (const id of stopEntities) pushCollapsed(id);
      continue;
    }
    // Fallback only when the day has no stop-level destination identity.
    pushCollapsed(entityFrom(day));
  }
  return ordered;
}

function collectDayDriveMinutes(day) {
  let drive = 0;
  for (const stop of day?.stops || []) {
    drive += Number(stop.drivingTimeFromPreviousMin) || 0;
  }
  if (Number.isFinite(Number(day?.totalDriveMinutes))) {
    drive = Math.max(drive, Number(day.totalDriveMinutes));
  }
  return drive;
}

function collectDayActivityMinutes(day) {
  let activity = 0;
  for (const stop of day?.stops || []) {
    activity += Number(stop.duration) || 0;
  }
  return activity;
}

/**
 * Validate destination coverage + sequence for multi-destination / road-trip.
 */
function validateDestinationCoverage(itineraryData, tripScope) {
  const issues = [];
  if (!tripScope?.destinations?.length) return issues;
  if (tripScope.type === 'single_destination') return issues;

  const required = tripScope.destinations
    .filter((d) => d?.entityId && d.status !== 'unresolved')
    .map((d) => d.entityId);
  if (!required.length) return issues;

  const present = new Set(collectPlanDestinationIds(itineraryData));
  for (const entityId of required) {
    if (!present.has(entityId)) {
      const dest = tripScope.destinations.find((d) => d.entityId === entityId);
      issues.push({
        type: 'missing_requested_destination',
        severity: 'feasibility',
        reasonCode: 'missing_requested_destination',
        details:
          `Destination ${dest?.order != null ? dest.order + 1 : '?'} requested by the traveler ` +
          `(${dest?.displayName || entityId}) is absent from the structured plan.`,
        entityId,
        displayName: dest?.displayName || null,
        order: dest?.order ?? null,
      });
    }
  }
  return issues;
}

/**
 * When user supplied explicit order, plan visit order must not rearrange destinations.
 */
function validateDestinationSequence(itineraryData, tripScope) {
  const issues = [];
  if (!tripScope?.destinations?.length || tripScope.destinations.length < 2) return issues;
  if (tripScope.optimizationRequested) return issues;
  if (tripScope.userSuppliedOrder === false || tripScope.destinationOrderExplicit === false) {
    return issues;
  }

  const required = tripScope.destinations
    .filter((d) => d?.entityId)
    .map((d) => d.entityId);
  const presentOrdered = collectPlanDestinationIds(itineraryData)
    .filter((id) => required.includes(id));

  if (presentOrdered.length < 2) return issues;

  // Compare relative order of destinations that appear in the plan.
  let reqIdx = 0;
  for (const id of presentOrdered) {
    while (reqIdx < required.length && required[reqIdx] !== id) reqIdx += 1;
    if (reqIdx >= required.length) {
      const expected = required.join(' → ');
      const actual = presentOrdered.join(' → ');
      issues.push({
        type: 'destination_sequence_violation',
        severity: 'feasibility',
        reasonCode: 'destination_sequence_violation',
        details:
          `Requested destination order is ${expected}; candidate plan visits ${actual}.`,
        expectedOrder: required,
        actualOrder: presentOrdered,
      });
      break;
    }
    reqIdx += 1;
  }
  return issues;
}

/**
 * User max daily drive preference (only when explicitly supplied).
 */
function validateMaxDailyDrive(itineraryData, tripScope, constraints = null) {
  const issues = [];
  const max =
    tripScope?.maxDailyDriveMinutes ??
    constraints?.maxDailyDriveMinutes ??
    null;
  if (max == null || !Number.isFinite(Number(max)) || Number(max) <= 0) return issues;

  const days = itineraryData?.days || [];
  for (let di = 0; di < days.length; di += 1) {
    const day = days[di];
    const drive = collectDayDriveMinutes(day);
    if (drive > Number(max)) {
      issues.push({
        type: 'max_daily_drive_exceeded',
        severity: 'feasibility',
        reasonCode: 'max_daily_drive_exceeded',
        details:
          `Day ${day.dayNumber || di + 1} exceeds the user's maximum daily driving limit ` +
          `(${Math.round(drive)} min drive vs ${max} min max).`,
        dayIndex: di,
        driveMinutes: drive,
        maxDailyDriveMinutes: Number(max),
      });
    }
  }
  return issues;
}

/**
 * Route-leg evidence completeness for explicit road trips.
 * Unknown legs must not be treated as verified feasible.
 */
function validateRouteLegCoverage(tripScope, { drivingEvidenceLegs = [] } = {}) {
  const issues = [];
  if (!tripScope || tripScope.type !== 'road_trip') return issues;

  for (const leg of tripScope.unresolvedRouteLegs || []) {
    issues.push({
      type: 'unresolved_route_leg',
      severity: 'feasibility',
      reasonCode: 'unresolved_route_leg',
      details:
        `Required route leg between ${leg.fromDisplayName || leg.fromEntityId || '?'} and ` +
        `${leg.toDisplayName || leg.toEntityId || '?'} cannot be verified ` +
        `(${leg.status}). Driving feasibility for this leg still needs verification.`,
      fromEntityId: leg.fromEntityId,
      toEntityId: leg.toEntityId,
      legStatus: leg.status,
      verifiedFeasible: false,
    });
  }

  const evidenceKeys = new Set(
    (drivingEvidenceLegs || []).map((e) => `${e.fromEntityId}|${e.toEntityId}`)
  );

  for (const leg of tripScope.routeLegs || []) {
    if (leg.status !== 'requires_driving_evidence') continue;
    const key = `${leg.fromEntityId}|${leg.toEntityId}`;
    const hasEvidence = evidenceKeys.has(key) || leg.driveDurationMinutes != null;
    if (!hasEvidence) {
      issues.push({
        type: 'missing_route_evidence',
        severity: 'feasibility',
        reasonCode: 'missing_route_evidence',
        details:
          `Required route leg between destination endpoints ` +
          `${leg.fromDisplayName || leg.fromEntityId} → ${leg.toDisplayName || leg.toEntityId} ` +
          `has no verified driving evidence. Cannot claim verified route feasibility.`,
        fromEntityId: leg.fromEntityId,
        toEntityId: leg.toEntityId,
        verifiedFeasible: false,
      });
    }
  }

  return issues;
}

/**
 * Global 14h guard + drive+activity combined feasibility.
 * Preserves existing schedule_overflow semantics; adds explicit combined reason.
 */
function validateDayDriveActivityFeasibility(itineraryData, {
  globalMaxActiveMinutes = GLOBAL_MAX_ACTIVE_MINUTES,
} = {}) {
  const issues = [];
  const days = itineraryData?.days || [];
  for (let di = 0; di < days.length; di += 1) {
    const day = days[di];
    if (!day?.stops?.length) continue;
    const drive = collectDayDriveMinutes(day);
    const activity = collectDayActivityMinutes(day);
    const buffer = Number(day.bufferMinutes) || 0;
    const total = drive + activity + buffer;
    if (total > globalMaxActiveMinutes) {
      issues.push({
        type: 'schedule_overflow',
        severity: 'feasibility',
        reasonCode: 'drive_activity_day_overflow',
        details:
          `Day ${day.dayNumber || di + 1} combines ~${Math.round(drive / 60 * 10) / 10}h driving + ` +
          `~${Math.round(activity / 60 * 10) / 10}h activities` +
          (buffer ? ` + ${Math.round(buffer / 60 * 10) / 10}h buffer` : '') +
          ` (${Math.round(total / 60 * 10) / 10}h) — exceeds ${globalMaxActiveMinutes / 60}h global feasibility guard.`,
        dayIndex: di,
        driveMinutes: drive,
        activityMinutes: activity,
        bufferMinutes: buffer,
        totalMinutes: total,
        globalMaxActiveMinutes,
        guardType: 'global_feasibility',
      });
    }
  }
  return issues;
}

/**
 * Overnight / end-location: ensure days retain destination identity when multi-dest.
 * Minimal structural check — not hotel inventory.
 */
function validateOvernightDestinationIdentity(itineraryData, tripScope) {
  const issues = [];
  if (!tripScope || !['multi_destination', 'road_trip'].includes(tripScope.type)) return issues;
  if ((tripScope.destinations || []).length < 2) return issues;

  const days = itineraryData?.days || [];
  for (let di = 0; di < days.length; di += 1) {
    const day = days[di];
    const endId =
      day?.overnightEntityId ||
      day?.endLocationEntityId ||
      day?.destinationEntityId ||
      day?.entityId ||
      (day?.parkCode ? `nps:park:${String(day.parkCode).toLowerCase()}` : null);

    // If overnightArea string exists without entity id, flag soft structural gap
    // only when no destination identity exists anywhere on the day.
    const hasStopIdentity = (day?.stops || []).some(
      (s) => s?.destinationEntityId || s?.entityId || s?.parkCode
    );
    if (!endId && !hasStopIdentity && (day?.overnightArea || day?.lodgingArea)) {
      issues.push({
        type: 'overnight_identity_missing',
        severity: 'preference',
        reasonCode: 'overnight_identity_missing',
        details:
          `Day ${day.dayNumber || di + 1} has overnight area text without a stable destination entity id.`,
        dayIndex: di,
      });
    }
  }
  return issues;
}

/**
 * Full Pass #3 validation suite.
 */
function validateRoadTripContract(itineraryData, tripScope, options = {}) {
  if (!itineraryData || !tripScope) return [];
  return [
    ...validateDestinationCoverage(itineraryData, tripScope),
    ...validateDestinationSequence(itineraryData, tripScope),
    ...evaluateRouteLegsAgainstDailyDriveCap({
      tripScope,
      drivingLegs: options.drivingEvidenceLegs || [],
      maxDailyDriveMinutes:
        tripScope.maxDailyDriveMinutes
        ?? options.constraints?.maxDailyDriveMinutes
        ?? null,
    }),
    ...validateMaxDailyDrive(itineraryData, tripScope, options.constraints),
    ...validateRouteLegCoverage(tripScope, options),
    ...validateDayDriveActivityFeasibility(itineraryData, options),
    ...validateOvernightDestinationIdentity(itineraryData, tripScope),
  ];
}

/**
 * Refinement helpers — recompute tripScope destinations without provider calls.
 */
function refineTripScopeAddDestination(tripScope, destination) {
  if (!tripScope || !destination?.entityId) return tripScope;
  const existing = (tripScope.destinations || []).some((d) => d.entityId === destination.entityId);
  if (existing) return tripScope;
  const destinations = [
    ...(tripScope.destinations || []),
    { ...destination, order: (tripScope.destinations || []).length },
  ];
  const { routeLegs, unresolvedRouteLegs } = buildRouteLegs({
    origin: tripScope.type === 'road_trip' ? tripScope.origin : null,
    destinations,
    routeShape: tripScope.routeShape || 'unknown',
  });
  return { ...tripScope, destinations, routeLegs, unresolvedRouteLegs };
}

function refineTripScopeRemoveDestination(tripScope, entityId) {
  if (!tripScope || !entityId) return tripScope;
  const destinations = (tripScope.destinations || [])
    .filter((d) => d.entityId !== entityId)
    .map((d, i) => ({ ...d, order: i }));
  const { routeLegs, unresolvedRouteLegs } = buildRouteLegs({
    origin: tripScope.type === 'road_trip' ? tripScope.origin : null,
    destinations,
    routeShape: tripScope.routeShape || 'unknown',
  });
  return { ...tripScope, destinations, routeLegs, unresolvedRouteLegs };
}

function refineTripScopeRouteShape(tripScope, routeShape) {
  if (!tripScope || !routeShape) return tripScope;
  const { routeLegs, unresolvedRouteLegs } = buildRouteLegs({
    origin: tripScope.type === 'road_trip' ? tripScope.origin : null,
    destinations: tripScope.destinations || [],
    routeShape,
  });
  return {
    ...tripScope,
    routeShape,
    routeLegs,
    unresolvedRouteLegs,
  };
}

module.exports = {
  GLOBAL_MAX_ACTIVE_MINUTES,
  collectPlanDestinationIds,
  collectDayDriveMinutes,
  collectDayActivityMinutes,
  validateDestinationCoverage,
  validateDestinationSequence,
  validateMaxDailyDrive,
  validateRouteLegCoverage,
  validateDayDriveActivityFeasibility,
  validateOvernightDestinationIdentity,
  validateRoadTripContract,
  refineTripScopeAddDestination,
  refineTripScopeRemoveDestination,
  refineTripScopeRouteShape,
};
