'use strict';

/**
 * Bridge verified Maps driving_time evidence into canonical road-trip drive minutes.
 *
 * Authoritative flow:
 *   EvidenceBundle durationSeconds
 *     → route leg minutes (by origin/destination entityId)
 *     → itinerary day/stop drive fields
 *     → validateMaxDailyDrive / day feasibility
 *
 * Model-emitted drive minutes cannot weaken verified Maps truth.
 */

function asEntityId(value) {
  if (value == null || value === '') return null;
  return String(value).trim().toLowerCase() || null;
}

function entityFromStop(stop) {
  if (!stop || typeof stop !== 'object') return null;
  return (
    asEntityId(stop.destinationEntityId)
    || asEntityId(stop.entityId)
    || asEntityId(stop.parkEntityId)
    || (stop.parkCode ? asEntityId(`nps:park:${String(stop.parkCode).trim()}`) : null)
  );
}

function entityFromDay(day) {
  if (!day || typeof day !== 'object') return null;
  return (
    asEntityId(day.destinationEntityId)
    || asEntityId(day.entityId)
    || asEntityId(day.parkEntityId)
    || (day.parkCode ? asEntityId(`nps:park:${String(day.parkCode).trim()}`) : null)
  );
}

function collapseConsecutive(ids = []) {
  const out = [];
  for (const id of ids) {
    if (!id) continue;
    if (out.length === 0 || out[out.length - 1] !== id) out.push(id);
  }
  return out;
}

function minutesFromDurationSeconds(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.max(1, Math.round(n / 60));
}

/**
 * Extract verified adjacent driving legs from a frozen EvidenceBundle.
 * Match key: originEntityId|destinationEntityId from claim subject/object or scope.route.
 */
function extractDrivingLegsFromEvidenceBundle(evidenceBundle) {
  const legs = [];
  for (const item of evidenceBundle?.evidence || []) {
    if (item?.topic !== 'driving_time') continue;
    if (item?.claim?.polarity === 'negative') continue;
    const route = item.scope?.route || {};
    const fromEntityId = asEntityId(
      route.originEntityId || item.claim?.subjectId || null
    );
    const toEntityId = asEntityId(
      route.destinationEntityId || item.claim?.objectId || item.entityId || null
    );
    const durationSeconds = Number(item.claim?.normalizedValue?.durationSeconds);
    const durationMinutes = minutesFromDurationSeconds(durationSeconds);
    if (!fromEntityId || !toEntityId || durationMinutes == null) continue;
    legs.push({
      fromEntityId,
      toEntityId,
      durationSeconds,
      durationMinutes,
      distanceMeters: Number.isFinite(Number(item.claim?.normalizedValue?.distanceMeters))
        ? Number(item.claim.normalizedValue.distanceMeters)
        : null,
      source: 'evidence_bundle',
    });
  }
  return legs;
}

function legKey(fromEntityId, toEntityId) {
  return `${asEntityId(fromEntityId)}|${asEntityId(toEntityId)}`;
}

function indexDrivingLegs(drivingLegs = []) {
  const map = new Map();
  for (const leg of drivingLegs) {
    if (!leg?.fromEntityId || !leg?.toEntityId) continue;
    map.set(legKey(leg.fromEntityId, leg.toEntityId), leg);
  }
  return map;
}

/**
 * Pre-generation / hard feasibility: any single mandatory adjacent leg whose
 * verified duration alone exceeds the user's daily drive cap is intrinsically
 * incompatible with keeping that direct leg on one calendar day.
 */
function evaluateRouteLegsAgainstDailyDriveCap({
  tripScope = null,
  drivingLegs = [],
  maxDailyDriveMinutes = null,
} = {}) {
  const max = maxDailyDriveMinutes ?? tripScope?.maxDailyDriveMinutes ?? null;
  if (max == null || !Number.isFinite(Number(max)) || Number(max) <= 0) return [];
  const byKey = indexDrivingLegs(drivingLegs);
  const issues = [];

  for (const leg of tripScope?.routeLegs || []) {
    if (!leg?.fromEntityId || !leg?.toEntityId) continue;
    if (leg.status && ![
      'requires_driving_evidence',
      'evidence_attached',
      'verified',
    ].includes(leg.status) && leg.driveDurationMinutes == null) {
      continue;
    }
    const hit = byKey.get(legKey(leg.fromEntityId, leg.toEntityId));
    const minutes = hit?.durationMinutes
      ?? (Number.isFinite(Number(leg.driveDurationMinutes))
        ? Number(leg.driveDurationMinutes)
        : null);
    if (minutes == null) continue;
    if (minutes > Number(max)) {
      issues.push({
        type: 'route_leg_exceeds_daily_drive_cap',
        severity: 'feasibility',
        reasonCode: 'route_leg_exceeds_daily_drive_cap',
        details:
          `Required route leg ${leg.fromDisplayName || leg.fromEntityId} → ` +
          `${leg.toDisplayName || leg.toEntityId} is ~${minutes} min of verified driving, ` +
          `which exceeds the user's maximum of ${max} min per day.`,
        fromEntityId: leg.fromEntityId,
        toEntityId: leg.toEntityId,
        driveMinutes: minutes,
        maxDailyDriveMinutes: Number(max),
        verifiedFeasible: false,
      });
    }
  }
  return issues;
}

