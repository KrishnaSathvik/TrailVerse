'use strict';

/**
 * Stage 10 (F-ACC-2) — deterministic coordinate provenance + validation.
 *
 * Coordinates may only enter the pipeline from a TRUSTED source: structured tool
 * output, resolved park/place metadata, a deterministic geocoder, or an existing
 * stored location record. Model-estimated coordinates are NEVER accepted — an
 * LLM inferring "roughly here" from general knowledge is not evidence of a
 * location. When coordinates are not supported, they normalize to explicit null
 * (never `0,0`, never a fabricated default).
 */

const COORDINATE_SOURCE = {
  TOOL: 'tool',
  RESOLVED_METADATA: 'resolved_metadata',
  GEOCODER: 'geocoder',
  STORED: 'stored',
  CATALOG: 'trailverse_catalog',
  UNKNOWN: 'unknown',
};

/** Sources whose coordinates we accept as trusted evidence of a location. */
const TRUSTED_SOURCES = new Set([
  COORDINATE_SOURCE.TOOL,
  COORDINATE_SOURCE.RESOLVED_METADATA,
  COORDINATE_SOURCE.GEOCODER,
  COORDINATE_SOURCE.STORED,
  COORDINATE_SOURCE.CATALOG,
]);

/**
 * Phase 9B.1 — geographic authority hardening.
 *
 * `TRUSTED_SOURCES` above governs whether a coordinate is kept at all (vs.
 * rejected as garbage) — `tool` stays in it, so schema-captured coordinates
 * remain valid, usable data. `AUTHORITATIVE_SOURCES` is a stricter, separate
 * question: which sources are independently verified enough to be treated as
 * geographic TRUTH for map placement or route/drive-feasibility endpoints.
 *
 * A coordinate the model emits through the itinerary tool is candidate
 * geography, not verified authority — an LLM constrained to a numeric schema
 * field is still not independent evidence of where a place actually is. It
 * is deliberately excluded here even though it stays "valid" above.
 */
const AUTHORITATIVE_SOURCES = new Set([
  COORDINATE_SOURCE.RESOLVED_METADATA,
  COORDINATE_SOURCE.GEOCODER,
  COORDINATE_SOURCE.STORED,
  COORDINATE_SOURCE.CATALOG,
]);

function isAuthoritativeCoordinateSource(source) {
  return typeof source === 'string' && AUTHORITATIVE_SOURCES.has(source);
}

/** Sources we explicitly refuse — a model guessing is not location evidence. */
const UNTRUSTED_SOURCES = new Set(['model_estimate', 'estimate', 'model', 'guess', 'inferred']);

const COORDINATE_REASON = {
  UNTRUSTED_SOURCE: 'untrusted_source',
  NON_NUMERIC: 'non_numeric',
  LAT_OUT_OF_RANGE: 'latitude_out_of_range',
  LON_OUT_OF_RANGE: 'longitude_out_of_range',
  NULL_ISLAND: 'null_island',
};

function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN; // null, undefined, boolean, object, empty string → not a coordinate
}

/**
 * Validate a coordinate pair and its provenance.
 *
 * @param {Object} params
 * @param {*} params.latitude
 * @param {*} params.longitude
 * @param {string} [params.source]
 * @returns {{latitude: number|null, longitude: number|null,
 *   coordinateSource: string, valid: boolean, reason: string|null}}
 */
function normalizeCoordinates({ latitude, longitude, source } = {}) {
  const rejected = (reason) => ({
    latitude: null,
    longitude: null,
    coordinateSource: COORDINATE_SOURCE.UNKNOWN,
    valid: false,
    reason,
    authoritative: false,
  });

  // A model estimate is never trusted evidence of a location.
  if (typeof source === 'string' && UNTRUSTED_SOURCES.has(source)) {
    return rejected(COORDINATE_REASON.UNTRUSTED_SOURCE);
  }

  const lat = toFiniteNumber(latitude);
  const lon = toFiniteNumber(longitude);

  // Non-numeric OR one coordinate without the other → both null.
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return rejected(COORDINATE_REASON.NON_NUMERIC);
  }
  if (lat < -90 || lat > 90) return rejected(COORDINATE_REASON.LAT_OUT_OF_RANGE);
  if (lon < -180 || lon > 180) return rejected(COORDINATE_REASON.LON_OUT_OF_RANGE);
  // `0,0` is not automatically valid evidence of a location — it is the classic
  // fabricated default. Reject it regardless of claimed source.
  if (lat === 0 && lon === 0) return rejected(COORDINATE_REASON.NULL_ISLAND);

  const coordinateSource = TRUSTED_SOURCES.has(source) ? source : COORDINATE_SOURCE.UNKNOWN;
  return {
    latitude: lat,
    longitude: lon,
    coordinateSource,
    valid: true,
    reason: null,
    authoritative: isAuthoritativeCoordinateSource(coordinateSource),
  };
}

/** Whether a stop-like object carries usable, trusted-enough coordinates. */
function hasUsableCoordinates(stop, source) {
  if (!stop) return false;
  return normalizeCoordinates({
    latitude: stop.latitude,
    longitude: stop.longitude,
    source: source || stop.coordinateSource,
  }).valid;
}

/**
 * Whether a stop-like object carries coordinates verified enough to serve as
 * map/route geographic AUTHORITY — stricter than `hasUsableCoordinates`.
 * A tool-only coordinate is real, kept data, but is not this.
 */
function hasAuthoritativeCoordinates(stop, source) {
  if (!stop) return false;
  return normalizeCoordinates({
    latitude: stop.latitude,
    longitude: stop.longitude,
    source: source || stop.coordinateSource,
  }).authoritative;
}

module.exports = {
  COORDINATE_SOURCE,
  COORDINATE_REASON,
  TRUSTED_SOURCES,
  AUTHORITATIVE_SOURCES,
  isAuthoritativeCoordinateSource,
  normalizeCoordinates,
  hasUsableCoordinates,
  hasAuthoritativeCoordinates,
};
