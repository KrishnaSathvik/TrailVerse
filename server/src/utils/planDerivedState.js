'use strict';

/**
 * Derived plan state is valid only for one plan revision.
 *
 * Trip facts persist. The canonical days version through bounded mutations.
 * Drive times, routes, logistics envelopes, and warnings are conclusions about
 * a specific plan — they may not outlive the hash they were computed for.
 */

function stampPlanDerived(artifact, planHash) {
  if (artifact == null || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return artifact;
  }
  if (!planHash || typeof planHash !== 'string') return artifact;
  return { ...artifact, planHash };
}

function isPlanDerivedCurrent(artifact, planHash) {
  if (!planHash || typeof planHash !== 'string') return false;
  if (artifact == null) return true;
  if (typeof artifact !== 'object' || Array.isArray(artifact)) return false;
  return artifact.planHash === planHash;
}

/**
 * Legs on a changed day cannot keep minutes measured for a different stop
 * sequence. Untouched days keep their verified drives.
 */
function clearDerivedDriveStateOnDays(plan, touchedDayNumbers = []) {
  if (!plan || !Array.isArray(plan.days) || touchedDayNumbers.length === 0) {
    return plan;
  }
  const touched = new Set(
    touchedDayNumbers.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
  );
  if (touched.size === 0) return plan;

  const days = plan.days.map((day, index) => {
    const dayNumber = Number(day?.dayNumber ?? day?.day ?? index + 1);
    if (!touched.has(dayNumber)) return day;
    const stops = Array.isArray(day.stops)
      ? day.stops.map((stop) => {
        if (!stop || typeof stop !== 'object') return stop;
        if (stop.drivingTimeFromPreviousMin == null
          && stop.drivingDistanceFromPreviousMiles == null
          && day.totalDriveMinutes == null) {
          return stop;
        }
        const next = { ...stop };
        if (Object.prototype.hasOwnProperty.call(next, 'drivingTimeFromPreviousMin')) {
          next.drivingTimeFromPreviousMin = null;
        }
        if (Object.prototype.hasOwnProperty.call(next, 'drivingDistanceFromPreviousMiles')) {
          next.drivingDistanceFromPreviousMiles = null;
        }
        return next;
      })
      : day.stops;
    const nextDay = { ...day, stops };
    if (Object.prototype.hasOwnProperty.call(nextDay, 'totalDriveMinutes')) {
      nextDay.totalDriveMinutes = null;
    }
    return nextDay;
  });
  return { ...plan, days };
}

function bindDerivedSurfaces({
  planHash = null,
  travelLogistics = null,
  response = null,
  warnings = null,
  route = null,
} = {}) {
  if (!planHash) {
    return { travelLogistics, response, warnings, route };
  }
  return {
    travelLogistics: stampPlanDerived(travelLogistics, planHash),
    response: stampPlanDerived(response, planHash),
    warnings: stampPlanDerived(warnings, planHash),
    route: stampPlanDerived(route, planHash),
  };
}

module.exports = {
  stampPlanDerived,
  isPlanDerivedCurrent,
  clearDerivedDriveStateOnDays,
  bindDerivedSurfaces,
};
