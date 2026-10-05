'use strict';

/**
 * Phase 12 closeout — independent availability-state confirmation.
 *
 * New destinations and new surface forms. Not the development table, and not
 * the three 12F.4 failed strings.
 */

const {
  resolveAvailabilityState,
  resolveAccessContingency,
} = require('../constraintFamilies');
const { buildTurnUnderstanding } = require('../../services/turnUnderstanding');
const { resolveTravelerJob } = require('../../services/trailieTravelerJobResolver');
const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');

const DEST = Object.freeze([
  { name: 'Congaree', code: 'cong' },
  { name: 'Voyageurs', code: 'voya' },
  { name: 'Channel Islands', code: 'chis' },
  { name: 'Isle Royale', code: 'isro' },
]);

function grounded(prompt) {
  const understanding = buildTurnUnderstanding({ userPrompt: prompt });
  const resolved = resolveTravelerJob({ userPrompt: prompt, understanding });
  const intent = classifyTrailieIntent({ userPrompt: prompt, understanding });
  return {
    job: resolved.job,
    intentJob: intent.travelerJob,
    artifact: understanding.requestedArtifact,
    askedToProduce: understanding.askedToProduceTripArtifact === true,
  };
}

const CONTINGENCY = Object.freeze([
  `If the water taxi to ${DEST[2].name} has been taken out of service, what's a fallback?`,
  `If the tram at ${DEST[0].name} is no longer in operation, what should we do instead?`,
  `If the north gate into ${DEST[1].name} can't be used, give us an alternative.`,
  `If the ferry out to ${DEST[3].name} has been shut down, what's plan B?`,
  `If the viewpoint over ${DEST[0].name} is fogged in, what instead?`,
  `If the lot beside ${DEST[1].name} is unusable, give me a fallback.`,
  `If the bus to the island at ${DEST[2].name} isn't running, what should we do instead?`,
  `If the marina at ${DEST[3].name} is out of service, give us an alternative.`,
  `If the shuttle for ${DEST[0].name} isn't currently operating, what's a fallback?`,
  `If access via the west side of ${DEST[1].name} has been closed, what should we do instead?`,
  `If the road into the visitor area at ${DEST[2].name} has been shut down, what's plan B?`,
  `If the reservation for ${DEST[3].name} is sold out, give me a fallback.`,
  `If the boat to the outer island at ${DEST[2].name} has been halted, what instead?`,
  `If parking near the visitor center at ${DEST[0].name} is unavailable, what's the alternative?`,
  `If the trailhead beyond the river at ${DEST[1].name} is inaccessible, what should we do instead?`,
  `If the overlook along the rim at ${DEST[3].name} is clouded out, give us a fallback.`,
]);

const STATUS = Object.freeze([
  `Is the tram operating at ${DEST[0].name}?`,
  `Has the water taxi resumed at ${DEST[2].name}?`,
  `Is north-gate access open at ${DEST[1].name}?`,
  `Is the marina running at ${DEST[3].name}?`,
  `What's parking like at ${DEST[0].name}?`,
  `Is the ferry operating this week at ${DEST[3].name}?`,
  `Has shuttle service resumed at ${DEST[1].name}?`,
  `Is west-side access open at ${DEST[2].name}?`,
  `Is the road open today at ${DEST[0].name}?`,
]);

const PRODUCE_FALLBACK = Object.freeze([
  `Build me a day at ${DEST[0].name}. If the tram is out of service, give me a fallback.`,
  `Map out a day at ${DEST[1].name}. If the north gate can't be used, what's plan B?`,
  `Sketch a day at ${DEST[2].name}. If parking is unusable, give us a fallback.`,
  `Plan a day at ${DEST[3].name} and tell me what to do if the ferry has been shut down.`,
  `Lay out a day at ${DEST[0].name}. If the viewpoint is fogged in, what instead?`,
]);

describe('independent availability family — contingency', () => {
  test.each(CONTINGENCY)('%s → access_contingency', (prompt) => {
    expect(resolveAvailabilityState(prompt).state).toBeTruthy();
    expect(resolveAccessContingency(prompt).isAccessContingency).toBe(true);
    const got = grounded(prompt);
    expect(got.job).toBe('access_contingency');
    expect(got.intentJob).toBe('access_contingency');
    expect(got.artifact).not.toBe('itinerary');
    expect(got.askedToProduce).toBe(false);
  });
});

describe('independent status-only controls', () => {
  test.each(STATUS)('%s remains status, not contingency', (prompt) => {
    expect(resolveAccessContingency(prompt).isAccessContingency).toBe(false);
    const got = grounded(prompt);
    expect(got.job).not.toBe('access_contingency');
    expect(got.intentJob).not.toBe('access_contingency');
  });
});

describe('independent produce + fallback', () => {
  test.each(PRODUCE_FALLBACK)('%s stays itinerary-dominant', (prompt) => {
    const got = grounded(prompt);
    expect(got.askedToProduce).toBe(true);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.intentJob).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
  });
});

describe('independent false-positive controls', () => {
  test.each([
    `I stopped at the visitor center at ${DEST[0].name}.`,
    `We suspended our trip to ${DEST[1].name}.`,
    `The view stopped us in our tracks at ${DEST[2].name}.`,
    `We blocked out two hours at ${DEST[3].name}.`,
    `The service at ${DEST[0].name} was great.`,
  ])('%s is not unavailability or contingency', (prompt) => {
    expect(resolveAvailabilityState(prompt).state).toBeNull();
    expect(resolveAccessContingency(prompt).isAccessContingency).toBe(false);
    expect(grounded(prompt).job).not.toBe('access_contingency');
  });
});
