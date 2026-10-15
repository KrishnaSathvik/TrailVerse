'use strict';

const { normalizeDayTravelEdges } = require('../utils/travelEdgeValidation');

const OPS = Object.freeze(['remove_stop', 'move_stop', 'add_day', 'remove_day', 'add_place']);

function clonePlan(plan) {
  return JSON.parse(JSON.stringify(plan));
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Empty rest day that passes validateDayCompleteness({ required: true }). */
function emptyDayStructure() {
  return {
    type: 'rest',
    startPeriod: 'morning',
    endPeriod: 'evening',
    summary: 'An open day ready for plans.',
    blocks: [{
      kind: 'downtime',
      periods: ['morning', 'midday', 'afternoon', 'evening'],
      label: 'Open day',
      note: 'Add experiences with Trailie, or keep this day flexible.',
      stopIds: [],
    }],
  };
}

function renumberDays(days) {
  return days.map((day, index) => ({
    ...day,
    dayNumber: index + 1,
    label: typeof day.label === 'string'
      ? day.label.replace(/^Day \d+/, `Day ${index + 1}`)
      : `Day ${index + 1}`,
  }));
}

/**
 * Outing stopIds must match stops[] order 1:1. Non-outing blocks keep empty
 * stopIds. When all stops are removed, collapse outings into a valid rest shell
 * so dayCompleteness does not reject unbound outing blocks.
 */
function syncDayStructureStopIds(day) {
  const stopIds = (day.stops || []).map((stop) => stop.id).filter(Boolean);
  let shape = day?.dayStructure;

  if (!stopIds.length) {
    // Empty days must remain structurally valid for model-first readers.
    shape = emptyDayStructure();
  } else if (!shape || !Array.isArray(shape.blocks)) {
    shape = {
      type: 'sightseeing',
      startPeriod: 'morning',
      endPeriod: 'evening',
      summary: day.label || 'A day of park experiences.',
      blocks: [
        {
          kind: 'outing',
          periods: ['morning', 'midday', 'afternoon'],
          label: 'Outing',
          note: 'Places for this day.',
          stopIds: [...stopIds],
        },
        {
          kind: 'downtime',
          periods: ['evening'],
          label: 'Evening',
          note: 'Wind down after the day.',
          stopIds: [],
        },
      ],
    };
  } else {
    let outingAssigned = false;
    const blocks = shape.blocks.map((block) => {
      if (block.kind !== 'outing') return { ...block, stopIds: [] };
      if (outingAssigned) {
        // Extra outings become downtime so period coverage stays intact.
        return { ...block, kind: 'downtime', stopIds: [] };
      }
      outingAssigned = true;
      return { ...block, stopIds: [...stopIds] };
    });
    if (!outingAssigned) {
      blocks.unshift({
        kind: 'outing',
        periods: [shape.startPeriod || 'morning'],
        label: 'Outing',
        note: 'Places for this day.',
        stopIds: [...stopIds],
      });
    }
    shape = { ...shape, blocks };
  }

  const next = { ...day, dayStructure: shape };
  return {
    ...next,
    travelEdges: normalizeDayTravelEdges(next),
  };
}

function findStopDay(days, stopId) {
  const dayIndex = days.findIndex((day) => (day.stops || []).some((stop) => stop.id === stopId));
  if (dayIndex < 0) return null;
  const stopIndex = days[dayIndex].stops.findIndex((stop) => stop.id === stopId);
  return { dayIndex, stopIndex, stop: days[dayIndex].stops[stopIndex] };
}

function reindexStops(stops) {
  return stops.map((stop, order) => ({ ...stop, order: order + 1 }));
}

/**
 * Apply a typed manual mutation. Pure: returns a new plan or a failure code.
 * @returns {{ ok: true, plan, touchedDayNumbers: number[] } | { ok: false, code: string }}
 */
function applyManualMutation(plan, body = {}) {
  const op = body?.op;
  if (!OPS.includes(op)) return { ok: false, code: 'manual_mutation_invalid' };
  if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) {
    return { ok: false, code: 'manual_mutation_invalid' };
  }

  const next = clonePlan(plan);
  let days = next.days;
  const touched = new Set();

  if (op === 'remove_stop') {
    const stopId = body.stopId;
    if (typeof stopId !== 'string' || !stopId) return { ok: false, code: 'manual_mutation_invalid' };
    const found = findStopDay(days, stopId);
    if (!found) return { ok: false, code: 'manual_mutation_invalid' };
    const day = days[found.dayIndex];
    day.stops = reindexStops(day.stops.filter((stop) => stop.id !== stopId));
    days[found.dayIndex] = syncDayStructureStopIds(day);
    touched.add(day.dayNumber);
  }

  if (op === 'move_stop') {
    const { stopId, toDayId } = body;
    if (typeof stopId !== 'string' || !stopId || typeof toDayId !== 'string' || !toDayId) {
      return { ok: false, code: 'manual_mutation_invalid' };
    }
    const found = findStopDay(days, stopId);
    const toIndex = days.findIndex((day) => day.id === toDayId);
    if (!found || toIndex < 0) return { ok: false, code: 'manual_mutation_invalid' };
    if (found.dayIndex === toIndex) {
      const day = days[toIndex];
      const stops = [...day.stops];
      const [moved] = stops.splice(found.stopIndex, 1);
      let index = body.index;
      if (!Number.isInteger(index)) index = stops.length;
      index = Math.max(0, Math.min(stops.length, index));
      stops.splice(index, 0, moved);
      day.stops = reindexStops(stops);
      days[toIndex] = syncDayStructureStopIds(day);
      touched.add(day.dayNumber);
    } else {
      const fromDay = days[found.dayIndex];
      const toDay = days[toIndex];
      const [moved] = fromDay.stops.splice(found.stopIndex, 1);
      fromDay.stops = reindexStops(fromDay.stops);
      let index = body.index;
      if (!Number.isInteger(index)) index = toDay.stops.length;
      index = Math.max(0, Math.min(toDay.stops.length, index));
      toDay.stops = reindexStops([
        ...toDay.stops.slice(0, index),
        moved,
        ...toDay.stops.slice(index),
      ]);
      days[found.dayIndex] = syncDayStructureStopIds(fromDay);
      days[toIndex] = syncDayStructureStopIds(toDay);
      touched.add(fromDay.dayNumber);
      touched.add(toDay.dayNumber);
    }
  }

  if (op === 'add_day') {
    const after = Number.isInteger(body.afterDayNumber) ? body.afterDayNumber : days.length;
    const insertAt = Math.max(0, Math.min(days.length, after));
    const newDay = {
      id: uid('day'),
      dayNumber: insertAt + 1,
      label: `Day ${insertAt + 1}`,
      stops: [],
      overnightLocation: '',
      dayStructure: emptyDayStructure(),
      travelEdges: [],
    };
    days = [...days.slice(0, insertAt), newDay, ...days.slice(insertAt)];
    days = renumberDays(days).map(syncDayStructureStopIds);
    days.forEach((day) => touched.add(day.dayNumber));
  }

  if (op === 'remove_day') {
    const { dayId } = body;
    if (typeof dayId !== 'string' || !dayId) return { ok: false, code: 'manual_mutation_invalid' };
    if (days.length <= 1) return { ok: false, code: 'manual_mutation_last_day' };
    const index = days.findIndex((day) => day.id === dayId);
    if (index < 0) return { ok: false, code: 'manual_mutation_invalid' };
    days = renumberDays(days.filter((_, i) => i !== index)).map(syncDayStructureStopIds);
    days.forEach((day) => touched.add(day.dayNumber));
  }

  if (op === 'add_place') {
    const { dayId, stop } = body;
    if (typeof dayId !== 'string' || !dayId || !stop || typeof stop !== 'object') {
      return { ok: false, code: 'manual_mutation_invalid' };
    }
    // Stop seed must be server-resolved (identity + map-eligible location).
    if (!stop.evidenceRef || !stop.canonicalPlaceId || !stop.location
      || stop.location.status !== 'resolved'
      || !Number.isFinite(stop.location.lat) || !Number.isFinite(stop.location.lon)) {
      return { ok: false, code: 'place_unresolved' };
    }
    const dayIndex = days.findIndex((day) => day.id === dayId);
    if (dayIndex < 0) return { ok: false, code: 'manual_mutation_invalid' };
    const day = days[dayIndex];
    if ((day.stops || []).some((s) => s.canonicalPlaceId === stop.canonicalPlaceId)) {
      return { ok: false, code: 'manual_mutation_invalid' };
    }
    let index = body.index;
    if (!Number.isInteger(index)) index = day.stops.length;
    index = Math.max(0, Math.min(day.stops.length, index));
    const seed = { ...stop };
    delete seed.id;
    delete seed.order;
    const inserted = {
      ...seed,
      id: uid('stop'),
      order: index + 1,
    };
    day.stops = reindexStops([
      ...day.stops.slice(0, index),
      inserted,
      ...day.stops.slice(index),
    ]);
    // Stop order changed — drop day route edges rather than trusting stale ones.
    day.travelEdges = [];
    days[dayIndex] = syncDayStructureStopIds(day);
    touched.add(days[dayIndex].dayNumber);
  }

  next.days = days;
  return { ok: true, plan: next, touchedDayNumbers: [...touched].sort((a, b) => a - b) };
}

module.exports = {
  OPS,
  applyManualMutation,
  syncDayStructureStopIds,
  emptyDayStructure,
};
