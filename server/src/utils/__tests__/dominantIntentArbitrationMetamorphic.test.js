'use strict';

/**
 * Phase 12C — metamorphic dominant-intent arbitration.
 *
 * Destinations are not 12A/12B fresh or development sets and not the frozen
 * held-out audit. Assertions are job + artifact + preserved 12B semantics,
 * never exact prose.
 */

const { buildTurnUnderstanding } = require('../../services/turnUnderstanding');
const { resolveTravelerJob, jobToPrimaryIntent } = require('../../services/trailieTravelerJobResolver');
const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');
const { parseConstraints } = require('../constraintEngine');
const { taskFamilyForJob } = require('../../services/travelerJobTaskFamilyMap');

const DEST = Object.freeze([
  { name: 'Lassen Volcanic', code: 'lavo' },
  { name: 'Wind Cave', code: 'wica' },
  { name: 'Great Sand Dunes', code: 'grsa' },
  { name: 'Pinnacles', code: 'pinn' },
]);

function grounded(prompt) {
  const understanding = buildTurnUnderstanding({ userPrompt: prompt });
  const resolved = resolveTravelerJob({ userPrompt: prompt, understanding });
  const intent = classifyTrailieIntent({ userPrompt: prompt });
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
    taskFamily: understanding.taskFamily,
    primaryIntent: intent.primaryIntent,
    mappedIntent: jobToPrimaryIntent(resolved),
    mappedFamily: taskFamilyForJob(resolved.job),
    parkCodes: (understanding.subjectDestinations || []).map((d) => d.parkCode).filter(Boolean),
    planning: parsed.planningState,
    parsed,
  };
}

function expectAligned(got) {
  expect(got.taskFamily).toBe(got.mappedFamily);
  expect(got.primaryIntent).toBe(got.mappedIntent);
}

describe('transport — primary route vs preference', () => {
  test('how do I get from A to B is route_planning', () => {
    const got = grounded(`How do I drive from ${DEST[0].name} to ${DEST[3].name}?`);
    expect(got.job).toBe('route_planning');
    expect(got.artifact).not.toBe('itinerary');
    expectAligned(got);
  });

  test('how long is the drive is route_planning', () => {
    const got = grounded(`How long is the drive to the visitor center at ${DEST[1].name}?`);
    expect(got.job).toBe('route_planning');
    expectAligned(got);
  });

  test.each([
    `Not much driving at ${DEST[0].name}.`,
    `Keep drives short at ${DEST[1].name}.`,
    `Avoid backtracking at ${DEST[2].name}.`,
  ])('%s is a driving preference, not a routing job', (prompt) => {
    const got = grounded(prompt);
    expect(got.job).not.toBe('route_planning');
    expect(got.job).toBe('general_advice');
    expect(got.soft.minimizeDriving).toBe(true);
    expect(got.askedToProduce).toBe(false);
    expectAligned(got);
  });

  test('produce + minimal driving stays an itinerary', () => {
    const dest = DEST[2];
    const got = grounded(`Plan two days at ${dest.name} with minimal driving.`);
    expect(got.askedToProduce).toBe(true);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expect(got.soft.minimizeDriving).toBe(true);
    expect(got.parkCodes).toContain(dest.code);
    expectAligned(got);
  });

  test('route question with a photography mention stays a route job', () => {
    const got = grounded(
      `How do I get from ${DEST[0].name} to ${DEST[3].name} for sunset photos?`,
    );
    expect(got.job).toBe('route_planning');
    expect(got.soft.photography).toBe(true);
    expect(got.askedToProduce).toBe(false);
    expectAligned(got);
  });
});

describe('photography — discovery vs preference vs itinerary', () => {
  test('where should I photograph sunrise is place_discovery', () => {
    const dest = DEST[2];
    const got = grounded(`Where should I photograph sunrise at ${dest.name}?`);
    expect(got.job).toBe('place_discovery');
    expect(got.soft.photography).toBe(true);
    expect(got.soft.photographyTiming).toBe('sunrise');
    expect(got.askedToProduce).toBe(false);
    expectAligned(got);
  });

  test.each([
    `We care about photography at ${DEST[3].name}.`,
    `We like taking pictures at ${DEST[0].name}.`,
  ])('%s is a preference, not place_discovery', (prompt) => {
    const got = grounded(prompt);
    expect(got.job).not.toBe('place_discovery');
    expect(got.job).toBe('general_advice');
    expect(got.soft.photography).toBe(true);
    expectAligned(got);
  });

  test('produce + sunrise photography + light driving stays an itinerary', () => {
    const dest = DEST[2];
    const got = grounded(
      `Plan a day at ${dest.name} for sunrise photography without much driving.`,
    );
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expect(got.soft.photography).toBe(true);
    expect(got.soft.photographyTiming).toBe('sunrise');
    expect(got.soft.minimizeDriving).toBe(true);
    expectAligned(got);
  });
});

describe('permits — question vs contingency vs itinerary concern', () => {
  test('direct permit question owns permits_reservations', () => {
    const got = grounded(`Do I need a permit for the High Peaks at ${DEST[3].name}?`);
    expect(got.job).toBe('permits_reservations');
    expect(got.artifact).not.toBe('itinerary');
    expectAligned(got);
  });

  test('unavailable reservation + instead is contingency, not permits', () => {
    const got = grounded(
      `If I can't get the sunrise reservation at ${DEST[2].name}, what should I do instead?`,
    );
    expect(got.job).toBe('access_contingency');
    expect(got.artifact).not.toBe('itinerary');
    expectAligned(got);
  });

  test('produce + reservation fallback keeps the itinerary', () => {
    const dest = DEST[0];
    const got = grounded(
      `Plan a day at ${dest.name} and tell me what to do if the reservation is unavailable.`,
    );
    expect(got.askedToProduce).toBe(true);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expectAligned(got);
  });
});

describe('access / weather — status vs contingency vs itinerary constraint', () => {
  test('road closed status is not contingency', () => {
    const got = grounded(`Is the ${DEST[0].name} park road closed?`);
    expect(got.job).not.toBe('access_contingency');
    expect(got.job).not.toBe('day_by_day_itinerary');
  });

  test('parking situation is status/advice, not routing or contingency', () => {
    const got = grounded(`What's parking like at ${DEST[1].name}?`);
    expect(got.job).not.toBe('access_contingency');
    expect(got.job).not.toBe('route_planning');
    expect(got.askedToProduce).toBe(false);
  });

  test('if the road is closed, what instead is contingency without a landmark alias', () => {
    const got = grounded(`If the ${DEST[0].name} road is closed, what should we do instead?`);
    expect(got.job).toBe('access_contingency');
    expect(got.artifact).not.toBe('itinerary');
    expectAligned(got);
  });

  test('ordinary weather question is not an itinerary', () => {
    const got = grounded(`What's the weather at ${DEST[3].name}?`);
    expect(got.job).not.toBe('day_by_day_itinerary');
    expect(got.job).not.toBe('route_planning');
    expect(got.askedToProduce).toBe(false);
  });

  test('if it rains, what instead is contingency, not an itinerary', () => {
    const got = grounded(`If it rains at ${DEST[3].name}, what should we do instead?`);
    expect(got.job).toBe('access_contingency');
    expect(got.askedToProduce).toBe(false);
  });

  test('produce with a rain constraint stays an itinerary', () => {
    const dest = DEST[3];
    const got = grounded(`Plan a day at ${dest.name} if it might rain.`);
    expect(got.askedToProduce).toBe(true);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expectAligned(got);
  });
});
