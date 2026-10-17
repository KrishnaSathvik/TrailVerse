'use strict';

// Single transition boundary for asserted traveler facts. Parsing produces
// explicit changes; applying them owns invalidation. No provider or DB access.
const EXPLORATORY = /\b(?:what if|maybe|might|thinking about|could we|what about|considering)\b/i;
// Confirmed lodging base — semantic variants, not one canned phrase.
// Generic "place" / "lodging" / "room" / "staying in" do not assert a property class.
const CONFIRMED_LODGING_PATTERNS = Object.freeze([
  {
    re: /\b(?:we|i)(?:'ve| have)?\s+(?:already\s+)?booked\s+(?:a\s+|an\s+|our\s+|the\s+)?(hotel|lodge|motel|cabin|airbnb|room|place|lodging)s?\s+in\s+([A-Za-z][A-Za-z .'-]{1,40})/i,
    kindGroup: 1,
    placeGroup: 2,
  },
  {
    re: /\b(?:we|i)(?:'re| are| were)\s+staying\s+in\s+([A-Za-z][A-Za-z .'-]{1,40})/i,
    kindGroup: null,
    placeGroup: 1,
  },
  {
    re: /\b(?:our|my)\s+(hotel|lodge|motel|cabin|airbnb)\s+is\s+in\s+([A-Za-z][A-Za-z .'-]{1,40})/i,
    kindGroup: 1,
    placeGroup: 2,
  },
]);
const BOOKING_RELOCATION = /\b(?:we|i)(?:'ve| have)?\s+(?:changed|moved|switched)\s+(?:(?:the|our|my)\s+)?booking\s+to\s+([A-Za-z][A-Za-z .'-]{1,40})/i;
function isExploratoryTripTalk(message) {
  return EXPLORATORY.test(String(message || ''));
}


function lodgingEntitySpan(raw) {
  // Clause boundaries never belong to an asserted entity. Ambiguous compound
  // names are left to semantic resolution, not persisted as an entire sentence.
  return String(raw || '').split(/[,;!?]|(?<!\bSt)(?<!\bMt)(?<!\bFt)\.(?=\s+[A-Z]|$)|\s+(?:and|but|because|so|while)\s+/)[0].trim();
}
function placeFromBooking(message) {
  const text = String(message || '');
  for (const row of CONFIRMED_LODGING_PATTERNS) {
    const match = text.match(row.re);
    if (!match) continue;
    const rawKind = row.kindGroup == null
      ? 'lodging'
      : String(match[row.kindGroup] || 'lodging').toLowerCase();
    const place = lodgingEntitySpan(match[row.placeGroup]);
    if (!place) continue;
    // "place" / "room" / bare "lodging" / "staying in" → generic lodging class.
    // Do not infer hotel unless the traveler named hotel/motel.
    const GENERIC = new Set(['place', 'room', 'lodging']);
    const kind = GENERIC.has(rawKind) ? 'lodging' : rawKind;
    const stayPreference = GENERIC.has(rawKind) ? null : rawKind;
    return { kind, stayPreference, place };
  }
  return null;
}


function extractLodgingFact(message, state = {}) {
  const text = String(message || '');
  if (text.includes('?') || isExploratoryTripTalk(text)) return null;
  const booking = placeFromBooking(text);
  if (booking) return { ...booking, kindOfChange: 'booking' };
  const moved = state.lodging?.booked === true && text.match(BOOKING_RELOCATION);
  const place = moved && lodgingEntitySpan(moved[1]);
  return place ? { place, kindOfChange: 'relocation' } : null;
}

function transitionLodging(lodging = {}, fact, resolution = null) {
  if (!fact) return { ...lodging };
  const next = { ...lodging, baseTown: fact.place, booked: true };
  if (fact.kindOfChange === 'booking') {
    next.type = fact.kind;
    next.stayPreference = fact.stayPreference;
  }
  if (String(lodging.baseTown || '').trim().toLowerCase() !== fact.place.trim().toLowerCase()) {
    for (const field of ['lat', 'lon', 'stateOrRegion', 'country', 'resolutionSource']) next[field] = null;
    next.resolutionStatus = 'unresolved';
  }
  // Resolution must be bound to this exact extracted identity, never a previous
  // base or a separately parsed full message.
  if (resolution?.baseTown === fact.place) {
    const geo = resolution.place;
    if (geo?.resolutionStatus === 'resolved' && Number.isFinite(geo.lat) && Number.isFinite(geo.lon)
      && Math.abs(geo.lat) <= 90 && Math.abs(geo.lon) <= 180 && !(geo.lat === 0 && geo.lon === 0)) {
      Object.assign(next, { lat: geo.lat, lon: geo.lon,
        stateOrRegion: geo.admin1 || geo.stateCode || null, country: geo.country_code || 'US',
        resolutionStatus: 'resolved', resolutionSource: geo.source || null });
    } else if (geo?.resolutionStatus) next.resolutionStatus = geo.resolutionStatus;
  }
  return next;
}

function applyTravelerFactTransition({ message, planningState, lodgingResolution = null } = {}) {
  if (!planningState || isExploratoryTripTalk(message)) return { planningState, reasons: [] };
  const next = { ...planningState, preferences: { ...planningState.preferences },
    activityPreferences: { ...planningState.activityPreferences }, lodging: { ...planningState.lodging } };
  const reasons = [];
  const lodging = extractLodgingFact(message, planningState);
  if (lodging) {
    next.lodging = transitionLodging(next.lodging, lodging, lodgingResolution);
    reasons.push(lodging.kindOfChange === 'relocation' ? 'lodging_booking_relocated' : 'lodging_booked');
  }
  const { extractExplicitConstraints, constraintValue } = require('./constraintSemantics');
  const exposure = constraintValue(extractExplicitConstraints(message), 'avoidExposure')
    ?? require('./travelerStateExtraction').extractActivityPreferences(message).avoidExposure;
  if (typeof exposure === 'boolean') {
    next.preferences.avoidExposure = exposure;
    reasons.push('avoid_exposure');
  }
  const photo = require('./constraintFamilies').resolvePhotography(message);
  if (photo.span && photo.asserted !== false) {
    if (photo.rejectedTiming) {
      if (next.activityPreferences.photographyTiming === photo.rejectedTiming) next.activityPreferences.photographyTiming = null;
      next.activityPreferences.excludedPhotographyTimings = [...new Set([
        ...(next.activityPreferences.excludedPhotographyTimings || []), photo.rejectedTiming])];
    } else {
      next.activityPreferences.photography = photo.photography;
      next.activityPreferences.photographyTiming = photo.photographyTiming;
      const interests = next.preferences.interests || [];
      next.preferences.interests = photo.photography ? [...new Set([...interests, 'photography'])]
        : interests.filter(value => value !== 'photography');
      if (photo.photographyTiming) next.activityPreferences.excludedPhotographyTimings =
        (next.activityPreferences.excludedPhotographyTimings || []).filter(value => value !== photo.photographyTiming);
    }
    reasons.push(photo.photographyTiming === 'sunrise' ? 'sunrise_photography' : 'photography_preference');
  }
  return { planningState: reasons.length ? next : planningState, reasons };
}
module.exports = { extractLodgingFact, transitionLodging, applyTravelerFactTransition, isExploratoryTripTalk };
