'use strict';

const {
  extractSpokenDuration,
  extractMobilityConstraints,
  extractPartyExtras,
  extractActivityPreferences,
} = require('../travelerStateExtraction');
const { parseConstraints } = require('../constraintEngine');
const { buildPlanningStateFromRuntime } = require('../planningState');

describe('normalized traveler-state extraction', () => {
  test('"3 days" and "three days" both become durationDays=3', () => {
    expect(extractSpokenDuration('Is 3 days enough for Yellowstone?').durationDays).toBe(3);
    expect(extractSpokenDuration('Is three days enough for Yellowstone?').durationDays).toBe(3);
    expect(extractSpokenDuration('three full days in the park').durationDays).toBe(3);

    const spelled = parseConstraints({}, 'Is three days enough for Yellowstone?');
    const numeric = parseConstraints({}, 'Is 3 days enough for Yellowstone?');
    expect(spelled.dates.numDays).toBe(3);
    expect(numeric.dates.numDays).toBe(3);
    expect(spelled.planningState.dates.durationDays).toBe(3);
    expect(numeric.planningState.dates.durationDays).toBe(3);
  });

  test('half day and six hours become availableHours without inventing days', () => {
    expect(extractSpokenDuration('We only have six hours').availableHours).toBe(6);
    expect(extractSpokenDuration('a half day visit').availableHours).toBe(4);
    expect(extractSpokenDuration('a half day visit').durationDays).toBeNull();
  });

  test('explicit ~1 mile walking limit becomes maxWalkMilesPerSegment', () => {
    const mobility = extractMobilityConstraints(
      "Parents in their late 60s who can't comfortably walk more than about a mile at a time."
    );
    expect(mobility.maxWalkMilesPerSegment).toBe(1);
    expect(mobility.requiresFrequentBreaks).toBeNull();

    const constraints = parseConstraints(
      {},
      "We're taking our parents in their late 60s. They can't comfortably walk more than about a mile at a time. Three days."
    );
    expect(constraints.planningState.mobility.maxWalkMilesPerSegment).toBe(1);
    expect(constraints.planningState.travelers.hasOlderTravelers).toBe(true);
    expect(constraints.planningState.dates.durationDays).toBe(3);
  });

  test('does not invent mobility values from vague tiredness', () => {
    const mobility = extractMobilityConstraints('We might get tired.');
    expect(mobility.maxWalkMilesPerSegment).toBeNull();
    expect(mobility.wheelchair).toBeNull();
  });

  test('party extras stay controlled', () => {
    expect(extractPartyExtras('parents in their late 60s').hasOlderTravelers).toBe(true);
    expect(extractPartyExtras('toddler and a 4 year old').hasChildren).toBe(true);
    expect(extractPartyExtras('just the two of us').travelParty).toBe('couple');
    expect(extractPartyExtras('solo trip').travelParty).toBe('solo');
  });

  test('activity preferences stay controlled and do not invent hiking', () => {
    const noHike = extractActivityPreferences('We hate hiking and want viewpoints.');
    expect(noHike.hiking).toBe('none');
    expect(noHike.avoidExposure).toBeNull();
    const easy = extractActivityPreferences('easy hikes only');
    expect(easy.hiking).toBe('easy');
    const hard = extractActivityPreferences('we want hard hikes');
    expect(hard.hiking).toBe('hard');
  });

  test('current-turn contradiction updates duration safely', () => {
    const prior = buildPlanningStateFromRuntime({
      constraints: parseConstraints({}, 'Is three days enough?'),
    });
    expect(prior.dates.durationDays).toBe(3);
    const next = parseConstraints(
      { planningState: prior },
      'Actually make it 6 days.'
    );
    expect(next.planningState.dates.durationDays).toBe(6);
  });
});
