'use strict';

const { hashPayload } = require('./canonicalResponse');
const { fingerprintCandidateStops } = require('./geoResolutionArtifact');
const { entityIdForEvidence } = require('./stableEvidenceEntity');
const { entityFromStop, minutesFromDurationSeconds } = require('./routeEvidenceDriveBridge');
const { hasAuthoritativeCoordinates } = require('./coordinateValidation');
const { canAuthorizeDrivingIntent } = require('./transportConstraintContract');
const { normalizeDayTravelEdges } = require('./travelEdgeValidation');
const { createMapsEvidenceProvider } = require('../services/providers/mapsEvidenceProvider');
const { semanticFingerprint } = require('../services/evidenceRefreshCoordinator');

const clone = (value) => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function emptyRouteCounts() {
  return { applicableEdges: 0, eligibleEdges: 0, dispatches: 0, verified: 0, noResult: 0,
    providerFailure: 0, cancelled: 0, discarded: 0, ineligibleMissingIdentity: 0,
    ineligibleMissingCoordinates: 0, ineligiblePolicy: 0, ineligibleProjection: 0, destinationOwned: 0 };
}
function dayKey(day, index) { return { dayId: day.id ?? null, dayNumber: day.dayNumber ?? null, dayIndex: index, date: day.date ?? null }; }
function targetKey(day, index, stop) {
  return hashPayload({ ...dayKey(day, index), stopId: stop.id ?? null, destination: entityFromStop(stop) });
}
// Call only on the bridge's server-produced output, never the model payload.
function captureDestinationRouteOwnership(itineraryData) {
  const owned = {};
  (itineraryData?.days || []).forEach((day, index) => {
    for (const stop of day.stops || []) {
      if (typeof stop.drivingTimeFromPreviousMin === 'number' && Number.isFinite(stop.drivingTimeFromPreviousMin)
        && stop.drivingTimeFromPreviousMin >= 0) owned[targetKey(day, index, stop)] = stop.drivingTimeFromPreviousMin;
    }
  });
  return freeze(owned);
}
function captureDriveIntents(itineraryData) {
  return (itineraryData?.days || []).flatMap((day, index) => (Array.isArray(day?.travelEdges) ? day.travelEdges : [])
    .filter((edge) => edge?.modeIntent === 'drive')
    .map((edge) => ({ dayIndex: index, sourceStopId: edge.sourceStopId, targetStopId: edge.targetStopId })));
}
function departureBucket(value = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid route departure clock');
  const original = date.getTime();
  date.setUTCMinutes(0, 0, 0);
  if (date.getTime() < original) date.setUTCHours(date.getUTCHours() + 1);
  return date.toISOString();
}
function routeFingerprint(candidateFingerprint, binding) {
  return hashPayload({ version: 'stop-route-v1', candidateFingerprint, binding });
}
function endpoint(stop, evidenceBundle) {
  const matches = (evidenceBundle?.evidence || []).filter((e) => e.evidenceId === stop?.evidenceRef);
  const name = matches[0]?.claim?.normalizedValue?.name;
  if (matches.length !== 1 || !stop.canonicalPlaceName
    || typeof name !== 'string' || name.trim() !== stop.canonicalPlaceName) return null;
  return entityIdForEvidence(matches[0]);
}
function coordinates(stop) {
  return { latitude: Number(stop.latitude), longitude: Number(stop.longitude), coordinateSource: stop.coordinateSource };
}

