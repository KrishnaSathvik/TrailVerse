'use strict';

/**
 * Walking-distance ownership (Phase 12H2-B).
 *
 * A numeric distance may become walkingDistanceMiles only when the evidence
 * establishes that the number describes the activity/path of THIS entity.
 *
 * Precedence:
 *   trusted structured activity distance
 *     > trusted entity-owned textual distance
 *     > no walkingDistanceMiles
 *
 * Geographic / park-total / from-A-to-B mile figures stay in source text.
 * They never populate walkingDistanceMiles. Max-of-plausible-numbers is not
 * a valid selection rule.
 */

const { travelerValueClass, VALUE_CLASS } = require('./travelerValueClass');

const WALKING_DISTANCE_QUALIFIER = Object.freeze({
  ROUND_TRIP: 'round_trip',
  ONE_WAY: 'one_way',
  LOOP: 'loop',
  UNSPECIFIED: 'unspecified',
});

const WALKING_DISTANCE_SOURCE = Object.freeze({
  STRUCTURED: 'structured',
  TEXT: 'text',
});

const MILE_TOKEN = /(?<![\w.])(\d+(?:\.\d+)?|\.\d+)\s*[- ]?miles?\b/gi;

const SERVICE_OR_EXHIBIT_NAME =
  /\b(wayside|visitor centers?|contact stations?|information centers?|nature centers?|ranger stations?|exhibits?|interpretive (?:panel|sign|exhibit)|parking|kiosk|marker|plaque)\b/i;
const SERVICE_OR_EXHIBIT_TYPE =
  /^(visitor_center|wayside|exhibit|parking|orientation|museum)$/i;

const GEOGRAPHIC_OWNER =
  /\b(rivers?|river area|shorelines?|coasts?|coastline|seashore|acreage|acres|perimeter|wilderness|recreational (?:river )?area|system)\b/i;
const PARK_TOTAL =
  /\b(the park (?:has|contains|protects|includes)|park contains|this park has|miles of trails|miles of roads?)\b/i;
const FROM_TO =
  /\b(miles? from|from the (?:park |south |north |east |west )?entrance|away from|miles? (?:south|north|east|west|downstream|upstream) of)\b/i;
const ROAD_CORRIDOR =
  /\b(scenic corridors?|road corridors?|highways?|park roads?|miles of road)\b/i;
const HISTORICAL_JOURNEY =
  /\b(traveled|journeyed|marched|expedition|wagon (?:train|road)|emigrants? traveled)\b/i;
const MILES_OF_GEO =
  /\bmiles? of (?:recreational |protected |designated )?(?:river|shoreline|coast|wilderness|road|highway|trails?|area)\b/i;

const ACTIVITY_SUBJECT =
  /\b(trails?|hikes?|walks?|loops?|paths?|boardwalks?|routes?|outings?)\b/i;
const ROUND_TRIP = /\b(round[- ]?trip|roundtrip)\b/i;
const ONE_WAY = /\b(one[- ]?way|each way)\b/i;
const LOOP_WORD = /\bloops?\b/i;
const LENGTH_SURVEY = /\blength\s*:/i;
const N_MILE_ACTIVITY =
  /\b(\d+(?:\.\d+)?|\.\d+)[- ]?miles?\s+(?:round[- ]?trip\s+)?(?:loop|trail|hike|walk|boardwalk|path|outing)\b/i;