function buildRouteLegCapInfeasibleMessage(issues = [], tripScope = null) {
  const first = issues[0];
  if (!first) {
    return "I can't build a verified itinerary that respects your daily driving limit with the requested route.";
  }
  const hours = Math.round((first.driveMinutes / 60) * 10) / 10;
  const from = first.fromDisplayName
    || tripScope?.routeLegs?.find((l) => l.fromEntityId === first.fromEntityId)?.fromDisplayName
    || first.fromEntityId;
  const to = first.toDisplayName
    || tripScope?.routeLegs?.find((l) => l.toEntityId === first.toEntityId)?.toDisplayName
    || first.toEntityId;
  const capH = Math.round((first.maxDailyDriveMinutes / 60) * 10) / 10;
  return (
    `${from} → ${to} is about ${hours} hours of verified driving, which exceeds your ` +
    `${capH}-hour daily driving limit. With the requested destination order, I can't verify ` +
    `an itinerary that satisfies that limit without adding an intermediate overnight/stop ` +
    `or changing the driving constraint.`
  );
}

/**
 * Hydrate tripScope.routeLegs.driveDurationMinutes from verified evidence (mutable copy).
 */
function hydrateTripScopeRouteLegs(tripScope, drivingLegs = []) {
  if (!tripScope?.routeLegs?.length) return tripScope;
  const byKey = indexDrivingLegs(drivingLegs);
  const nextLegs = tripScope.routeLegs.map((leg) => {
    const hit = byKey.get(legKey(leg.fromEntityId, leg.toEntityId));
    if (!hit) return { ...leg };
    return {
      ...leg,
      driveDurationMinutes: hit.durationMinutes,
      status: leg.status === 'requires_driving_evidence' ? 'evidence_attached' : leg.status,
    };
  });
  return { ...tripScope, routeLegs: nextLegs };
}

/**
 * Attach verified drive minutes onto itinerary transitions.
 * Convention: an A→B inter-destination leg is charged to the day that first
 * arrives at B (does not double-count across the prior overnight day).
 * Within a day, consecutive destination changes sum.
 * Verified Maps minutes override contradictory model drivingTimeFromPreviousMin.
 */
/**
 * Phase 9C.1B — a model-authored `drivingTimeFromPreviousMin` is candidate
 * data, not verified route truth (the same principle Phase 9B.1 established
 * for coordinates). This strips every stop's value to null so that only a
 * VERIFIED assignment made below can populate it — previously, a stop this
 * function never touched (no matching leg, or no evidence at all) silently
 * kept whatever the model wrote, which is exactly the unverified-authority
 * leak this phase closes.
 */
function stripUnverifiedDrivingTimes(itineraryData) {
  for (const day of itineraryData?.days || []) {
    for (const stop of day?.stops || []) {
      if (stop) stop.drivingTimeFromPreviousMin = null;
    }
  }
  return itineraryData;
}

