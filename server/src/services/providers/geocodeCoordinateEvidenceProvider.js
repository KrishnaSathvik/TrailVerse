'use strict';

/**
 * Phase 9B.2B — evidence-bound coordinate resolution.
 *
 * Wraps the existing, proven free-text geocoder (`geocodePlaceService.js`)
 * behind the standard seven-member evidence-provider contract, so it can be
 * dispatched through the same dedupe/fingerprint/cost/attempt machinery as
 * every other provider — without changing that framework.
 *
 * This provider resolves COORDINATES for an ALREADY-GROUNDED place. It does
 * not establish canonical identity: callers must supply a query built from a
 * stop that already has an `evidenceRef`/`canonicalPlaceName` (see
 * `geoResolutionArtifact.js`). This module has no opinion on identity at
 * all — it only answers "where is this named place," the same question
 * `geocodePlaceService.js` already answers.
 *
 * Provenance is preserved, not laundered: `geocodePlace()` returns which
 * underlying source actually answered (`google`, `open-meteo`, or the
 * service's own tiny `trailverse-known-place` catalog) and that value
 * survives into the normalized evidence claim's `normalizedValue.providerSource`
 * and `source.sourceId` — it is never collapsed into an undifferentiated
 * label before the caller sees it.
 */

const { COORDINATE_SOURCE } = require('../../utils/coordinateValidation');

const TOPIC = 'stop_coordinates';

/** Maps the geocoder's actual source into the existing coordinateSource enum. */
function coordinateSourceFor(providerSource) {
  if (providerSource === 'trailverse-known-place') return COORDINATE_SOURCE.CATALOG;
  // Both 'google' and 'open-meteo' are external geocoding lookups — the
  // existing enum has one trusted bucket for that: 'geocoder'.
  return COORDINATE_SOURCE.GEOCODER;
}

function normalizedQuery(query) {
  return String(query || '').trim().toLowerCase();
}

function defaultGeocodePlace() {
  return require('../geocodePlaceService').geocodePlace;
}

function createGeocodeCoordinateEvidenceProvider({ geocodePlace = null } = {}) {
  const resolveGeocodePlace = () => geocodePlace || defaultGeocodePlace();

  return {
    id: 'geocode_coordinate',
    ephemeralOnly: true,

    supports(requirement) {
      return requirement?.topic === TOPIC && typeof requirement?.query === 'string' && requirement.query.trim().length >= 2;
    },

    estimateCost() {
      // The underlying service tries Google first (metered), falls back to
      // Open-Meteo (free) or its own catalog (free) — cost is provider-
      // dependent and not knowable before the call.
      return { costStatus: 'unknown', costUsd: null, providerAttemptLimit: 1 };
    },

    buildRequest(requirement) {
      if (requirement?.topic !== TOPIC) throw new TypeError('Unsupported geocode_coordinate requirement');
      const query = String(requirement.query || '').trim();
      if (query.length < 2) throw new TypeError('geocode_coordinate requires a non-trivial query');
      const provenance = requirement.queryProvenance
        ? JSON.parse(JSON.stringify(requirement.queryProvenance)) : null;
      return {
        provider: 'geocode_coordinate',
        operation: 'geocode_place',
        parameters: { query, ...(provenance ? { queryProvenance: provenance } : {}) },
        dedupeKey: `geocode_coordinate|geocode_place|${normalizedQuery(query)}${provenance ? `|${JSON.stringify(provenance)}` : ''}`,
        publicCanonicalRequest: { provider: 'geocode_coordinate', operation: 'geocode_place', query,
          ...(provenance ? { queryProvenance: provenance } : {}) },
      };
    },

    async fetch(request, { signal } = {}) {
      if (signal?.aborted) throw Object.assign(new Error('Geocode resolution cancelled'), { code: 'ABORT_ERR' });
      const result = await resolveGeocodePlace()(request.parameters.query, { signal, reportFailure: true,
        ...(request.parameters.queryProvenance ? { queryProvenance: request.parameters.queryProvenance } : {}) });
      return {
        raw: result,
        metadata: { observedAt: new Date().toISOString() },
        // Absence here means "this place could not be geocoded" — a real,
        // provable negative, not an unknown. The caller (geoResolutionArtifact)
        // treats a `[]` normalize() result as "unresolved", never as a
        // license to fabricate a coordinate.
        completeness: { isComplete: true, topics: [TOPIC], emptyMeans: 'unresolved' },
        providerAttempts: 1,
      };
    },

    normalize(raw, request, metadata = {}) {
      if (!raw || !Number.isFinite(raw.lat) || !Number.isFinite(raw.lon)) return [];
      const query = request.parameters.query;
      const providerSource = raw.source || 'unknown';
      const observedAt = metadata.observedAt || new Date().toISOString();
      return [{
        entityId: null, // caller binds this to a stop-level key, not an evidence entity
        topic: TOPIC,
        evidenceType: 'fact',
        claim: {
          identity: `geocode_coordinate:${normalizedQuery(query)}`,
          text: `Geocoded "${raw.name || query}"`,
          normalizedValue: {
            latitude: raw.lat,
            longitude: raw.lon,
            resolvedName: raw.name || null,
            providerSource,
          },
          unit: null,
          status: 'resolved',
          subjectId: null,
          objectId: null,
          qualifiers: ['external_geocode_lookup'],
        },
        scope: { audience: 'public', locale: 'en-US' },
        source: {
          provider: 'geocode_coordinate',
          sourceClass: providerSource === 'trailverse-known-place' ? 'trusted_specialist' : 'external_geocoder',
          sourceId: providerSource,
          url: null,
          title: null,
          publishedAt: null,
          sourceUpdatedAt: null,
        },
        observedAt,
        quality: { authorityClass: 'external_geocoder', scopeMatch: 'exact', conflictStatus: 'none' },
        provenance: { extractionMethod: 'geocode_lookup', extractorVersion: 'geocode-coordinate-evidence-v1' },
      }];
    },

    classifyError(error) {
      if (error?.code === 'ABORT_ERR' || error?.name === 'AbortError') return { code: 'provider_cancelled', retryable: false };
      return { code: 'provider_invalid_response', retryable: false };
    },
  };
}

module.exports = { createGeocodeCoordinateEvidenceProvider, coordinateSourceFor, TOPIC };
