'use strict';

const { resolveRefinementScope, scopeAllowsOperation } = require('../refinementScope');
const { resolveRefinementIntent } = require('../refinementSemantics');
const { resolveTravelerJob } = require('../../services/trailieTravelerJobResolver');

function zionPlan() {
  return {
    days: [
      {
        dayNumber: 1,
        stops: [
          { id: 'd1-canyon', name: 'Canyon Junction', type: 'viewpoint', exposureLevel: 'low', difficulty: 'easy' },
        ],
      },
      {
        dayNumber: 2,
        stops: [
          { id: 'd2-watchman', name: 'Watchman Campground', type: 'walk', exposureLevel: 'low', difficulty: 'easy' },
        ],
      },
      {
        dayNumber: 4,
        stops: [
          { id: 'd4-angels', name: 'Angels Landing', type: 'trail', exposureLevel: null, difficulty: 'strenuous' },
          { id: 'd4-canyon', name: 'Canyon Junction', type: 'viewpoint', exposureLevel: 'low' },
        ],
      },
    ],
  };
}

const NOW = new Date('2026-09-13T15:00:00.000Z');

describe('itinerary impact and day targets', () => {
  test('inflected weather updates refine tomorrow, while weather questions do not', () => {
    const context = { priorPlan: zionPlan(), hasPriorPlan: true };
    expect(resolveRefinementIntent({ ...context, text: "It's raining until noon tomorrow." }).isRefinement).toBe(true);
    expect(resolveRefinementIntent({ ...context, text: "It's snowing tomorrow morning." }).isRefinement).toBe(true);
    expect(resolveRefinementIntent({ ...context, text: 'Is it raining tomorrow?' }).isRefinement).toBe(false);
    expect(resolveRefinementIntent({ text: "It's raining until noon tomorrow." }).isRefinement).toBe(false);
  });
  test('tomorrow on an undated plan stays unresolved instead of guessing day 2', () => {
    const scope = resolveRefinementScope({
      text: "We're exhausted. Simplify tomorrow.",
      priorPlan: zionPlan(),
      now: NOW,
    });
    expect(scope.resolved).toBe(false);
    expect(scope.reasonCodes).toContain('temporal_target_unresolved');
    expect(scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 1 } }).ok).toBe(false);
    expect(scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 2 } }).ok).toBe(false);
  });

  test('tomorrow on a dated plan resolves to the matching calendar day', () => {
    const plan = {
      days: [
        { dayNumber: 1, date: '2026-09-13', stops: [{ id: 'a', name: 'Walk', type: 'walk' }] },
        { dayNumber: 2, date: '2026-09-14', stops: [{ id: 'b', name: 'Museum', type: 'museum' }] },
      ],
    };
    const scope = resolveRefinementScope({
      text: "We're exhausted. Simplify tomorrow.",
      priorPlan: plan,
      now: NOW,
    });
    expect(scope.resolved).toBe(true);
    expect(scope.dayNumber).toBe(2);
    expect(scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 1 } }).ok).toBe(false);
    expect(scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 2 } }).ok).toBe(true);
  });

  test('today on a dated plan, day two, the second day, and the first full day share one day number', () => {
    const plan = zionPlan();
    const dated = {
      days: [
        { dayNumber: 1, date: '2026-09-13', stops: plan.days[0].stops },
        { dayNumber: 2, date: '2026-09-14', stops: plan.days[1].stops },
      ],
    };
    expect(resolveRefinementScope({ text: 'Simplify today.', priorPlan: dated, now: NOW }).dayNumber).toBe(1);
    expect(resolveRefinementScope({ text: 'Redo day two.', priorPlan: plan }).dayNumber).toBe(2);
    expect(resolveRefinementScope({ text: 'Redo the second day.', priorPlan: plan }).dayNumber).toBe(2);
    expect(resolveRefinementScope({ text: 'Keep our first full day easy.', priorPlan: plan }).dayNumber).toBe(1);
  });

  test('Friday resolves from the trip start and does not guess when that weekday is absent', () => {
    const plan = {
      days: [
        { dayNumber: 1, date: '2026-09-17', stops: [{ id: 'a', name: 'Pa’rus', type: 'walk', exposureLevel: 'low' }] },
        { dayNumber: 2, date: '2026-09-18', stops: [{ id: 'b', name: 'Museum', type: 'museum', exposureLevel: 'low' }] },
      ],
    };
    expect(resolveRefinementScope({ text: 'Make Friday easier.', priorPlan: plan }).dayNumber).toBe(2);
    expect(resolveRefinementScope({
      text: 'Make Friday easier.',
      priorPlan: zionPlan(),
      tripStart: '2026-09-12',
    }).resolved).toBe(false);
  });

  test('a trail with no recorded exposure is still in scope', () => {
    const plan = zionPlan();
    plan.days[2].stops[0].difficulty = null;
    const scope = resolveRefinementScope({
      text: 'No scary exposed hikes.',
      priorPlan: plan,
    });
    expect(scope.dayNumber).toBe(4);
  });

  test('exposure updates include unknown walks and landmarks judged by validation', () => {
    const plan = zionPlan();
    plan.days[1].stops = [{ id: 'river', name: 'River boardwalk', type: 'walk' }];
    plan.days[2].stops = [{ id: 'gorge', name: 'Gorge overlook', type: 'landmark' }];
    const scope = resolveRefinementScope({ text: 'No scary exposed hikes.', priorPlan: plan });
    expect(scope.dayNumbers).toEqual([2, 4]);
    expect(scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 1 } }).ok).toBe(false);
  });

  test('a new exposure limit scopes the hard trail and leaves easy days alone', () => {
    const scope = resolveRefinementScope({
      text: "My girlfriend doesn't like scary exposed hikes.",
      priorPlan: zionPlan(),
    });
    expect(scope.dayNumber).toBe(4);
    expect(scope.reasonCodes).toContain('scope_itinerary_impact');
    expect(scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 2 } }).ok).toBe(false);
    const intent = resolveRefinementIntent({
      text: "My girlfriend doesn't like scary exposed hikes.",
      priorPlan: zionPlan(),
      hasPriorPlan: true,
    });
    expect(intent.isRefinement).toBe(true);
  });

  test('a stated canyon closure scopes days that mention the canyon', () => {
    const text = 'The road into the canyon is closed. What should we do instead?';
    const scope = resolveRefinementScope({ text, priorPlan: zionPlan() });
    expect(scope.dayNumbers || [scope.dayNumber]).toEqual(expect.arrayContaining([1, 4]));
    expect(scope.dayNumber === 2 || (scope.dayNumbers || []).includes(2)).toBe(false);
    const job = resolveTravelerJob({
      userPrompt: text,
      priorTripState: { hasItinerary: true, existingCanonicalPlan: zionPlan() },
    });
    expect(job.job).toBe('itinerary_refinement');
  });

  test('a hypothetical closure does not become a plan edit', () => {
    const intent = resolveRefinementIntent({
      text: 'What if the canyon road is closed?',
      priorPlan: zionPlan(),
      hasPriorPlan: true,
    });
    expect(intent.isRefinement).toBe(false);
  });
});