// Consumes the finalizer's canonical, already-normalized graph. No edge or
// transport policy is inferred here, and no second normalizer is introduced.
function planStopRoutes({ itineraryData, evidenceBundle, transportation, destinationOwned = {}, departureTimeBucket, proposedDriveIntents = [] }) {
  const candidateFingerprint = fingerprintCandidateStops(itineraryData);
  const counts = emptyRouteCounts();
  const entries = [];
  (itineraryData?.days || []).forEach((day, dayIndex) => {
    const stops = day.stops || [];
    const edges = day.travelEdges || [];
    // Reuse the canonical validator when rechecking after an await, too. A
    // newly changed activity group may invalidate an otherwise unchanged edge.
    const surviving = normalizeDayTravelEdges(day, { transportation });
    for (const edge of edges) {
      if (edge.relationship !== 'transfer') continue;
      const wasDrive = proposedDriveIntents.some((p) => p.dayIndex === dayIndex
        && p.sourceStopId === edge.sourceStopId && p.targetStopId === edge.targetStopId);
      if (edge.modeIntent !== 'drive' && !(wasDrive && !canAuthorizeDrivingIntent(transportation))) continue;
      counts.applicableEdges += 1;
      if (edge.modeIntent !== 'drive' || !canAuthorizeDrivingIntent(transportation)) { counts.ineligiblePolicy += 1; continue; }
      const sources = stops.filter((s) => s.id === edge.sourceStopId);
      const targets = stops.filter((s) => s.id === edge.targetStopId);
      if (sources.length !== 1 || targets.length !== 1) { counts.ineligibleProjection += 1; continue; }
      const source = sources[0]; const target = targets[0];
      const destination = entityFromStop(source);
      if (!destination || destination.startsWith('unresolved:') || destination !== entityFromStop(target)) {
        counts.ineligibleMissingIdentity += 1; continue;
      }
      if (!surviving.some((e) => e.sourceStopId === edge.sourceStopId && e.targetStopId === edge.targetStopId)) {
        counts.ineligibleProjection += 1; continue;
      }
      if (Object.hasOwn(destinationOwned, targetKey(day, dayIndex, target))) { counts.destinationOwned += 1; continue; }
      if (stops.indexOf(target) === 0 || stops[stops.indexOf(target) - 1] !== source
        || edges.filter((e) => e.relationship === 'transfer' && e.targetStopId === target.id).length !== 1) {
        counts.ineligibleProjection += 1; continue;
      }
      const sourceEntityId = endpoint(source, evidenceBundle);
      const targetEntityId = endpoint(target, evidenceBundle);
      if (!sourceEntityId || !targetEntityId) { counts.ineligibleMissingIdentity += 1; continue; }
      if (!hasAuthoritativeCoordinates(source) || !hasAuthoritativeCoordinates(target)) {
        counts.ineligibleMissingCoordinates += 1; continue;
      }
      const binding = { ...dayKey(day, dayIndex), sourceStopId: source.id, targetStopId: target.id,
        relationship: 'transfer', destinationEntityId: destination, sourceEntityId, targetEntityId,
        sourceCoordinates: coordinates(source), targetCoordinates: coordinates(target),
        modeIntent: 'drive', travelMode: 'driving', departureTimeBucket };
      entries.push({ binding, routeFingerprint: routeFingerprint(candidateFingerprint, binding) });
      counts.eligibleEdges += 1;
    }
  });
  return { candidateFingerprint, counts, entries };
}
function routeRequirement(binding) {
  return { requirementId: 'ephemeral:stop_route', topic: 'driving_time', preferredProviders: ['google_maps'],
    allowedFallbackProviders: [], routeScope: {
      origin: { entityId: binding.sourceEntityId, ...binding.sourceCoordinates },
      destination: { entityId: binding.targetEntityId, ...binding.targetCoordinates },
      travelMode: 'driving', departureTimeBucket: binding.departureTimeBucket,
    } };
}
function buildProductionStopRouteResolver({ dispatchEphemeral }) {
  const provider = createMapsEvidenceProvider(); // buildRequest only; all I/O goes through the broker.
  return async ({ binding, ownership, signal }) => {
    const requirement = routeRequirement(binding);
    const expected = semanticFingerprint(provider.buildRequest(requirement));
    const result = await dispatchEphemeral({ requirement, requestId: ownership.requestId, ownership, signal });
    return { result, expectedSemanticFingerprint: expected };
  };
}
const validMetric = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

