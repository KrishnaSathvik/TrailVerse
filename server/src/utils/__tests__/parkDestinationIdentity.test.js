'use strict';

const { resolveParkIdentity } = require('../parkDestinationIdentity');

const park = (parkCode, fullName, designation, states, cities = []) => ({
  parkCode, fullName, designation, states, addresses: cities.map((city) => ({ city, stateCode: states.split(',')[0] })),
});
const PARKS = [
  park('glac', 'Glacier National Park', 'National Park', 'MT', ['West Glacier']),
  park('glba', 'Glacier Bay National Park & Preserve', 'National Park & Preserve', 'AK', ['Gustavus']),
  park('yose', 'Yosemite National Park', 'National Park', 'CA', ['Yosemite National Park']),
  park('arch', 'Arches National Park', 'National Park', 'UT', ['Moab']),
  park('zion', 'Zion National Park', 'National Park', 'UT', ['Springdale']),
  park('brca', 'Bryce Canyon National Park', 'National Park', 'UT', ['Bryce Canyon']),
  park('grsm', 'Great Smoky Mountains National Park', 'National Park', 'NC,TN', ['Gatlinburg']),
];
const code = (name) => resolveParkIdentity(name, PARKS)?.park.parkCode || null;

test.each([
  ['Zion National Park', 'zion', 'exact'],
  ['zion', 'zion', 'exact'],
  ['Glacier National Park, Montana', 'glac', 'qualified'],
  ['Glacier National Park, MT, USA', 'glac', 'qualified'],
  ['Glacier National Park - West Glacier', 'glac', 'qualified'],
  ['Arches National Park, Utah', 'arch', 'qualified'],
  ['Arches National Park, Moab', 'arch', 'qualified'],
  ['Yosemite National Park, Yosemite Valley', 'yose', 'qualified'],
  ['Great Smoky Mountains National Park (Tennessee)', 'grsm', 'qualified'],
])('resolves %s', (name, expected, match) => {
  expect(resolveParkIdentity(name, PARKS)).toMatchObject({ park: { parkCode: expected }, match });
});

test.each([
  'Glacier National Park, Utah', // wrong state for the named park
  'Glacier National Park, British Columbia', // a different (Canadian) park
  'Glacier National Park (Canada)',
  'Glacier National Park, Glacier Bay', // second park as qualifier
  'Zion National Park; Las Vegas, Nevada', // second destination
  'Zion National Park, Bryce Canyon National Park',
  'Zion National Park and Bryce Canyon National Park',
  'Arches National Park, Springdale', // another park's city
  'Smoky Mountains', // not an exact identity
  'Mountains in Utah',
])('leaves %s unresolved rather than guessing', (name) => {
  expect(code(name)).toBeNull();
});

test('missing catalog never resolves', () => {
  expect(resolveParkIdentity('Zion National Park', [])).toBeNull();
});