function enrichItineraryWithRouteEvidence({
  itineraryData,
  tripScope = null,
  evidenceBundle = null,
  drivingLegs = null,
} = {}) {
  const legs = Array.isArray(drivingLegs)
    ? drivingLegs
    : extractDrivingLegsFromEvidenceBundle(evidenceBundle);
  const byKey = indexDrivingLegs(legs);
  const hydratedScope = hydrateTripScopeRouteLegs(
    tripScope ? JSON.parse(JSON.stringify(tripScope)) : null,
    legs
  );

  if (!itineraryData?.days?.length) {
    return {
      itineraryData,
      tripScope: hydratedScope || tripScope,
      drivingEvidenceLegs: legs,
    };
  }

  if (byKey.size === 0) {
    return {
      itineraryData: stripUnverifiedDrivingTimes(JSON.parse(JSON.stringify(itineraryData))),
      tripScope: hydratedScope || tripScope,
      drivingEvidenceLegs: legs,
    };
  }

  const next = stripUnverifiedDrivingTimes(JSON.parse(JSON.stringify(itineraryData)));
  let previousDest = asEntityId(hydratedScope?.origin?.entityId) || null;

  for (const day of next.days || []) {
    const stopIds = collapseConsecutive((day.stops || []).map(entityFromStop));
    const dayDest = stopIds[0] || entityFromDay(day);
    const transitions = [];

    // Overnight → this day's first destination
    if (previousDest && dayDest && previousDest !== dayDest) {
      const inbound = byKey.get(legKey(previousDest, dayDest));
      if (inbound) transitions.push(inbound);
    }

    // Within-day destination changes
    let cursor = dayDest || previousDest;
    for (let i = 1; i < stopIds.length; i += 1) {
      const id = stopIds[i];
      if (!cursor || !id || cursor === id) {
        cursor = id || cursor;
        continue;
      }
      const hit = byKey.get(legKey(cursor, id));
      if (hit) transitions.push(hit);
      cursor = id;
    }

    // Deduplicate identical legs if overnight + first within-day overlap
    const unique = [];
    const seen = new Set();
    for (const t of transitions) {
      const key = legKey(t.fromEntityId, t.toEntityId);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(t);
    }

    const evidenceDrive = unique.reduce((sum, t) => sum + Number(t.durationMinutes || 0), 0);
    if (evidenceDrive > 0) {
      const priorTotal = Number(day.totalDriveMinutes);
      day.totalDriveMinutes = Number.isFinite(priorTotal)
        ? Math.max(priorTotal, evidenceDrive)
        : evidenceDrive;

      if (Array.isArray(day.stops) && day.stops.length > 0) {
        // Attach inbound overnight→day transition to first stop (Maps wins).
        if (previousDest && dayDest && previousDest !== dayDest) {
          const inbound = byKey.get(legKey(previousDest, dayDest));
          if (inbound) {
            day.stops[0].drivingTimeFromPreviousMin = inbound.durationMinutes;
          }
        }
        // Attach subsequent within-day transitions to the first stop of each new dest.
        let walkPrev = dayDest || previousDest;
        for (let si = 1; si < day.stops.length; si += 1) {
          const id = entityFromStop(day.stops[si]);
          if (!id) continue;
          if (walkPrev && id !== walkPrev) {
            const hit = byKey.get(legKey(walkPrev, id));
            if (hit) {
              const modelVal = Number(day.stops[si].drivingTimeFromPreviousMin);
              day.stops[si].drivingTimeFromPreviousMin = hit.durationMinutes;
              // Maps authoritative: even if model said a lower number, overwrite.
              if (Number.isFinite(modelVal) && modelVal !== hit.durationMinutes) {
                day.stops[si].drivingTimeFromPreviousMin = hit.durationMinutes;
              }
            }
            walkPrev = id;
          } else if (!walkPrev) {
            walkPrev = id;
          }
        }
      }
    }

    previousDest = stopIds[stopIds.length - 1] || dayDest || previousDest;
  }

  return {
    itineraryData: next,
    tripScope: hydratedScope || tripScope,
    drivingEvidenceLegs: legs,
  };
}

function textClaimsRouteTimingUnavailable(text) {
  const blob = String(text || '');
  if (!blob.trim()) return false;
  if (/\b(?:does not|doesn't|do not)\s+establish\b[\s\S]{0,100}\b(?:route[- ]specific\s+)?driv(?:e|ing)\s+time\b/i.test(blob)) {
    return true;
  }
  if (/\b(?:no|without|unavailable|not (?:yet )?available)\b[\s\S]{0,60}\b(?:route[- ]specific\s+)?driv(?:e|ing)\s+(?:time|duration)\b/i.test(blob)) {
    return true;
  }
  if (/\bsupplied evidence\b[\s\S]{0,80}\b(?:does not|doesn't)\b[\s\S]{0,40}\bdriv/i.test(blob)) {
    return true;
  }
  return false;
}

/**
 * Prose must not claim route timing is unavailable when verified driving_time exists.
 */
function detectRouteEvidenceProseConflict(text, evidenceBundleOrLegs) {
  const legs = Array.isArray(evidenceBundleOrLegs)
    ? evidenceBundleOrLegs
    : extractDrivingLegsFromEvidenceBundle(evidenceBundleOrLegs);
  if (!legs.length) return [];
  if (!textClaimsRouteTimingUnavailable(text)) return [];
  return ['route_evidence_prose_conflict'];
}

module.exports = {
  asEntityId,
  buildRouteLegCapInfeasibleMessage,
  detectRouteEvidenceProseConflict,
  enrichItineraryWithRouteEvidence,
  entityFromDay,
  entityFromStop,
  evaluateRouteLegsAgainstDailyDriveCap,
  extractDrivingLegsFromEvidenceBundle,
  hydrateTripScopeRouteLegs,
  minutesFromDurationSeconds,
  textClaimsRouteTimingUnavailable,
};
