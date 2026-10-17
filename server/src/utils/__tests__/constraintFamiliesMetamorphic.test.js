'use strict';

/**
 * Phase 12B — metamorphic constraint/contingency families.
 *
 * Generated from semantic classes, not the held-out unseen-park audit list
 * and not the 12A fresh paraphrase destinations.
 */

const { buildTurnUnderstanding } = require('../../services/turnUnderstanding');
const { resolveTravelerJob } = require('../../services/trailieTravelerJobResolver');
const { parseConstraints } = require('../constraintEngine');

const DEST = Object.freeze([
  { name: 'Dry Tortugas', code: 'drto' },
  { name: 'Mesa Verde', code: 'meve' },
  { name: 'Petrified Forest', code: 'pefo' },
  { name: 'Theodore Roosevelt', code: 'thro' },
]);

function grounded(prompt) {
  const understanding = buildTurnUnderstanding({ userPrompt: prompt });
  const resolved = resolveTravelerJob({ userPrompt: prompt, understanding });
  const parsed = parseConstraints({ formData: {} }, prompt);
  const explicit = Object.fromEntries(
    (understanding.explicitConstraints || []).map((item) => [item.field, item.value]),
  );
  const soft = Object.fromEntries(
    (understanding.softPreferences || []).map((item) => [item.field, item.value]),
  );
  return {
    explicit,
    soft,
    job: resolved.job,
    artifact: understanding.requestedArtifact,
    askedToProduce: understanding.askedToProduceTripArtifact === true,
    parkCodes: (understanding.subjectDestinations || []).map((d) => d.parkCode).filter(Boolean),
    planning: parsed.planningState,
    parsed,
  };
}

function field(prompt, name) {
  return grounded(prompt).explicit[name];
}

describe('hiking effort family — one ceiling, not one phrase', () => {
  const dest = DEST[0].name;

  test.each([
    [`Easy trails only at ${dest}.`],
    [`Nothing strenuous at ${dest}.`],
    [`Keep the hiking light at ${dest}.`],
    [`Avoid hard hikes at ${dest}.`],
    [`No difficult trails at ${dest}.`],
  ])('%s → hiking easy', (prompt) => {
    const got = grounded(prompt);
    expect(got.explicit.hiking).toBe('easy');
    expect(got.planning.activityPreferences.hiking).toBe('easy');
  });

  test.each([
    [`Moderate is okay at ${dest}.`],
    [`Moderate hiking is fine at ${dest}.`],
  ])('%s → hiking moderate, not easy-only', (prompt) => {
    expect(field(prompt, 'hiking')).toBe('moderate');
    expect(field(prompt, 'hiking')).not.toBe('easy');
  });

  test('easy-to-moderate is distinct from easy-only', () => {
    expect(field(`Easy-to-moderate hiking at ${dest}.`, 'hiking')).toBe('easy-to-moderate');
    expect(field(`Easy trails only at ${dest}.`, 'hiking')).toBe('easy');
  });

  test.each([
    `I'm pretty fit for ${dest}.`,
    `We're in good shape for ${dest}.`,
    `Is the hike to the overlook too hard at ${dest}?`,
  ])('%s does not set a trip-wide hiking ceiling', (prompt) => {
    expect(field(prompt, 'hiking')).toBeUndefined();
  });
});

describe('hiking distance / walking-time family', () => {
  const dest = DEST[1].name;

  test.each([
    [`No hike longer than 5 miles at ${dest}.`, 5],
    [`Keep hikes under 5 mi at ${dest}.`, 5],
    [`Nothing over 5 miles per hike at ${dest}.`, 5],
    [`We can't do more than five miles of hiking at ${dest}.`, 5],
    [`Keep hikes under 8 kilometers at ${dest}.`, 5],
  ])('%s → maxWalkMilesPerSegment %s', (prompt, miles) => {
    const got = grounded(prompt);
    expect(got.explicit.maxWalkMilesPerSegment).toBe(miles);
    expect(got.planning.mobility.maxWalkMilesPerSegment).toBe(miles);
  });

  test('a walking-time cap is minutes, not invented miles', () => {
    const got = grounded(`No hike longer than 3 hours at ${dest}.`);
    expect(got.explicit.maxWalkMinutesPerSegment).toBe(180);
    expect(got.explicit.maxWalkMilesPerSegment).toBeUndefined();
    expect(got.planning.mobility.maxWalkMinutesPerSegment).toBe(180);
  });

  test.each([
    `Short hikes only at ${dest}.`,
    `Keep the walks short at ${dest}.`,
  ])('%s stays qualitative — no fabricated mileage', (prompt) => {
    const got = grounded(prompt);
    expect(got.explicit.maxWalkMilesPerSegment).toBeUndefined();
    expect(got.explicit.maxWalkMinutesPerSegment).toBeUndefined();
    expect(
      got.explicit.walkingTolerance === 'limited' || got.explicit.hiking === 'easy',
    ).toBe(true);
  });
});

