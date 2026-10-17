'use strict';

/**
 * P0-5 (audit 2026-08-31) — vehicle DIMENSIONS are their own semantics.
 *
 * `vehicle_capability` answers "do you have 4WD?" — a capability the traveler
 * either holds or lacks. A dimensional rule is arithmetic over two
 * machine-owned numbers: traveler vehicle length vs. an official maximum. The
 * audit's failure — a 24-ft RV planned onto a road capped at 21 ft with
 * "check the restriction" as a caveat — happened because neither number ever
 * became structured state, so nothing could compare them. The model must
 * never perform this arithmetic in prose.
 *
 * Everything here is deterministic: parse both sides, normalize units to
 * feet, compare with a small tolerance (6.4 m and 21 ft are the same limit).
 */

const FEET_PER_METER = 3.28084;
const FEET_TOLERANCE = 0.1;

const VEHICLE_KIND = /\b(rv|motorhome|motor home|camper van|campervan|camper|travel trailer|trailer|fifth wheel)\b/i;

const UNIT_TO_FEET = Object.freeze({
  ft: 1, foot: 1, feet: 1, "'": 1,
  in: 1 / 12, inch: 1 / 12, inches: 1 / 12,
  m: FEET_PER_METER, meter: FEET_PER_METER, meters: FEET_PER_METER, metre: FEET_PER_METER, metres: FEET_PER_METER,
});

const UNIT_PATTERN = "(?:ft|feet|foot|in(?:ch(?:es)?)?|m|meters?|metres?)";

function normalizeKind(raw) {
  const value = String(raw || '').toLowerCase().replace(/\s+/g, ' ');
  if (value === 'motor home') return 'motorhome';
  if (value === 'campervan' || value === 'camper van') return 'camper';
  if (value === 'travel trailer' || value === 'fifth wheel') return 'trailer';
  return value;
}

function toFeet(value, unitRaw) {
  const unit = String(unitRaw || '').toLowerCase();
  const key = unit.replace(/\.$/, '');
  const factor = UNIT_TO_FEET[key]
    ?? (key.startsWith('in') ? UNIT_TO_FEET.in
      : key.startsWith('m') ? UNIT_TO_FEET.m
        : key.startsWith('f') ? 1 : null);
  if (factor == null) return null;
  const numeric = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric * factor;
}

/**
 * The traveler's vehicle, from their own words. Returns null when no vehicle
 * of a dimensional kind is mentioned; returns `{ kind, lengthFeet: null }`
 * when the vehicle is named without a length (the requirement must then be
 * retained rather than resolved).
 */
function parseTravelerVehicle(text) {
  const raw = String(text || '');
  const kindMatch = raw.match(VEHICLE_KIND);
  if (!kindMatch) return null;

  // Campground amenities ("RV sites", "RV hookups", "RV dump station") name
  // infrastructure, not the traveler's vehicle.
  const amenity = new RegExp(`${kindMatch[0]}\\s+(?:sites?|hookups?|dump|pads?|parking)\\b`, 'i');
  if (amenity.test(raw)) return null;

  const kind = normalizeKind(kindMatch[0]);

  // "24-foot RV", "24 ft RV", "288-inch trailer", "7.3 m camper"
  const before = raw.match(new RegExp(`(\\d{1,4}(?:\\.\\d+)?)[\\s-]*(${UNIT_PATTERN})\\.?[\\s-]*(?:long\\s+)?(?:${VEHICLE_KIND.source})`, 'i'));
  // "our RV is 24 feet", "RV, 24 ft long"
  const after = raw.match(new RegExp(`(?:${VEHICLE_KIND.source})[^.\\d]{0,24}?(\\d{1,4}(?:\\.\\d+)?)[\\s-]*(${UNIT_PATTERN})\\b`, 'i'));

  let lengthFeet = null;
  if (before) lengthFeet = toFeet(before[1], before[2]);
  if (lengthFeet == null && after) {
    const groups = after.filter((g) => g !== undefined);
    // Last two captured groups are the number and the unit.
    lengthFeet = toFeet(groups[groups.length - 2], groups[groups.length - 1]);
  }

  return { kind, lengthFeet, raw: kindMatch[0] };
}

/**
 * An official vehicle LENGTH limit, from official prose. Length only — a
 * width or height rule is real but is not this rule. Anchored on limit
 * language so mileage, elevation and scenery numbers can never qualify.
 */
