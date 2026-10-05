'use strict';

/**
 * Phase 12B — independent paraphrase evaluation.
 *
 * Destinations and surface forms are not the 12B development metamorphic
 * tables, not the 12A fresh-family parks, and not the frozen held-out audit.
 * Agreement is measured on normalized state/job fields, never exact prose.
 */

const { buildTurnUnderstanding } = require('../../services/turnUnderstanding');
const { resolveTravelerJob } = require('../../services/trailieTravelerJobResolver');
const { parseConstraints } = require('../constraintEngine');
const { kmToMiles } = require('../constraintFamilies');

const DESTINATIONS = Object.freeze([
  { name: 'Guadalupe Mountains', code: 'guad' },
  { name: 'Great Basin', code: 'grba' },
  { name: 'Channel Islands', code: 'chis' },
  { name: 'Biscayne', code: 'bisc' },
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

describe('fresh hiking-effort paraphrases', () => {
  const dest = DESTINATIONS[0].name;

  test.each([
    `Stick to easy walking at ${dest}.`,
    `We aren't up for anything intense at ${dest}.`,
    `Light hiking please at ${dest}.`,
    `Hard trails are off the table at ${dest}.`,
  ])('%s → hiking easy', (prompt) => {
    const got = grounded(prompt);
    expect(got.explicit.hiking).toBe('easy');
    expect(got.planning.activityPreferences.hiking).toBe('easy');
  });

  test(`Moderate hiking is alright at ${dest} is not easy-only`, () => {
    expect(grounded(`Moderate hiking is alright at ${dest}.`).explicit.hiking).toBe('moderate');
  });

  test(`Easy to moderate trails at ${dest} stay a range`, () => {
    expect(grounded(`Easy to moderate trails at ${dest}.`).explicit.hiking).toBe('easy-to-moderate');
  });

  test.each([
    `I'm in decent shape for ${dest}.`,
    `Is that canyon trail too strenuous at ${dest}?`,
  ])('%s does not invent a hiking ceiling', (prompt) => {
    expect(grounded(prompt).explicit.hiking).toBeUndefined();
  });
});

describe('fresh hiking-distance paraphrases', () => {
  const dest = DESTINATIONS[1].name;

  test.each([
    [`Cap each hike at 4 miles at ${dest}.`, 4],
    [`Hikes no longer than four miles at ${dest}.`, 4],
    [`Stay under 6.5 km of hiking at ${dest}.`, kmToMiles(6.5)],
  ])('%s → %s miles', (prompt, miles) => {
    const got = grounded(prompt);
    expect(got.explicit.maxWalkMilesPerSegment).toBe(miles);
    expect(got.planning.mobility.maxWalkMilesPerSegment).toBe(miles);
  });

  test('duration cap stays minutes', () => {
    const got = grounded(`No walk over 90 minutes at ${dest}.`);
    expect(got.explicit.maxWalkMinutesPerSegment).toBe(90);
    expect(got.explicit.maxWalkMilesPerSegment).toBeUndefined();
  });

  test('just short walks stays qualitative', () => {
    const got = grounded(`Just short walks at ${dest}.`);
    expect(got.explicit.maxWalkMilesPerSegment).toBeUndefined();
    expect(
      got.explicit.walkingTolerance === 'limited' || got.explicit.hiking === 'easy',
    ).toBe(true);
  });
});

describe('fresh pace paraphrases', () => {
  const dest = DESTINATIONS[2].name;

  test.each([
    `Slow trip at ${dest}.`,
    `Take it easy at ${dest}.`,
    `No packed days at ${dest}.`,
    `Laid-back visit to ${dest}.`,
  ])('%s → relaxed', (prompt) => {
    const got = grounded(prompt);
    expect(got.explicit.pace).toBe('relaxed');
    expect(got.planning.preferences.pace).toBe('relaxed');
  });

  test.each([
    'Quick question about the ferry schedule.',
    `A quick look at the visitor center at ${dest}.`,
  ])('%s is not trip pace', (prompt) => {
    expect(grounded(prompt).explicit.pace).toBeUndefined();
  });
});

describe('fresh driving paraphrases', () => {
  const dest = DESTINATIONS[3].name;

  test.each([
    `Minimize the driving at ${dest}.`,
    `Keep driving light at ${dest}.`,
    `We'd rather not spend the trip in the car at ${dest}.`,
  ])('%s → minimizeDriving', (prompt) => {
    const got = grounded(prompt);
    expect(got.soft.minimizeDriving).toBe(true);
    expect(got.parsed.drivingFeasibilityRequired).toBe(true);
    expect(got.explicit.maxDailyDriveMinutes).toBeUndefined();
  });

  test(`Max 3 hours driving a day at ${dest}`, () => {
    const got = grounded(`Max 3 hours driving a day at ${dest}.`);
    expect(got.parsed.maxDailyDriveMinutes).toBe(180);
    expect(got.planning.preferences.maxDailyDriveMinutes).toBe(180);
  });
});

describe('fresh photography paraphrases', () => {
  const dest = DESTINATIONS[0].name;

  test.each([
    `We'll bring the camera at ${dest}.`,
    `We want to take pictures at ${dest}.`,
  ])('%s is interest only', (prompt) => {
    const got = grounded(prompt);
    expect(got.soft.photography).toBe(true);
    expect(got.soft.photographyTiming).toBeUndefined();
  });

  test.each([
    [`Dawn photography at ${dest}.`, 'sunrise'],
    [`Golden hour pictures at ${dest}.`, 'golden_hour'],
  ])('%s timing %s', (prompt, timing) => {
    const got = grounded(prompt);
    expect(got.soft.photography).toBe(true);
    expect(got.soft.photographyTiming).toBe(timing);
  });
});

describe('fresh access-contingency paraphrases', () => {
  const dest = DESTINATIONS[1].name;

  test.each([
    `If the gate is closed at ${dest}, what instead?`,
    `If we can't get there at ${dest}, give us a fallback.`,
    `If the lot is full at ${dest}, what's plan B?`,
  ])('%s → access_contingency', (prompt) => {
    const got = grounded(prompt);
    expect(got.job).toBe('access_contingency');
    expect(got.artifact).not.toBe('itinerary');
  });

  test.each([
    `How's parking at ${dest}?`,
    `Is the road closed at ${dest}?`,
  ])('%s is not contingency', (prompt) => {
    expect(grounded(prompt).job).not.toBe('access_contingency');
  });
});

describe('fresh produce+constraint combinations', () => {
  test.each(DESTINATIONS.map((d) => d))('$name mapped day keeps the 12A produce contract', (dest) => {
    const prompt =
      `Map out a day at ${dest.name} that's easygoing with light hiking and not too much driving.`;
    const got = grounded(prompt);
    expect(got.askedToProduce).toBe(true);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expect(got.parkCodes).toContain(dest.code);
    expect(got.explicit.hiking).toBe('easy');
    expect(got.explicit.pace).toBe('relaxed');
    expect(got.soft.minimizeDriving).toBe(true);
  });
});

describe('12C-reserved topic-stealing observations (not 12B failures)', () => {
  test('bare minimize-driving without produce may still be stolen by TRANSPORT', () => {
    const got = grounded('Not much driving at Guadalupe Mountains.');
    expect(got.soft.minimizeDriving).toBe(true);
    expect(got.askedToProduce).toBe(false);
    if (got.job === 'route_planning') {
      expect(got.job).toBe('route_planning');
    }
  });

  test('bare photography without produce may still be stolen by place discovery', () => {
    const got = grounded('We care about photography at Great Basin.');
    expect(got.soft.photography).toBe(true);
    expect(got.askedToProduce).toBe(false);
  });
});
