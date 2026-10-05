'use strict';

/**
 * Phase 9C.1B — continuous-activity grouping validation/normalization.
 *
 * A group means only: "these stops are one continuous traveler activity, so
 * adjacency between them must not be independently read as a driving leg."
 * It does not imply shared geographic identity, does not merge map pins,
 * and does not assert any travel mode — see `drivingTimesContextService.js`
 * for the one consumer that currently reads this.
 *
 * Deliberately conservative: an invalid or dangling group (e.g. after a
 * repair pass changed/removed a stop) is DROPPED, never repaired, rewritten,
 * or guessed at. `stop.id` is the only endpoint identity guaranteed to
 * survive every existing repair pass (Phase 9C.1A recon); `order`/array
 * position must never be used to reconcile group membership.
 */

const { entityFromStop } = require('./routeEvidenceDriveBridge');

/**
 * Validate and normalize one day's `activityGroups`, dropping (not fixing)
 * anything invalid:
 *   - fewer than 2 stop ids after de-dup
 *   - a stop id listed twice within the same group (authoring error)
 *   - a stop id that does not exist among this day's stops
 *   - a stop id already claimed by an earlier, valid group in this day
 *     (a stop cannot belong to more than one continuous-activity group;
 *     first group wins, in array order)
 *   - structured visitor_center members, differing known destination entities,
 *     out-of-order members, or an otherwise-valid authored internal transfer
 *   - members that do not occupy one CONTIGUOUS run of the day's current stop
 *     sequence (Phase 9C.1D.2 — an unrelated stop interrupting a supposedly
 *     continuous activity is a semantic contradiction, not a repairable gap)
 */
function normalizeDayActivityGroups(day) {
  const groups = Array.isArray(day?.activityGroups) ? day.activityGroups : [];
  if (groups.length === 0) return [];

  const stops = Array.isArray(day?.stops) ? day.stops : [];
  const dayStopIds = new Set(stops.map((s) => s?.id).filter(Boolean));
  const indexById = new Map();
  stops.forEach((s, i) => { if (s?.id) indexById.set(s.id, i); });
  // Defer this import because travelEdgeValidation uses stopsShareActivityGroup.
  // Test already-authored edges under ordinary rules with group suppression
  // removed. A valid internal transfer contradicts the proposed group; the
  // caller revalidates edges against the surviving groups afterward.
  const { normalizeDayTravelEdges } = require('./travelEdgeValidation');
  const authoredEdges = normalizeDayTravelEdges({ ...day, activityGroups: [] });
  const claimed = new Set();
  const valid = [];

  for (const group of groups) {
    const rawIds = Array.isArray(group?.stopIds) ? group.stopIds.filter(Boolean) : [];
    const uniqueIds = [...new Set(rawIds)];
    if (rawIds.length !== uniqueIds.length) continue; // a stop id listed twice — authoring error
    if (uniqueIds.length < 2) continue;
    if (!uniqueIds.every((id) => dayStopIds.has(id))) continue; // dangling reference
    if (uniqueIds.some((id) => claimed.has(id))) continue; // already in an earlier group

    const memberIndices = uniqueIds.map((id) => indexById.get(id));
    if (memberIndices.some((index, i) => i > 0 && index <= memberIndices[i - 1])) continue;
    const members = memberIndices.map((index) => stops[index]);
    if (members.some((stop) => stop.type === 'visitor_center')) continue;
    // Missing destination identity is not itself a contradiction.
    if (new Set(members.map(entityFromStop).filter(Boolean)).size > 1) continue;
    if (authoredEdges.some((edge) => uniqueIds.includes(edge.sourceStopId)
      && uniqueIds.includes(edge.targetStopId))) continue;
    const span = memberIndices[memberIndices.length - 1] - memberIndices[0] + 1;
    if (span !== memberIndices.length) continue; // not a contiguous run — an unrelated stop is between members

    for (const id of uniqueIds) claimed.add(id);
    valid.push({ id: group.id || null, stopIds: uniqueIds });
  }

  return valid;
}

/** Normalize every day's activityGroups in place-equivalent (returns the same object, mutated). */
function normalizeItineraryActivityGroups(itineraryData) {
  for (const day of itineraryData?.days || []) {
    if (day && (day.activityGroups !== undefined)) {
      day.activityGroups = normalizeDayActivityGroups(day);
    }
  }
  return itineraryData;
}

/** Do two stop ids belong to the same (already-normalized) continuous-activity group on this day? */
function stopsShareActivityGroup(day, stopIdA, stopIdB) {
  if (!stopIdA || !stopIdB) return false;
  const groups = Array.isArray(day?.activityGroups) ? day.activityGroups : [];
  return groups.some((g) => (
    Array.isArray(g?.stopIds) && g.stopIds.includes(stopIdA) && g.stopIds.includes(stopIdB)
  ));
}

module.exports = {
  normalizeDayActivityGroups,
  normalizeItineraryActivityGroups,
  stopsShareActivityGroup,
};
