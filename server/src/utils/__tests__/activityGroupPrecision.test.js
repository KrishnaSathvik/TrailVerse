'use strict';

jest.mock('node-fetch');
const fetch = require('node-fetch');
const { normalizeDayActivityGroups } = require('../activityGroupValidation');
const { normalizeDayTravelEdges } = require('../travelEdgeValidation');
const { finalizeStructuredItinerary } = require('../finalizeItinerary');
const { applyPlanPatch } = require('../itineraryPlanPatch');
const { enrichItineraryDrivingTimes } = require('../../services/drivingTimesContextService');
const { getCreateItineraryTool, PATCH_ITINERARY_TOOL } = require('../itineraryToolSchema');
const edge = (sourceStopId, targetStopId) => ({ sourceStopId, targetStopId, relationship: 'transfer' });
const stop = (id, extra = {}) => ({ id, name: id, type: 'trail', duration: 30, note: 'n', parkCode: 'yose', ...extra });
const group = { id: 'mist-hike', stopIds: ['mist', 'bridge', 'fall'] };
function day() {
  return { dayNumber: 1, stops: [stop('mist', { name: 'Mist Trail' }),
    stop('bridge', { name: 'Vernal Fall Footbridge', type: 'viewpoint' }), stop('fall', { name: 'Vernal Fall', type: 'landmark' }),
    stop('view', { name: 'Tunnel View', type: 'viewpoint' })], activityGroups: [group] };
}
function normalize(d) {
  d.activityGroups = normalizeDayActivityGroups(d);
  if (d.travelEdges !== undefined) d.travelEdges = normalizeDayTravelEdges(d);
  return d;
}

