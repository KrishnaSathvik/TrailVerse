'use strict';

const { createNamedPlaceEvidenceProvider } = require('./providers/namedPlaceEvidenceProvider');
const { normalizeEvidenceLocation, validLocation } = require('../utils/trailieCanonicalLocation');
const { buildActivePlaceResolutionContext } = require('./geocodePlaceService');

const FORGE_FIELDS = Object.freeze([
  'latitude', 'longitude', 'lat', 'lon', 'lng', 'location', 'coords',
  'coordinateSource', 'evidenceRef', 'canonicalPlaceId', 'canonicalPlaceName',
  'placeId', 'googlePlaceId', 'providerId', 'provenance', 'sourceReferences',
  'travelEdges', 'route',
]);

function rejectForgeAttempt(body = {}) {
  return FORGE_FIELDS.some((key) => body[key] !== undefined);
}

function parkCodeOf(trip) {
  return trip?.parkCode
    || trip?.plan?.parkCode
    || trip?.planningState?.destination?.parkCode
    || trip?.plan?.destinations?.[0]?.parkCode
    || null;
}

function parkNameOf(trip) {
  return trip?.parkName
    || trip?.plan?.parkName
    || trip?.planningState?.destination?.parkName
    || trip?.plan?.destinations?.[0]?.name
    || null;
}

function buildQueryProvenance(trip, query) {
  const context = buildActivePlaceResolutionContext({
    planningState: trip?.planningState,
    parkCode: parkCodeOf(trip),
    parkName: parkNameOf(trip),
    resolvedMetadata: {
      parkCode: parkCodeOf(trip),
      parkName: parkNameOf(trip),
    },
  });
  const parkCode = context?.destination?.parkCode || parkCodeOf(trip);
  const parkName = context?.destination?.name || parkNameOf(trip);
  const states = Array.isArray(context?.regions)
    ? context.regions.map((r) => r.code || r.name).filter(Boolean)
    : [];
  const destinationAnchors = parkCode && parkName
    ? [{
      source: 'nps',
      parkCode: String(parkCode).toLowerCase(),
      sourceId: `nps:park:${String(parkCode).toLowerCase()}`,
      name: parkName,
      country: 'US',
      states,
      ...(Number.isFinite(context?.destination?.coordinates?.lat)
        && Number.isFinite(context?.destination?.coordinates?.lon)
        ? {
          latitude: context.destination.coordinates.lat,
          longitude: context.destination.coordinates.lon,
        }
        : {}),
    }]
    : [];

  return {
    rawTravelerPlaceText: query,
    groundedPlaceText: null,
    destinationAnchors,
    destinationNames: parkName ? [parkName] : [],
    contextualRegions: Array.isArray(context?.regions) ? context.regions : [],
  };
}

function publicChoice(row) {
  const value = row.claim?.normalizedValue || {};
  return {
    candidateId: row.claim?.identity || row.entityId,
    name: value.name || value.canonicalPlaceName,
    subtitle: value.canonicalPlaceName && value.canonicalPlaceName !== value.name
      ? value.canonicalPlaceName
      : null,
  };
}

function evidenceIdFor(row, index) {
  return `manual-place:${row.claim?.identity || row.entityId || index}`;
}

/**
 * Resolve a human place query for manual add_place.
 * Inject `provider` in tests; production uses the default named_place provider.
 *
 * @returns {Promise<
 *   | { status: 'resolved', evidence, stopSeed }
 *   | { status: 'ambiguous', code: 'place_ambiguous', query, choices }
 *   | { status: 'unresolved', code: 'place_unresolved', query }
 * >}
 */
