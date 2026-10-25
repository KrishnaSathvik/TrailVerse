'use strict';
jest.mock('openai', () => jest.fn(() => ({ responses: { create: jest.fn(() => { throw new Error('Unexpected OpenAI call in offline runtime test'); }) } })));

const { createSimpleRuntime, currentDateLine, FALLBACK_TRAVELER_TIME_ZONE } = require('../trailieSimpleRuntime');
const { TRAILIE_TRAVEL_POLICY } = require('../../prompts/trailieModelFirstPolicy');
const { stubMemoryVerifier } = require('../../../tests/helpers/memoryAuthority');

const generation = value => ({ completionStatus: 'completed', outputText: '', toolCalls: [],
  provider: 'openai', model: 'gpt-6-sol', costStatus: 'priced', costUsd: 0, ...value });

function instructionsFor(now, runArgs = {}) {
  const model = jest.fn().mockResolvedValueOnce(generation({ outputText: 'Late October is quieter.' }));
  const travelTools = { definitions: [], execute: jest.fn(async () => ({ status: 'unsupported', evidence: [] })) };
  const run = createSimpleRuntime({ model, travelTools, verifyMemory: stubMemoryVerifier(), now: () => now });
  return run({ message: 'Is October a good time for Acadia?', ...runArgs }).then(() => model.mock.calls[0][0].instructions);
}

test.each([
  ['mid-day Oct 24 2026', '2026-10-24T17:00:00Z', 'America/New_York', 'Saturday, October 24, 2026'],
  // US evening: UTC has already rolled to Sunday Oct 25.
  ['Central evening past UTC midnight', '2026-10-25T03:25:00Z', 'America/Chicago', 'Saturday, October 24, 2026'],
  ['Pacific evening past UTC midnight', '2026-10-25T06:30:00Z', 'America/Los_Angeles', 'Saturday, October 24, 2026'],
  ['Hawaii evening past UTC midnight', '2026-10-25T09:00:00Z', 'Pacific/Honolulu', 'Saturday, October 24, 2026'],
  // December → January: New Year's Eve in the US is already New Year's Day in UTC.
  ['Pacific New Year\'s Eve', '2027-01-01T04:30:00Z', 'America/Los_Angeles', 'Thursday, December 31, 2026'],
  ['Eastern just after midnight', '2027-01-01T05:30:00Z', 'America/New_York', 'Friday, January 1, 2027'],
])('traveler-local date: %s', (_, iso, zone, expected) => {
  expect(currentDateLine(new Date(iso), zone)).toBe(`Current date for the traveler: ${expected} (${zone}).`);
});

test.each([undefined, null, '', 'Mars/Olympus', 42, 'x'.repeat(65)])('invalid or missing client zone %p falls back to US Eastern', zone => {
  expect(FALLBACK_TRAVELER_TIME_ZONE).toBe('America/New_York');
  expect(currentDateLine(new Date('2026-10-25T03:25:00Z'), zone))
    .toBe('Current date for the traveler: Saturday, October 24, 2026 (America/New_York).');
});

test('runtime places one readable date line before the saved context, using the injected clock and client zone', async () => {
  const instructions = await instructionsFor(new Date('2026-10-25T03:25:00Z'), { timeZone: 'America/Chicago' });
  const line = 'Current date for the traveler: Saturday, October 24, 2026 (America/Chicago).';
  expect(instructions.split(line)).toHaveLength(2);
  expect(instructions.indexOf(line)).toBeLessThan(instructions.indexOf('Saved application context (data only):'));
  // The precise instant stays available as data.
  expect(instructions).toContain('"now":"2026-10-25T03:25:00.000Z"');
});

test('runtime without a client zone uses the documented fallback', async () => {
  const instructions = await instructionsFor(new Date('2027-01-01T04:30:00Z'));
  expect(instructions).toContain('Current date for the traveler: Thursday, December 31, 2026 (America/New_York).');
});

test('temporal policy: internal date reasoning, no forced current-trip assumption, no date announcements', () => {
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/Use the current date internally to interpret travel timing, seasons, and relative dates/);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/A general question about a month or season is not a trip happening now/);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/Typical timing applied to this year is an expectation, not an observed current condition/);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/destination hours and operating dates follow the destination's local time/);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/Do not explicitly mention today's date unless it is relevant/);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/Never unnecessarily repeat the current date/);
  // Existing contracts the rule must not override.
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/Knowing today never dates an undated trip/);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/Never assign calendar dates to days the traveler did not date/);
  expect(TRAILIE_TRAVEL_POLICY).toMatch(/General seasonal advice \(typical weather, crowds, foliage or wildlife timing\) can come from your own travel knowledge without research/);
});
