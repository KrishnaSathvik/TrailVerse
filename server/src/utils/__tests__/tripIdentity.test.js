'use strict';
const { nationalParkDestinations, tripTitle, withTripIdentity } = require('../tripIdentity');

const parks = [
  { parkCode: 'zion', fullName: 'Zion National Park', designation: 'National Park' },
  { parkCode: 'brca', fullName: 'Bryce Canyon National Park', designation: 'National Park' },
  { parkCode: 'glac', fullName: 'Glacier National Park', designation: 'National Park' },
  { parkCode: 'glba', fullName: 'Glacier Bay National Park & Preserve', designation: 'National Park & Preserve' },
  { parkCode: 'yell', fullName: 'Yellowstone National Park', designation: 'National Park' },
  { parkCode: 'grca', fullName: 'Grand Canyon National Park', designation: 'National Park' },
  { parkCode: 'para', fullName: 'Grand Canyon-Parashant National Monument', designation: 'National Monument' },
];
const plan = parkName => ({ parkName, days: [{ dayNumber: 1, stops: [] }] });

test('a single park trip is named after the official park', () => {
  const d = nationalParkDestinations(plan('Glacier National Park'), parks);
  expect(d.map(x => x.parkCode)).toEqual(['glac']);
  expect(tripTitle(plan('Glacier National Park'), d)).toBe('Glacier National Park');
});

test('a multi-park trip keeps every park, in the order the plan names them', () => {
  const p = plan('Zion and Bryce Canyon National Parks');
  const d = nationalParkDestinations(p, parks);
  expect(d.map(x => x.parkCode)).toEqual(['zion', 'brca']);
  expect(tripTitle(p, d)).toBe('Zion + Bryce Canyon');
});

test('a park name contained in a longer matched park is one mention', () => {
  expect(nationalParkDestinations(plan('Grand Canyon-Parashant National Monument'), parks).map(x => x.parkCode)).toEqual(['para']);
});

test('a non-NPS destination keeps its own label and gets no park code', () => {
  const p = plan('Canaan Valley and Blackwater Falls, West Virginia');
  expect(nationalParkDestinations(p, parks)).toEqual([]);
  expect(tripTitle(p, [])).toBe('Canaan Valley and Blackwater Falls, West Virginia');
  expect(withTripIdentity(p, parks)).toEqual(p);
});

test('identity is stamped onto the plan and replaces stale identity', () => {
  const out = withTripIdentity({ ...plan('Yellowstone National Park'), parkCode: 'zion', destinations: [{ parkCode: 'zion' }] }, parks);
  expect(out.parkCode).toBe('yell');
  expect(out.destinations).toEqual([{ type: 'nps_park', parkCode: 'yell', name: 'Yellowstone National Park', shortName: 'Yellowstone' }]);
});
