'use strict';

/**
 * Planning Readiness Pass #3 — generic destination resolution.
 * Uses existing local catalogs (parkExtractor + cityCoordinates + KNOWN_PLACES).
 * No provider calls. No destination-specific production branches.
 */

const {
  extractAllParksFromMessage,
  PARK_NAME_TO_CODE,
  getParkCatalogMentionEntries,
  getParkIdentityByCode,
} = require('./parkExtractor');
const { CITIES } = require('./cityCoordinates');
const { KNOWN_PLACES } = require('../services/geocodePlaceService');
const {
  resolvePlanningGeographyFromMessage,
  isRegionalParksAsk,
} = require('./planningGeography');
const {
  getPersistedOfficialPlaceRecords,
  resolvePersistedOfficialPlaces,
  getPersistedOfficialPlaceIndex,
} = require('./persistedOfficialPlaceLookup');
const {
  buildOfficialPlaceIndex,
  officialPlacesMentionedIn,
  npsUnitIdentityFromOfficialIndex,
} = require('./officialPlaceIndex');

function usableCoord(value, max) {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 && n >= -max && n <= max ? n : null;
}

function titleCaseName(key) {
  return String(key || '')
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function parkIdentityFromCode(parkCode) {
  const code = String(parkCode || '').toLowerCase();
  if (!code) return null;
  const catalog = getParkIdentityByCode(code);
  if (catalog) return catalog;
  const records = getPersistedOfficialPlaceRecords();
  const index = getPersistedOfficialPlaceIndex()
    || (Array.isArray(records) && records.length ? buildOfficialPlaceIndex(records) : null);
  return npsUnitIdentityFromOfficialIndex(index, code);
}

function mentionedFromOfficialPlaces(places) {
  return (places || []).map((place) => ({
    name: place.canonicalName,
    key: place.nameKey,
    role: 'experience',
    entityId: place.entityId || null,
  }));
}

/**
 * Official places are experiences, not destinations.
 * Unique place-only mentions may infer the parent park; they never replace it.
 */
function applyOfficialPlaceContext(text, npsEntities, officialPlaces) {
  const records = Array.isArray(officialPlaces) && officialPlaces.length
    ? officialPlaces
    : getPersistedOfficialPlaceRecords();
  const resolved = resolvePersistedOfficialPlaces({ text, records });
  let hits = resolved.places || [];
  const parentCodes = [...new Set((npsEntities || []).map((entity) => entity.parkCode).filter(Boolean))];
  if (parentCodes.length === 1) {
    const index = getPersistedOfficialPlaceIndex()
      || (Array.isArray(records) && records.length ? buildOfficialPlaceIndex(records) : null);
    if (index?.places?.length) {
      const scoped = officialPlacesMentionedIn(text, index, { parkCode: parentCodes[0] });
      const seen = new Set(hits.map((place) => place.entityId || place.evidenceId));
      for (const place of scoped) {
        const id = place.entityId || place.evidenceId;
        if (seen.has(id)) continue;
        seen.add(id);
        hits = [...hits, place];
      }
    }
  }
  if (hits.length === 0) return npsEntities;

  const uniqueParent = resolved.status === 'exact' ? resolved.parentParkCode : null;
  const entities = npsEntities || [];
  const onlyEmbedded = entities.length > 0 && entities.every((entity) => entity.featureEmbedded === true);

  if ((entities.length === 0 || onlyEmbedded) && uniqueParent) {
    const catalog = parkIdentityFromCode(uniqueParent);
    if (!catalog) return onlyEmbedded ? [] : entities;
    return [toNpsDestinationEntity({
      parkCode: uniqueParent,
      lat: catalog.lat,
      lon: catalog.lon,
      parkName: catalog.parkName || titleCaseName(catalog.key),
      identitySource: catalog.source || null,
      unitKind: catalog.kind || null,
      mentionedPlaces: mentionedFromOfficialPlaces(hits.filter((place) => place.parkCode === uniqueParent)),
      focalPlace: false,
    }, 0)];
  }

  if (entities.length === 0) return entities;

  return entities.map((entity) => {
    const extra = hits.filter((place) => place.parkCode === entity.parkCode);
    if (extra.length === 0) return entity;
    const existing = new Set((entity.mentionedPlaces || []).map((p) => String(p.name || '').toLowerCase()));
    const mentionedPlaces = [
      ...(entity.mentionedPlaces || []),
      ...mentionedFromOfficialPlaces(extra).filter((p) => !existing.has(String(p.name).toLowerCase())),
    ];
    return { ...entity, mentionedPlaces };
  });
}

function slugifyLabel(label) {
  return String(label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Find first occurrence index of a catalog key in lowercased message.
 */
function firstIndexOfKey(lowerMsg, key) {
  const idx = lowerMsg.indexOf(key);
  return idx < 0 ? null : idx;
}

function toNpsDestinationEntity(park, order) {
  const latitude = usableCoord(park.lat ?? park.latitude, 90);
  const longitude = usableCoord(park.lon ?? park.longitude, 180);
  const code = String(park.parkCode || '').toLowerCase();
  const catalogIdentity = getParkIdentityByCode(code) || {};
  const identitySource = park.identitySource || catalogIdentity.source || null;
  const unitKind = park.unitKind || catalogIdentity.kind || null;
  const entity = {
    entityId: code ? `nps:park:${code}` : null,
    entityType: 'national_park',
    parkCode: code || null,
    displayName: park.parkName || park.fullName || catalogIdentity.parkName || code,
    latitude,
    longitude,
    resolutionConfidence: latitude != null && longitude != null ? 1 : 0.5,
    order,
    // Phase 9B.1 note: this is the DESTINATION/ENTITY-identity layer's own
    // coordinate-resolution status ('resolved' / 'unresolved_coords'),
    // consistent across genericDestinationResolver.js, planningGeography.js,
    // planningState.js, and trailieV2ExecutionService.js. It is a distinct
    // concept from roadTripContract.js's route-LEG status vocabulary
    // ('requires_driving_evidence' / 'unresolved_coordinates' /
    // 'unresolved_endpoint'), which describes a leg BETWEEN two already-
    // identified entities, not one entity's own coordinate state. The
    // similar names are NOT a bug to unify — each layer is internally
    // consistent; don't collapse them into one enum.
    status: latitude != null && longitude != null ? 'resolved' : 'unresolved_coords',
    source: 'nps_catalog',
  };
  if (identitySource) entity.identitySource = identitySource;
  if (unitKind) entity.npsUnitKind = unitKind;
  if (Array.isArray(park.mentionedPlaces) && park.mentionedPlaces.length > 0) {
    entity.mentionedPlaces = park.mentionedPlaces.map((p) => ({
      name: p.name || titleCaseName(p.key),
      key: p.key || null,
      role: p.role || 'subordinate_place',
    }));
  }
  if (park.focalPlace === true) entity.focalPlace = true;
  if (park.featureEmbedded === true) entity.featureEmbedded = true;
  return entity;
}

function toKnownPlaceEntity(place, order) {
  const latitude = usableCoord(place.lat, 90);
  const longitude = usableCoord(place.lon, 180);
  const key = String(place.key || place.name || '').toLowerCase();
  return {
    entityId: `place:known:${slugifyLabel(key)}`,
    entityType: 'known_place',
    parkCode: null,
    displayName: place.name || titleCaseName(key),
    latitude,
    longitude,
    resolutionConfidence: latitude != null && longitude != null ? 0.95 : 0.4,
    order,
    status: latitude != null && longitude != null ? 'resolved' : 'unresolved_coords',
    source: 'known_place_catalog',
  };
}

function toUnresolvedDestinationEntity(label, order) {
  const displayName = titleCaseName(String(label || '').trim());
  const slug = slugifyLabel(displayName) || `slot-${order}`;
  return {
    entityId: `unresolved:${slug}`,
    entityType: 'unresolved_destination',
    parkCode: null,
    displayName,
    latitude: null,
    longitude: null,
    resolutionConfidence: 0,
    order,
    status: 'unresolved',
    source: 'user_requested',
  };
}

/**
 * Resolve known-place catalog hits from message (offline, sync).
 */
function resolveKnownPlacesFromMessage(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return [];

  const keys = Object.keys(KNOWN_PLACES).sort((a, b) => b.length - a.length);
  const found = [];
  const usedKeys = new Set();

  for (const key of keys) {
    if (!lower.includes(key)) continue;
    // Skip if a longer key already covers this span (e.g. full NRA name vs short).
    let covered = false;
    for (const used of usedKeys) {
      if (used.includes(key) || key.includes(used)) {
        covered = true;
        break;
      }
    }
    if (covered) continue;
    usedKeys.add(key);
    const place = KNOWN_PLACES[key];
    found.push({
      ...place,
      key,
      _index: firstIndexOfKey(lower, key),
    });
  }

  found.sort((a, b) => (a._index ?? 0) - (b._index ?? 0));
  return found.map((p, i) => toKnownPlaceEntity(p, i));
}

/**
 * Extract ordered destination labels from through/via/then road-trip phrasing.
 * Generic — no destination hardcodes.
 */
function extractOrderedDestinationLabels(message) {
  const text = String(message || '');
  if (!text.trim()) return [];

  const multiCue =
    /\b(?:through|via|then|→|->)\b/i.test(text) ||
    /\broad\s*trip\b/i.test(text) ||
    (/\bfrom\b/i.test(text) && /\band\b/i.test(text));

  if (!multiCue) return [];

  let segment = null;
  const throughMatch = text.match(
    /\b(?:through|via)\s+(.+?)(?=\s+over\s+\d|\s+for\s+\d|\s+in\s+\d|\s+with\b|\s+we(?:'ll| will)\b|\s+don't\b|\s+do not\b|[.?!]|$)/i
  );
  if (throughMatch?.[1]) segment = throughMatch[1];

  if (!segment) {
    const thenChain = text.match(
      /\b(?:visiting|visit|to)\s+(.+?)(?=\s+over\s+\d|\s+for\s+\d|\s+as a\b|[.?!]|$)/i
    );
    if (thenChain?.[1] && /\b(?:then|,|and)\b/i.test(thenChain[1])) {
      segment = thenChain[1];
    }
  }

  if (!segment) return [];

  // Drop trailing constraint clauses that leaked in.
  segment = segment
    .replace(/\b(?:we'll|we will|want|camping|hiking|scenery|don't|do not).*$/i, '')
    .trim();

  const parts = segment
    .split(/\s*,\s*|\s+then\s+|\s+→\s+|\s+->\s+|\s+and\s+/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => p.length >= 3)
    .filter((p) => !/^(from|starting|in|at|the|a|an)$/i.test(p))
    .filter((p) => !isGenericNonDestinationLabel(p));

  // Deduplicate while preserving order.
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

/**
 * Reject collective / constraint phrases that are not concrete destinations.
 */
function isGenericNonDestinationLabel(label) {
  const l = String(label || '').toLowerCase().trim();
  if (!l) return true;
  if (/^(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:national\s+)?parks?\b/.test(l)) {
    return true;
  }
  if (/^(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+\w+\s+parks?\b/.test(l)) {
    return true;
  }
  if (/\b(?:hours?|hrs?|minutes?|kids?|children|friends?|budget|driving)\b/.test(l)) {
    return true;
  }
  if (/^(?:parks?|destinations?|stops?|places?)$/.test(l)) return true;
  return false;
}

function labelMatchesEntity(label, entity) {
  const l = String(label || '').toLowerCase().trim();
  if (!l) return false;
  const name = String(entity.displayName || '').toLowerCase();
  const code = String(entity.parkCode || '').toLowerCase();
  if (name && (name.includes(l) || l.includes(name))) return true;
  if (code && l.includes(code)) return true;
  // Strip common designation words for fuzzy NPS matching.
  const strip = (s) =>
    s
      .replace(
        /\b(national(?:\s+(?:park|monument|recreation area|historic(?:al)?(?:\s+park|site)?)|seashore|lakeshore|preserve)?|nra)\b/gi,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim();
  const ls = strip(l);
  const ns = strip(name);
  if (ls && ns && (ns.includes(ls) || ls.includes(ns))) return true;
  return false;
}

function resolveNpsFromCatalogEntries(lower, catalogEntries) {
  const found = [];
  const used = new Set();
  const sorted = [...catalogEntries].sort((a, b) => {
    const aLandmark = a.kind === 'landmark' ? 1 : 0;
    const bLandmark = b.kind === 'landmark' ? 1 : 0;
    // Park identity before landmarks; then longer keys first.
    if (aLandmark !== bLandmark) return aLandmark - bLandmark;
    return String(b.key || '').length - String(a.key || '').length;
  });
  for (const entry of sorted) {
    const key = String(entry.key || '').toLowerCase();
    if (!key || !lower.includes(key) || used.has(entry.code)) continue;
    used.add(entry.code);
    found.push({
      parkCode: entry.code,
      lat: entry.lat,
      lon: entry.lon,
      parkName: titleCaseName(key),
      mentionedPlaces: [],
      focalPlace: entry.kind === 'landmark',
      _index: firstIndexOfKey(lower, key),
    });
  }
  // Attach subordinate landmark mentions for codes that also matched landmarks.
  for (const entry of catalogEntries) {
    if (entry.kind !== 'landmark') continue;
    const key = String(entry.key || '').toLowerCase();
    if (!key || !lower.includes(key)) continue;
    const park = found.find((p) => p.parkCode === entry.code);
    if (!park || park.focalPlace) continue;
    park.mentionedPlaces.push({
      name: titleCaseName(key),
      key,
      role: 'subordinate_place',
    });
  }
  found.sort((a, b) => (a._index ?? 0) - (b._index ?? 0));
  return found.map((p, i) => {
    const { _index, ...rest } = p;
    return toNpsDestinationEntity(rest, i);
  });
}

/**
 * Resolve destinations from message using local catalogs, ordered by first mention.
 * Preserves unmatched multi-dest labels as explicit unresolved entities.
 *
 * @param {string} message
 * @param {{ catalogEntries?: Array<{key:string,code:string,lat:number,lon:number}> }} [options]
 */
function resolveDestinationsFromMessage(message, options = {}) {
  const text = String(message || '');
  if (!text.trim()) return [];

  const lower = text.toLowerCase();

  // Prefer extractAllParksFromMessage for skip-context filtering, then re-order
  // by first mention index using hardcoded + dynamic catalog keys.
  let npsEntities = [];
  const extracted = extractAllParksFromMessage(text);

  if (extracted.length === 0 && Array.isArray(options.catalogEntries)) {
    npsEntities = resolveNpsFromCatalogEntries(lower, options.catalogEntries);
  } else {
    const codeToIndex = new Map();
    for (const { key, code } of getParkCatalogMentionEntries()) {
      if (!lower.includes(key)) continue;
      const idx = firstIndexOfKey(lower, key);
      if (idx == null) continue;
      const prev = codeToIndex.get(code);
      if (prev == null || idx < prev) codeToIndex.set(code, idx);
    }
    // Also index injected catalog entries when mixed with live extraction.
    if (Array.isArray(options.catalogEntries)) {
      for (const entry of options.catalogEntries) {
        const key = String(entry.key || '').toLowerCase();
        if (!key || !lower.includes(key)) continue;
        const idx = firstIndexOfKey(lower, key);
        if (idx == null) continue;
        const prev = codeToIndex.get(entry.code);
        if (prev == null || idx < prev) codeToIndex.set(entry.code, idx);
      }
      // Merge any catalog-only codes not returned by extractAllParksFromMessage.
      const extractedCodes = new Set(extracted.map((p) => p.parkCode));
      for (const entry of options.catalogEntries) {
        if (extractedCodes.has(entry.code)) continue;
        const key = String(entry.key || '').toLowerCase();
        if (!key || !lower.includes(key)) continue;
        extracted.push({
          parkCode: entry.code,
          lat: entry.lat,
          lon: entry.lon,
          parkName: titleCaseName(key),
        });
        extractedCodes.add(entry.code);
      }
    }

    const ordered = [...extracted].sort((a, b) => {
      const ia = codeToIndex.get(a.parkCode);
      const ib = codeToIndex.get(b.parkCode);
      // Missing index sorts last (not before everything via ?? 0).
      return (ia ?? Number.MAX_SAFE_INTEGER) - (ib ?? Number.MAX_SAFE_INTEGER);
    });
    npsEntities = ordered.map((p, i) => toNpsDestinationEntity(p, i));
  }

  npsEntities = applyOfficialPlaceContext(text, npsEntities, options.officialPlaces);

  const knownEntities = resolveKnownPlacesFromMessage(text);

  // Merge NPS + known places by mention order, deduping overlapping spans.
  const merged = [];
  const usedEntityIds = new Set();
  const candidates = [
    ...npsEntities.map((e) => ({
      entity: e,
      index: firstIndexOfKey(lower, String(e.displayName || '').toLowerCase())
        ?? (e.parkCode
          ? [...getParkCatalogMentionEntries()]
            .filter((x) => x.code === e.parkCode)
            .map((x) => firstIndexOfKey(lower, x.key))
            .filter((i) => i != null)
            .sort((a, b) => a - b)[0]
          : null),
    })),
    ...knownEntities.map((e) => ({
      entity: e,
      index: firstIndexOfKey(lower, String(e.displayName || '').toLowerCase().split(',')[0].trim())
        ?? firstIndexOfKey(
          lower,
          Object.keys(KNOWN_PLACES).find((k) => e.entityId.includes(slugifyLabel(k))) || ''
        ),
    })),
  ];

  candidates.sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER));
  for (const { entity } of candidates) {
    if (!entity?.entityId || usedEntityIds.has(entity.entityId)) continue;
    usedEntityIds.add(entity.entityId);
    merged.push(entity);
  }

  const geoEntities = resolvePlanningGeographyFromMessage(text);
  const keepStateWithParks = isRegionalParksAsk(text) || npsEntities.length === 0;
  for (const geo of geoEntities) {
    if (!geo?.entityId || usedEntityIds.has(geo.entityId)) continue;
    if (geo.entityType === 'state' && npsEntities.length > 0 && !keepStateWithParks) continue;
    usedEntityIds.add(geo.entityId);
    merged.push({ ...geo, order: merged.length });
  }

  // Multi-destination labels: preserve unresolved requested stops.
  const labels = extractOrderedDestinationLabels(text);
  if (labels.length > 0) {
    const orderedSlots = [];
    const claimed = new Set();

    for (const label of labels) {
      const match = merged.find(
        (e) => !claimed.has(e.entityId) && labelMatchesEntity(label, e)
      );
      if (match) {
        claimed.add(match.entityId);
        orderedSlots.push(match);
      } else {
        // Also try resolving the label against known places / NPS catalogs alone.
        const labelLower = label.toLowerCase();
        let resolved = null;
        for (const [key, place] of Object.entries(KNOWN_PLACES)) {
          if (labelLower.includes(key) || key.includes(labelLower)) {
            resolved = toKnownPlaceEntity({ ...place, key }, orderedSlots.length);
            break;
          }
        }
        if (!resolved && Array.isArray(options.catalogEntries)) {
          for (const entry of options.catalogEntries) {
            const key = String(entry.key || '').toLowerCase();
            if (labelLower.includes(key) || key.includes(labelLower)) {
              resolved = toNpsDestinationEntity(
                {
                  parkCode: entry.code,
                  lat: entry.lat,
                  lon: entry.lon,
                  parkName: titleCaseName(key),
                },
                orderedSlots.length
              );
              break;
            }
          }
        }
        if (!resolved) {
          for (const { key, code } of getParkCatalogMentionEntries()) {
            if (labelLower.includes(key) || key.includes(labelLower)) {
              const hardcoded = PARK_NAME_TO_CODE.get(key);
              resolved = toNpsDestinationEntity(
                {
                  parkCode: code,
                  lat: hardcoded?.lat,
                  lon: hardcoded?.lon,
                  parkName: titleCaseName(key),
                },
                orderedSlots.length
              );
              // Prefer extractAllParks coords when available.
              const fromExtract = extracted.find((p) => p.parkCode === code);
              if (fromExtract) {
                resolved = toNpsDestinationEntity(fromExtract, orderedSlots.length);
              }
              break;
            }
          }
        }
        orderedSlots.push(resolved || toUnresolvedDestinationEntity(label, orderedSlots.length));
      }
    }

    // Append any resolved entities not claimed by ordered labels (rare).
    for (const entity of merged) {
      if (!claimed.has(entity.entityId) && !orderedSlots.some((e) => e.entityId === entity.entityId)) {
        // Only keep if its mention is outside the through-list (e.g. extra park elsewhere).
        orderedSlots.push(entity);
      }
    }

    return orderedSlots.map((e, i) => ({ ...e, order: i }));
  }

  return merged.map((e, i) => ({ ...e, order: i }));
}

/**
 * Resolve an origin city from "from X" / "starting in X" language using local CITIES.
 * Offline only — no geocoding provider.
 */
function resolveOriginFromMessage(message) {
  const text = String(message || '');
  if (!text.trim()) return null;
  const lower = text.toLowerCase();

  const fromMatch = lower.match(
    /\b(?:from|starting(?:\s+in|\s+at)?|begin(?:ning)?(?:\s+in|\s+at)?|leave(?:\s+from)?)\s+([a-z][a-z\s.'-]{1,40}?)(?:\s+through|\s+to|\s+via|\s+toward|\s*,|\s+and\b|$)/i
  );
  const candidate = fromMatch?.[1]?.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!candidate) return null;

  // Longest city key match against the candidate / message.
  const cityKeys = Object.keys(CITIES).sort((a, b) => b.length - a.length);
  for (const key of cityKeys) {
    if (candidate === key || candidate.startsWith(`${key} `) || lower.includes(`from ${key}`)) {
      const city = CITIES[key];
      const latitude = usableCoord(city.lat, 90);
      const longitude = usableCoord(city.lon, 180);
      return {
        entityId: `place:city:${key.replace(/\s+/g, '-')}`,
        entityType: 'city',
        parkCode: null,
        displayName: titleCaseName(key),
        latitude,
        longitude,
        resolutionConfidence: latitude != null && longitude != null ? 0.95 : 0.4,
        order: -1,
        status: latitude != null && longitude != null ? 'resolved' : 'unresolved_coords',
        state: city.state || null,
      };
    }
  }

  // Explicit origin mentioned but not in local city catalog.
  if (fromMatch) {
    return {
      entityId: null,
      entityType: 'unresolved_origin',
      parkCode: null,
      displayName: titleCaseName(candidate),
      latitude: null,
      longitude: null,
      resolutionConfidence: 0,
      order: -1,
      status: 'unresolved',
      state: null,
    };
  }

  return null;
}

/**
 * Convert destinations (+ optional origin) into planner resolvedEntities shape.
 * Entities without coordinates are included with null lat/lon so callers can
 * distinguish unresolved route coverage (planner routeScope still requires coords).
 */
function toPlannerEntities(destinations = [], { includeUnresolvedCoords = false } = {}) {
  const out = [];
  for (const d of destinations) {
    if (!d?.entityId) continue;
    const hasCoords = d.latitude != null && d.longitude != null;
    const isExplicitUnresolved = d.status === 'unresolved' || d.entityType === 'unresolved_destination';
    if (!hasCoords && !includeUnresolvedCoords && !isExplicitUnresolved) continue;
    out.push({
      entityId: d.entityId,
      canonicalId: d.entityId.startsWith('nps:park:')
        ? `park:nps:${d.parkCode}`
        : d.entityId,
      displayName: d.displayName,
      name: d.displayName,
      latitude: d.latitude,
      longitude: d.longitude,
      lat: d.latitude,
      lon: d.longitude,
      resolutionConfidence: d.resolutionConfidence,
      confidence: d.resolutionConfidence,
      entityType: d.entityType,
      status: d.status,
    });
  }
  return out;
}

module.exports = {
  resolveDestinationsFromMessage,
  resolveOriginFromMessage,
  toPlannerEntities,
  usableCoord,
  extractOrderedDestinationLabels,
  resolveKnownPlacesFromMessage,
  parkIdentityFromCode,
};
