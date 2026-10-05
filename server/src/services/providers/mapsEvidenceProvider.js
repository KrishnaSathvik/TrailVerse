'use strict';

const { isRoutableEndpoint, normalizeRoutingEndpoint } = require('../../utils/routingEndpoint');

const MAPS_API_BASE = 'https://maps.googleapis.com/maps/api/distancematrix/json';
const ROUTE_MODES = Object.freeze(new Set(['driving', 'walking', 'bicycling', 'transit']));

function validPoint(point) {
  return isRoutableEndpoint(point);
}

function validRoute(route) {
  return validPoint(route?.origin) && validPoint(route?.destination)
    && ROUTE_MODES.has(route?.travelMode)
    && Boolean(route?.departureTimeBucket)
    && !Number.isNaN(new Date(route.departureTimeBucket).getTime());
}

function malformedRoute() {
  return Object.assign(new Error('Maps route response is malformed'), { code: 'maps_invalid_response' });
}

function metric(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw malformedRoute();
  return value;
}

function checkAbort(signal, providerAttempts = 0) {
  if (signal?.aborted) throw Object.assign(new Error('Maps request cancelled'), {
    code: 'ABORT_ERR', providerAttempts,
  });
}

/**
 * Interpret a Distance Matrix JSON body without network I/O.
 * Throws classified errors for auth/quota/invalid; returns null only for explicit ZERO_RESULTS / NOT_FOUND elements.
 */
function interpretDistanceMatrixResponse(data) {
  if (typeof data?.status !== 'string' || !data.status) throw malformedRoute();
  const topStatus = String(data?.status || 'UNKNOWN');
  if (topStatus === 'REQUEST_DENIED') {
    throw Object.assign(new Error('Google Distance Matrix REQUEST_DENIED'), {
      code: 'maps_not_configured',
      mapsStatus: topStatus,
      errorMessage: data?.error_message || null,
    });
  }
  if (topStatus === 'OVER_QUERY_LIMIT') {
    throw Object.assign(new Error('Google Distance Matrix OVER_QUERY_LIMIT'), {
      code: 'maps_rate_limited',
      mapsStatus: topStatus,
      errorMessage: data?.error_message || null,
    });
  }
  if (topStatus === 'INVALID_REQUEST') {
    throw Object.assign(new Error('Google Distance Matrix INVALID_REQUEST'), {
      code: 'maps_invalid_request',
      mapsStatus: topStatus,
      errorMessage: data?.error_message || null,
    });
  }
  if (topStatus !== 'OK') {
    throw Object.assign(new Error(`Google Distance Matrix ${topStatus}`), {
      code: 'provider_unavailable',
      mapsStatus: topStatus,
      errorMessage: data?.error_message || null,
    });
  }

  if (!Array.isArray(data.rows) || data.rows.length !== 1
    || !Array.isArray(data.rows[0]?.elements) || data.rows[0].elements.length !== 1) {
    throw malformedRoute();
  }
  const element = data.rows[0].elements[0];
  // Documented element statuses: NOT_FOUND is unresolved endpoints, whereas
  // ZERO_RESULTS is a successful search with no route. Neither is a metric.
  if (['ZERO_RESULTS', 'NOT_FOUND'].includes(element?.status)) return null;
  if (element?.status === 'MAX_ROUTE_LENGTH_EXCEEDED') {
    throw Object.assign(new Error('Maps route exceeds provider limit'), { code: 'maps_route_limit' });
  }
  if (element?.status !== 'OK') throw malformedRoute();

  const baseDurationSeconds = metric(element.duration?.value);
  const distanceMeters = metric(element.distance?.value);
  const durationInTrafficSeconds = element.duration_in_traffic == null
    ? null : metric(element.duration_in_traffic.value);
  return {
    distanceMeters,
    baseDurationSeconds,
    durationSeconds: durationInTrafficSeconds ?? baseDurationSeconds,
    durationInTrafficSeconds,
    providerStatus: topStatus,
  };
}

