/**
 * Presentation-only mapping model for the accepted Trailie itinerary.
 *
 * This module NEVER mutates or re-derives planning/evidence/validation
 * state. It reads the canonical `plan` object exactly as rendered by
 * `TrailieItinerary` (source-bound `location` on final canonical plans,
 * with flat-coordinate read compatibility for older saved plans) and produces a pure, derived view for
 * the map surface. Every call recomputes from the plan it is given — there
 * is no separate mutable map state to drift from a refinement.
 *
 * "Mappable" is a presentation concept distinct from the backend's
 * itinerary-completeness `classifyStop` (which decides day-coverage credit).
 * Product intent for the map is broader in one direction (a visitor center
 * or an in-plan campground/lodge is a real, fixed-location place worth
 * showing) and narrower in another (never a rest/meal/flex/transit/
 * informational block). The vocabulary below is deliberately independent of
 * `server/src/utils/itineraryCompleteness.js` — duplicated intent, not a
 * shared source of truth, because the two questions ("does this stop count
 * toward a full day" vs "is this a pin-worthy place") are genuinely
 * different and must not be coupled.
 */

const MAPPABLE_TYPES = new Set([
  'trail', 'hike', 'walk', 'landmark', 'viewpoint', 'overlook', 'scenic',
  'scenic_drive', 'lake', 'historic', 'ranger_program', 'museum', 'wildlife',
  'photography', 'geothermal', 'beach', 'boat', 'accessible',
  'visitor_center', 'campground', 'lodge', 'lodging', 'activity',
]);

const NEVER_MAPPABLE_TYPES = new Set([
  'restaurant', 'meal', 'picnic', 'picnic_area',
  'transport', 'parking', 'shuttle', 'drive', 'logistics',
]);

const REST_MEAL_TEXT =
  /\b(rest|break|lunch|dinner|breakfast|brunch|snack|midday retreat|heat break|recovery|free time|downtime)\b/i;

const LOGISTICS_TEXT =
  /\b(conditions check|road status|check current conditions|orientation stop|parking(?:-to-trail)? transition|check[- ]?in|check[- ]?out|supplies|departure buffer|return[- ]to[- ]vehicle|drive to|driving to|transfer|shuttle (?:pickup|ride)|road closure check)\b/i;

const MAPPABLE_TEXT =
  /\b(hike|trail|walk|stroll|viewpoint|overlook|scenic|wildlife|lookout|pools?|canyon|waterfall|beach|boardwalk|petroglyph|formation|arch|mesa|dune|geyser|meadow|summit|rim|grove|falls|shoreline|lake|visitor center|campground|lodge|museum)\b/i;

/** Traveler-facing stop fields the map/preview may show. No entity/route internals. */
const MAP_STOP_PRESENTATION_KEYS = [
  'name', 'type', 'placeKind', 'note', 'why', 'duration', 'difficulty', 'physicalDifficulty',
  'timeWindow', 'startTime', 'requirements', 'alternatives', 'source',
];

function stopText(stop) {
  return `${stop?.name || ''} ${stop?.note || ''} ${stop?.why || ''}`.toLowerCase();
}

/**
 * Is this the kind of stop that gets a pin at all (independent of whether we
 * happen to have coordinates for it)? Rest/meal/flex/transit/informational
 * blocks are never mappable, even if a future data source were to attach
 * coordinates to one.
 */
export function isMappableStop(stop) {
  if (stop?.placeKind === 'area' && stop?.location?.status === 'resolved') return true;
  const type = String(stop?.type || '').toLowerCase().trim();
  if (NEVER_MAPPABLE_TYPES.has(type)) return false;
  if (MAPPABLE_TYPES.has(type)) return true;

  const name = String(stop?.name || '').toLowerCase();
  if (REST_MEAL_TEXT.test(name)) return false;
  if (LOGISTICS_TEXT.test(name)) return false;
  if (MAPPABLE_TEXT.test(name)) return true;

  const text = stopText(stop);
  if (REST_MEAL_TEXT.test(text)) return false;
  if (LOGISTICS_TEXT.test(text)) return false;
  return MAPPABLE_TEXT.test(text);
}

/**
 * Canonical coordinates only — never geocoded/fabricated. `latitude`/
 * `longitude` on a stop come from `stopIdentityResolution.js`'s evidence
 * binding; this function does not invent, round-trip through a geocoder, or
 * accept anything else as a coordinate.
 */