describe('pace / density family', () => {
  const dest = DEST[2].name;

  test.each([
    [`Keep it relaxed at ${dest}.`],
    [`Leisurely days at ${dest}.`],
    [`Unhurried visit to ${dest}.`],
    [`Don't rush us at ${dest}.`],
    [`Keep it easygoing at ${dest}.`],
    [`Leave lots of downtime at ${dest}.`],
    [`Only a few things each day at ${dest}.`],
  ])('%s → pace relaxed', (prompt) => {
    const got = grounded(prompt);
    expect(got.explicit.pace).toBe('relaxed');
    expect(got.planning.preferences.pace).toBe('relaxed');
  });

  test.each([
    'Quick question about the visitor center hours.',
    "I'm in a hurry — is the park open today?",
    `A quick morning walk at ${dest} sounds nice.`,
  ])('%s is not a trip-pace preference', (prompt) => {
    expect(field(prompt, 'pace')).toBeUndefined();
  });
});

describe('driving-minimization family', () => {
  const dest = DEST[3].name;

  test.each([
    [`Minimal driving at ${dest}.`],
    [`Not much driving at ${dest}.`],
    [`Keep drives short at ${dest}.`],
    [`Don't make us drive all day at ${dest}.`],
    [`Avoid backtracking at ${dest}.`],
  ])('%s → minimizeDriving without becoming a drive cap', (prompt) => {
    const got = grounded(prompt);
    expect(got.soft.minimizeDriving).toBe(true);
    expect(got.parsed.drivingFeasibilityRequired).toBe(true);
    expect(got.explicit.maxDailyDriveMinutes).toBeUndefined();
  });

  test.each([
    [`No more than 2 hours of driving per day at ${dest}.`, 120],
    [`Keep driving under 2 hours/day at ${dest}.`, 120],
    [`Max 90 minutes driving per day at ${dest}.`, 90],
  ])('%s → maxDailyDriveMinutes %s', (prompt, minutes) => {
    const got = grounded(prompt);
    expect(got.parsed.maxDailyDriveMinutes).toBe(minutes);
    expect(got.planning.preferences.maxDailyDriveMinutes).toBe(minutes);
  });
});

describe('photography family — interest vs timing', () => {
  const dest = DEST[0].name;

  test.each([
    [`We like photography at ${dest}.`],
    [`We want photos at ${dest}.`],
    [`We'll be taking pictures at ${dest}.`],
  ])('%s is photography interest, not a timing requirement', (prompt) => {
    const got = grounded(prompt);
    expect(got.soft.photography).toBe(true);
    expect(got.soft.photographyTiming).toBeUndefined();
    expect(got.explicit.photographyTiming).toBeUndefined();
  });

  test.each([
    [`Sunrise photography at ${dest}.`, 'sunrise'],
    [`Sunset photography at ${dest}.`, 'sunset'],
    [`Golden-hour photos at ${dest}.`, 'golden_hour'],
  ])('%s carries timing %s', (prompt, timing) => {
    const got = grounded(prompt);
    expect(got.soft.photography).toBe(true);
    expect(got.soft.photographyTiming).toBe(timing);
  });
});

describe('access-contingency family — relationship, not backup-plan collocation', () => {
  const dest = DEST[1].name;

  test.each([
    `If we can't get in at ${dest}, what should we do instead?`,
    `If it's closed at ${dest}, what's the alternative?`,
    `If parking fills at ${dest}, give me a fallback.`,
    `If the reservation is unavailable at ${dest}, what do we do instead?`,
    `If the shuttle doesn't work at ${dest}, what's plan B?`,
    `If sunrise is cloudy and unusable at ${dest}, what should we do instead?`,
  ])('%s → access_contingency', (prompt) => {
    const got = grounded(prompt);
    expect(got.job).toBe('access_contingency');
    expect(got.artifact).not.toBe('itinerary');
  });

  test.each([
    `What is the parking situation at ${dest}?`,
    `Is the visitor center closed at ${dest}?`,
    `What's a good backup plan in general for ${dest}?`,
  ])('%s is not contingency', (prompt) => {
    const got = grounded(prompt);
    expect(got.job).not.toBe('access_contingency');
  });

  test('backup-plan noun does not become an itinerary', () => {
    const got = grounded(`What's a good backup plan if parking is full at ${dest}?`);
    expect(got.artifact).not.toBe('itinerary');
    expect(got.askedToProduce).toBe(false);
    expect(got.job).toBe('access_contingency');
  });
});

describe('12A produce signal survives attached constraints', () => {
  test.each(DEST.map((d) => d))('$name day-build plus constraints stays an itinerary', (dest) => {
    const prompt =
      `Build me a day at ${dest.name} with easy trails, not much driving, `
      + 'and only a few things so you do not rush us.';
    const got = grounded(prompt);
    expect(got.askedToProduce).toBe(true);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expect(got.parkCodes).toContain(dest.code);
    expect(got.explicit.hiking).toBe('easy');
    expect(got.explicit.pace).toBe('relaxed');
    expect(got.soft.minimizeDriving).toBe(true);
  });

  test('photography day-build stays an itinerary and still records photography', () => {
    const dest = DEST[3];
    const got = grounded(`Build a photography day at ${dest.name} with sunrise photos.`);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expect(got.soft.photography).toBe(true);
    expect(got.soft.photographyTiming).toBe('sunrise');
  });

  test('produce plus a parking fallback still produces the day', () => {
    const dest = DEST[0];
    const got = grounded(
      `Build me a day at ${dest.name}. If parking fills, give me a fallback.`,
    );
    expect(got.askedToProduce).toBe(true);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
  });
});
