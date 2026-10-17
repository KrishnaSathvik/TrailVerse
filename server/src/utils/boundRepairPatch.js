'use strict';
const { resolveCandidateRef } = require('./evidenceBoundRepairCandidates');
const { projectDayStopsAgainstFrozenPlan } = require('./refinementCrossDayCandidateViability');
const key = value => String(value || '').trim().toLowerCase();

// Existing stop edits retain their identity. Every new place, including one
// introduced inside update_day, must select a supplied reference.
function bindRepairPatch({ planPatch, priorPlan, candidates }) {
  const patch = JSON.parse(JSON.stringify(planPatch));
  let failure = null;
  const bind = (stop, existing = []) => {
    if (!stop || failure) return stop;
    const retained = existing.find(old => key(old.name) === key(stop.name)
      && (!stop.id || stop.id === old.id));
    if (stop.placeRef == null && retained) return stop;
    const candidate = resolveCandidateRef(candidates, stop.placeRef);
    if (!candidate) {
      failure = candidates.length ? 'unauthorized_refinement_candidate' : 'no_eligible_repair_candidate';
      return stop;
    }
    // Model owns sequencing, duration and explanation; catalogue owns identity
    // and suitability. Inherited facts from a replaced place must not survive.
    const { placeRef, name, type, canonicalPlaceName, evidenceRef, exposure,
      exposureLevel, difficulty, walkingDistanceMiles, wheelchairAccessible,
      parkCode, parkName, latitude, longitude, ...authored } = stop;
    return { ...authored, name: candidate.canonicalName, type: candidate.canonicalType,
      canonicalPlaceName: candidate.canonicalName, evidenceRef: candidate.evidenceIds?.[0] || null,
      exposureLevel: null, difficulty: null, walkingDistanceMiles: null,
      parkCode: null, parkName: null,
      latitude: candidate.coordinates?.latitude ?? null,
      longitude: candidate.coordinates?.longitude ?? null };
  };
  for (const operation of patch.operations || []) {
    const day = priorPlan?.days?.find((d, i) => Number(d.dayNumber ?? d.day ?? i + 1) === Number(operation.dayNumber));
    const existing = day?.stops || [];
    if (operation.op === 'add_stop') operation.stop = bind(operation.stop);
    if (operation.op === 'update_day' && operation.day?.stops) {
      operation.day.stops = operation.day.stops.map(stop => bind(stop, existing));
      if (failure) break;
      // Individually authorized stops can still form an illegal Day-N set
      // against frozen days (or each other). Reject before merge.
      const projection = projectDayStopsAgainstFrozenPlan({
        plan: priorPlan,
        targetDayNumber: Number(operation.dayNumber),
        proposedStops: operation.day.stops,
      });
      if (!projection.ok) {
        failure = 'duplicate_base_experience';
        break;
      }
    }
    if (operation.op === 'update_stop' && operation.stop) {
      const target = existing.find(stop => operation.stopId ? stop.id === operation.stopId : key(stop.name) === key(operation.stopName));
      const supplied = operation.stop;
      if (supplied.placeRef != null || (supplied.name && key(supplied.name) !== key(target?.name))) {
        operation.stop = bind(supplied);
      }
    }
  }
  return failure ? { ok: false, reasonCodes: [failure] } : { ok: true, patch };
}

function buildBoundRepairTool(baseTool, candidates) {
  const tool = JSON.parse(JSON.stringify(baseTool));
  const properties = tool.input_schema.properties.operations.items.properties;
  const ref = { type: 'integer', ...(candidates.length ? { enum: candidates.map(c => c.ref) } : {}),
    description: 'Required for any new or replacement place. Select a supplied catalogue reference; the server supplies its name and identity.' };
  properties.stop.properties.placeRef = ref;
  properties.day.properties.stops.items.properties.placeRef = ref;
  return tool;
}
module.exports = { bindRepairPatch, buildBoundRepairTool };
