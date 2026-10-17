'use strict';

/**
 * Phase 12 closeout — relational availability-state recognition.
 *
 * Resource + negative availability state in the same clause, with ordinary
 * intervening destination/route language. Not collocation. Not the three
 * 12F.4 failed surface strings.
 */

const {
  resolveAvailabilityState,
  resolveAccessContingency,
} = require('../constraintFamilies');
const { buildTurnUnderstanding } = require('../../services/turnUnderstanding');
const { resolveTravelerJob } = require('../../services/trailieTravelerJobResolver');

const DEST = Object.freeze([
  { name: 'Olympic', code: 'olym' },
  { name: 'Great Sand Dunes', code: 'grsa' },
  { name: 'Badlands', code: 'badl' },
  { name: 'Capitol Reef', code: 'care' },
]);

function grounded(prompt) {
  const understanding = buildTurnUnderstanding({ userPrompt: prompt });
  const resolved = resolveTravelerJob({ userPrompt: prompt, understanding });
  return {
    job: resolved.job,
    artifact: understanding.requestedArtifact,
    askedToProduce: understanding.askedToProduceTripArtifact === true,
  };
}

describe('resolveAvailabilityState — resource + negative state, intervening text allowed', () => {
  test.each([
    [`Boat transportation to ${DEST[0].name} has been halted.`],
    [`The park shuttle at ${DEST[1].name} isn't operating today.`],
    [`Access through the east entrance at ${DEST[2].name} has been cut off.`],
    [`The ferry service over to ${DEST[3].name} won't be running.`],
    [`The overlook above ${DEST[0].name} is hidden by low cloud.`],
    [`The parking facility near ${DEST[1].name} is unavailable.`],
    [`The trailhead below ${DEST[2].name} has been made inaccessible.`],
    [`Road access into ${DEST[3].name} via the scenic byway is closed.`],
  ])('%s marks a negative availability state', (prompt) => {
    const got = resolveAvailabilityState(prompt);
    expect(got.state).toBeTruthy();
    expect(got.inaccessibility).toBeTruthy();
  });

  test('status questions do not invent unavailability', () => {
    expect(resolveAvailabilityState(`Is the shuttle operating at ${DEST[0].name}?`).state).toBeNull();
    expect(resolveAvailabilityState(`Has ferry service resumed at ${DEST[1].name}?`).state).toBeNull();
    expect(resolveAvailabilityState(`Is east-entrance access open at ${DEST[2].name}?`).state).toBeNull();
  });

  test.each([
    `I stopped at the visitor center at ${DEST[0].name}.`,
    `We suspended our trip to ${DEST[1].name}.`,
    `The view stopped us in our tracks at ${DEST[2].name}.`,
    `We blocked out two hours at ${DEST[3].name}.`,
    `The service at ${DEST[0].name} was great.`,
  ])('%s is not operational unavailability', (prompt) => {
    expect(resolveAvailabilityState(prompt).state).toBeNull();
  });
});

describe('access_contingency — unavailable resource + fallback ask', () => {
  test.each([
    `If boat transportation to ${DEST[0].name} has been halted, what's a fallback?`,
    `If the park shuttle at ${DEST[1].name} isn't operating today, what should we do instead?`,
    `If access through the east entrance at ${DEST[2].name} has been cut off, give us an alternative.`,
    `If the ferry service over to ${DEST[3].name} won't be running, what's plan B?`,
    `If the overlook above ${DEST[0].name} is hidden by low cloud, what instead?`,
    `If the parking facility near ${DEST[1].name} is unavailable, give me a fallback.`,
    `If the trailhead below ${DEST[2].name} has been made inaccessible, what should we do instead?`,
    `If road access into ${DEST[3].name} via the scenic byway is closed, what's a fallback?`,
  ])('%s → access_contingency', (prompt) => {
    const family = resolveAccessContingency(prompt);
    expect(family.isAccessContingency).toBe(true);
    expect(family.asksForAlternative).toBe(true);
    expect(family.availabilityState).toBeTruthy();
    const got = grounded(prompt);
    expect(got.job).toBe('access_contingency');
    expect(got.artifact).not.toBe('itinerary');
  });

  test('negative availability without an alternative is not contingency', () => {
    const prompt = `The park shuttle at ${DEST[1].name} isn't operating today.`;
    expect(resolveAvailabilityState(prompt).state).toBeTruthy();
    const family = resolveAccessContingency(prompt);
    expect(family.isAccessContingency).toBe(false);
    expect(grounded(prompt).job).not.toBe('access_contingency');
  });
});

describe('status-only controls stay current-information asks', () => {
  test.each([
    `Is the shuttle operating at ${DEST[0].name}?`,
    `Has ferry service resumed at ${DEST[1].name}?`,
    `Is east-entrance access open at ${DEST[2].name}?`,
    `Is the road into ${DEST[3].name} open?`,
    `What's the parking situation at ${DEST[0].name}?`,
  ])('%s is not contingency', (prompt) => {
    expect(resolveAccessContingency(prompt).isAccessContingency).toBe(false);
    expect(grounded(prompt).job).not.toBe('access_contingency');
  });
});

describe('produce + fallback remains itinerary-dominant', () => {
  test.each([
    `Build me a day at ${DEST[0].name}. If the parking facility is unavailable, give me a fallback.`,
    `Map out a day at ${DEST[1].name}. If the shuttle isn't operating, what's plan B?`,
    `Plan a day at ${DEST[2].name} and tell me what to do if the ferry won't be running.`,
  ])('%s stays an itinerary', (prompt) => {
    const got = grounded(prompt);
    expect(got.askedToProduce).toBe(true);
    expect(got.job).toBe('day_by_day_itinerary');
    expect(got.artifact).toBe('itinerary');
  });
});
