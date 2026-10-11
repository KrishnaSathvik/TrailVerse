'use strict';

function dayPresentation(day) {
  return { label: day.label, overnightLocation: day.overnightLocation,
    stops: (day.stops || []).map(s => ({ id: s.id, name: s.name, canonicalPlaceId: s.canonicalPlaceId,
      startTime: s.startTime, duration: s.duration, note: s.note, why: s.why, location: s.location && [s.location.lat, s.location.lon] })),
    edges: (day.travelEdges || []).map(e => [e.sourceStopId, e.targetStopId, e.travelMode, e.status, e.durationSeconds, e.operationalAccess]) };
}
function tripRefinement(prior, next) {
  if (!prior?.days?.length || !next?.days?.length) return { isRefinement: false, changes: [] };
  const changedDayNumbers = next.days.filter((day, i) => {
    const old = prior.days.find((d, j) => (d.dayNumber || j + 1) === (day.dayNumber || i + 1));
    return !old || JSON.stringify(dayPresentation(old)) !== JSON.stringify(dayPresentation(day));
  }).map(day => day.dayNumber || next.days.indexOf(day) + 1);
  return { isRefinement: true, changes: ['trip_updated'], changedDayNumbers };
}
module.exports = { tripRefinement };
