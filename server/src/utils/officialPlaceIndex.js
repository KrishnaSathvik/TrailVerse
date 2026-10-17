'use strict';

/**
 * Generic official-place registry over NPS/evidence rows.
 *
 * Internal generation/validation index only — not a traveler-facing schema.
 * Exact normalized identity; no fuzzy semantic substitution.
 */

const { canonicalExperienceKey } = require('./canonicalExperience');
const { entityIdForEvidence } = require('./stableEvidenceEntity');

const TAXONOMY = new Set(['taxonomy', 'activity_taxonomy']);

function finiteCoord(value, max) {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 && n >= -max && n <= max ? n : null;
}

function extractOfficialCoordinates(normalizedValue) {
  if (!normalizedValue || typeof normalizedValue !== 'object') return null;
  const nested = normalizedValue.coordinates && typeof normalizedValue.coordinates === 'object'
    ? normalizedValue.coordinates
    : null;
  const latitude = finiteCoord(normalizedValue.latitude ?? nested?.latitude, 90);
  const longitude = finiteCoord(normalizedValue.longitude ?? nested?.longitude, 180);
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude };
}

function parkCodeOf(item, value) {
  const fromValue = String(value?.parkCode || '').toLowerCase().trim();
  if (fromValue) return fromValue;
  const dest = String(value?.destinationId || item?.entityId || '');
  const match = /^nps:park:([a-z0-9_-]+)$/i.exec(dest);
  return match ? match[1].toLowerCase() : null;
}

function officialNameKey(name) {
  const stripped = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, '');
  return canonicalExperienceKey(stripped);
}

function officialNameKeys(value) {
  const names = [
    value?.name,
    ...(Array.isArray(value?.aliases) ? value.aliases : []),
  ];
  const keys = [];
  const seen = new Set();
  for (const name of names) {
    if (typeof name !== 'string' || !name.trim()) continue;
    const key = officialNameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push({ key, sourceName: name.trim() });
  }
  return keys;
}

const GENERIC_PLACE_TYPE_SUFFIXES = Object.freeze([
  'visitor center',
  'parking area',
  'picnic area',
  'trailhead',
  'overlook',
  'viewpoint',
  'trail',
  'walk',
  'road',
]);

const GENERIC_PLACE_TYPE_KEYS = new Set(GENERIC_PLACE_TYPE_SUFFIXES);

function derivedOfficialTitleAlias(nameKey) {
  const tokens = String(nameKey || '').split(' ').filter(Boolean);
  if (tokens.length < 2) return null;
  for (const suffix of GENERIC_PLACE_TYPE_SUFFIXES) {
    const suffixTokens = suffix.split(' ');
    if (tokens.length <= suffixTokens.length) continue;
    if (tokens.slice(-suffixTokens.length).join(' ') !== suffix) continue;
    const stem = tokens.slice(0, -suffixTokens.length).join(' ');
    if (!stem || GENERIC_PLACE_TYPE_KEYS.has(stem)) return null;
    return stem;
  }
  return null;
}

function parentUnitNameOf(value, placeNameKey) {
  const candidates = [
    value?.parentParkName,
    value?.parentUnitName,
    value?.parkName,
    value?.destinationName,
  ];
  for (const name of candidates) {
    if (typeof name !== 'string' || !name.trim()) continue;
    const key = officialNameKey(name);
    if (!key || key === placeNameKey) continue;
    return name.trim();
  }
  return null;
}

function parentUnitCoords(value) {
  const lat = finiteCoord(value?.parentLatitude ?? value?.parkLatitude, 90);
  const lon = finiteCoord(value?.parentLongitude ?? value?.parkLongitude, 180);
  if (lat == null || lon == null) return null;
  return { latitude: lat, longitude: lon };
}

function isTrustedNpsProvenance(item) {
  const provider = item?.source?.provider;
  const sourceClass = item?.source?.sourceClass || item?.quality?.authorityClass;
  if (provider && provider !== 'nps' && provider !== 'curated_experience') return false;
  if (sourceClass && sourceClass !== 'official_owner' && sourceClass !== 'nps') return false;
  return provider === 'nps' || sourceClass === 'official_owner';
}