function appendMapsDiag(entry) {
  const dest = process.env.TRAILIE_MAPS_DIAG_PATH;
  if (!dest) return;
  try {
    const fs = require('fs');
    const line = JSON.stringify({
      at: new Date().toISOString(),
      ...entry,
    });
    fs.appendFileSync(dest, `${line}\n`);
  } catch {
    /* diagnostics must never break routing */
  }
}

function sanitizeMatrixErrorMessage(message) {
  if (!message) return null;
  return String(message)
    .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]');
}

function defaultMapsClient() {
  return {
    async getRoute(parameters, { signal } = {}) {
      let providerAttempts = 0;
      checkAbort(signal, providerAttempts);
      const apiKey = process.env.GMAPS_SERVER_KEY;
      if (!apiKey) {
        appendMapsDiag({
          phase: 'preflight',
          originEntityId: parameters?.origin?.entityId || null,
          destinationEntityId: parameters?.destination?.entityId || null,
          dispatchAttempted: false,
          errorCategory: 'maps_not_configured',
        });
        throw Object.assign(new Error('Google Maps API key is not configured'), {
          code: 'maps_not_configured', providerAttempts,
        });
      }
      const { getGoogleMaps } = require('../googleMapsTransport');
      const departure = Math.floor(new Date(parameters.departureTimeBucket).getTime() / 1000);
      const legKey = `${parameters.origin.entityId}->${parameters.destination.entityId}`;

      const callOnce = async ({ includeDepartureTime, attempt }) => {
        checkAbort(signal, providerAttempts);
        const departureTimeApplied = includeDepartureTime
          && ['driving', 'transit'].includes(parameters.travelMode);
        providerAttempts += 1;
        const response = await getGoogleMaps(MAPS_API_BASE, {
          params: {
            origins: `${parameters.origin.latitude},${parameters.origin.longitude}`,
            destinations: `${parameters.destination.latitude},${parameters.destination.longitude}`,
            mode: parameters.travelMode,
            ...(includeDepartureTime
              && (parameters.travelMode === 'driving' || parameters.travelMode === 'transit')
              ? { departure_time: departure }
              : {}),
            key: apiKey,
          },
          timeout: 10000,
          signal,
        });
        checkAbort(signal, providerAttempts);
        const data = response.data || {};
        const element = data?.rows?.[0]?.elements?.[0] || null;
        try {
          const raw = interpretDistanceMatrixResponse(data);
          checkAbort(signal, providerAttempts);
          // Traffic timing is meaningful only on a driving request that sent
          // departure_time. Reject contradictory provider payloads.
          if (raw?.durationInTrafficSeconds != null
            && (!departureTimeApplied || parameters.travelMode !== 'driving')) throw malformedRoute();
          appendMapsDiag({
            phase: 'matrix_response',
            legKey,
            originEntityId: parameters.origin.entityId,
            destinationEntityId: parameters.destination.entityId,
            attempt,
            includeDepartureTime: !!includeDepartureTime,
            dispatchAttempted: true,
            matrixTopStatus: data.status || null,
            elementStatus: element?.status || null,
            normalizedDurationSeconds: raw?.durationSeconds ?? null,
            normalizedDistanceMeters: raw?.distanceMeters ?? null,
            errorCategory: null,
            errorMessage: sanitizeMatrixErrorMessage(data.error_message),
          });
          return {
            outcome: raw ? 'route' : 'no_result',
            raw,
            metadata: {
              departureTimeApplied,
              requestedDepartureTimeBucket: parameters.departureTimeBucket,
              actualDepartureTimeBucket: departureTimeApplied ? parameters.departureTimeBucket : null,
              ...(raw ? {} : { noResultReason: element.status }),
            },
            providerAttempts,
          };
        } catch (error) {
          appendMapsDiag({
            phase: 'matrix_response',
            legKey,
            originEntityId: parameters.origin.entityId,
            destinationEntityId: parameters.destination.entityId,
            attempt,
            includeDepartureTime: !!includeDepartureTime,
            dispatchAttempted: true,
            matrixTopStatus: error.mapsStatus || data.status || null,
            elementStatus: element?.status || null,
            normalizedDurationSeconds: null,
            normalizedDistanceMeters: null,
            errorCategory: error.code || 'provider_unavailable',
            errorMessage: sanitizeMatrixErrorMessage(error.errorMessage || error.message),
          });
          throw error;
        }
      };

      try {
        try {
          return await callOnce({ includeDepartureTime: true, attempt: 1 });
        } catch (error) {
          checkAbort(signal, providerAttempts);
          // Align with the legacy itinerary drive-enrichment path: a bare matrix
          // query is often accepted when departure_time is rejected. Never invent durations.
          if (error?.code === 'maps_invalid_request'
            && (parameters.travelMode === 'driving' || parameters.travelMode === 'transit')) {
            appendMapsDiag({
              phase: 'retry_without_departure_time',
              legKey,
              originEntityId: parameters.origin.entityId,
              destinationEntityId: parameters.destination.entityId,
              retryWithoutDepartureTime: true,
              priorErrorCategory: error.code,
            });
            checkAbort(signal, providerAttempts);
            return await callOnce({ includeDepartureTime: false, attempt: 2 });
          }
          throw error;
        }
      } catch (error) {
        checkAbort(signal, providerAttempts);
        throw Object.assign(error, { providerAttempts });
      }
    },
  };
}

