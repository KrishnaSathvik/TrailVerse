'use strict';

/**
 * Pre-generation read-only lookup over locally persisted official NPS place
 * evidence. Classification may use this BEFORE the frozen turn bundle exists.
 *
 * Exact normalized identity only. No network, no fuzzy match, no handwritten
 * famous-place dictionary. Records must already be in officialPlaceIndex shape.
 */

const {
  buildOfficialPlaceIndex,
  lookupOfficialPlace,
  officialPlacesMentionedIn,
} = require('./officialPlaceIndex');
const { extractNamedExperienceRequests } = require('./namedExperienceRequirements');

let persistedRecords = null;
let persistedIndex = null;

function setPersistedOfficialPlaceEvidence(records = null) {
  if (!Array.isArray(records) || records.length === 0) {
    persistedRecords = null;
    persistedIndex = null;
    return null;
  }
  persistedRecords = records;
  persistedIndex = buildOfficialPlaceIndex(records);
  return persistedIndex;
}

function clearPersistedOfficialPlaceEvidence() {
  persistedRecords = null;
  persistedIndex = null;
}

function getPersistedOfficialPlaceRecords() {
  return persistedRecords;
}

function getPersistedOfficialPlaceIndex() {
  return persistedIndex;
}

function indexFrom({ records = null, index = null } = {}) {
  if (index?.byKey) return index;
  if (Array.isArray(records) && records.length) return buildOfficialPlaceIndex(records);
  return persistedIndex;
}

function framedPlaceCandidates(text) {
  return extractNamedExperienceRequests(text).map((item) => item.requestedName).filter(Boolean);
}

/**
 * Exact official-place hits for first-turn text. Unique parent park may be
 * inferred; same-name-across-parks stays unresolved.
 */
function resolvePersistedOfficialPlaces({
  text,
  records = null,
  index = null,
} = {}) {
  const built = indexFrom({ records, index });
  const empty = {
    status: 'unresolved',
    places: [],
    parentParkCode: null,
    candidates: [],
  };
  if (!built?.places?.length) return empty;

  const seen = new Set();
  const places = [];
  const mentionHits = officialPlacesMentionedIn(text, built);
  for (const place of mentionHits) {
    const id = place.entityId || place.evidenceId;
    if (seen.has(id)) continue;
    seen.add(id);
    places.push(place);
  }
  for (const name of framedPlaceCandidates(text)) {
    const hit = lookupOfficialPlace({ name, index: built });
    if (hit.status !== 'exact' || !hit.place) continue;
    const id = hit.place.entityId || hit.place.evidenceId;
    if (seen.has(id)) continue;
    seen.add(id);
    places.push(hit.place);
  }

  if (places.length === 0) {
    return empty;
  }
  const parks = [...new Set(places.map((place) => place.parkCode).filter(Boolean))];
  if (parks.length > 1) {
    return {
      status: 'ambiguous',
      places,
      parentParkCode: null,
      candidates: places,
    };
  }
  return {
    status: 'exact',
    places,
    parentParkCode: parks[0] || null,
    candidates: places,
  };
}

function lookupExactPersistedOfficialPlace(name, options = {}) {
  const built = indexFrom(options);
  if (!built) {
    return { status: 'unresolved', place: null, candidates: [] };
  }
  return lookupOfficialPlace({ name, parkCode: options.parkCode || null, index: built });
}

module.exports = {
  setPersistedOfficialPlaceEvidence,
  clearPersistedOfficialPlaceEvidence,
  getPersistedOfficialPlaceRecords,
  getPersistedOfficialPlaceIndex,
  resolvePersistedOfficialPlaces,
  lookupExactPersistedOfficialPlace,
  framedPlaceCandidates,
};