function isIndexablePlace(item) {
  if (!item || item.evidenceType !== 'fact') return false;
  const value = item.claim?.normalizedValue;
  if (!value || typeof value !== 'object' || typeof value.name !== 'string') return false;
  if (TAXONOMY.has(String(value.category || '').toLowerCase())) return false;
  const provider = item.source?.provider;
  if (provider && provider !== 'nps' && provider !== 'curated_experience') return false;
  return Boolean(officialNameKey(value.name));
}

function placeRecord(item) {
  const value = item.claim.normalizedValue;
  const coords = extractOfficialCoordinates(value);
  const parkCode = parkCodeOf(item, value);
  const entityId = value.entityId || entityIdForEvidence(item) || null;
  const nameKey = officialNameKey(value.name);
  const derivedAlias = derivedOfficialTitleAlias(nameKey);
  const parentCoords = parentUnitCoords(value);
  return {
    canonicalName: value.name.trim(),
    nameKey,
    entityId,
    evidenceId: item.evidenceId || null,
    parkCode,
    destinationId: value.destinationId || (parkCode ? `nps:park:${parkCode}` : item.entityId || null),
    category: value.category || null,
    activityTypes: Array.isArray(value.activityTypes) ? value.activityTypes : [],
    coordinates: coords,
    aliases: (value.aliases || []).filter((a) => typeof a === 'string' && a.trim()),
    derivedAlias,
    parentUnitName: parentUnitNameOf(value, nameKey),
    parentDesignation: typeof value.parentDesignation === 'string' ? value.parentDesignation.trim() : null,
    parentCoordinates: parentCoords,
    trustedNps: isTrustedNpsProvenance(item),
    provenance: {
      provider: item.source?.provider || null,
      sourceClass: item.source?.sourceClass || item.quality?.authorityClass || null,
      sourceId: item.source?.sourceId || null,
    },
  };
}

function buildOfficialPlaceIndex(records = []) {
  const places = [];
  const byKey = new Map();
  for (const item of records || []) {
    if (!isIndexablePlace(item)) continue;
    const place = placeRecord(item);
    places.push(place);
    const keys = officialNameKeys(item.claim.normalizedValue);
    if (place.derivedAlias && !keys.some((entry) => entry.key === place.derivedAlias)) {
      keys.push({ key: place.derivedAlias, sourceName: place.canonicalName, derived: true });
    }
    for (const { key } of keys) {
      const list = byKey.get(key) || [];
      list.push(place);
      byKey.set(key, list);
    }
  }
  return Object.freeze({ places: Object.freeze(places), byKey });
}

function uniquePlaces(list) {
  const seen = new Set();
  const out = [];
  for (const place of list || []) {
    const id = place.entityId || place.evidenceId || `${place.parkCode}:${place.nameKey}`;
    if (seen.has(id)) continue;
    // NPS publishes the same named facility in both /places and
    // /visitorcenters. Different record IDs do not make two visitor centers.
    // Keep genuine same-name geographic conflicts ambiguous.
    const facility = /\b(?:visitor center|nature center|museum)\b/.test(place.nameKey);
    const duplicate = facility && place.parkCode && out.find(other =>
      other.parkCode === place.parkCode && other.nameKey === place.nameKey
      && (!other.coordinates || !place.coordinates
        || (Math.abs(other.coordinates.latitude - place.coordinates.latitude) < 0.001
          && Math.abs(other.coordinates.longitude - place.coordinates.longitude) < 0.001)));
    if (duplicate) {
      if (!duplicate.coordinates && place.coordinates) out[out.indexOf(duplicate)] = place;
      seen.add(id);
      continue;
    }
    seen.add(id);
    out.push(place);
  }
  return out;
}

function candidatesForKey(index, key, parkCode = null) {
  let candidates = uniquePlaces(index?.byKey?.get(key) || []);
  const scoped = String(parkCode || '').toLowerCase().trim();
  if (scoped) candidates = candidates.filter((place) => place.parkCode === scoped);
  return candidates;
}

