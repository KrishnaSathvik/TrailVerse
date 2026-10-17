'use strict';

const { validateOvernightLimit, validateGuidanceLinks, normalizeGuidanceLinkLabels } = require('../itineraryReliability');
const { transferRouteMode } = require('../transferRouteMode');
const { resolveParkIdentity } = require('../parkDestinationIdentity');
const { validateDayCompleteness } = require('../dayCompleteness');

test.each([
  [['Port Angeles', 'Port Angeles', 'Forks', 'Forks'], 1, []],
  [['Boston', 'Boston', 'Portland', 'Portland'], 1, []],
  [['Springdale', 'Bryce Canyon City', 'Springdale'], 1, ['hotel_change_limit_exceeded']],
  [['Seattle', 'Portland', 'Seattle'], 1, ['hotel_change_limit_exceeded']],
  [['Chicago', 'Chicago'], 0, []],
  [['Bar Harbor', ''], 0, ['overnight_bases_incomplete']],
])('counts actual overnight transitions %j', (bases, limit, expected) => {
  expect(validateOvernightLimit({ days: [...bases.map(overnightLocation => ({ overnightLocation })), {}] }, { maxHotelChanges: limit })).toEqual(expected);
});

test.each(['Colorado', 'Washington', 'New York'])('does not resolve state %s to a park short name', state => {
  const park = { fullName: `${state} National Monument`, designation: 'National Monument', parkCode: 'test', states: 'CO' };
  expect(resolveParkIdentity(state, [park])).toBeNull();
  expect(resolveParkIdentity(`${state} mountains`, [park])).toBeNull();
  expect(resolveParkIdentity(park.fullName, [park])?.park).toBe(park);
});

test.each(['walking', 'transit', 'shuttle', 'ferry'])('car ownership does not force %s legs to driving', requestedMode => {
  expect(transferRouteMode({ rentalCar: true }, { requestedMode }).mode).toBe(requestedMode);
  expect(transferRouteMode({ rentalCar: true }, { requestedMode, requiredMode: 'shuttle' }).mode).toBe('shuttle');
});

test.each([
  'https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm',
  'https://www.recreation.gov/camping/campgrounds/232447',
  'https://www.nps.gov/acad/planyourvisit/vehicle_reservations.htm',
])('guidance requires the exact returned resource %s', url => {
  const sections = [{ placement: 'after_plan', heading: 'Things to Know', markdown: `Check [official information](${url}). Availability is not confirmed.` }];
  expect(validateGuidanceLinks(sections, [{ source: { url } }])).toEqual([]);
  expect(validateGuidanceLinks(sections, [{ claim: { normalizedValue: { reservationUrl: url } } }])).toEqual([]);
  expect(validateGuidanceLinks(sections, [])).toEqual(['guidance_link_unsupported']);
  expect(validateGuidanceLinks(sections, [], sections)).toEqual([]);
});

test.each(['javascript:alert', 'https://invented.example/reserve', 'https://user:password@example.com/'])('unsupported link %s is rejected', url => {
  expect(validateGuidanceLinks([{ markdown: `[Reserve](${url})` }], [])).toEqual(['guidance_link_unsupported']);
});

test('no generic guidance is required', () => {
  expect(validateGuidanceLinks([], [])).toEqual([]);
  expect(validateGuidanceLinks([{ markdown: 'The transfer time remains unconfirmed.' }], [])).toEqual([]);
});

test.each([
  '[Reserve][camp]\n\n[camp]: https://www.recreation.gov/camping/campgrounds/232447',
  '<https://www.recreation.gov/camping/campgrounds/232447>',
])('reference and automatic links require returned evidence', markdown => {
  expect(validateGuidanceLinks([{ markdown }], [])).toEqual(['guidance_link_unsupported']);
  expect(validateGuidanceLinks([{ markdown }], [{ source: { url: 'https://www.recreation.gov/camping/campgrounds/232447' } }])).toEqual([]);
});

test.each(['Airport', 'Ferry terminal'])('non-place transfer cannot overlap the %s commitment', label => {
  const day = { stops: [], dayStructure: { type: 'departure', summary: label, startPeriod: 'morning', endPeriod: 'morning', blocks: [
    { kind: 'transfer', periods: ['morning'], label: 'Transfer', note: 'Allow travel time', stopIds: [], startTime: '09:00', timingReason: 'Departure commitment', duration: 180 },
    { kind: 'departure', periods: ['morning'], label, note: 'Depart', stopIds: [], startTime: '11:00', timingReason: 'Traveler departure', duration: 0 },
  ] } };
  expect(validateDayCompleteness(day)).toContain('activity_time_overlap');
  day.dayStructure.blocks[0].startTime = '07:00';
  expect(validateDayCompleteness(day)).not.toContain('activity_time_overlap');
});

test('a park homepage is never labelled as an alerts page', () => {
  const home = 'https://www.nps.gov/zion/index.htm';
  const conditions = 'https://www.nps.gov/zion/planyourvisit/conditions.htm';
  const sections = [{ placement: 'after_plan', heading: 'Things to Know', markdown: `Review [Zion's official alerts](${home}) before setting out. See [shuttle info](https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm).` }];
  const relabelled = normalizeGuidanceLinkLabels(sections, [{ source: { url: home } }]);
  expect(relabelled[0].markdown).toContain(`[the official NPS park page](${home})`);
  expect(relabelled[0].markdown).toContain('[shuttle info]');
  const pointed = normalizeGuidanceLinkLabels(sections, [{ source: { url: home } }, { source: { url: conditions } }]);
  expect(pointed[0].markdown).toContain(`[Zion's official alerts](${conditions})`);
  expect(validateGuidanceLinks(pointed, [{ source: { url: conditions } }, { source: { url: 'https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm' } }])).toEqual([]);
  expect(normalizeGuidanceLinkLabels(sections, [], sections)[0]).toBe(sections[0]);
  expect(normalizeGuidanceLinkLabels([{ markdown: `[Plan your visit](${home})` }], [])[0].markdown).toBe(`[Plan your visit](${home})`);
});