test('a normalized dropped group with an authored edge still cannot enable Distance Matrix', async () => {
  const savedKey = process.env.GMAPS_SERVER_KEY;
  process.env.GMAPS_SERVER_KEY = 'test-key';
  try {
    const d = day();
    d.travelEdges = [edge('mist', 'bridge')];
    d.stops.forEach((s, i) => { s.latitude = 37.73 + i / 100; s.longitude = -119.55; s.coordinateSource = 'geocoder'; });
    normalize(d);
    expect(d.activityGroups).toEqual([]);
    const enriched = await enrichItineraryDrivingTimes({ days: [d] });
    expect(enriched.days[0].travelEdges).toEqual([edge('mist', 'bridge')]);
    expect(enriched.days[0].stops.every((s) => !s.drivingTimeFromPreviousMin)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    if (savedKey === undefined) delete process.env.GMAPS_SERVER_KEY;
    else process.env.GMAPS_SERVER_KEY = savedKey;
  }
});

test.each([{}, { reduced: true }, { strict: true }, { reduced: true, bindParkIdentity: true }])('authoring guidance survives schema variants %j', (opts) => {
  const desc = getCreateItineraryTool(opts).input_schema.properties.days.items.properties.activityGroups.description;
  for (const term of ['uninterrupted', 'clustered', 'nearby', 'same area', 'same basin', 'geographic convenience',
    'Visitor centers', 'museums', 'information stations', 'meals/rest stops', 'one hike', 'one scenic drive', 'one boat trip', 'guided continuous tour']) {
    expect(desc).toContain(term);
  }
  expect(PATCH_ITINERARY_TOOL.input_schema.properties.operations.items.properties.day.properties.activityGroups.description).toContain('uninterrupted');
});

test('live-style Yosemite group and outgoing edge survive finalization without routing', async () => {
  const d = day();
  d.travelEdges = [edge('fall', 'view')];
  const result = await finalizeStructuredItinerary({ itineraryData: { days: [d] }, enrichDrivingTimes: enrichItineraryDrivingTimes });
  expect(result.itineraryData.days[0].activityGroups).toEqual([group]);
  expect(result.itineraryData.days[0].travelEdges).toEqual([edge('fall', 'view')]);
  expect(fetch).not.toHaveBeenCalled();
});

test.each([
  ['Old Faithful', 'Old Faithful Visitor Education Center'],
  ['Norris Geyser Basin', 'Norris Information Station'],
])('structured visitor center drops %s group without inventing movement', async (name, facility) => {
  const d = { dayNumber: 1, stops: [stop('a', { name, parkCode: 'yell', type: 'geothermal' }),
    stop('b', { name: facility, parkCode: 'yell', type: 'visitor_center' })], activityGroups: [{ id: 'bad', stopIds: ['a', 'b'] }] };
  const result = await finalizeStructuredItinerary({ itineraryData: { days: [d] }, enrichDrivingTimes: enrichItineraryDrivingTimes });
  expect(result.itineraryData.days[0].activityGroups).toEqual([]);
  expect(result.itineraryData.days[0].travelEdges).toBeUndefined();
  expect(result.itineraryData.days[0].stops.every((s) => !s.drivingTimeFromPreviousMin)).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});

test('visitor center mixed into a hike drops the entire group', () => {
  const d = day(); d.stops[1].type = 'visitor_center';
  expect(normalize(d).activityGroups).toEqual([]);
});

test.each(['trail', 'meal', 'lodge', 'picnic', 'museum'])('continuous trailhead/chalet stage is not rejected merely for type %s', (type) => {
  const d = { stops: [stop('trailhead'), stop('chalet', { type })], activityGroups: [{ id: 'hike', stopIds: ['trailhead', 'chalet'] }] };
  expect(normalize(d).activityGroups).toHaveLength(1);
});

test('known limitation: museum-typed information station evades structured visitor-center rejection', () => {
  const d = day(); d.stops[1] = stop('bridge', { name: 'Norris Museum and Information Station', type: 'museum' });
  expect(normalize(d).activityGroups).toEqual([group]);
});

test('destination semantics prefer authoritative entity IDs over parkCode and normalize identity', () => {
  const d = day();
  d.stops[0].destinationEntityId = ' CUSTOM:HIKE ';
  d.stops[1].entityId = 'custom:hike'; d.stops[1].parkCode = 'glac';
  d.stops[2].parkEntityId = 'custom:hike';
  expect(normalize(d).activityGroups).toEqual([group]);
});

test.each(['destinationEntityId', 'entityId', 'parkEntityId', 'parkCode'])('different destination through %s drops group', (field) => {
  const d = day(); d.stops[1][field] = field === 'parkCode' ? 'glac' : 'custom:other';
  expect(normalize(d).activityGroups).toEqual([]);
});

test('missing destination identity alone does not reject a group', () => {
  const d = day(); delete d.stops[1].parkCode;
  expect(normalize(d).activityGroups).toEqual([group]);
});

test('internal authored edge wins, is reconstructed normally, and enables no routing', async () => {
  const d = day(); d.travelEdges = [{ ...edge('mist', 'fall'), mode: 'driving' }, edge('fall', 'view')];
  const result = await finalizeStructuredItinerary({ itineraryData: { days: [d] }, enrichDrivingTimes: enrichItineraryDrivingTimes });
  expect(result.itineraryData.days[0].activityGroups).toEqual([]);
  expect(result.itineraryData.days[0].travelEdges).toEqual([edge('mist', 'fall'), edge('fall', 'view')]);
  expect(fetch).not.toHaveBeenCalled();
});

test.each([edge('fall', 'mist'), edge('mist', 'mist'), edge('mist', 'missing'),
  { ...edge('mist', 'fall'), relationship: 'drive' }])('invalid edge does not defeat a valid group: %j', (raw) => {
  const d = day(); d.travelEdges = [raw];
  expect(normalize(d).activityGroups).toEqual([group]);
  expect(d.travelEdges).toEqual([]);
});

test('dropping a cross-destination group does not rescue its invalid edge', () => {
  const d = day(); d.stops[2].destinationEntityId = 'custom:other'; d.travelEdges = [edge('mist', 'fall')];
  expect(normalize(d).activityGroups).toEqual([]); expect(d.travelEdges).toEqual([]);
});

test('surviving group boundary rules still apply after another group drops', () => {
  const d = day(); d.stops[0].type = 'visitor_center';
  d.activityGroups = [{ id: 'bad', stopIds: ['mist', 'bridge'] }, { id: 'valid', stopIds: ['fall', 'view'] }];
  d.travelEdges = [edge('bridge', 'view')];
  expect(normalize(d).activityGroups).toEqual([{ id: 'valid', stopIds: ['fall', 'view'] }]);
  expect(d.travelEdges).toEqual([]);
});

test.each([
  [{ op: 'remove_stop', stopId: 'bridge' }, false, true],
  [{ op: 'reorder_stops', stopOrder: ['bridge', 'mist', 'fall', 'view'] }, false, true],
  [{ op: 'add_stop', stop: stop('extra') }, true, true],
  [{ op: 'update_stop', stopId: 'bridge', stop: { type: 'visitor_center' } }, false, true],
  [{ op: 'update_stop', stopId: 'fall', stop: { destinationEntityId: 'other' } }, false, false],
])('patch normalizes groups before edges: %j', (operation, keepGroup, keepEdge) => {
  const d = day(); d.travelEdges = [edge('fall', 'view')];
  const result = applyPlanPatch({ priorPlan: { days: [d] }, planPatch: { operations: [{ ...operation, dayNumber: 1 }] } });
  expect(result.ok).toBe(true);
  expect(result.plan.days[0].activityGroups).toEqual(keepGroup ? [group] : []);
  expect(result.plan.days[0].travelEdges).toEqual(keepEdge ? [edge('fall', 'view')] : []);
});

test('update_day resolves group/edge contradiction in patch flow', () => {
  const d = day(); d.travelEdges = [edge('mist', 'bridge')];
  const result = applyPlanPatch({ priorPlan: { days: [day()] }, planPatch: { operations: [{ op: 'update_day', dayNumber: 1, day: d }] } });
  expect(result.ok).toBe(true);
  expect(result.plan.days[0].activityGroups).toEqual([]);
  expect(result.plan.days[0].travelEdges).toEqual([edge('mist', 'bridge')]);
});
