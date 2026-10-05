'use strict';

// Traveler intent, absolute value and relative burden are separate contracts.
// Model day labels never grant a quality exemption.
function resolveDayIntent({ userPrompt = '', constraints = null, dayNumber = 1, dayCount = 1, touchedDayNumbers = null } = {}) {
  const text = String(userPrompt);
  const explicitDays = [...text.matchAll(/\bday\s+(\d+)\b/gi)].map(m => Number(m[1]));
  const scoped = dayCount === 1 || (touchedDayNumbers || explicitDays).includes(dayNumber);
  const rest = scoped && /\b(?:rest day|day off|mostly rest|do almost nothing|take it easy all day)\b/i.test(text)
    && !/\b(?:no|not|without)\s+(?:a\s+)?rest day\b/i.test(text);
  const relative = scoped && require('./constraintFamilies').resolvePace(text).value === 'relaxed'
    && /\b(?:make|redo|rework|less|more|shorten|simplify|easier|slower)\b/i.test(text);
  const hours = Number(constraints?.planningState?.time?.availableHours ?? constraints?.time?.availableHours);
  const availableMinutes = hours > 0 ? hours * 60 : null;
  const boundary = scoped && /\b(?:arrival|departure|transfer|travel) day\b/i.test(text);
  return { kind: rest ? 'rest' : availableMinutes ? 'limited_time' : boundary ? 'travel_boundary' : 'sightseeing',
    relativeBurden: relative ? 'reduce' : 'unspecified', availableMinutes, travelerAsserted: rest || boundary || Boolean(availableMinutes) };
}

function dayBurden(day, bundle = null) {
  const stops = day?.stops || [];
  const distances = stops.filter(s => /trail|hike|walk/.test(s.type || '')).map(stop => {
    const values = require('./semanticDayValue').evidenceForStop(stop, bundle).map(row => row.claim?.normalizedValue?.walkingDistanceMiles);
    const known = values.filter(value => value != null).map(Number).filter(n => Number.isFinite(n) && n >= 0);
    return known.length ? Math.max(...known) : null;
  });
  return { walkingMiles: distances.some(value => value === null) ? null : distances.reduce((a, b) => a + b, 0), scheduledMinutes: stops.reduce((n, s) => n + Math.max(0, Number(s.duration) || 0), 0),
    stopCount: stops.filter(s => s.name).length };
}
function compareDayBurden(before, after, bundle = null) {
  if (!before) return { status: 'unknown', before: null, after: dayBurden(after, bundle) };
  const a = dayBurden(before, bundle); const b = dayBurden(after, bundle);
  // A fewer-stop day can still be longer. Preserve both dimensions rather than
  // treating attraction count as a proxy for effort.
  const increased = b.scheduledMinutes > a.scheduledMinutes || b.stopCount > a.stopCount
    || a.walkingMiles != null && b.walkingMiles != null && b.walkingMiles > a.walkingMiles;
  const reduced = b.scheduledMinutes < a.scheduledMinutes || b.stopCount < a.stopCount
    || a.walkingMiles != null && b.walkingMiles != null && b.walkingMiles < a.walkingMiles;
  return { status: increased ? 'increased' : reduced ? 'reduced' : 'unchanged', before: a, after: b };
}
module.exports = { resolveDayIntent, compareDayBurden, dayBurden };
