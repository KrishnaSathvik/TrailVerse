'use strict';

/**
 * Phase 12A — independent paraphrase family.
 *
 * Created after the produce-object grammar, using destinations and surface
 * forms that are not the development metamorphic tables and not the held-out
 * unseen-park audit strings. Agreement is measured on contract fields only.
 */

const { buildTurnUnderstanding } = require('../turnUnderstanding');
const { resolveTravelerJob } = require('../trailieTravelerJobResolver');

const DESTINATIONS = Object.freeze([
  { name: 'Congaree', code: 'cong' },
  { name: 'Voyageurs', code: 'voya' },
  { name: 'Capitol Reef', code: 'care' },
  { name: 'Isle Royale', code: 'isro' },
]);

function contract(prompt) {
  const understanding = buildTurnUnderstanding({ userPrompt: prompt });
  const resolved = resolveTravelerJob({ userPrompt: prompt, understanding });
  return {
    job: resolved.job,
    artifact: understanding.requestedArtifact,
    durationDays: resolved.durationDays,
    parkCodes: (understanding.subjectDestinations || []).map((d) => d.parkCode).filter(Boolean),
    askedToProduce: understanding.askedToProduceTripArtifact === true,
  };
}

function expectedOneDay(got, parkCode) {
  return got.job === 'day_by_day_itinerary'
    && got.artifact === 'itinerary'
    && got.durationDays === 1
    && got.askedToProduce === true
    && got.parkCodes.includes(parkCode);
}

function paraphrases(dest) {
  const d = dest.name;
  return [
    `Map out a day in ${d}`,
    `Lay out one day at ${d}`,
    `Sketch us a day at ${d}`,
    `Draft a ${d} day`,
    `Come up with a day in ${d}`,
    `Work out a ${d} day`,
    `Draw up one day at ${d}`,
    `Write me a day at ${d}`,
    `Help us spend a day at ${d}`,
    `We have a day in ${d} — build it`,
  ];
}

describe('fresh paraphrase family — one-day produce contract', () => {
  const rows = DESTINATIONS.flatMap((dest) => paraphrases(dest).map((prompt) => [prompt, dest.code]));

  test.each(rows)('%s', (prompt, parkCode) => {
    expect(expectedOneDay(contract(prompt), parkCode)).toBe(true);
  });
});

describe('fresh paraphrase family — counted trip still holds duration role', () => {
  test.each(DESTINATIONS.map((dest) => [dest.name, dest.code]))(
    'counted trip with a later activity-role day at %s',
    (name, parkCode) => {
      const got = contract(
        `Build a 3-day ${name} trip with forest time and one ridge day.`,
      );
      expect(got.job).toBe('day_by_day_itinerary');
      expect(got.artifact).toBe('itinerary');
      expect(got.durationDays).toBe(3);
      expect(got.parkCodes).toContain(parkCode);
    },
  );
});

describe('fresh paraphrase family — advice controls', () => {
  test.each([
    "What's Plan B if the visitor center lot at Congaree is full?",
    'How should I plan if storms roll through Voyageurs?',
    'Is two days enough for Capitol Reef?',
    "Don't build the itinerary yet for a week at Isle Royale.",
    'What should I prioritize with one full day in Congaree?',
  ])('%s stays out of the produce family', (prompt) => {
    const got = contract(prompt);
    expect(got.askedToProduce).toBe(false);
    expect(got.artifact).not.toBe('itinerary');
    expect(got.job).not.toBe('day_by_day_itinerary');
  });
});
