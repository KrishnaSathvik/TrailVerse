'use strict';

/**
 * Compatibility/fallback stop coordinates. Official NPS place coordinates
 * promoted during identity binding (`resolved_metadata`) take precedence.
 * Do not add parks to this table to "fix" map coverage — use official rows.
 */

const { isAuthoritativeCoordinateSource } = require('./coordinateValidation');

const KNOWN_STOP_LOCATIONS = Object.freeze({
  'logan pass': [48.6967, -113.7183],
  'hidden lake overlook': [48.6922, -113.7272],
  'trail of the cedars': [48.6801, -113.8193],
  'avalanche lake': [48.6551, -113.7891],
  'lake mcdonald lodge': [48.6175, -113.8788],
  'apgar village': [48.5263, -113.9906],
  'fire canyon overlook': [36.4538, -114.5156],
  'rainbow vista': [36.4491, -114.5157],
  'mouse\'s tank': [36.4478, -114.5168],
  'atlatl rock': [36.4236, -114.5499],
  'arch rock': [36.4256, -114.5523],
  'elephant rock': [36.4282, -114.4605],
  'pa\'rus trail': [37.2002, -112.9869],
  'watchman trail': [37.2001, -112.9876],
  'canyon overlook': [37.2132, -112.9401],
  'riverside walk': [37.2852, -112.9475],
  'general sherman tree': [36.5817, -118.7511],
  'big trees trail': [36.5633, -118.7724],
});

function resolveKnownStopLocation(stopName) {
  const name = String(stopName || '').toLowerCase();
  const key = Object.keys(KNOWN_STOP_LOCATIONS).find((candidate) => name.includes(candidate));
  if (!key) return null;
  const [latitude, longitude] = KNOWN_STOP_LOCATIONS[key];
  return { latitude, longitude, coordinateSource: 'trailverse_catalog', locationResolutionSource: 'trailverse_known_stop_catalog' };
}

function enrichKnownStopLocations(itineraryData) {
  const diagnostics = [];
  for (const day of itineraryData?.days || []) {
    for (const stop of day.stops || []) {
      // Phase 9B.1 — only ALREADY-AUTHORITATIVE coordinates (evidence/
      // provider-resolved, geocoder, stored, or a prior catalog match) block
      // this backfill. Merely-present numbers with no provenance, or numbers
      // explicitly tagged 'tool', are unverified model candidates — the
      // trusted catalog is allowed to override them when it has a match.
      const coordinatesPresent = Number.isFinite(Number(stop.latitude))
        && Number.isFinite(Number(stop.longitude))
        && isAuthoritativeCoordinateSource(stop.coordinateSource);
      if (coordinatesPresent) continue;
      const resolved = resolveKnownStopLocation(stop.name);
      if (resolved) Object.assign(stop, resolved);
      diagnostics.push({
        stopName: stop.name || null,
        destination: stop.parkName || itineraryData.parkName || null,
        locationResolutionSource: resolved?.locationResolutionSource || 'unresolved',
        coordinatesPresent: Boolean(resolved),
        resolutionFailureReason: resolved ? null : 'not_in_known_stop_catalog',
      });
    }
  }
  return diagnostics;
}

module.exports = { KNOWN_STOP_LOCATIONS, resolveKnownStopLocation, enrichKnownStopLocations };
