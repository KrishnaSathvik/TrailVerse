'use strict';

/**
 * Deterministic NPS park identity for a read_travel destination string.
 *
 * The model often qualifies a park ("Glacier National Park, Montana",
 * "Yosemite National Park, Yosemite Valley"). Exact-only matching left those
 * unresolved, so the official activity corpus was never read (diagnosis +
 * repair verification 2026-10-12: R03, R05, R10).
 *
 * Rules (no fuzzy or similarity matching):
 *  1. Exact: the whole string equals one park's full name, short name or code.
 *  2. Qualified: the first segment exactly identifies ONE park, and every other
 *     segment is consistent with that park's official record — one of its
 *     states (name or code), the United States, one of its official address
 *     cities, or a sub-area carrying the park's own short name. A qualifier that
 *     names another park, another state, or anything else leaves the
 *     destination unresolved (multi-destination and foreign-park strings stay
 *     with the existing anchor handling).
 */

const { lexical } = require('../services/providers/namedPlaceEquivalence');

const US_STATES = Object.freeze({
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado', CT: 'connecticut',
  DE: 'delaware', FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa',
  KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan',
  MN: 'minnesota', MS: 'mississippi', MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new hampshire',
  NJ: 'new jersey', NM: 'new mexico', NY: 'new york', NC: 'north carolina', ND: 'north dakota', OH: 'ohio', OK: 'oklahoma',
  OR: 'oregon', PA: 'pennsylvania', RI: 'rhode island', SC: 'south carolina', SD: 'south dakota', TN: 'tennessee',
  TX: 'texas', UT: 'utah', VT: 'vermont', VA: 'virginia', WA: 'washington', WV: 'west virginia', WI: 'wisconsin',
  WY: 'wyoming', DC: 'district of columbia', AS: 'american samoa', GU: 'guam', MP: 'northern mariana islands',
  PR: 'puerto rico', VI: 'virgin islands',
});
const COUNTRY = new Set(['us', 'usa', 'u s', 'u s a', 'united states', 'united states of america']);
const SEGMENT_SPLIT = /\s*[,;()]\s*|\s+[-–—]\s+/;

const shortName = (park) => String(park?.fullName || '').replace(park?.designation || '', '').trim();
const keys = (park) => [park?.fullName, shortName(park), park?.parkCode].map(lexical).filter(Boolean);
const stateCodes = (park) => String(park?.states || '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);

function exactMatches(parks, text) {
  const key = lexical(text);
  return key ? parks.filter((park) => keys(park).includes(key)) : [];
}

function qualifierConsistent(qualifier, park, parks) {
  const q = lexical(qualifier);
  if (!q) return true;
  // A qualifier that is itself another park is a second destination.
  if (parks.some((other) => other !== park && keys(other).includes(q))) return false;
  if (COUNTRY.has(q)) return true;
  const codes = stateCodes(park);
  if (codes.some((code) => q === code.toLowerCase() || q === US_STATES[code])) return true;
  if ((park.addresses || []).some((address) => lexical(address?.city) === q)) return true;
  const own = lexical(shortName(park));
  return own.length >= 4 && ` ${q} `.includes(` ${own} `);
}

/**
 * @returns {{ park: object, match: 'exact'|'qualified' } | null}
 */
function resolveParkIdentity(name, parks = []) {
  if (!Array.isArray(parks) || !parks.length || typeof name !== 'string') return null;
  const exact = exactMatches(parks, name);
  if (exact.length === 1) return { park: exact[0], match: 'exact' };
  if (exact.length > 1) return null;
  const segments = name.split(SEGMENT_SPLIT).map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return null;
  const head = exactMatches(parks, segments[0]);
  if (head.length !== 1) return null;
  return segments.slice(1).every((q) => qualifierConsistent(q, head[0], parks)) ? { park: head[0], match: 'qualified' } : null;
}

module.exports = { resolveParkIdentity };
