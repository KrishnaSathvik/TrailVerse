/** Read-only projections of canonical trips; never modifies plan or traveler state. */
export function tripTitle(plan, fallback) {
  return plan?.parkName || (fallback && !/^(new trip plan|untitled trip)$/i.test(fallback) ? fallback : 'Your trip');
}
export function tripBases(plan) {
  return [...new Set((plan?.days || []).map(d => d.overnightLocation).filter(Boolean))].join(' → ');
}
const TYPES = { trail: 'Trail', viewpoint: 'Viewpoint', visitor_center: 'Visitor center', route: 'Route', lake: 'Lake', waterfall: 'Waterfall', locality: 'Town', lodging: 'Lodging', campground: 'Campground', park: 'Park' };
export function groundedPlaceType(stop) {
  if (stop?.source === 'user' && stop.type === 'custom') return 'Custom';
  if (!stop?.canonicalPlaceId || stop?.location?.status !== 'resolved') return null;
  return TYPES[stop.groundedType] || (stop.placeTypes || []).map(t => TYPES[t]).find(Boolean) || null;
}
export function formatTravelMinutes(minutes) {
  const total = Math.round(minutes);
  if (!Number.isFinite(total) || total < 0) return null;
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}
export function verifiedTransferLabel(edge) {
  const access = edge?.operationalAccess;
  const sourcedAccess = Array.isArray(access?.sources) && access.sources.length > 0;
  const modes = { driving: 'drive', walking: 'walk', bicycling: 'bike ride', transit: 'transit', shuttle: 'shuttle', ferry: 'ferry' };
  const verified = edge?.status === 'verified' && edge.source?.evidenceId && edge.source?.provider && Number.isFinite(edge.durationSeconds) && edge.durationSeconds >= 0;
  if (sourcedAccess && access.status === 'required_alternative' && modes[access.requiredMode]) {
    if (verified && edge.travelMode === access.requiredMode) return `${formatTravelMinutes(edge.durationSeconds / 60)} ${modes[access.requiredMode]}`;
    const name = modes[access.requiredMode];
    return `${name.charAt(0).toUpperCase() + name.slice(1)} required · timing not verified`;
  }
  if (sourcedAccess && access.status === 'restricted') return 'Access restricted · confirm transportation';
  if (!verified || !modes[edge.travelMode]) return null;
  const label = edge.travelMode === 'driving' && !(sourcedAccess && access.status === 'allowed') ? 'by road' : modes[edge.travelMode];
  return `${formatTravelMinutes(edge.durationSeconds / 60)} ${label}`;
}
export function hasUnknownRoadAccess(day) {
  return (day?.travelEdges || []).some(edge => verifiedTransferLabel(edge)?.endsWith('by road'));
}
export const ROAD_ACCESS_NOTE = 'Getting around: Road travel times are shown for planning. Shuttle/private-vehicle access depends on your travel dates; check access rules before setting out.';
function dayPresentation(day) {
  return { label: day.label, overnightLocation: day.overnightLocation, dayStructure: day.dayStructure,
    stops: (day.stops || []).map(s => ({ id: s.id, name: s.name, canonicalPlaceId: s.canonicalPlaceId, startTime: s.startTime, timeWindow: s.timeWindow, timingReason: s.timingReason, duration: s.duration, note: s.note, why: s.why, location: s.location && [s.location.lat, s.location.lon] })),
    edges: (day.travelEdges || []).map(e => [e.sourceStopId, e.targetStopId, e.travelMode, e.status, e.durationSeconds, e.operationalAccess]) };
}
export function tripRefinement(prior, next) {
  if (!prior?.days?.length || !next?.days?.length) return { isRefinement: false, changes: [] };
  const changedDayNumbers = next.days.filter((day, i) => {
    const old = prior.days.find((d, j) => (d.dayNumber || j + 1) === (day.dayNumber || i + 1));
    return !old || JSON.stringify(dayPresentation(old)) !== JSON.stringify(dayPresentation(day));
  }).map(day => day.dayNumber || next.days.indexOf(day) + 1);
  return { isRefinement: true, changes: ['trip_updated'], changedDayNumbers };
}
// Read compatibility for recorded/restored turns from before refinement metadata.
export function withTripRefinements(messages) {
  let prior = null;
  return messages.map(message => {
    const plan = message.canonicalPlan || message.itineraryPlan || message.plan;
    if (!plan?.days?.length) return message;
    const refinement = tripRefinement(prior, plan);
    prior = plan;
    return { ...message, refinement, presentation: message.presentation ? { ...message.presentation, refinement } : message.presentation };
  });
}