export function hasCanonicalCoordinates(stop) {
  const lat = stop?.location ? stop.location.lat : stop?.latitude;
  const lon = stop?.location ? stop.location.lon : stop?.longitude;
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/**
 * Phase 9B.1 — geographic authority hardening.
 *
 * "Has coordinates" is not the same question as "safe to plot as verified
 * geography." A stop can carry real, finite lat/lng that the model emitted
 * through the itinerary tool schema — useful internal data, but not
 * independently verified. Mirrors the backend's `coordinateValidation.js`
 * `AUTHORITATIVE_SOURCES` (deliberately duplicated here rather than shared
 * across the server/frontend boundary — same tradeoff already made for
 * `isMappableStop` vs. the backend's `classifyStop`).
 */
const AUTHORITATIVE_COORDINATE_SOURCES = new Set([
  'resolved_metadata', 'geocoder', 'stored', 'trailverse_catalog',
]);

export function hasAuthoritativeCoordinates(stop) {
  if (stop?.location) return hasCanonicalCoordinates(stop) && stop.location.status === 'resolved'
    && AUTHORITATIVE_COORDINATE_SOURCES.has(stop.location.source) && Boolean(stop.location.sourceRef)
    && ['official_owner', 'official_partner', 'trusted_specialist', 'commercial_structured', 'external_geocoder'].includes(stop.location.authority);
  return hasCanonicalCoordinates(stop) && AUTHORITATIVE_COORDINATE_SOURCES.has(stop?.coordinateSource);
}

/**
 * Restrained per P1-6 sequencing note: only action-required / condition-check
 * requirements earn a pin badge. Hard-incompatibility stops are normally
 * repaired away before a plan is accepted, so there is deliberately no
 * hard-incompatibility marker here.
 */
export function stopHasBadgeworthyRequirement(stop) {
  const list = Array.isArray(stop?.requirements) ? stop.requirements : [];
  return list.some((r) => r?.category === 'action_required' || r?.category === 'condition_check');
}

function copyPresentationFields(stop) {
  const out = {};
  for (const key of MAP_STOP_PRESENTATION_KEYS) {
    if (stop[key] !== undefined) out[key] = stop[key];
  }
  return out;
}

function normalizeActivityGroups(rawGroups, stopIdSet) {
  if (!Array.isArray(rawGroups)) return [];
  const groups = [];
  for (const group of rawGroups) {
    const id = typeof group?.id === 'string' ? group.id.trim() : '';
    if (!id) continue;
    const seen = new Set();
    const stopIds = [];
    for (const stopId of Array.isArray(group.stopIds) ? group.stopIds : []) {
      if (!stopIdSet.has(stopId) || seen.has(stopId)) continue;
      seen.add(stopId);
      stopIds.push(stopId);
    }
    if (stopIds.length < 2) continue;
    groups.push({ id, stopIds });
  }
  return groups;
}

export function stopsShareActivityGroup(activityGroups, sourceStopId, targetStopId) {
  if (!sourceStopId || !targetStopId) return false;
  return (activityGroups || []).some((group) => (
    group.stopIds.includes(sourceStopId) && group.stopIds.includes(targetStopId)
  ));
}

function precedingStopId(stops, targetStopId) {
  const index = stops.findIndex((stop) => stop.id === targetStopId);
  if (index <= 0) return null;
  return stops[index - 1].id;
}

function presentationMinutes(edge, sourceStopId, canonicalTarget, precedingId) {
  if (edge?.status) return edge.status === 'verified' && Number.isFinite(edge.durationSeconds) ? edge.durationSeconds / 60 : null;
  if (edge?.modeIntent !== 'drive') return null;
  if (precedingId !== sourceStopId) return null;
  const minutes = canonicalTarget?.drivingTimeFromPreviousMin;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes;
}

function buildTransferEdges(rawEdges, mapStops, canonicalStops) {
  if (!Array.isArray(rawEdges) || rawEdges.length === 0) return [];
  const mapById = new Map(mapStops.map((stop) => [stop.id, stop]));
  const canonicalById = new Map(canonicalStops.map((stop) => [stop.id, stop]));
  const edges = [];
  for (const edge of rawEdges) {
    if (edge?.relationship !== 'transfer') continue;
    const sourceStopId = edge.sourceStopId;
    const targetStopId = edge.targetStopId;
    if (!sourceStopId || !targetStopId || sourceStopId === targetStopId) continue;
    const source = mapById.get(sourceStopId);
    const target = mapById.get(targetStopId);
    if (!source || !target) continue;
    const modeIntent = edge.modeIntent === 'drive' ? 'drive' : null;
    edges.push({
      sourceStopId,
      targetStopId,
      relationship: 'transfer',
      modeIntent,
      status: edge.status || null,
      travelMode: edge.travelMode || null,
      durationSeconds: edge.status === 'verified' ? edge.durationSeconds : null,
      distanceMeters: edge.status === 'verified' ? edge.distanceMeters : null,
      source: edge.status === 'verified' ? edge.source : null,
      minutes: presentationMinutes(
        edge,
        sourceStopId,
        canonicalById.get(targetStopId),
        precedingStopId(mapStops, targetStopId),
      ),
      sourceMapped: Boolean(source.mapped),
      targetMapped: Boolean(target.mapped),
    });
  }
  return edges;
}

/**
 * An abstract A→B connector is drawn only when both endpoints are mapped pins
 * and they are not members of the same continuous activity group.
 */
export function isDrawableTransferEdge(edge, activityGroups) {
  if (!edge?.sourceMapped || !edge?.targetMapped) return false;
  if (stopsShareActivityGroup(activityGroups, edge.sourceStopId, edge.targetStopId)) return false;
  return true;
}

/**
 * Builds the full map model from a canonical plan. Pure function of `plan`
 * — call it fresh on every render (it's cheap); never cache it beside the
 * plan, or a refinement could leave a stale pin on screen.
 *
 * Stop ordering and per-day numbering exactly mirror the itinerary card
 * order (`day.stops` array order, 1-based within each day) so a pin number
 * always matches the number shown on its itinerary card. Non-mappable stops
 * still occupy a number (so "stop 3" on the card and "pin 3" on the map are
 * always the same stop) — they just never get a pin.
 *
 * Day-level `activityGroups` and `travelEdges` are copied as presentation
 * fields only. The renderer must not invent connectors from stop adjacency.
 */
export function buildTripMapModel(plan) {
  const planDays = Array.isArray(plan?.days) ? plan.days : [];
  let mappableCount = 0;
  let mappedCount = 0;

  const days = planDays.map((day, dayIndex) => {
    const dayId = day.id || `day-${day.dayNumber ?? dayIndex + 1}`;
    const canonicalStops = [];
    const stops = (day.stops || []).map((stop, stopIndex) => {
      const mappable = isMappableStop(stop);
      // Phase 9B.1 — "mapped" (i.e. gets an authoritative pin) requires more
      // than mere coordinate presence: the coordinate's provenance must pass
      // geographic-authority policy. A tool-only guess stays mappable (it's
      // still the right kind of stop) but degrades gracefully, same as a
      // stop with no coordinates at all.
      const mapped = mappable && hasAuthoritativeCoordinates(stop);
      if (mappable) mappableCount += 1;
      if (mapped) mappedCount += 1;
      const id = stop.id || `${dayId}-stop-${stopIndex}`;
      canonicalStops.push({ id, drivingTimeFromPreviousMin: stop.drivingTimeFromPreviousMin });
      const presentation = copyPresentationFields(stop);
      return {
        ...presentation,
        id,
        dayId,
        dayNumber: day.dayNumber ?? dayIndex + 1,
        pinNumber: stopIndex + 1,
        mappable,
        mapped,
        hasBadge: mapped && stopHasBadgeworthyRequirement(stop),
        // Non-mappable / non-authoritative stops never carry coordinates
        // into the renderer — rest/meal/flex/transit and tool-guesses stay
        // off the map regardless of data quirks.
        latitude: mapped ? (stop.location?.lat ?? stop.latitude) : undefined,
        longitude: mapped ? (stop.location?.lon ?? stop.longitude) : undefined,
      };
    });

    const stopIdSet = new Set(stops.map((stop) => stop.id));
    const activityGroups = normalizeActivityGroups(day.activityGroups, stopIdSet);
    const transferEdges = buildTransferEdges(day.travelEdges, stops, canonicalStops);

    return {
      id: dayId,
      dayNumber: day.dayNumber ?? dayIndex + 1,
      label: day.label || null,
      date: day.date || null,
      stops,
      activityGroups,
      transferEdges,
      mappedCount: stops.filter((s) => s.mapped).length,
    };
  });

  return {
    days,
    mappableCount,
    mappedCount,
    hasAnyMappedStop: mappedCount > 0,
    coveragePercent: mappableCount > 0 ? Math.round((mappedCount / mappableCount) * 100) : null,
  };
}

export function findMapStopById(mapModel, stopId) {
  if (!stopId) return { stop: null, day: null };
  for (const day of mapModel?.days || []) {
    const stop = day.stops.find((s) => s.id === stopId);
    if (stop) return { stop, day };
  }
  return { stop: null, day: null };
}
