'use strict';

/**
 * Stage 13 — synthetic fixture builders.
 *
 * All evaluation data is synthetic and reproducible: no production user
 * conversation is ever used. Builders produce valid `create_itinerary` payloads
 * (satisfy isValidToolItinerary + the tool schema fields) and marker-correct
 * Phase B prose so the REAL orchestrator/finalizer/verifier run unchanged.
 */

const SCENARIO_VERSION = '2026-07-28.1';

function stop(id, order, name, opts = {}) {
  const s = {
    id,
    order,
    type: opts.type || 'trail',
    name,
    note: opts.note || `${name} details`,
    startTime: opts.startTime || '08:00',
    duration: Number.isFinite(opts.duration) ? opts.duration : 120,
    parkCode: opts.parkCode || null,
    parkName: opts.parkName || null,
    latitude: opts.latitude ?? null,
    longitude: opts.longitude ?? null,
    difficulty: opts.difficulty || null,
    why: opts.why || null,
    drivingTimeFromPreviousMin: opts.drivingTimeFromPreviousMin ?? null,
  };
  if (opts.alternatives) s.alternatives = opts.alternatives;
  return s;
}

function day(id, dayNumber, label, stops, extra = {}) {
  return { id, dayNumber, label, stops, ...extra };
}

function itinerary(days) {
  return { days };
}

/** Marker-correct prose covering every day + stop in manifest order. */
function goodProse(itin, { intro } = {}) {
  const parts = [];
  if (intro) parts.push(`<!--TRAILIE_INTRO--> ${intro}`);
  for (const d of itin.days) {
    parts.push(`<!--TRAILIE_DAY:${d.id}--> ${d.label}.`);
    for (const s of d.stops) {
      parts.push(`<!--TRAILIE_STOP:${s.id}--> Head to ${s.name}. ${s.note}.`);
    }
  }
  return parts.join('\n');
}

/**
 * Build prose from an itinerary with a targeted defect for consistency tests.
 * `mutate(days)` receives a deep copy of the marker structure spec and returns a
 * modified spec: an array of { dayId, label, stops:[{stopId,text}] }.
 */
function proseFromSpec(spec, { intro } = {}) {
  const parts = [];
  if (intro) parts.push(`<!--TRAILIE_INTRO--> ${intro}`);
  for (const d of spec) {
    parts.push(`<!--TRAILIE_DAY:${d.dayId}--> ${d.label || d.dayId}.`);
    for (const s of d.stops) {
      parts.push(`<!--TRAILIE_STOP:${s.stopId}--> ${s.text}`);
    }
  }
  return parts.join('\n');
}

/** Default marker spec matching an itinerary exactly (the baseline to mutate). */
function specFor(itin) {
  return itin.days.map((d) => ({
    dayId: d.id,
    label: d.label,
    stops: d.stops.map((s) => ({ stopId: s.id, text: `Head to ${s.name}. ${s.note}.` })),
  }));
}

module.exports = {
  SCENARIO_VERSION,
  stop,
  day,
  itinerary,
  goodProse,
  proseFromSpec,
  specFor,
};