test('canyon road closure does not target an independent canyons district', () => {
  const { itineraryImpacts } = require('../itineraryImpact');
  const impacts = itineraryImpacts({ text: 'The canyon road is closed. What should we do instead?', plan: { days: [
    { dayNumber: 1, stops: [{ name: 'North Lookout', accessDependencies: ['Canyon Road'] }] },
    { dayNumber: 2, stops: [{ name: 'Other Canyons Visitor Center', why: 'A day away from the canyon.' }] },
  ] } });
  expect(impacts.map(i => i.dayNumber)).toEqual([1]);
});

test('an explicit photography priority updates the active plan, while questions do not', () => {
  const priorPlan = zionPlan();
  expect(resolveRefinementIntent({ text: 'Sunrise photography is really important.', priorPlan, hasPriorPlan: true }).isRefinement).toBe(true);
  expect(resolveRefinementScope({ text: 'Sunrise photography is really important.', priorPlan }).level).toBe('whole_plan');
  expect(resolveRefinementIntent({ text: 'Is sunrise photography important?', priorPlan, hasPriorPlan: true }).isRefinement).toBe(false);
  expect(resolveRefinementIntent({ text: 'Sunrise photography is really important.' }).isRefinement).toBe(false);
});

test('a committed family addition targets the final two saved days without shortening the trip', () => {
  const priorPlan = zionPlan();
  const text = 'My parents are joining for the last two days.';
  expect(resolveRefinementIntent({ text, priorPlan, hasPriorPlan: true }).isRefinement).toBe(true);
  const scope = resolveRefinementScope({ text, priorPlan });
  expect(scope.dayNumbers).toEqual([2, 4]);
  expect(scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 1 } }).ok).toBe(false);
  expect(scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 4 } }).ok).toBe(true);
  expect(priorPlan.days).toHaveLength(3);
});
