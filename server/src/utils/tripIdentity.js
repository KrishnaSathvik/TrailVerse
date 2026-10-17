'use strict';

const { lexical } = require('../services/providers/namedPlaceEquivalence');

const DEFAULT_TITLE = 'New Trip Plan';
const MAX_DESTINATIONS = 6;

const shortName = park => String(park?.fullName || '').replace(park?.designation || '', '').trim();

/**
 * Official NPS parks a canonical trip is about, read from the plan's own
 * destination label against the official catalog. Whole-phrase matches only;
 * a park whose name sits inside a longer matched park name is the same mention.
 */
function nationalParkDestinations(plan, parks = []) {
  const label = ` ${lexical(plan?.parkName)} `;
  if (!label.trim()) return [];
  const hits = [];
  for (const park of parks) {
    if (!park?.parkCode || !park.fullName) continue;
    const names = [park.fullName, shortName(park)].map(lexical).filter(n => n.length >= 4);
    const matched = names.filter(n => label.includes(` ${n} `)).sort((a, b) => b.length - a.length)[0];
    if (matched) hits.push({ park, matched, at: label.indexOf(` ${matched} `) });
  }
  const kept = hits.filter(h => !hits.some(o => o !== h && o.matched.length > h.matched.length && o.matched.includes(h.matched)));
  return kept.sort((a, b) => a.at - b.at).slice(0, MAX_DESTINATIONS).map(({ park }) => ({
    type: 'nps_park', parkCode: String(park.parkCode).toLowerCase(), name: park.fullName, shortName: shortName(park) || park.fullName,
  }));
}

/** A plain traveler-facing name for the trip. */
function tripTitle(plan, destinations = []) {
  if (destinations.length === 1) return destinations[0].name;
  if (destinations.length > 1) return destinations.slice(0, 3).map(d => d.shortName).join(' + ');
  const label = typeof plan?.parkName === 'string' ? plan.parkName.trim() : '';
  return label ? label.slice(0, 120) : DEFAULT_TITLE;
}

/** Identity fields that travel WITH the canonical plan (hashed alongside it). */
function withTripIdentity(plan, parks = []) {
  if (!plan?.days?.length) return plan;
  const destinations = nationalParkDestinations(plan, parks);
  const { parkCode: _parkCode, destinations: _destinations, ...rest } = plan;
  return { ...rest, ...(destinations.length ? { parkCode: destinations[0].parkCode, destinations } : {}) };
}

module.exports = { DEFAULT_TITLE, nationalParkDestinations, tripTitle, withTripIdentity };
