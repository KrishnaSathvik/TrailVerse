'use strict';

/**
 * Stage 11 — deterministic finalization of a structured (Phase A) itinerary,
 * BEFORE any prose is generated. This runs the exact same deterministic steps
 * the legacy path used, in the required order, then FREEZES the result so no
 * subsequent prose or reviewer step can mutate it.
 *
 *   normalize coordinates
 *   → constraint validation
 *   → correctItinerary (bounded passes)
 *   → driving-time enrichment
 *   → park-identity enrichment
 *   → feasibility validation (on the FINAL corrected plan)
 *   → scoring
 *   → deep-freeze
 */

const { validateItineraryConstraints } = require('./constraintEngine');
const { correctItinerary, computeConfidence, scoreItinerary } = require('./itineraryCorrector');
const { validateItineraryFeasibility } = require('./extractItineraryJSON');
const { enrichItineraryParkIdentity } = require('./itineraryParkIdentity');
const { normalizeCoordinates, COORDINATE_SOURCE } = require('./coordinateValidation');
const { enrichKnownStopLocations } = require('./knownOutdoorLocations');
const { normalizeItineraryActivityGroups } = require('./activityGroupValidation');
const { captureDriveIntents } = require('./stopRouteArtifact');
const { normalizeItineraryTravelEdges } = require('./travelEdgeValidation');
const { applyOperationalConstraints, normalizeSchedulePrecision, CONSTRAINT_TYPE } = require('./trailieOperationalConstraints');
const { isAvoidExposureActive } = require('./planningInputContract');
const { normalizeItineraryIntro, normalizeNarrativeSections } = require('./itineraryToolSchema');
const { ensureFullItineraryClosing } = require('./visibleItineraryCompleteness');
const { applyStopDisplayLabel } = require('./stopDisplayLabel');

/** Recursively deep-freeze so the finalized plan is immutable downstream. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/**
 * Coordinates captured through the `create_itinerary` SCHEMA are trusted-source
 * ('tool') and survive deterministic validation as `coordinateSource: 'tool'`.
 * Only malformed, partial, out-of-range, `0,0`, or coordinates the payload
 * EXPLICITLY marks estimated/uncertain become null. This is different from the
 * fallback prose extractor, whose coordinates are unvalidated model estimates
 * (nulled separately in the route).
 */
function normalizeItineraryCoordinates(itineraryData) {
  for (const day of itineraryData.days || []) {
    for (const stop of day.stops || []) {
      const norm = normalizeCoordinates({
        latitude: stop.latitude,
        longitude: stop.longitude,
        // Default provenance for schema-captured coordinates is 'tool'. If the
        // payload explicitly declared an untrusted source (e.g. model_estimate),
        // that is honored and rejected by normalizeCoordinates.
        source: stop.coordinateSource || COORDINATE_SOURCE.TOOL,
      });
      stop.latitude = norm.latitude;
      stop.longitude = norm.longitude;
      stop.coordinateSource = norm.valid ? norm.coordinateSource : COORDINATE_SOURCE.UNKNOWN;
    }
  }
  return itineraryData;
}

/**
 * @param {Object} params
 * @param {Object} params.itineraryData      the Phase A structured plan
 * @param {Object|null} params.constraints
 * @param {Object|null} params.hypothetical
 * @param {Object} params.npsFacts
 * @param {Object} params.resolvedMetadata
 * @param {Object[]} params.allExtractedParks
 * @param {Function} [params.enrichDrivingTimes] async (itin, prefix) => itin
 * @param {string} [params.logPrefix]
 * @returns {Promise<{itineraryData, correctionsApplied, feasibilityIssues,
 *   planScore, confidence, contentChangedByValidation}>}
 */
