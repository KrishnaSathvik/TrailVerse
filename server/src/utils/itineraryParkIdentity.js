'use strict';

/**
 * Deterministic park identity for itinerary stops.
 *
 * Populates the optional parkCode/parkName the review pipeline uses for section
 * scope. Identity is only ever derived from resolved metadata or exact park-name
 * evidence — never guessed from a stop name, and never asked of a model. A stop
 * that cannot be assigned confidently stays null, which reduces mutation
 * authority rather than borrowing another park's facts.
 */

const { PARK_NAME_TO_CODE } = require('./parkExtractor');

const CODE_TO_NAME = new Map();
for (const [name, entry] of PARK_NAME_TO_CODE) {
  if (!CODE_TO_NAME.has(entry.code) && /national park/i.test(name)) {
    CODE_TO_NAME.set(entry.code, name.replace(/\b\w/g, (c) => c.toUpperCase()));
  }
}

/** Stop types that are never inside a park boundary. */
const NON_PARK_TYPES = new Set(['restaurant', 'lodging']);

/** Exact park names appearing in a piece of text. */
function parkCodesInText(text) {
  const lower = String(text || '').toLowerCase();
  const codes = new Set();
  for (const [name, entry] of PARK_NAME_TO_CODE) {
    if (name.length >= 4 && lower.includes(name)) codes.add(entry.code);
  }
  return [...codes];
}

/**
 * @returns {{itineraryData: Object, coverage: {stopsTotal: number, stopsWithParkCode: number, stopsUnknownPark: number}}}
 */
function enrichItineraryParkIdentity({ itineraryData, resolvedMetadata = {}, allExtractedParks = [] }) {
  if (!itineraryData?.days) {
    return {
      itineraryData,
      coverage: { stopsTotal: 0, stopsWithParkCode: 0, stopsUnknownPark: 0 },
    };
  }

  let stopsTotal = 0;
  let stopsWithParkCode = 0;

  const days = itineraryData.days.map((day) => {
    const stops = (day.stops || []).map((stop) => {
      stopsTotal += 1;
      // Frozen place evidence or an explicit canonical entity mapping is the
      // authority. Conversation context and substrings cannot establish containment.
      const entityCode = String(stop.evidenceEntityId || '').match(/^nps:park:([a-z0-9]+)(?::|$)/)?.[1];
      const exactEntry = PARK_NAME_TO_CODE.get(String(stop.name || '').toLowerCase().trim());
      const exactCode = /national (?:park|monument|historic|seashore|recreation)/i.test(stop.name || '') ? exactEntry?.code : null;
      const code = stop.parkIdentityEvidenceId ? stop.parkCode : entityCode || exactCode || null;

      if (!code) return { ...stop, parkCode: null, parkName: null };

      stopsWithParkCode += 1;
      return { ...stop, parkCode: code, parkName: CODE_TO_NAME.get(code) || null };
    });

    const stopParkCodes = [...new Set(stops.map((s) => s.parkCode).filter(Boolean))];
    return { ...day, stops, parkCodes: stopParkCodes };
  });

  return {
    itineraryData: { ...itineraryData, days },
    coverage: { stopsTotal, stopsWithParkCode, stopsUnknownPark: stopsTotal - stopsWithParkCode },
  };
}

module.exports = { enrichItineraryParkIdentity, parkCodesInText, NON_PARK_TYPES };
