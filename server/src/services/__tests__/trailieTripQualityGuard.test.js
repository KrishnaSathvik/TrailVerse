'use strict';
const { validateSimpleMutation } = require('../trailieSimpleGuard');
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');

const now = new Date('2026-10-05T12:00:00Z');
const observation = { observedAt: now.toISOString(), expiresAt: new Date(+now + 86400000).toISOString() };
const place = (name, i, extra = {}) => normalizeEvidenceLocation({ evidenceId: name, topic: 'activities', entityId: name,
  claim: { identity: `official:${name}`, normalizedValue: { name, latitude: 38 + i * 0.01, longitude: -78, ...extra } },
  source: { provider: 'nps', sourceClass: 'official_owner', sourceId: name }, observation });
const evidence = [place('Limberlost Trail', 0), place('Stony Man', 1), place('Skyland', 2), place('Big Meadows', 3),
  place('Springdale', 4, { placeKind: 'area', placeTypes: ['locality', 'political'] })];
const stop = (id, name, extra = {}) => ({ id, order: 1, type: 'trail', name, evidenceRef: name, note: '', startTime: '', timeWindow: 'Morning', duration: 60, ...extra });
const day = (n, stops, overnightLocation = 'Skyland (suggested; subject to availability)') => ({ id: `d${n}`, dayNumber: n, label: `Day ${n}`, overnightLocation,
  stops: stops.map((s, i) => ({ ...s, order: i + 1 })), dayStructure: {startPeriod: 'morning', endPeriod: 'evening',type: 'sightseeing', summary: 'Outing then rest.', blocks: [{kind:'outing',periods:['morning'],label:'Outing',note:'Enjoy the walk.',stopIds:stops.map(s => s.id)}, {kind:'downtime',periods:['midday','evening'],label:'Rest',note:'Lunch, rest and dinner.',stopIds:[]}] } });
const validate = days => validateSimpleMutation({ message: 'plan it', evidence, now, proposal: { response: 'Proposed.', plan: { intro: 'Trip', days } } });

test('the overnight base listed as a lodging stop is the base, not an attraction', () => {
  const v = validate([day(1, [stop('a', 'Limberlost Trail'), stop('b', 'Skyland', { type: 'lodging' })]),
    day(2, [stop('c', 'Stony Man'), stop('d', 'Skyland', { type: 'lodge' })])]);
  expect(v.ok).toBe(true);
  expect(v.plan.days.map(d => d.stops.map(s => s.name))).toEqual([['Limberlost Trail'], ['Stony Man']]);
  expect(v.plan.days[0].overnightLocation).toMatch(/^Skyland/);
});

test('a lodging stop that is the whole day (arrival) is kept', () => {
  const v = validate([day(1, [stop('b', 'Skyland', { type: 'lodging' })]), day(2, [stop('c', 'Stony Man')])]);
  expect(v.plan.days[0].stops.map(s => s.name)).toEqual(['Skyland']);
});

test('a town visited for lunch or downtime is not a lodging stop and stays', () => {
  const v = validate([day(1, [stop('a', 'Limberlost Trail'), stop('b', 'Springdale', { type: 'custom' })], 'Springdale')]);
  expect(v.plan.days[0].stops.map(s => s.name)).toEqual(['Limberlost Trail', 'Springdale']);
});

test('the same sightseeing place on another day needs an explicit reason', () => {
  const repeated = validate([day(1, [stop('a', 'Limberlost Trail')]), day(2, [stop('b', 'Stony Man')]), day(3, [stop('c', 'Limberlost Trail')])]);
  expect(repeated.issues).toContain('repeated_place_without_reason');
  const reasoned = validate([day(1, [stop('a', 'Limberlost Trail')]), day(2, [stop('c', 'Limberlost Trail', { revisitReason: 'A second dawn session for the wildlife the traveler prioritized.' })])]);
  expect(reasoned.ok).toBe(true);
});

test('a town or locality may recur across days without a reason', () => {
  const v = validate([day(1, [stop('a', 'Springdale', { type: 'custom' })], 'Springdale'), day(2, [stop('b', 'Stony Man'), stop('c', 'Springdale', { type: 'custom' })], 'Springdale')]);
  expect(v.issues).not.toContain('repeated_place_without_reason');
});

test('a stop whose record has no location uses the same-name identity that has one', () => {
  const unlocated = { evidenceId: 'todo', topic: 'activities', entityId: 'yell', claim: { identity: 'thingstodo:gc', normalizedValue: { name: 'Grand Canyon of the Yellowstone' } },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'todo' }, observation };
  const located = normalizeEvidenceLocation({ evidenceId: 'gc-place', topic: 'activities', entityId: 'gc', claim: { identity: 'nps:place:gc',
    normalizedValue: { name: 'Grand Canyon of the Yellowstone', requestedName: 'Grand Canyon of the Yellowstone', latitude: 44.72, longitude: -110.48, providerSource: 'nps' } },
    source: { provider: 'named_place', sourceClass: 'official_owner', sourceId: 'gc' }, observation });
  const v = validateSimpleMutation({ message: 'plan', now, evidence: [...evidence, unlocated, located],
    proposal: { response: 'P', plan: { intro: 'T', days: [day(1, [stop('a', 'Grand Canyon of the Yellowstone', { evidenceRef: 'todo' })], 'Canyon Village')] } } });
  expect(v.ok).toBe(true);
  expect(v.plan.days[0].stops[0]).toMatchObject({ canonicalPlaceId: 'nps:place:gc', location: { lat: 44.72, lon: -110.48, status: 'resolved' } });
});