function createMapsEvidenceProvider({ mapsClient = null, now = () => new Date() } = {}) {
  const client = () => mapsClient || defaultMapsClient();
  return {
    id: 'google_maps',
    supports(requirement) {
      return requirement?.topic === 'driving_time' && validRoute(requirement.routeScope);
    },
    estimateCost() {
      return { costStatus: 'unknown', costUsd: null, providerAttemptLimit: 2 };
    },
    buildRequest(requirement) {
      if (requirement?.topic !== 'driving_time' || !validRoute(requirement.routeScope)) {
        throw new TypeError('Unsupported Maps evidence requirement');
      }
      const route = requirement.routeScope;
      const origin = normalizeRoutingEndpoint(route.origin);
      const destination = normalizeRoutingEndpoint(route.destination);
      const parameters = {
        origin: {
          entityId: origin.entityId,
          latitude: origin.latitude,
          longitude: origin.longitude,
        },
        destination: {
          entityId: destination.entityId,
          latitude: destination.latitude,
          longitude: destination.longitude,
        },
        travelMode: route.travelMode,
        departureTimeBucket: new Date(route.departureTimeBucket).toISOString(),
      };
      const publicCanonicalRequest = {
        provider: 'google_maps', operation: 'route',
        originEntityId: parameters.origin.entityId,
        destinationEntityId: parameters.destination.entityId,
        origin: { latitude: parameters.origin.latitude, longitude: parameters.origin.longitude },
        destination: { latitude: parameters.destination.latitude, longitude: parameters.destination.longitude },
        travelMode: parameters.travelMode,
        departureTimeBucket: parameters.departureTimeBucket,
      };
      return {
        provider: 'google_maps', operation: 'route', parameters,
        dedupeKey: `google_maps|route|${parameters.origin.entityId}|${parameters.destination.entityId}|${parameters.travelMode}|${parameters.departureTimeBucket}`,
        publicCanonicalRequest,
      };
    },
    async fetch(request, { signal } = {}) {
      checkAbort(signal);
      const result = await client().getRoute(request.parameters, { signal });
      // Preserve the injected legacy client seam (route object / null). The
      // built-in client always returns the explicit outcome envelope above.
      const structured = result && Object.hasOwn(result, 'outcome');
      if (structured && !['route', 'no_result'].includes(result.outcome)) throw malformedRoute();
      const providerAttempts = structured ? result.providerAttempts : 1;
      checkAbort(signal, providerAttempts);
      if (structured && ((result.outcome === 'route' && !result.raw)
        || (result.outcome === 'no_result' && result.raw !== null))) throw malformedRoute();
      return {
        raw: structured ? result.raw : result,
        metadata: {
          observedAt: now().toISOString(),
          departureTimeApplied: null,
          requestedDepartureTimeBucket: request.parameters.departureTimeBucket,
          actualDepartureTimeBucket: null,
          ...(structured ? result.metadata : {}),
        },
        completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' },
        providerAttempts,
      };
    },
    normalize(raw, request, metadata = {}) {
      if (raw === null) return [];
      if (!raw) throw malformedRoute();
      const distanceMeters = metric(raw.distanceMeters);
      const durationSeconds = metric(raw.durationSeconds);
      const durationInTrafficSeconds = raw.durationInTrafficSeconds == null
        ? null : metric(raw.durationInTrafficSeconds);
      const baseDurationSeconds = raw.baseDurationSeconds === undefined
        ? null : metric(raw.baseDurationSeconds);
      const departureTimeApplied = typeof metadata.departureTimeApplied === 'boolean'
        ? metadata.departureTimeApplied : null;
      const { origin, destination, travelMode, departureTimeBucket } = request.parameters;
      const observedAt = metadata.observedAt || now().toISOString();
      return [{
        entityId: destination.entityId,
        topic: 'driving_time', evidenceType: 'fact',
        claim: {
          identity: `google-maps-route:${origin.entityId}:${destination.entityId}:${travelMode}:${departureTimeBucket}`,
          text: null,
          normalizedValue: {
            distanceMeters, durationSeconds, baseDurationSeconds, durationInTrafficSeconds,
            travelMode,
            // The route scope/key retains the REQUESTED bucket for persistent
            // correlation. These fields explicitly describe the actual request.
            departureTimeBucket: departureTimeApplied === false ? null : departureTimeBucket,
            requestedDepartureTimeBucket: departureTimeBucket,
            actualDepartureTimeBucket: departureTimeApplied === true ? departureTimeBucket : null,
            departureTimeApplied,
          },
          unit: null, status: 'estimated_route', subjectId: origin.entityId, objectId: destination.entityId,
          qualifiers: ['route_specific', 'traffic_conditions_may_change',
            ...(departureTimeApplied === false ? ['departure_time_not_applied'] : [])],
        },
        scope: {
          geographicEntityIds: [origin.entityId, destination.entityId],
          validFrom: departureTimeApplied === false ? null : departureTimeBucket, validThrough: null,
          audience: 'public', locale: 'en-US',
          route: {
            originEntityId: origin.entityId, destinationEntityId: destination.entityId,
            travelMode, departureTimeBucket,
          },
        },
        source: {
          provider: 'google_maps', sourceClass: 'commercial_structured',
          sourceId: `google-maps-route:${origin.entityId}:${destination.entityId}:${travelMode}`,
          url: null, title: 'Google Maps route estimate', publishedAt: null, sourceUpdatedAt: null,
        },
        observedAt,
        quality: { authorityClass: 'commercial_structured', scopeMatch: 'exact', conflictStatus: 'none' },
        provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'maps-evidence-v1' },
      }];
    },
    classifyError(error) {
      const status = error?.response?.status;
      if (error?.code === 'maps_invalid_response') return { code: 'provider_invalid_response', retryable: false };
      if (error?.code === 'maps_route_limit') return { code: 'provider_unavailable', retryable: false };
      if (error?.code === 'maps_not_configured' || status === 401 || status === 403) {
        return { code: 'provider_not_configured', retryable: false };
      }
      if (error?.code === 'maps_rate_limited' || status === 429) {
        return { code: 'provider_rate_limited', retryable: false };
      }
      if (error?.code === 'maps_invalid_request') {
        return { code: 'provider_unavailable', retryable: false };
      }
      if (error?.code === 'ABORT_ERR' || error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') {
        return { code: 'provider_cancelled', retryable: false };
      }
      if (['ETIMEDOUT', 'ECONNABORTED'].includes(error?.code)) {
        return { code: 'provider_timeout', retryable: true };
      }
      return { code: 'provider_unavailable', retryable: status >= 500 || !status };
    },
  };
}

module.exports = {
  createMapsEvidenceProvider,
  interpretDistanceMatrixResponse,
};
