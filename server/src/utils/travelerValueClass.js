'use strict';

/**
 * Generic traveler-value classification of an evidence candidate.
 *
 * "Evidence-backed place" and "worth putting in someone's vacation" are not
 * the same thing: NPS place feeds legitimately contain wayside signs,
 * interpretive panels, parking areas and markers, and until 2026-09-02 the
 * prompt renderer's ranking had no notion of the difference — so a Day-2
 * refinement was offered 18 wayside signs and one trailhead
 * (artifacts/trailie-attempt1-quality-2026-09-02).
 *
 * Classes are ordered most-restrictive first: an entity that is literally a
 * sign stays a sign even when its name mentions a trail. All rules are
 * name/activity-type semantics — no park-specific lists.
 *
 * Classification is a RANKING signal, never an exclusion: a micro-POI may
 * still be offered when nothing better exists, and validators are untouched.
 */

const VALUE_CLASS = Object.freeze({
  PRIMARY_EXPERIENCE: 'PRIMARY_EXPERIENCE',
  SUPPORTING_EXPERIENCE: 'SUPPORTING_EXPERIENCE',
  REST: 'REST',
  LOGISTICS: 'LOGISTICS',
  MICRO_POI: 'MICRO_POI',
  UNKNOWN: 'UNKNOWN',
});

const MICRO_POI_NAME =
  /\[sign\]|wayside|\bmarker\b|\bplaque\b|\bkiosk\b|interpretive panel|\bmilepost\b|\bsignpost\b|\bsign\b/i;
const LOGISTICS_NAME =
  /\bparking\b|\bshuttle\b|\btransit\b|park & ride|entrance station|fee booth|boat launch|ferry terminal|\bbus stop\b|\bdock\b/i;
const REST_NAME = /\bpicnic\b|rest area|\brestrooms?\b|comfort station/i;
const SUPPORTING_NAME =
  /visitor center|contact station|\bmuseum\b|ranger station|\blodge\b|amphitheater|nature center|information center|\bbookstore\b|historical society|\bresort\b/i;
const PRIMARY_NAME =
  /\btrail\b|trailhead|\bfalls\b|overlook|viewpoint|\bbeach\b|\blake\b|\bridge\b|scenic drive|\bloop road\b|\bsprings?\b|\barch\b|\bcanyon\b|\bgeyser\b|\bdunes?\b|\bglacier\b|\bmeadow\b|\bsummit\b|\bcove\b|\bpoint\b|\bboardwalk\b|\bcape\b|\bbutte\b|\bgrove\b|\btidepools?\b|\bhot spring/i;

const LOGISTICS_TYPE = /parking|shuttle|transit/;
const REST_TYPE = /picnic/;
const SUPPORTING_TYPE = /visitor_center|museum|exhibits|orientation|ranger/;
const PRIMARY_TYPE =
  /hik|trail|walk|scenic|viewpoint|wildlife|photograph|boat|beach|climb|paddl|stargaz|swim|snorkel|kayak|bik|fish|birdwatch|geolog|waterfall|astronomy/;

function travelerValueClass({ name = '', activityTypes = [] } = {}) {
  const text = String(name || '');
  const types = (Array.isArray(activityTypes) ? activityTypes : [])
    .map((t) => String(t).toLowerCase()).join(' ');

  if (MICRO_POI_NAME.test(text)) return VALUE_CLASS.MICRO_POI;
  if (LOGISTICS_NAME.test(text) || LOGISTICS_TYPE.test(types)) return VALUE_CLASS.LOGISTICS;
  if (REST_NAME.test(text) || REST_TYPE.test(types)) return VALUE_CLASS.REST;
  if (SUPPORTING_NAME.test(text) || SUPPORTING_TYPE.test(types)) return VALUE_CLASS.SUPPORTING_EXPERIENCE;
  if (PRIMARY_NAME.test(text) || PRIMARY_TYPE.test(types)) return VALUE_CLASS.PRIMARY_EXPERIENCE;
  return VALUE_CLASS.UNKNOWN;
}

module.exports = { travelerValueClass, VALUE_CLASS };
