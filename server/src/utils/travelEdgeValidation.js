'use strict';

/**
 * Phase 9C.1D.2 — minimal canonical same-destination travel-edge semantics.
 *
 * A `travelEdge` means only: "the traveler is intended to transfer from this
 * independent experience/location to that one." It is deliberately minimal:
 *   { sourceStopId, targetStopId, relationship: 'transfer', modeIntent?: 'drive' }
 * No id, duration, distance, route status, verification status, provider
 * fields, coordinates, or prose.
 *
 * Phase 9C.1F.2 — `modeIntent:'drive'` is the ONE optional positive mode. It is
 * model-authored per edge and server-AUTHORIZED against the durable 9C.1F.1
 * transport policy supplied in `context.transportation`; it is never
 * synthesized from availability, and an unauthorized/unsupported mode is
 * stripped while the otherwise-valid transfer edge is KEPT (invalid mode ≠
 * invalid transfer). Absent field = unknown. A kept mode is planning intent,
 * not route evidence — routing (9C.2) must re-authorize against the CURRENT
 * policy before any dispatch. A stable future edge identity is
 * derivable from (day identity, sourceStopId, targetStopId, relationship) —
 * no separate model-authored edge id is introduced.
 *
 * Boundary with activityGroups:
 *   activityGroups = internal structure of ONE continuous traveler experience
 *   travelEdges    = intentional transfer between INDEPENDENT experiences
 * so an edge between two stops already sharing an activity group is invalid
 * (the group already owns that relationship), and an edge touching a group
 * must connect at that group's physical entry/exit boundary — its first
 * member as a target, its last member as a source — never an internal
 * waypoint.
 *
 * Boundary with destination-level route evidence: a same-day transition
 * between two DIFFERENT destination entities is `roadTripContract` /
 * `routeEvidenceDriveBridge` territory (including within a single day), so a
 * cross-destination stop-level edge is invalid here — never a duplicate
 * representation of that same transfer.
 *
 * Deliberately conservative, same fail-safe policy as `activityGroupValidation`:
 * anything structurally invalid/ambiguous is DROPPED, never repaired,
 * reversed, or guessed at by adjacency/name/coordinate heuristics.
 */

const { stopsShareActivityGroup } = require('./activityGroupValidation');
const { entityFromStop } = require('./routeEvidenceDriveBridge');
const { authorizeTravelEdgeModeIntent } = require('./transportConstraintContract');

const ALLOWED_RELATIONSHIPS = new Set(['transfer']);

/** Group boundary check: is `stopId` the first/last member of its group, by current day sequence? */
function isGroupBoundaryStop(day, groups, indexById, stopId, boundary) {
  const group = groups.find((g) => g.stopIds.includes(stopId));
  if (!group) return true; // not in any group — no boundary constraint applies
  const memberIndices = group.stopIds.map((id) => indexById.get(id));
  const boundaryIndex = boundary === 'last' ? Math.max(...memberIndices) : Math.min(...memberIndices);
  return indexById.get(stopId) === boundaryIndex;
}

/**
 * Validate and normalize one day's `travelEdges`, dropping (not fixing)
 * anything invalid. Assumes `day.activityGroups` is already normalized
 * (contiguous, deduplicated) — normalize activity groups first.
 */
function normalizeDayTravelEdges(day, context = null) {
  const edges = Array.isArray(day?.travelEdges) ? day.travelEdges : [];
  if (edges.length === 0) return [];
  // Only `context.transportation` (planningState.transportation) is authority.
  // No context → no authority → every proposed mode is stripped.
  const transportation = context && typeof context === 'object' ? context.transportation || null : null;

  const stops = Array.isArray(day?.stops) ? day.stops : [];
  const indexById = new Map();
  stops.forEach((s, i) => { if (s?.id) indexById.set(s.id, i); });
  const groups = Array.isArray(day?.activityGroups) ? day.activityGroups : [];

  const seenPairs = new Set();
  const valid = [];

  for (const rawEdge of edges) {
    const relationship = rawEdge?.relationship;
    if (!ALLOWED_RELATIONSHIPS.has(relationship)) continue;

    const sourceStopId = rawEdge?.sourceStopId;
    const targetStopId = rawEdge?.targetStopId;
    if (!sourceStopId || !targetStopId) continue;
    if (sourceStopId === targetStopId) continue;
    if (!indexById.has(sourceStopId) || !indexById.has(targetStopId)) continue; // dangling reference

    const sourceIndex = indexById.get(sourceStopId);
    const targetIndex = indexById.get(targetStopId);
    if (sourceIndex >= targetIndex) continue; // backward/self — never reversed, just dropped

    if (stopsShareActivityGroup(day, sourceStopId, targetStopId)) continue; // group already owns this

    if (!isGroupBoundaryStop(day, groups, indexById, sourceStopId, 'last')) continue;
    if (!isGroupBoundaryStop(day, groups, indexById, targetStopId, 'first')) continue;

    const sourceEntity = entityFromStop(stops[sourceIndex]);
    const targetEntity = entityFromStop(stops[targetIndex]);
    if (sourceEntity !== targetEntity) continue; // cross-destination — routeEvidenceDriveBridge owns it

    const pairKey = `${sourceStopId}=>${targetStopId}`;
    if (seenPairs.has(pairKey)) continue; // exact duplicate
    seenPairs.add(pairKey);

    const modeIntent = authorizeTravelEdgeModeIntent(rawEdge?.modeIntent, transportation);
    valid.push({
      sourceStopId,
      targetStopId,
      relationship: 'transfer',
      ...(modeIntent ? { modeIntent } : {}),
    });
  }

  return valid;
}

/** Normalize every day's travelEdges in place-equivalent (returns the same object, mutated). */
function normalizeItineraryTravelEdges(itineraryData, context = null) {
  for (const day of itineraryData?.days || []) {
    if (day && day.travelEdges !== undefined) {
      day.travelEdges = normalizeDayTravelEdges(day, context);
    }
  }
  return itineraryData;
}

/** Pure lookup — never dispatches routing, mutates nothing. */
function findTravelEdge(day, sourceStopId, targetStopId) {
  const edges = Array.isArray(day?.travelEdges) ? day.travelEdges : [];
  return edges.find((e) => e.sourceStopId === sourceStopId && e.targetStopId === targetStopId) || null;
}

module.exports = {
  normalizeDayTravelEdges,
  normalizeItineraryTravelEdges,
  findTravelEdge,
};