async function finalizeStructuredItinerary({
  itineraryData,
  constraints = null,
  hypothetical = null,
  npsFacts = null,
  resolvedMetadata = {},
  allExtractedParks = [],
  enrichDrivingTimes = null,
  verifyStopRoutes = null,
  constraintValidateOptions = null,
  logPrefix = '[Tool-First]',
} = {}) {
  // Work on a private copy — never mutate the caller's tool payload.
  let current = JSON.parse(JSON.stringify(itineraryData));
  current.intro = normalizeItineraryIntro(current.intro);
  current.narrativeSections = normalizeNarrativeSections(current.narrativeSections);
  const locationResolutionDiagnostics = enrichKnownStopLocations(current);
  current = normalizeItineraryCoordinates(current);

  let correctionsApplied = [];
  const removedStops = []; // names of stops removed during correction (Stage 12)
  let confidence = { level: 'high', score: 1.0 };

  const operationalRules = [...(constraints?.operational || [])];
  if (isAvoidExposureActive(constraints) && !operationalRules.some((rule) => rule.type === CONSTRAINT_TYPE.EXPOSURE_CONSTRAINT)) {
    operationalRules.push({ type: CONSTRAINT_TYPE.EXPOSURE_CONSTRAINT, subjects: [] });
  }
  const operational = applyOperationalConstraints(current, operationalRules);
  current = operational.itinerary;
  correctionsApplied.push(...operational.corrections);
  current = normalizeSchedulePrecision(current);

  const constraintIssues = constraints
    ? validateItineraryConstraints(current, constraints, constraintValidateOptions || {})
    : [];

  if (constraintIssues.length > 0) {
    let allCorrections = [];
    let totalRemoved = 0;
    const originalCount = current.days.reduce((sum, d) => sum + (d.stops?.length || 0), 0);

    for (let pass = 1; pass <= 2; pass += 1) {
      const issues = pass === 1 ? constraintIssues : validateItineraryConstraints(
        current,
        constraints,
        constraintValidateOptions || {}
      );
      if (issues.length === 0) break;
      const res = correctItinerary(current, constraints, issues, npsFacts, {
        isHypothetical: hypothetical?.isHypothetical || false,
        pass,
        replaceStops: false,
      });
      current = res.correctedItinerary;
      allCorrections.push(...res.corrections);
      totalRemoved += res.removedCount;
      for (const gap of res.gaps || []) {
        if (gap.removedName) removedStops.push({ name: gap.removedName });
      }
      if (res.tooAggressive && pass === 1) break;
    }

    confidence = computeConfidence(allCorrections, totalRemoved, originalCount);
    correctionsApplied.push(...allCorrections);
  }

  if (typeof enrichDrivingTimes === 'function') {
    current = await enrichDrivingTimes(current, logPrefix);
  }

  const enriched = enrichItineraryParkIdentity({
    itineraryData: current,
    resolvedMetadata: resolvedMetadata || {},
    allExtractedParks,
  });
  current = enriched.itineraryData;

  // Phase 9C.1B — drop any continuous-activity group left dangling by an
  // earlier repair/correction pass (a referenced stop id that no longer
  // exists, a group collapsed to <2 members, etc). Never repaired/guessed —
  // only ever dropped, deterministically, right before the plan freezes.
  current = normalizeItineraryActivityGroups(current);

  // Phase 9C.1D.2 — same fail-safe policy for `travelEdges`: drop anything
  // structurally invalid (dangling reference, backward, same-activity-group,
  // cross-destination, group-boundary violation, duplicate). MUST run after
  // activityGroups normalization above, since edge validation reads the
  // already-normalized (contiguous) groups for boundary checks.
  // Phase 9C.1F.2 — model-authored `modeIntent:'drive'` survives only when the
  // durable planning-state transport policy authorizes it. The policy is read
  // from `constraints.planningState.transportation` (the one 9C.1F.1 source);
  // no policy → no authority → mode stripped, edge kept.
  const proposedDriveIntents = captureDriveIntents(current);
  current = normalizeItineraryTravelEdges(current, {
    transportation: constraints?.planningState?.transportation || null,
  });

  // Attempt-owned I/O seam: corrected identities/groups/edges are now final.
  // Projection precedes all final checks and freeze; never correct a routed
  // candidate in place afterwards and accidentally retain a stale route.
  let routeArtifact = null;
  let routeConstraintIssues = [];
  if (typeof verifyStopRoutes === 'function') {
    const routed = await verifyStopRoutes({ itineraryData: current, proposedDriveIntents });
    current = routed.itineraryData;
    routeArtifact = routed.artifact;
    if (routeArtifact?.counts.verified > 0 && constraints) {
      routeConstraintIssues = validateItineraryConstraints(current, constraints, constraintValidateOptions || {})
        .filter((issue) => issue.severity === 'feasibility');
    }
  }

  // Feasibility on the FINAL corrected plan (never a pre-correction draft).
  const feasibilityIssues = [...validateItineraryFeasibility(current), ...routeConstraintIssues];
  const planScore = scoreItinerary(current, constraints);

  current = ensureFullItineraryClosing(current, {
    constraints,
    removedStopNames: removedStops.map((item) => item?.name).filter(Boolean),
    driveMinutesAvailable: Number(routeArtifact?.counts?.verified) > 0,
  });
  const destinationLabel = current.parkName || constraints?.planningState?.destination?.displayName || null;
  if (Array.isArray(current.days)) {
    current = {
      ...current,
      days: current.days.map((day) => ({
        ...day,
        stops: (day.stops || []).map((stop) => applyStopDisplayLabel(stop, { destinationLabel })),
      })),
    };
  }

  // Freeze — authoritative from here; prose/reviewer cannot change it.
  deepFreeze(current);

  return {
    itineraryData: current,
    correctionsApplied,
    removedStops,
    feasibilityIssues,
    planScore,
    confidence,
    contentChangedByValidation: correctionsApplied.length > 0,
    operationalConflicts: operational.conflicts,
    locationResolutionDiagnostics,
    ...(routeArtifact ? { routeArtifact, routeCoverage: routeArtifact.coverage } : {}),
  };
}

module.exports = {
  deepFreeze,
  normalizeItineraryCoordinates,
  finalizeStructuredItinerary,
};
