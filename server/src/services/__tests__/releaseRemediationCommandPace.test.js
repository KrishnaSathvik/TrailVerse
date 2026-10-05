'use strict';
const { resolveActiveTripContext } = require('../activeTripContextService');
const { parseConstraints } = require('../../utils/constraintEngine');
const { buildPlanningStateFromRuntime } = require('../../utils/planningState');
const prior = { name: 'Yosemite National Park', parkCode: 'yose', type: 'nps', confidence: 'high' };
const destination = text => resolveActiveTripContext({ lastUserMessage: text,
  storedContext: { primaryDestination: prior, lockedPlanDestination: prior, lastRecommendationList: [] },
}).activeTripContext.primaryDestination;

describe('generic selection imperative boundary', () => {
  for (const [name, code] of [['Acadia','acad'],['Zion','zion'],['Yellowstone','yell'],['Olympic','olym'],['Glacier','glac']]) {
    for (const frame of ['Pick X instead.', 'Choose X instead.', 'Switch to X.', 'Go with X instead.', 'Use X instead.']) {
      for (const variant of [frame, frame[0].toLowerCase()+frame.slice(1)]) {
        test(`${variant} / ${name}`, () => expect(destination(variant.replace('X',name)).parkCode).toBe(code));
      }
    }
  }
  test.each(['Exit Glacier', 'Hike to Exit Glacier.', 'Visit the Exit Glacier Nature Center.',
    'Walk along Zion Canyon Scenic Drive.', 'See Glacier Point again.', 'Explore Death Valley Junction.'])('%s remains a local reference', text => {
    expect(destination(text).parkCode).toBe('yose');
  });
});

describe('trip-level comparative pace family', () => {
  const phrases = [];
  for (const noun of ['trip','plan','itinerary','schedule','day']) {
    for (const frame of ['Make the X slower.', 'Slow our X down.', 'Make the X less rushed.', 'Ease up the X.']) phrases.push(frame.replace('X',noun));
  }
  phrases.push('Actually make the trip slower.', 'Take the trip more slowly.', 'Give us a slower pace.');
  for (const text of phrases) {
    for (const previous of [{}, { planningState: buildPlanningStateFromRuntime({ constraints: { pace:'packed', numDays:3, parkCode:'yose' } }) }]) {
      test(`${JSON.stringify(previous)} -> ${text}`, () => {
        const constraints = parseConstraints(previous, text);
        expect(constraints.pace).toBe('relaxed');
        expect(buildPlanningStateFromRuntime({ constraints }).preferences.pace).toBe('relaxed');
      });
    }
  }
  test.each(['Drive slower.', 'The shuttle is slower.', 'The website is slow.', 'Slow traffic.',
    'Slower ferry service.', 'Slow Wi-Fi.', 'We need slower driving.'])('%s is not a pace request', text => {
    expect(parseConstraints({}, text).pace).not.toBe('relaxed');
    expect(parseConstraints({ planningState: buildPlanningStateFromRuntime({ constraints: { pace:'packed' } }) }, text).pace).toBe('packed');
  });
});