function parseVehicleLengthLimit(text) {
  const raw = String(text || '');

  // A "sentence span" that stops at sentence-ending periods but walks through
  // decimal points — the official GTSR wording is "longer than 21 feet
  // (6.4 m) are prohibited", and 6.4 must not read as a sentence boundary.
  const SPAN = '(?:[^.!?]|\\.(?=\\d))';
  const patterns = [
    // "vehicles ... longer than 21 feet ... prohibited / not permitted"
    new RegExp(`\\b(?:vehicles?|rvs?|vehicle combinations?)\\b${SPAN}{0,80}?\\b(?:longer|greater|more)\\s+than\\s+(\\d{1,3}(?:\\.\\d+)?)[\\s-]*(${UNIT_PATTERN})\\b${SPAN}{0,120}?\\b(?:prohibit|not permitted|not allowed|restricted|banned)`, 'i'),
    // "vehicles over 21 feet are prohibited"
    new RegExp(`\\b(?:vehicles?|rvs?)\\b${SPAN}{0,40}?\\bover\\s+(\\d{1,3}(?:\\.\\d+)?)[\\s-]*(${UNIT_PATTERN})\\b${SPAN}{0,120}?\\b(?:prohibit|not permitted|not allowed|restricted|banned)`, 'i'),
    // "maximum vehicle length is 21 feet" / "vehicle length limit: 21 ft"
    new RegExp(`\\b(?:maximum\\s+vehicle\\s+length|vehicle\\s+length\\s+(?:limit|maximum|restriction))\\b[^\\d]{0,16}(\\d{1,3}(?:\\.\\d+)?)[\\s-]*(${UNIT_PATTERN})\\b`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const maxLengthFeet = toFeet(match[1], match[2]);
    if (maxLengthFeet != null) {
      return { dimension: 'length', operator: 'max', maxLengthFeet, raw: match[0], index: match.index ?? null };
    }
  }
  return null;
}

/**
 * The road a limit is ABOUT, from the rule's own surrounding text: the
 * nearest preceding named road ("Are there restrictions on Going-to-the-Sun
 * Road? … longer than 21 feet … prohibited"). Identity-equivalent naming per
 * 4T — a full proper name ending in a road-type word, never token soup.
 */
// Title-cased words only: hyphenated compounds ("Going-to-the-Sun") are one
// token, but each space-separated word must be capitalized — otherwise the
// capture swallows the sentence leading up to the name.
const NAMED_ROAD = /([A-Z][\w'’&.-]*(?:\s[A-Z][\w'’&.-]*){0,5}\s(?:Road|Highway|Drive|Parkway|Byway))\b/g;

function namedRoadNearLimit(text, limitIndex, windowChars = 400) {
  if (!Number.isFinite(limitIndex)) return null;
  const before = String(text || '').slice(Math.max(0, limitIndex - windowChars), limitIndex);
  let nearest = null;
  for (const match of before.matchAll(NAMED_ROAD)) nearest = match[1];
  return nearest ? nearest.replace(/\s+/g, ' ').trim() : null;
}

/**
 * The arithmetic. "Longer than N prohibited" admits exactly N, and 6.4 m and
 * 21 ft are the same limit — hence the tolerance.
 */
function assessVehicleDimensionFit({ vehicleLengthFeet = null, maxLengthFeet = null } = {}) {
  if (maxLengthFeet == null || !Number.isFinite(Number(maxLengthFeet))) {
    return { status: 'not_applicable' };
  }
  if (vehicleLengthFeet == null || !Number.isFinite(Number(vehicleLengthFeet))) {
    return { status: 'unknown', maxLengthFeet };
  }
  const exceeds = Number(vehicleLengthFeet) > Number(maxLengthFeet) + FEET_TOLERANCE;
  return {
    status: exceeds ? 'incompatible' : 'compatible',
    vehicleLengthFeet: Number(vehicleLengthFeet),
    maxLengthFeet: Number(maxLengthFeet),
  };
}

const KIND_LABEL = Object.freeze({
  rv: 'RV', motorhome: 'motorhome', camper: 'camper', trailer: 'trailer', vehicle: 'vehicle',
});

function formatFeet(feet) {
  const rounded = Math.round(Number(feet) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Exact numbers, both sides — never "may not meet the requirements". */
function describeVehicleDimensionConflict({ vehicle = {}, maxLengthFeet, subjectName = 'this road' } = {}) {
  const label = KIND_LABEL[vehicle.kind] || 'vehicle';
  return `Your ${label} is ${formatFeet(vehicle.lengthFeet)} ft; ${subjectName} allows vehicles up to ${formatFeet(maxLengthFeet)} ft.`;
}

/**
 * The traveler's vehicle as the validators see it: canonical state first
 * (an explicit `constraints.vehicle` written by understanding/persistence),
 * the current turn's own words second. Never model output.
 */
function resolveTravelerVehicle({ constraints = null, userPrompt = '' } = {}) {
  const canonical = constraints?.vehicle;
  if (canonical && typeof canonical === 'object' && canonical.kind) {
    return {
      kind: normalizeKind(canonical.kind),
      lengthFeet: Number.isFinite(Number(canonical.lengthFeet)) ? Number(canonical.lengthFeet) : null,
      raw: canonical.raw || canonical.kind,
    };
  }
  return parseTravelerVehicle(userPrompt);
}

module.exports = {
  parseTravelerVehicle,
  parseVehicleLengthLimit,
  namedRoadNearLimit,
  assessVehicleDimensionFit,
  describeVehicleDimensionConflict,
  resolveTravelerVehicle,
  formatFeet,
};
