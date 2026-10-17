'use strict';

/**
 * Phase 12A — metamorphic planning-contract families.
 *
 * Generated from semantic components (produce verb × trip object × destination
 * form). Asserts invariant contract fields. Does not import the held-out
 * unseen-park audit list.
 */

const { buildTurnUnderstanding } = require('../turnUnderstanding');
const { resolveTravelerJob } = require('../trailieTravelerJobResolver');

const DESTINATIONS = Object.freeze([
  { name: 'Acadia', code: 'acad' },
  { name: 'Big Bend', code: 'bibe' },
  { name: 'Canyonlands', code: 'cany' },
  { name: 'Sequoia', code: 'sequ' },
]);

function contract(prompt) {
  const understanding = buildTurnUnderstanding({ userPrompt: prompt });
  const resolved = resolveTravelerJob({ userPrompt: prompt, understanding });
  return {
    job: resolved.job,
    artifact: understanding.requestedArtifact,
    durationDays: resolved.durationDays,
    parkCodes: (understanding.subjectDestinations || []).map((d) => d.parkCode).filter(Boolean),
    taskFamily: understanding.taskFamily,
  };
}

function oneDayPrompts(dest) {
  const d = dest.name;
  return [
    `Plan me a day in ${d}`,
    `Build me a day in ${d}`,
    `Make me a day in ${d}`,
    `Put together a day at ${d}`,
    `Design a day at ${d}`,
    `Give us a day at ${d}`,
    `Plan us a day at ${d}`,
    `Put together a ${d} day`,
    `Build me one day at ${d}`,
    `Plan me one day in ${d}`,
    `Create a one-day ${d} itinerary`,
    `Put together one day at ${d}`,
    `We have one full day in ${d} — plan it`,
    `What would you plan for one full day in ${d}?`,
  ];
}

describe('metamorphic one-day produce family shares one planning contract', () => {
  const cases = DESTINATIONS.flatMap((dest) => (
    oneDayPrompts(dest).map((prompt) => [prompt, dest.code])
  ));

  test.each(cases)('%s', (prompt, parkCode) => {
    const got = contract(prompt);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expect(got.durationDays).toBe(1);
    expect(got.parkCodes).toContain(parkCode);
    expect(got.taskFamily).toBe('itinerary');
  });
});

describe('metamorphic counted-trip produce family', () => {
  const cases = DESTINATIONS.flatMap((dest) => ([
    [`Build a 3-day ${dest.name} trip`, dest.code, 3],
    [`Create a 2-day itinerary for ${dest.name}`, dest.code, 2],
    [`Plan four days in ${dest.name}`, dest.code, 4],
  ]));

  test.each(cases)('%s', (prompt, parkCode, days) => {
    const got = contract(prompt);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expect(got.durationDays).toBe(days);
    expect(got.parkCodes).toContain(parkCode);
  });
});

describe('produce request still owns the job when a constraint mentions driving or photos', () => {
  test('not-much-driving is a constraint on a day build, not a route job', () => {
    const got = contract(
      'Put together an easy day at Indiana Dunes with a couple scenic stops and not much driving.',
    );
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expect(got.durationDays).toBe(1);
    expect(got.parkCodes).toContain('indu');
  });

  test('photography plus light driving still produces the day artifact', () => {
    const got = contract('Build a photography day at White Sands with not much driving.');
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expect(got.parkCodes).toContain('whsa');
  });
});

describe('advice and circumstance frames stay out of the produce family', () => {
  test.each([
    ["What's a good backup plan if parking is full at Acadia?", 'access_contingency'],
    ['How should I plan if it rains in Sequoia?', 'general_advice'],
    ["What's the best way to plan around crowds at Acadia in October?", 'general_advice'],
    ['Is three days enough for Sequoia?', 'trip_duration_advice'],
    ['Compare Acadia and Shenandoah for photography.', 'destination_compare'],
    ["Don't build the itinerary yet for a week in Big Bend.", 'trip_skeleton'],
  ])('%s', (prompt, job) => {
    const got = contract(prompt);
    expect(got.job).toBe(job);
    expect(got.artifact).not.toBe('itinerary');
  });

  test('priority questions with a visit length are not itinerary builds', () => {
    const got = contract('What should I prioritize with one full day in Acadia?');
    expect(got.job).not.toBe('day_by_day_itinerary');
    expect(got.artifact).not.toBe('itinerary');
  });
});

describe('TurnUnderstanding and TravelerJob share one produce signal', () => {
  test('TravelerJob does not contradict a requested itinerary artifact', () => {
    const prompt = 'Design a day at Big Bend';
    const understanding = buildTurnUnderstanding({ userPrompt: prompt });
    const resolved = resolveTravelerJob({ userPrompt: prompt, understanding });
    expect(understanding.requestedArtifact).toBe('itinerary');
    expect(resolved.job).toBe('day_by_day_itinerary');
    expect(resolved.understanding.requestedArtifact).toBe('itinerary');
  });
});
