'use strict';

const {
  parseExplicitPlanMutation,
  applyPlanPatch,
  isExplicitPlanRestructure,
  evaluateRefinementOwnership,
} = require('../itineraryPlanPatch');

function threeDayPlan() {
  return {
    intro: 'A 3-day trip.',
    days: [
      { day: 1, dayNumber: 1, stops: [{ name: 'Day 1 place', type: 'viewpoint', duration: 90 }] },
      { day: 2, dayNumber: 2, stops: [{ name: 'Day 2 place', type: 'scenic_drive', duration: 120 }] },
      { day: 3, dayNumber: 3, stops: [{ name: 'Day 3 place', type: 'visitor_center', duration: 60 }] },
    ],
  };
}

describe('itineraryPlanPatch — refinement ownership', () => {
  test('update_day patch changes Day 2 while preserving Days 1 and 3 byte-for-byte', () => {
    const prior = threeDayPlan();
    const beforeDay1 = JSON.stringify(prior.days[0]);
    const beforeDay3 = JSON.stringify(prior.days[2]);
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: {
        response: 'I slowed down Day 2 and reduced the driving.',
        operations: [{
          op: 'update_day',
          dayNumber: 2,
          day: {
            day: 2,
            dayNumber: 2,
            label: 'A slower Day 2',
            stops: [{ name: 'Slower Day 2 place', type: 'scenic_drive', duration: 90 }],
          },
        }],
      },
    });
    expect(result.ok).toBe(true);
    const { plan } = result;
    expect(plan.days.map((d) => d.dayNumber || d.day)).toEqual([1, 2, 3]);
    expect(plan.days[1].stops[0].name).toBe('Slower Day 2 place');
    expect(JSON.stringify(plan.days[0])).toBe(beforeDay1);
    expect(JSON.stringify(plan.days[2])).toBe(beforeDay3);
    expect(plan.intro).toBe('I slowed down Day 2 and reduced the driving.');
    expect(evaluateRefinementOwnership({
      priorPlan: prior,
      nextPlan: plan,
      userPrompt: 'Make Day 2 slower and reduce driving.',
      touchedDayNumbers: result.touchedDayNumbers,
    }).ok).toBe(true);
  });

  test('update_stop, add_stop, remove_stop, and reorder_stops are bounded to their target day', () => {
    const prior = threeDayPlan();
    prior.days[1].stops = [
      { id: 's1', order: 1, name: 'First', duration: 60 },
      { id: 's2', order: 2, name: 'Second', duration: 60 },
    ];
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: {
        response: 'Updated.',
        operations: [
          { op: 'update_stop', dayNumber: 2, stopId: 's1', stop: { duration: 90 } },
          { op: 'add_stop', dayNumber: 2, stop: { id: 's3', name: 'Third', duration: 30 } },
          { op: 'remove_stop', dayNumber: 2, stopId: 's2' },
          { op: 'reorder_stops', dayNumber: 2, stopOrder: ['s3', 's1'] },
        ],
      },
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[1].stops.map((stop) => stop.id)).toEqual(['s3', 's1']);
    expect(result.plan.days[1].stops.map((stop) => stop.order)).toEqual([1, 2]);
    expect(result.plan.days[1].stops[1].duration).toBe(90);
    expect(result.touchedDayNumbers).toEqual([2]);
  });

  test('a two-day move expressed as remove plus add reports both exact touched days', () => {
    const prior = threeDayPlan();
    prior.days[1].stops[0].id = 'moving-stop';
    const movingStop = { ...prior.days[1].stops[0] };
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: {
        response: 'Moved the stop from Day 2 to Day 3.',
        operations: [
          { op: 'remove_stop', dayNumber: 2, stopId: 'moving-stop' },
          { op: 'add_stop', dayNumber: 3, stop: movingStop },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.touchedDayNumbers).toEqual([2, 3]);
    expect(result.plan.days.map((day) => day.dayNumber)).toEqual([1, 2, 3]);
  });

  test('whole-plan refinements report every touched day without truncating the plan', () => {
    const prior = threeDayPlan();
    const operations = prior.days.map((day) => ({
      op: 'update_stop',
      dayNumber: day.dayNumber,
      stopName: day.stops[0].name,
      stop: { duration: day.stops[0].duration + 15 },
    }));
    const result = applyPlanPatch({ priorPlan: prior, planPatch: { response: 'Relaxed the trip.', operations } });

    expect(result.ok).toBe(true);
    expect(result.touchedDayNumbers).toEqual([1, 2, 3]);
    expect(result.plan.days).toHaveLength(3);
  });

  test('invalid target fails closed without returning a mutated plan', () => {
    const prior = threeDayPlan();
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: {
        response: 'Changed it.',
        operations: [{ op: 'update_day', dayNumber: 7, day: { dayNumber: 7, stops: [] } }],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.plan).toBeNull();
    expect(result.reasonCodes).toContain('plan_patch_target_not_found');
  });

  test('explicit duration changes enter the restructure path', () => {
    const mutation = parseExplicitPlanMutation('Make this a 2-day trip');
    expect(mutation.shortenToDays).toBe(2);
    expect(isExplicitPlanRestructure('Make this a 2-day trip')).toBe(true);
    expect(isExplicitPlanRestructure('Remove Day 3')).toBe(true);
    expect(isExplicitPlanRestructure('Make Day 2 slower')).toBe(false);
  });

  test('ownership validator rejects a truncated candidate that was not merged', () => {
    const prior = threeDayPlan();
    const truncated = { days: [{ day: 2, dayNumber: 2, stops: [{ name: 'Only day 2', duration: 90 }] }] };
    const result = evaluateRefinementOwnership({
      priorPlan: prior,
      nextPlan: truncated,
      userPrompt: 'Make Day 2 slower',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('refinement_dropped_unaffected_days');
    expect(result.droppedDayNumbers).toEqual(expect.arrayContaining([1, 3]));
  });

  test('ownership validator detects a changed untouched day, not only missing days', () => {
    const prior = threeDayPlan();
    const rearranged = JSON.parse(JSON.stringify(prior));
    [rearranged.days[0], rearranged.days[2]] = [rearranged.days[2], rearranged.days[0]];
    rearranged.days[0].day = 1;
    rearranged.days[0].dayNumber = 1;
    rearranged.days[2].day = 3;
    rearranged.days[2].dayNumber = 3;
    const result = evaluateRefinementOwnership({
      priorPlan: prior,
      nextPlan: rearranged,
      userPrompt: 'Make Day 2 slower',
      touchedDayNumbers: [2],
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('refinement_changed_unaffected_days');
    expect(result.changedDayNumbers).toEqual([1, 3]);
  });
});