function oneLine(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function typesOf(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').toLowerCase()).filter(Boolean);
  if (value) return [String(value).toLowerCase()];
  return [];
}

function splitSentences(text) {
  const source = oneLine(text);
  if (!source) return [];
  return source.split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
}

function parseMileToken(raw) {
  const miles = Number(raw);
  if (!Number.isFinite(miles) || miles <= 0) return null;
  return Math.round(miles * 100) / 100;
}

function qualifierOf(sentence) {
  if (ROUND_TRIP.test(sentence)) return WALKING_DISTANCE_QUALIFIER.ROUND_TRIP;
  if (ONE_WAY.test(sentence)) return WALKING_DISTANCE_QUALIFIER.ONE_WAY;
  if (LOOP_WORD.test(sentence) && !GEOGRAPHIC_OWNER.test(sentence)) {
    return WALKING_DISTANCE_QUALIFIER.LOOP;
  }
  return WALKING_DISTANCE_QUALIFIER.UNSPECIFIED;
}

function isGeographicSentence(sentence) {
  const s = String(sentence || '');
  if (MILES_OF_GEO.test(s)) return true;
  if (PARK_TOTAL.test(s)) return true;
  if (FROM_TO.test(s)) return true;
  if (ROAD_CORRIDOR.test(s)) return true;
  if (HISTORICAL_JOURNEY.test(s)) return true;
  if (GEOGRAPHIC_OWNER.test(s) && !ACTIVITY_SUBJECT.test(s)) return true;
  return false;
}

function ownershipStrength(sentence, miles, rawToken = '') {
  if (isGeographicSentence(sentence)) return 0;
  const token = String(rawToken || miles);
  const compact = `(?:(?<![\\w.])${token.replace('.', '\\.')}|\\b${String(miles).replace('.', '\\.')})[- ]?miles?\\b`;
  if (new RegExp(`\\b(?:the\\s+)?(?:trail|hike|walk|loop|path|boardwalk)\\b[^.!?]{0,40}\\b(?:is|of|measures?|covers?)\\b[^.!?]{0,24}${compact}`, 'i').test(sentence)) {
    return 3;
  }
  if (N_MILE_ACTIVITY.test(sentence) || (ROUND_TRIP.test(sentence) && ACTIVITY_SUBJECT.test(sentence))) {
    return 3;
  }
  if (ONE_WAY.test(sentence) && (ACTIVITY_SUBJECT.test(sentence) || /\bwalk\b/i.test(sentence))) return 3;
  if (LENGTH_SURVEY.test(sentence) && new RegExp(compact, 'i').test(sentence)) return 2;
  if (LOOP_WORD.test(sentence) && new RegExp(compact, 'i').test(sentence) && !GEOGRAPHIC_OWNER.test(sentence)) {
    return 2;
  }
  if (ACTIVITY_SUBJECT.test(sentence) && new RegExp(compact, 'i').test(sentence)) return 1;
  return 0;
}

function isNarrativeIneligibleEntity({
  name = '',
  activityTypes = [],
  category = '',
  facilityKind = '',
} = {}) {
  const types = typesOf(activityTypes);
  const joined = types.join(' ');
  const hayName = String(name || '');
  const cat = String(facilityKind || category || '').toLowerCase();
  if (SERVICE_OR_EXHIBIT_NAME.test(hayName)) return true;
  if (SERVICE_OR_EXHIBIT_TYPE.test(cat)) return true;
  if (types.some((type) => SERVICE_OR_EXHIBIT_TYPE.test(type))) return true;
  const valueClass = travelerValueClass({ name: hayName, activityTypes: types });
  if (valueClass === VALUE_CLASS.MICRO_POI) return true;
  if (valueClass === VALUE_CLASS.LOGISTICS && !/\b(trail|hike|walk|loop)\b/i.test(`${hayName} ${joined}`)) {
    return true;
  }
  return false;
}

function structuredDistance(structuredMiles) {
  const miles = Number(structuredMiles);
  if (!Number.isFinite(miles) || miles <= 0) return null;
  return Math.round(miles * 100) / 100;
}

function ownedTextDistances(text) {
  const sentences = splitSentences(String(text || '').toLowerCase().replace(/\bone[- ]mile\b/g, '1 mile'));
  const owned = [];
  for (const sentence of sentences) {
    const matches = [...sentence.matchAll(MILE_TOKEN)];
    for (const match of matches) {
      const miles = parseMileToken(match[1]);
      if (miles == null) continue;
      const strength = ownershipStrength(sentence, miles, match[1]);
      if (strength <= 0) continue;
      owned.push({
        miles,
        strength,
        qualifier: qualifierOf(sentence),
        sentence,
      });
    }
  }
  return owned;
}

function selectOwnedText(owned) {
  if (!owned.length) return { miles: null, qualifier: null, conflict: false };
  const best = Math.max(...owned.map((item) => item.strength));
  const top = owned.filter((item) => item.strength === best);
  const uniqueMiles = [...new Set(top.map((item) => item.miles))];
  if (uniqueMiles.length > 1) {
    return { miles: null, qualifier: null, conflict: true };
  }
  return {
    miles: top[0].miles,
    qualifier: top[0].qualifier,
    conflict: false,
  };
}

function emptyResult(overrides = {}) {
  return {
    miles: null,
    qualifier: null,
    source: null,
    conflict: false,
    derivedDurationMinutes: null,
    reason: null,
    ...overrides,
  };
}

function resolveWalkingDistance({
  text = '',
  name = '',
  activityTypes = [],
  category = '',
  facilityKind = '',
  structuredMiles = null,
} = {}) {
  const structured = structuredDistance(structuredMiles);
  const ineligible = isNarrativeIneligibleEntity({ name, activityTypes, category, facilityKind });
  const owned = ownedTextDistances(text);
  const selected = selectOwnedText(owned);

  if (structured != null) {
    const narrativeConflicts = selected.miles != null && selected.miles !== structured;
    return emptyResult({
      miles: structured,
      qualifier: selected.qualifier || WALKING_DISTANCE_QUALIFIER.UNSPECIFIED,
      source: WALKING_DISTANCE_SOURCE.STRUCTURED,
      conflict: Boolean(narrativeConflicts || selected.conflict),
    });
  }

  if (ineligible) {
    return emptyResult({ reason: 'entity_role' });
  }

  if (selected.conflict) {
    return emptyResult({ conflict: true, reason: 'owned_text_conflict' });
  }

  if (selected.miles == null) {
    return emptyResult({ reason: 'no_owned_distance' });
  }

  return emptyResult({
    miles: selected.miles,
    qualifier: selected.qualifier,
    source: WALKING_DISTANCE_SOURCE.TEXT,
  });
}

function structuredActivityMiles(item) {
  if (!item || typeof item !== 'object') return null;
  const fields = [item.walkingDistanceMiles, item.distanceMiles, item.distance, item.length];
  for (const field of fields) {
    if (typeof field === 'number' && Number.isFinite(field) && field > 0) {
      return Math.round(field * 100) / 100;
    }
    if (typeof field === 'string' && /^\d+(?:\.\d+)?$/.test(field.trim())) {
      return Number(field.trim());
    }
  }
  return null;
}

function walkingDistanceFields(params = {}) {
  const structuredMiles = params.structuredMiles != null
    ? params.structuredMiles
    : structuredActivityMiles(params.item);
  const resolved = resolveWalkingDistance({ ...params, structuredMiles });
  return {
    walkingDistanceMiles: resolved.miles,
    walkingDistanceQualifier: resolved.qualifier,
    walkingDistanceSource: resolved.source,
    walkingDistanceConflict: resolved.conflict === true,
  };
}

function inferWalkingDistanceMiles(text, entityContext = null) {
  const resolved = resolveWalkingDistance({
    text,
    ...(entityContext && typeof entityContext === 'object' ? entityContext : {}),
  });
  return resolved.miles;
}

function mobilityDistanceMiles(value) {
  const miles = Number(value?.walkingDistanceMiles ?? value?.miles);
  if (!Number.isFinite(miles) || miles <= 0) return null;
  const qualifier = value?.walkingDistanceQualifier || value?.qualifier;
  if (qualifier === WALKING_DISTANCE_QUALIFIER.ONE_WAY) {
    return Math.round(miles * 2 * 100) / 100;
  }
  return miles;
}

module.exports = {
  WALKING_DISTANCE_QUALIFIER,
  WALKING_DISTANCE_SOURCE,
  resolveWalkingDistance,
  inferWalkingDistanceMiles,
  mobilityDistanceMiles,
  walkingDistanceFields,
  structuredActivityMiles,
  isNarrativeIneligibleEntity,
  isGeographicSentence,
};