async function resolveManualPlace({
  query,
  trip,
  candidateId = null,
  provider = null,
  now = () => new Date(),
  signal = undefined,
} = {}) {
  const trimmed = typeof query === 'string' ? query.trim() : '';
  if (trimmed.length < 2 || trimmed.length > 200) {
    return { status: 'unresolved', code: 'place_unresolved', query: trimmed };
  }

  const named = provider || createNamedPlaceEvidenceProvider({ now });
  const request = named.buildRequest({
    preferredProviders: ['named_place'],
    topic: 'activities',
    entity: { displayName: trimmed, entityId: `place:request:${trimmed.toLowerCase()}` },
    queryProvenance: buildQueryProvenance(trip, trimmed),
  });

  let fetched;
  try {
    fetched = await named.fetch(request, { signal });
  } catch {
    return { status: 'unresolved', code: 'place_unresolved', query: trimmed };
  }

  const observedAt = fetched.metadata?.observedAt || now().toISOString();
  const expiresAt = new Date(+now() + 24 * 60 * 60 * 1000).toISOString();
  const rows = named.normalize(fetched.raw, request, fetched.metadata || {})
    .map((row, index) => normalizeEvidenceLocation({
      ...row,
      evidenceId: evidenceIdFor(row, index),
      observation: { observedAt, expiresAt },
    }))
    .filter((row) => validLocation(row.claim?.normalizedValue?.location));

  const byId = (row) => row.claim?.identity || row.entityId;

  if (typeof candidateId === 'string' && candidateId) {
    const pick = rows.find((row) => byId(row) === candidateId);
    if (!pick) {
      return { status: 'unresolved', code: 'place_unresolved', query: trimmed };
    }
    return {
      status: 'resolved',
      evidence: pick,
      stopSeed: stopSeedFromEvidence(pick),
    };
  }

  if (fetched.raw) {
    const exact = rows.find((row) => !row.claim?.normalizedValue?.alternativeFor) || rows[0];
    if (exact) {
      return {
        status: 'resolved',
        evidence: exact,
        stopSeed: stopSeedFromEvidence(exact),
      };
    }
  }

  const choices = rows.map(publicChoice).filter((c) => c.candidateId && c.name);
  if (choices.length > 1 || fetched.metadata?.unresolvedReason === 'ambiguous_identity') {
    return {
      status: 'ambiguous',
      code: 'place_ambiguous',
      query: trimmed,
      choices: choices.slice(0, 6),
    };
  }

  if (choices.length === 1) {
    // Grounded alternative with a single eligible place — still ask? Contract says
    // no silent fuzzy substitution. A single grounded alternative for a different
    // name is ambiguous UX-wise; only accept when fetched.raw selected exactly.
    return {
      status: 'ambiguous',
      code: 'place_ambiguous',
      query: trimmed,
      choices,
    };
  }

  return { status: 'unresolved', code: 'place_unresolved', query: trimmed };
}

function stopSeedFromEvidence(row) {
  const value = row.claim?.normalizedValue || {};
  const location = value.location;
  return {
    name: value.name,
    canonicalPlaceName: value.canonicalPlaceName || value.name,
    displayName: value.name,
    canonicalPlaceId: row.claim?.identity || row.entityId,
    evidenceRef: row.evidenceId,
    resolutionStatus: 'resolved',
    location: {
      lat: location.lat,
      lon: location.lon,
      status: location.status,
      source: location.source,
      authority: location.authority,
      sourceRef: location.sourceRef,
      sourceEntity: location.sourceEntity || null,
    },
    sourceReferences: [{
      evidenceId: row.evidenceId,
      url: row.source?.url || null,
      observedAt: row.observation?.observedAt || null,
    }],
    ...(value.experience && value.mapAnchor
      ? { experience: value.experience, mapAnchor: value.mapAnchor }
      : {}),
    ...(value.placeKind
      ? { placeKind: value.placeKind, placeTypes: value.placeTypes || [] }
      : {}),
    type: value.placeKind === 'area' ? 'custom' : 'viewpoint',
    note: '',
    timeWindow: 'Morning',
    duration: 45,
    startTime: '',
  };
}

module.exports = {
  FORGE_FIELDS,
  rejectForgeAttempt,
  resolveManualPlace,
  stopSeedFromEvidence,
  buildQueryProvenance,
};