function uniquePlaceForKey(index, key, parkCode = null) {
  const candidates = candidatesForKey(index, key, parkCode);
  return candidates.length === 1 ? candidates[0] : null;
}

function placeHasExactKey(place, key) {
  if (!place || !key) return false;
  if (place.nameKey === key) return true;
  return (place.aliases || []).some((alias) => officialNameKey(alias) === key);
}

function mentionKeysFor(place) {
  const keys = [{ key: place.nameKey, derived: false }];
  for (const alias of place.aliases || []) {
    const key = officialNameKey(alias);
    if (key) keys.push({ key, derived: false });
  }
  if (place.derivedAlias) keys.push({ key: place.derivedAlias, derived: true });
  return keys;
}

function lookupOfficialPlace({ name, parkCode = null, index = null, records = null } = {}) {
  const built = index || buildOfficialPlaceIndex(records || []);
  const key = officialNameKey(name);
  if (!key || !built?.byKey) {
    return { status: 'unresolved', place: null, candidates: [] };
  }
  const candidates = candidatesForKey(built, key, parkCode);
  if (candidates.length === 0) {
    return { status: 'unresolved', place: null, candidates: [] };
  }
  const exactCandidates = candidates.filter((place) => placeHasExactKey(place, key));
  const ranked = exactCandidates.length > 0 ? exactCandidates : candidates;
  const parks = new Set(ranked.map((place) => place.parkCode).filter(Boolean));
  const scoped = String(parkCode || '').toLowerCase().trim();
  if (!scoped && parks.size > 1) {
    return { status: 'ambiguous', place: null, candidates: ranked };
  }
  if (ranked.length > 1) {
    return { status: 'ambiguous', place: null, candidates: ranked };
  }
  const place = ranked[0];
  return { status: 'exact', place, candidates: ranked };
}

function npsUnitIdentityFromOfficialIndex(index, parkCode) {
  const code = String(parkCode || '').toLowerCase().trim();
  if (!code || !index?.places?.length) return null;
  const places = index.places.filter((place) => place.parkCode === code && place.trustedNps);
  if (places.length === 0) return null;
  const names = [...new Set(places.map((place) => place.parentUnitName).filter(Boolean))];
  if (names.length !== 1) return null;
  const named = places.find((place) => place.parentUnitName === names[0]);
  const coords = named?.parentCoordinates || null;
  return {
    key: officialNameKey(names[0]),
    parkName: names[0],
    code,
    lat: coords?.latitude ?? null,
    lon: coords?.longitude ?? null,
    designation: named.parentDesignation || null,
    source: 'official_place_parent',
    kind: 'nps_unit',
  };
}

function officialPlacesMentionedIn(text, index, { parkCode = null } = {}) {
  const raw = String(text || '');
  if (!raw.trim() || !index?.places?.length) return [];
  const haystack = officialNameKey(raw);
  if (!haystack) return [];
  const padded = ` ${haystack} `;
  const hits = [];
  const seen = new Set();
  const scoped = String(parkCode || '').toLowerCase().trim();
  const ranked = [...index.places]
    .filter((place) => !scoped || place.parkCode === scoped)
    .sort((a, b) => b.nameKey.length - a.nameKey.length);
  for (const place of ranked) {
    for (const { key, derived } of mentionKeysFor(place)) {
      if (!key) continue;
      const tokenCount = key.split(' ').filter(Boolean).length;
      if (tokenCount < 1) continue;
      if (tokenCount < 2 && !scoped) continue;
      if (!padded.includes(` ${key} `)) continue;
      if (derived && !uniquePlaceForKey(index, key, scoped || null)) continue;
      if (tokenCount === 1 && scoped && !uniquePlaceForKey(index, key, scoped)) continue;
      const id = place.entityId || place.evidenceId;
      if (seen.has(id)) break;
      seen.add(id);
      hits.push(place);
      break;
    }
  }
  return hits;
}

module.exports = {
  buildOfficialPlaceIndex,
  lookupOfficialPlace,
  extractOfficialCoordinates,
  officialPlacesMentionedIn,
  officialNameKey,
  derivedOfficialTitleAlias,
  npsUnitIdentityFromOfficialIndex,
};