async function resolveStopRouteArtifact({ itineraryData, evidenceBundle, getTransportation,
  destinationOwned = {}, proposedDriveIntents = [], departureTimeBucket,
  ownership, resolveStopRoute, signal } = {}) {
  const options = () => ({ itineraryData, evidenceBundle, transportation: getTransportation(),
    destinationOwned, proposedDriveIntents, departureTimeBucket });
  const planned = planStopRoutes(options());
  const owner = clone(ownership);
  const entries = [];
  let dispatches = 0;
  for (const plannedEntry of planned.entries) {
    const entry = { ...clone(plannedEntry), requestSemanticFingerprint: null, status: 'provider_failure',
      provider: 'google_maps', observedAt: null, durationSeconds: null, durationInTrafficSeconds: null,
      distanceMeters: null, departureTimeApplied: null, reasonCode: null };
    entries.push(entry);
    if (signal?.aborted) { entry.status = 'cancelled'; continue; }
    if (typeof resolveStopRoute !== 'function') { entry.reasonCode = 'route_provider_unavailable'; continue; }
    // An earlier await may have invalidated later requests too.
    if (!planStopRoutes(options()).entries.some((e) => e.routeFingerprint === entry.routeFingerprint)
      || hashPayload(owner) !== hashPayload(ownership)) { entry.status = 'discarded'; entry.reasonCode = 'route_binding_changed'; continue; }
    try {
      dispatches += 1;
      const expectedOwner = { ...owner, candidateFingerprint: planned.candidateFingerprint, routeFingerprint: entry.routeFingerprint };
      const { result, expectedSemanticFingerprint } = await resolveStopRoute({ binding: clone(entry.binding), ownership: clone(expectedOwner), signal });
      entry.requestSemanticFingerprint = expectedSemanticFingerprint;
      if (signal?.aborted || result.status === 'cancelled') { entry.status = 'cancelled'; continue; }
      if (hashPayload(result.ownership) !== hashPayload(expectedOwner)
        || result.semanticFingerprint !== expectedSemanticFingerprint) {
        entry.status = 'discarded'; entry.reasonCode = 'route_ownership_mismatch'; continue;
      }
      if (result.status === 'no_result') { entry.status = 'no_result'; continue; }
      if (result.status !== 'fulfilled') { entry.reasonCode = 'route_provider_failure'; continue; }
      const candidates = result.normalizedCandidates || [];
      const route = candidates[0];
      const value = route?.claim?.normalizedValue;
      if (candidates.length !== 1 || route.source?.provider !== 'google_maps' || route.topic !== 'driving_time'
        || route.claim.subjectId !== entry.binding.sourceEntityId || route.claim.objectId !== entry.binding.targetEntityId
        || value?.travelMode !== 'driving' || !validMetric(value?.durationSeconds) || !validMetric(value?.distanceMeters)
        || (value.durationInTrafficSeconds != null && !validMetric(value.durationInTrafficSeconds))) {
        entry.reasonCode = 'route_invalid_response'; continue;
      }
      Object.assign(entry, { status: 'verified', observedAt: route.observedAt ?? result.observedAt,
        durationSeconds: value.durationSeconds, distanceMeters: value.distanceMeters,
        durationInTrafficSeconds: value.durationInTrafficSeconds ?? null,
        departureTimeApplied: typeof value.departureTimeApplied === 'boolean' ? value.departureTimeApplied : null });
    } catch (error) {
      entry.status = signal?.aborted || ['ABORT_ERR', 'ERR_CANCELED', 'provider_cancelled'].includes(error?.code)
        ? 'cancelled' : 'provider_failure';
      entry.reasonCode = entry.status === 'cancelled' ? 'provider_cancelled' : 'route_provider_failure';
    }
  }
  // Atomic projection after the last await: recompute every semantic binding.
  const current = planStopRoutes(options());
  const ownershipMatches = hashPayload(owner) === hashPayload(ownership);
  const next = clone(itineraryData);
  (next.days || []).forEach((day, index) => {
    for (const stop of day.stops || []) stop.drivingTimeFromPreviousMin = destinationOwned[targetKey(day, index, stop)] ?? null;
  });
  for (const entry of entries) {
    if (signal?.aborted) { entry.status = 'cancelled'; }
    else if (!ownershipMatches || current.candidateFingerprint !== planned.candidateFingerprint
      || !current.entries.some((e) => e.routeFingerprint === entry.routeFingerprint)) {
      entry.status = 'discarded'; entry.reasonCode = 'route_binding_changed';
    }
    if (entry.status === 'verified') {
      const target = next.days[entry.binding.dayIndex].stops.find((s) => s.id === entry.binding.targetStopId);
      target.drivingTimeFromPreviousMin = minutesFromDurationSeconds(entry.durationSeconds);
    } else {
      entry.durationSeconds = null; entry.distanceMeters = null; entry.durationInTrafficSeconds = null;
    }
  }
  const counts = { ...planned.counts, dispatches };
  for (const [status, key] of Object.entries({ verified: 'verified', no_result: 'noResult', provider_failure: 'providerFailure', cancelled: 'cancelled', discarded: 'discarded' })) {
    counts[key] = entries.filter((e) => e.status === status).length;
  }
  const coverage = { scope: 'applicable_stop_drive_edges', applicableEdges: counts.applicableEdges,
    verifiedEdges: counts.verified, status: counts.verified === 0 ? 'none_checked'
      : counts.verified === counts.applicableEdges ? 'fully_checked' : 'partially_checked' };
  return { itineraryData: next, artifact: freeze({ version: 'stop-route-v1', ownership: owner,
    candidateFingerprint: planned.candidateFingerprint, entries, counts, coverage }) };
}

module.exports = { emptyRouteCounts, captureDestinationRouteOwnership, captureDriveIntents, departureBucket,
  routeFingerprint, planStopRoutes, routeRequirement, buildProductionStopRouteResolver, resolveStopRouteArtifact };
