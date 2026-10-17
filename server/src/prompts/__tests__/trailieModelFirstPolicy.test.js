'use strict';

const { TRAILIE_TRAVEL_POLICY } = require('../trailieModelFirstPolicy');
const { validateDayCompleteness } = require('../../utils/dayCompleteness');

test.each([
  ['arrival', 'arrival'],
  ['departure', 'departure'],
  ['transfer', 'transfer'],
  ['rest', 'downtime'],
])('initial policy communicates the existing %s → %s guard contract', (type, kind) => {
  expect(TRAILIE_TRAVEL_POLICY).toContain(`${type} requires a${kind === 'arrival' ? 'n' : ''} ${kind} block`);
  const day = { stops: [], dayStructure: { type, startPeriod: 'afternoon', endPeriod: 'afternoon',
    summary: 'A deliberately partial day.', blocks: [
      { kind: 'meal', periods: ['afternoon'], label: 'Lunch', note: 'Time for lunch.', stopIds: [] },
    ] } };
  expect(validateDayCompleteness(day)).toContain('day_type_inconsistent');
  day.dayStructure.blocks.push({ kind, periods: ['afternoon'], label: 'Planned commitment',
    note: 'The commitment chosen for this day.', stopIds: [] });
  expect(validateDayCompleteness(day)).toEqual([]);
});

test('type dependencies preserve freedom to compose full sightseeing or partial days', () => {
  expect(TRAILIE_TRAVEL_POLICY).toContain("Choose each day's type to fit the trip.");
  expect(TRAILIE_TRAVEL_POLICY).toContain('not instructions to assign any particular type to a day');
  expect(TRAILIE_TRAVEL_POLICY).toContain('Do not assume Day 1 is arrival or the final day is departure');
  expect(TRAILIE_TRAVEL_POLICY).toContain('an afternoon arrival need not invent a morning');
});

test('composition policy requires deliberate day purpose and destination-defining highlights', () => {
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/each day's purpose/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/destination-defining experiences/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/day's identity/i);
});

test('composition policy keeps traveler intent above forced distinctiveness', () => {
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/not a rigid rule/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/intentional sameness is correct/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/deliberate slow afternoon/i);
});

test('chat after a successful plan explains shape instead of duplicating the itinerary', () => {
  expect(TRAILIE_TRAVEL_POLICY).not.toMatch(/for itineraries, favor day-by-day structure/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/never paste a second stop-by-stop itinerary into chat/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/one short line per day purpose/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/do not narrate each stop/i);
});

test('unsuccessful updates and clarifications still require full conversational explanations', () => {
  expect(TRAILIE_TRAVEL_POLICY).toMatch(
    /Validation failures, research limitations and clarification requests still need full,? useful conversational explanations/
  );
});

test('practical notes remain one activity story without restating', () => {
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/how it fits the day's purpose/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/why the experience is worthwhile/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/never restate the same content in both notes/i);
});

test('architecture lock language remains: model judgment, tools retrieve, no invented verified durations', () => {
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/Travel tools own retrieval/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/never invent a verified duration/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/propose_trip_update/);
});

test('active policy includes booking and availability limitations', () => {
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/cannot book, reserve, hold, purchase or guarantee/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/cannot check live booking inventory/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/Never imply you checked availability/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/without inventing links/i);
});

test('booking limitation is not a mandatory footer for every answer category', () => {
  // Present once as standing capability text — not as a required closing for advice/compare Q&A.
  const matches = TRAILIE_TRAVEL_POLICY.match(/cannot book, reserve, hold, purchase or guarantee/gi) || [];
  expect(matches).toHaveLength(1);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/Do not add booking disclaimers to unrelated answers/i);
  expect(TRAILIE_TRAVEL_POLICY).not.toMatch(/always remind the traveler you cannot book/i);
  expect(TRAILIE_TRAVEL_POLICY).not.toMatch(/end every answer with a booking disclaimer/i);
});

test('active policy states U.S. itinerary scope without rigid foreign-mention bans', () => {
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/specializes in U\.S\. travel/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/Do not create itineraries outside the United States/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/no trip artifact/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/mention them for comparison or context/i);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/never add foreign stops to a saved trip/i);
});
