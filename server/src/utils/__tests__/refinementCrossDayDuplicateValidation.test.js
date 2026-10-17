'use strict';

const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const { applyPlanPatch } = require('../itineraryPlanPatch');

const stop = (id, name, type = 'trail') => ({
  id,
  name,
  type,
  duration: 120,
});

function priorPlan() {
  return {
    intro: 'Three complete days.',
    days: [
      {
        day: 1,
        dayNumber: 1,
        stops: [stop('d1-ridge', 'Hurricane Ridge', 'viewpoint')],
      },
      {
        day: 2,
        dayNumber: 2,
        stops: [stop('d2-drive', 'Olympic Scenic Drive', 'scenic_drive')],
      },
      {
        day: 3,
        dayNumber: 3,
        stops: [stop('d3-highline', 'Highline Trail')],
      },
    ],
  };
}

function validateRefinement(plan, touchedDayNumbers) {
  return evaluateItineraryCompleteness({
    itineraryData: plan,
    constraints: null,
    userPrompt: 'Refine the requested days and keep the rest the same.',
    priorItineraryData: priorPlan(),
    isRefinement: true,
    touchedDayNumbers,
  });
}

describe('refinement-aware cross-day duplicate experience validation', () => {
  test('rejects the live defect when touched Day 2 duplicates retained Day 3', () => {
    const prior = priorPlan();
    const applied = applyPlanPatch({
      priorPlan: prior,
      planPatch: {
        response: 'I made Day 2 easier and kept the rest intact.',
        operations: [{
          op: 'update_day',
          dayNumber: 2,
          day: {
            day: 2,
            dayNumber: 2,
            stops: [stop('d2-highline', 'Highline Trail hike')],
          },
        }],
      },
    });

    expect(applied.ok).toBe(true);
    expect(applied.touchedDayNumbers).toEqual([2]);
    expect(applied.plan.days.map((day) => day.dayNumber)).toEqual([1, 2, 3]);

    const result = validateRefinement(applied.plan, applied.touchedDayNumbers);
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('duplicate_base_experience');
    expect(result.dayDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dayNumber: 2,
        codes: expect.arrayContaining(['duplicate_base_experience']),
        duplicateExperienceConflicts: expect.arrayContaining([
          expect.objectContaining({
            dayNumbers: [2, 3],
            touchedDayNumbers: [2],
            conflictType: 'touched_vs_untouched',
          }),
        ]),
      }),
    ]));
  });

  test('rejects a duplicate spanning two touched days', () => {
    const plan = priorPlan();
    plan.days[1].stops = [stop('d2-highline', 'Highline Trail')];

    const result = validateRefinement(plan, [2, 3]);
    expect(result.reasonCodes).toContain('duplicate_base_experience');
    expect(result.dayDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        duplicateExperienceConflicts: expect.arrayContaining([
          expect.objectContaining({
            dayNumbers: [2, 3],
            touchedDayNumbers: [2, 3],
            conflictType: 'touched_vs_touched',
          }),
        ]),
      }),
    ]));
  });

  test('does not newly reject a duplicate confined to untouched legacy days', () => {
    const plan = priorPlan();
    plan.days[0].stops = [stop('d1-highline', 'Highline Trail')];
    plan.days[1].stops = [stop('d2-lake', 'Lake Crescent shoreline walk')];

    const result = validateRefinement(plan, [2]);
    expect(result.reasonCodes).not.toContain('duplicate_base_experience');
    expect(result.ok).toBe(true);
  });

  test('allows a legitimate two-day move when the final merged plan contains one copy', () => {
    const prior = priorPlan();
    const applied = applyPlanPatch({
      priorPlan: prior,
      planPatch: {
        response: 'I moved Highline Trail from Day 3 to Day 2.',
        operations: [
          {
            op: 'update_day',
            dayNumber: 2,
            day: { day: 2, dayNumber: 2, stops: [stop('d2-highline', 'Highline Trail')] },
          },
          {
            op: 'update_day',
            dayNumber: 3,
            day: { day: 3, dayNumber: 3, stops: [stop('d3-lake', 'Lake Crescent shoreline walk')] },
          },
        ],
      },
    });

    expect(applied.ok).toBe(true);
    expect(applied.touchedDayNumbers).toEqual([2, 3]);
    const result = validateRefinement(applied.plan, applied.touchedDayNumbers);
    expect(result.reasonCodes).not.toContain('duplicate_base_experience');
    expect(result.ok).toBe(true);
  });

  test('preserves existing same-day duplicate rejection', () => {
    const plan = priorPlan();
    plan.days[1].stops = [
      stop('d2-highline-a', 'Highline Trail'),
      stop('d2-highline-b', 'Highline Trail hike'),
    ];

    const result = validateRefinement(plan, [2]);
    expect(result.reasonCodes).toContain('duplicate_base_experience');
  });

  test('preserves fresh-itinerary cross-day behavior without refinement context', () => {
    const plan = priorPlan();
    plan.days[1].stops = [stop('d2-highline', 'Highline Trail hike')];

    const result = evaluateItineraryCompleteness({
      itineraryData: plan,
      userPrompt: 'Plan a three-day trip.',
      isRefinement: false,
    });
    // Fresh plans keep day-local duplicate_base_experience only. Cross-day
    // repetition may still affect coverage credit, but must not emit the
    // refinement-scoped duplicate reason.
    expect(result.reasonCodes).not.toContain('duplicate_base_experience');
    expect(
      (result.dayDiagnostics || []).every((d) => !(d.codes || []).includes('duplicate_base_experience'))
    ).toBe(true);
  });
});
