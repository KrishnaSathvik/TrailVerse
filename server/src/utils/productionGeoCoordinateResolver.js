'use strict';

// Coordinate authority is evaluated AFTER ephemeral execution, including cache hits.
const { evaluateGeocodeAuthority } = require('./geocodeAuthorityPolicy');
const { PARK_NAME_TO_CODE } = require('./parkExtractor');

function groundedContext(key, evidenceBundle) {
  if (!evidenceBundle) return key; // Explicit injected legacy/test seam.
  const evidence = evidenceBundle.evidence || [];
  const bound = evidence.find((item) => item.evidenceId === key.evidenceRef);
  const value = bound?.claim?.normalizedValue;
  if (!bound || String(value?.name || '').trim() !== key.canonicalPlaceName) return null;
  const profile = evidence.find((item) => bound.entityId && item.entityId === bound.entityId
    && item.topic === 'destination_identity')?.claim?.normalizedValue;
  const code = String(bound.entityId || '').match(/^nps:park:([a-z0-9]+)$/)?.[1];
  const catalogName = code && [...PARK_NAME_TO_CODE].find(([name, entry]) =>
    entry.code === code && /national park/i.test(name))?.[0];
  return {
    canonicalPlaceName: String(value.name).trim(),
    parkName: value.parkName || profile?.fullName || catalogName?.replace(/\b\w/g, (c) => c.toUpperCase()) || null,
  };
}

function buildProductionGeoCoordinateResolver({ geocodePlace = null, dispatchEphemeral = null } = {}) {
  // Production always supplies dispatchEphemeral. Direct geocoder injection is
  // retained only for the existing deterministic authority-policy tests.
  if (!dispatchEphemeral && !geocodePlace) throw new TypeError('Coordinate resolver requires ephemeral dispatch');
  return async function resolveStopCoordinates({
    query, key = {}, signal, requestId, ownership, evidenceBundle, onDispatch = () => {},
  }) {
    const cancelled = () => {
      if (signal?.aborted) throw Object.assign(new Error('Coordinate resolution cancelled'), { code: 'provider_cancelled' });
    };
    cancelled();
    const context = dispatchEphemeral && !evidenceBundle ? null : groundedContext(key, evidenceBundle);
    if (!context) throw Object.assign(new Error('Missing authoritative binding'), { code: 'coordinate_binding_invalid' });
    let raw;
    if (dispatchEphemeral) {
      const groundedQuery = [context.canonicalPlaceName, context.parkName].filter(Boolean).join(', ');
      onDispatch();
      const result = await dispatchEphemeral({
        requirement: {
          requirementId: 'ephemeral:stop_coordinates',
          topic: 'stop_coordinates', query: groundedQuery,
          // Grounded identity and retrieval context are not traveler assertions.
          queryProvenance: {
            rawTravelerPlaceText: null,
            groundedPlaceText: context.canonicalPlaceName,
            explicitTravelerRegion: null,
            explicitTravelerCountry: null,
            contextualRegions: [],
            contextualPlaceText: context.parkName || null,
          },
          preferredProviders: ['geocode_coordinate'], allowedFallbackProviders: [],
        },
        requestId, signal, ownership,
      });
      cancelled();
      if (result.ownership?.candidateFingerprint !== ownership?.candidateFingerprint
        || result.ownership?.attempt !== ownership?.attempt
        || result.ownership?.dispatchIndex !== ownership?.dispatchIndex) {
        throw Object.assign(new Error('Stale coordinate result'), { code: 'coordinate_ownership_mismatch' });
      }
      if (result.status === 'cancelled' || result.status === 'failed' || result.status === 'unsupported') {
        throw Object.assign(new Error('Coordinate provider unavailable'), {
          code: result.status === 'cancelled' ? 'provider_cancelled' : 'coordinate_provider_failure',
        });
      }
      const value = result.normalizedCandidates?.[0]?.claim?.normalizedValue;
      raw = value && { lat: value.latitude, lon: value.longitude, name: value.resolvedName, source: value.providerSource };
    } else {
      raw = await (signal ? geocodePlace(query, { signal }) : geocodePlace(query));
    }
    cancelled();
    if (!raw || !Number.isFinite(raw.lat) || !Number.isFinite(raw.lon)) return null;
    const decision = evaluateGeocodeAuthority({
      providerSource: raw.source, resolvedName: raw.name,
      canonicalPlaceName: context.canonicalPlaceName, parkName: context.parkName,
    });
    return {
      latitude: raw.lat, longitude: raw.lon,
      coordinateSource: decision.coordinateSource, providerSource: raw.source,
    };
  };
}

module.exports = { buildProductionGeoCoordinateResolver };
