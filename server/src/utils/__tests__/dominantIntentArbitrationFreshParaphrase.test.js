'use strict';

/**
 * Phase 12C — independent arbitration paraphrase evaluation.
 *
 * Destinations and surface forms are not the 12C development metamorphic
 * tables, not 12A/12B parks, and not the frozen held-out audit. Agreement is
 * measured on dominant job + artifact + preserved 12B semantics, never prose.
 */

const { buildTurnUnderstanding } = require('../../services/turnUnderstanding');
const { resolveTravelerJob, jobToPrimaryIntent } = require('../../services/trailieTravelerJobResolver');
const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');
const { parseConstraints } = require('../constraintEngine');
const { taskFamilyForJob } = require('../../services/travelerJobTaskFamilyMap');

const DEST = Object.freeze([
  { name: 'Cuyahoga Valley', code: 'cuva' },
  { name: 'New River Gorge', code: 'neri' },
  { name: 'Black Canyon of the Gunnison', code: 'blca' },
  { name: 'Mammoth Cave', code: 'maca' },
]);

function grounded(prompt) {
  const understanding = buildTurnUnderstanding({ userPrompt: prompt });
  const resolved = resolveTravelerJob({ userPrompt: prompt, understanding });
  const intent = classifyTrailieIntent({ userPrompt: prompt });
  parseConstraints({ formData: {} }, prompt);
  const soft = Object.fromEntries(
    (understanding.softPreferences || []).map((item) => [item.field, item.value]),
  );
  return {
    soft,
    job: resolved.job,
    artifact: understanding.requestedArtifact,
    askedToProduce: understanding.askedToProduceTripArtifact === true,
    taskFamily: understanding.taskFamily,
    primaryIntent: intent.primaryIntent,
    mappedIntent: jobToPrimaryIntent(resolved),
    mappedFamily: taskFamilyForJob(resolved.job),
    parkCodes: (understanding.subjectDestinations || []).map((d) => d.parkCode).filter(Boolean),
  };
}

function expectAligned(got) {
  expect(got.taskFamily).toBe(got.mappedFamily);
  expect(got.primaryIntent).toBe(got.mappedIntent);
}

describe('fresh transport arbitration', () => {
  test('how should we drive from A to B is route_planning', () => {
    const got = grounded(`How should we drive from ${DEST[0].name} to ${DEST[1].name}?`);
    expect(got.job).toBe('route_planning');
    expect(got.artifact).not.toBe('itinerary');
    expectAligned(got);
  });

  test('how far is the drive is route_planning', () => {
    const got = grounded(`How far is the drive to the visitor center at ${DEST[3].name}?`);
    expect(got.job).toBe('route_planning');
    expectAligned(got);
  });

  test.each([
    `Shorter drives at ${DEST[2].name}.`,
    `Limit driving at ${DEST[0].name}.`,
    `Don't make us drive all day at ${DEST[1].name}.`,
  ])('%s is a driving preference, not a routing job', (prompt) => {
    const got = grounded(prompt);
    expect(got.job).not.toBe('route_planning');
    expect(got.job).toBe('general_advice');
    expect(got.soft.minimizeDriving).toBe(true);
    expect(got.askedToProduce).toBe(false);
    expectAligned(got);
  });

  test('sketch days + less driving stays an itinerary', () => {
    const dest = DEST[3];
    const got = grounded(`Sketch two days at ${dest.name} with less driving.`);
    expect(got.askedToProduce).toBe(true);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expect(got.soft.minimizeDriving).toBe(true);
    expect(got.parkCodes).toContain(dest.code);
    expectAligned(got);
  });

  test('get-from route question with sunset pictures stays a route job', () => {
    const got = grounded(
      `How should we get from ${DEST[0].name} to ${DEST[1].name} for sunset pictures?`,
    );
    expect(got.job).toBe('route_planning');
    expect(got.soft.photography).toBe(true);
    expect(got.askedToProduce).toBe(false);
    expectAligned(got);
  });
});

describe('fresh photography arbitration', () => {
  test('where can I photograph sunrise is place_discovery', () => {
    const dest = DEST[2];
    const got = grounded(`Where can I photograph sunrise at ${dest.name}?`);
    expect(got.job).toBe('place_discovery');
    expect(got.soft.photography).toBe(true);
    expect(got.soft.photographyTiming).toBe('sunrise');
    expect(got.askedToProduce).toBe(false);
    expectAligned(got);
  });

  test.each([
    `We're interested in photography at ${DEST[0].name}.`,
    `I enjoy taking pictures at ${DEST[3].name}.`,
  ])('%s is a preference, not place_discovery', (prompt) => {
    const got = grounded(prompt);
    expect(got.job).not.toBe('place_discovery');
    expect(got.job).toBe('general_advice');
    expect(got.soft.photography).toBe(true);
    expectAligned(got);
  });

  test('build a day for sunrise photography + light driving stays an itinerary', () => {
    const dest = DEST[1];
    const got = grounded(
      `Build a day at ${dest.name} for sunrise photography with not too much driving.`,
    );
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expect(got.soft.photography).toBe(true);
    expect(got.soft.photographyTiming).toBe('sunrise');
    expect(got.soft.minimizeDriving).toBe(true);
    expectAligned(got);
  });
});

describe('fresh permit arbitration', () => {
  test('is a permit required owns permits_reservations', () => {
    const got = grounded(`Is a permit required at ${DEST[3].name}?`);
    expect(got.job).toBe('permits_reservations');
    expect(got.artifact).not.toBe('itinerary');
    expectAligned(got);
  });

  test('sold-out reservation + instead is contingency, not permits', () => {
    const got = grounded(
      `If the reservation is sold out at ${DEST[0].name}, what should we do instead?`,
    );
    expect(got.job).toBe('access_contingency');
    expect(got.artifact).not.toBe('itinerary');
    expectAligned(got);
  });

  test('map out a day plus unavailable reservation keeps the itinerary', () => {
    const dest = DEST[2];
    const got = grounded(
      `Map out a day at ${dest.name} and tell me what to do if the reservation is unavailable.`,
    );
    expect(got.askedToProduce).toBe(true);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expectAligned(got);
  });
});

describe('fresh access / weather arbitration', () => {
  test('how is parking is status, not routing or contingency', () => {
    const got = grounded(`How's parking at ${DEST[1].name}?`);
    expect(got.job).not.toBe('access_contingency');
    expect(got.job).not.toBe('route_planning');
    expect(got.askedToProduce).toBe(false);
    expectAligned(got);
  });

  test('closed gate + fallback is contingency without a landmark alias', () => {
    const got = grounded(`If the gate is closed at ${DEST[3].name}, give us a fallback.`);
    expect(got.job).toBe('access_contingency');
    expect(got.artifact).not.toBe('itinerary');
    expectAligned(got);
  });

  test('ordinary forecast question is not an itinerary', () => {
    const got = grounded(`What's the forecast at ${DEST[0].name}?`);
    expect(got.job).not.toBe('day_by_day_itinerary');
    expect(got.job).not.toBe('route_planning');
    expect(got.askedToProduce).toBe(false);
    expectAligned(got);
  });

  test('if storms hit, plan B is contingency', () => {
    const got = grounded(`If storms hit ${DEST[1].name}, what's plan B?`);
    expect(got.job).toBe('access_contingency');
    expect(got.askedToProduce).toBe(false);
    expectAligned(got);
  });

  test('build a day if it might rain stays an itinerary', () => {
    const dest = DEST[2];
    const got = grounded(`Build a day at ${dest.name} if it might rain.`);
    expect(got.askedToProduce).toBe(true);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
    expectAligned(got);
  });
});
