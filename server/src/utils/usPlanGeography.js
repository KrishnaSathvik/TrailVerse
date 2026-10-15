'use strict';

const { validLocation } = require('./trailieCanonicalLocation');

/**
 * Deterministic U.S. plan geography for model-first TripPlan acceptance.
 * Never infer country from a place name — only authoritative evidence fields
 * or previously accepted stop geography metadata.
 */

/** ISO / common codes treated as domestic U.S. travel jurisdiction (states + territories). */
const US_JURISDICTION_CODES = Object.freeze(new Set([
  'US', 'PR', 'VI', 'GU', 'AS', 'MP',
]));

function normalizeCountryCode(value) {
  if (value == null) return null;
  const raw = String(value).trim().toUpperCase();
  if (!raw) return null;
  if (raw === 'US' || raw === 'USA' || raw === 'UNITED STATES' || raw === 'UNITED STATES OF AMERICA') {
    return 'US';
  }
  if (raw.length === 2) return raw;
  return raw;
}

/**
 * True when the value (ISO code, country string, evidence row, stop, or
 * normalizedValue-like object) is in the U.S. domestic jurisdiction set.
 */
function isUsJurisdiction(value) {
  if (value == null) return false;
  if (typeof value === 'string') {
    return US_JURISDICTION_CODES.has(normalizeCountryCode(value));
  }
  if (typeof value !== 'object') return false;
  const fromEvidence = countryFromEvidence(value);
  if (fromEvidence) return US_JURISDICTION_CODES.has(fromEvidence);
  const fromStop = countryFromStop(value);
  if (fromStop) return US_JURISDICTION_CODES.has(fromStop);
  const nested = normalizeCountryCode(
    value.countryCode
    || value.country
    || value.claim?.normalizedValue?.countryCode
    || value.claim?.normalizedValue?.country
    || null,
  );
  return nested != null && US_JURISDICTION_CODES.has(nested);
}

function countryFromEvidence(row) {
  if (!row || typeof row !== 'object') return null;
  const value = row.claim?.normalizedValue || {};
  return normalizeCountryCode(
    value.countryCode
    || value.country
    || row.source?.countryCode
    || null,
  );
}

function countryFromStop(stop) {
  return normalizeCountryCode(stop?.countryCode || stop?.country || null);
}

function isNpsIdentity(row, stop = null) {
  const identity = row?.claim?.identity || row?.entityId || stop?.canonicalPlaceId || '';
  const provider = row?.source?.provider || '';
  return provider === 'nps' || String(identity).startsWith('nps:');
}

/**
 * Classify a bound stop against its evidence row and any stop-level country.
 * @returns {{ usGrounded: boolean, foreignConfirmed: boolean }}
 */
function classifyStopGeography(stop, evidenceRow) {
  const country = countryFromEvidence(evidenceRow) || countryFromStop(stop);
  if (country && !isUsJurisdiction(country)) {
    return { usGrounded: false, foreignConfirmed: true };
  }
  if (isUsJurisdiction(country)) {
    return { usGrounded: true, foreignConfirmed: false };
  }
  if (isNpsIdentity(evidenceRow, stop)) return { usGrounded: true, foreignConfirmed: false };
  // Previously accepted identity-resolved stops retain domestic grounding across
  // patches even when this turn did not re-fetch country metadata. Named-place
  // resolution admits U.S. jurisdiction candidates; NPS identities are US.
  if (stop?.resolutionStatus === 'resolved' && stop?.canonicalPlaceId && validLocation(stop.location)) {
    return { usGrounded: true, foreignConfirmed: false };
  }
  return { usGrounded: false, foreignConfirmed: false };
}

function evidenceForStop(stop, byId, fresh) {
  if (!stop) return null;
  if (stop.evidenceRef && byId.has(stop.evidenceRef)) return byId.get(stop.evidenceRef);
  const name = String(stop.name || '').trim().toLowerCase();
  if (!name) return null;
  const named = fresh.filter((row) => {
    if (['stop_coordinates', 'destination_identity'].includes(row.topic)) return false;
    const value = row.claim?.normalizedValue || {};
    const candidates = [value.name, row.source?.provider === 'named_place' ? value.requestedName : null];
    return candidates.some((n) => n && String(n).trim().toLowerCase() === name);
  });
  return named.length === 1 ? named[0] : null;
}

/**
 * Evaluate the resulting canonical plan against U.S. geography policy.
 * @returns {string[]} issue codes
 */
function evaluateUsPlanGeography({ plan, evidence = [] } = {}) {
  if (!plan?.days?.length) return [];
  const issues = [];
  const fresh = Array.isArray(evidence) ? evidence : [];
  const byId = new Map(fresh.map((row) => [row.evidenceId, row]));
  let usGroundedPlaces = 0;
  let usDestinationIdentity = false;

  for (const day of plan.days) {
    for (const stop of day.stops || []) {
      const row = evidenceForStop(stop, byId, fresh);
      // Accepted stops already carry identity; prefer bound evidence, else NPS identity on the stop.
      const classification = row
        ? classifyStopGeography(stop, row)
        : (isNpsIdentity(null, stop) || String(stop.canonicalPlaceId || '').startsWith('nps:')
          ? { usGrounded: true, foreignConfirmed: false }
          : { usGrounded: false, foreignConfirmed: false });
      if (classification.foreignConfirmed) {
        issues.push('foreign_place_in_plan');
      }
      if (classification.usGrounded) usGroundedPlaces += 1;
    }
  }

  // Destination identity is authoritative geography for the trip base when present.
  for (const row of fresh) {
    if (row.topic !== 'destination_identity') continue;
    const country = countryFromEvidence(row);
    if (country && !isUsJurisdiction(country)) issues.push('foreign_place_in_plan');
    if (isUsJurisdiction(country) || isNpsIdentity(row)) usDestinationIdentity = true;
  }

  // Zero US-grounded stops and no US destination identity → reject (closes
  // experience-only foreign plans). Pinless US logistics/experience days remain
  // acceptable when destination_identity or an NPS catalog row confirms US.
  if (usGroundedPlaces === 0 && !usDestinationIdentity) {
    issues.push('us_geography_unsupported');
  }
  return [...new Set(issues)];
}

module.exports = {
  US_JURISDICTION_CODES,
  normalizeCountryCode,
  isUsJurisdiction,
  countryFromEvidence,
  classifyStopGeography,
  evaluateUsPlanGeography,
};
