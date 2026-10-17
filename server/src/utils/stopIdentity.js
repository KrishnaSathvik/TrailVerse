'use strict';

// One rule for "is this the same accepted place?", shared by grounding and the
// mutation guard. Identity is preserved only when every identity-bearing field
// of an accepted canonical stop is unchanged; anything else is re-grounded.
const norm = (value) => String(value || '').trim().toLowerCase();

function identityFingerprint(stop) {
  const location = stop?.location || {};
  return JSON.stringify([norm(stop?.name), stop?.evidenceRef || null, stop?.canonicalPlaceId || null,
    location.lat ?? null, location.lon ?? null, location.sourceRef || null, location.status || null]);
}

function acceptedStopsById(plan) {
  const byId = new Map();
  for (const day of plan?.days || []) for (const stop of day.stops || []) if (stop?.id) byId.set(stop.id, stop);
  return byId;
}

/** The prior accepted stop this stop may keep its identity from, or null. */
function preservedIdentitySource(stop, priorById) {
  const prior = stop?.id ? priorById.get(stop.id) : null;
  if (!prior?.canonicalPlaceId || !prior.evidenceRef) return null;
  const resolved = prior.resolutionStatus === 'resolved' || prior.location?.status === 'resolved';
  if (!resolved) return null;
  return identityFingerprint(prior) === identityFingerprint(stop) ? prior : null;
}

/** Stops in `days` that are new or whose identity changed relative to `priorPlan`. */
function identityChangedStops(priorPlan, days) {
  const priorById = acceptedStopsById(priorPlan);
  return (days || []).flatMap((day) => (day.stops || []).filter((stop) => !preservedIdentitySource(stop, priorById)));
}

/** Accepted transfer edges keyed by their stop pair. */
function acceptedEdgesByPair(plan) {
  const edges = new Map();
  for (const day of plan?.days || []) for (const edge of day.travelEdges || []) {
    if (edge?.sourceStopId && edge?.targetStopId) edges.set(`${edge.sourceStopId}->${edge.targetStopId}`, edge);
  }
  return edges;
}

module.exports = { identityFingerprint, acceptedStopsById, preservedIdentitySource, identityChangedStops, acceptedEdgesByPair };
