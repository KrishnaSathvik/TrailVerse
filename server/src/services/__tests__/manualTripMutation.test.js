'use strict';

const {
  applyManualMutation,
  emptyDayStructure,
} = require('../manualTripMutation');
const { validateDayCompleteness } = require('../../utils/dayCompleteness');
const { validateManualPlanIntegrity } = require('../manualPlanIntegrity');

function basePlan() {
  return {
    intro: 'A short visit.',
    responseId: 'resp-manual-1',
    responseVersion: 1,
    contentHash: 'ch1',
    itineraryHash: 'old-hash',
    tripSchemaVersion: 1,
    days: [
      {
        id: 'day-1',
        dayNumber: 1,
        label: 'Day 1',
        overnightLocation: 'Springdale',
        stops: [
          {
            id: 's1',
            order: 1,
            type: 'viewpoint',
            name: 'Overlook',
            note: '',
            timeWindow: 'Morning',
            duration: 30,
          },
          {
            id: 's2',
            order: 2,
            type: 'viewpoint',
            name: 'Second look',
            note: '',
            timeWindow: 'Afternoon',
            duration: 30,
          },
        ],
        dayStructure: {
          type: 'sightseeing',
          startPeriod: 'morning',
          endPeriod: 'evening',
          summary: 'Two overlooks and a quiet evening.',
          blocks: [
            {
              kind: 'outing',
              periods: ['morning', 'midday', 'afternoon'],
              label: 'Overlooks',
              note: 'Visit both viewpoints.',
              stopIds: ['s1', 's2'],
            },
            {
              kind: 'downtime',
              periods: ['evening'],
              label: 'Evening',
              note: 'Dinner and rest.',
              stopIds: [],
            },
          ],
        },
        travelEdges: [],
      },
      {
        id: 'day-2',
        dayNumber: 2,
        label: 'Day 2',
        overnightLocation: 'Springdale',
        stops: [
          {
            id: 's3',
            order: 1,
            type: 'trail',
            name: 'Canyon walk',
            note: '',
            timeWindow: 'Morning',
            duration: 60,
          },
        ],
        dayStructure: {
          type: 'sightseeing',
          startPeriod: 'morning',
          endPeriod: 'evening',
          summary: 'A canyon morning.',
          blocks: [
            {
              kind: 'outing',
              periods: ['morning', 'midday', 'afternoon'],
              label: 'Canyon',
              note: 'Walk the canyon path.',
              stopIds: ['s3'],
            },
            {
              kind: 'downtime',
              periods: ['evening'],
              label: 'Evening',
              note: 'Rest.',
              stopIds: [],
            },
          ],
        },
        travelEdges: [],
      },
    ],
  };
}

test('emptyDayStructure passes dayCompleteness', () => {
  const day = { id: 'd', dayNumber: 1, label: 'Day 1', stops: [], dayStructure: emptyDayStructure() };
  expect(validateDayCompleteness(day, { required: true })).toEqual([]);
});

test('remove_stop updates dayStructure.stopIds', () => {
  const result = applyManualMutation(basePlan(), { op: 'remove_stop', stopId: 's1' });
  expect(result.ok).toBe(true);
  const day1 = result.plan.days[0];
  expect(day1.stops.map((s) => s.id)).toEqual(['s2']);
  expect(day1.dayStructure.blocks.find((b) => b.kind === 'outing').stopIds).toEqual(['s2']);
  expect(validateManualPlanIntegrity(result.plan).ok).toBe(true);
});

test('move_stop updates source and destination day stopIds', () => {
  const result = applyManualMutation(basePlan(), {
    op: 'move_stop',
    stopId: 's2',
    toDayId: 'day-2',
  });
  expect(result.ok).toBe(true);
  const [day1, day2] = result.plan.days;
  expect(day1.stops.map((s) => s.id)).toEqual(['s1']);
  expect(day1.dayStructure.blocks.find((b) => b.kind === 'outing').stopIds).toEqual(['s1']);
  expect(day2.stops.map((s) => s.id)).toEqual(['s3', 's2']);
  expect(day2.dayStructure.blocks.find((b) => b.kind === 'outing').stopIds).toEqual(['s3', 's2']);
  expect(validateManualPlanIntegrity(result.plan).ok).toBe(true);
});

test('add_day creates a structurally valid empty day', () => {
  const result = applyManualMutation(basePlan(), { op: 'add_day', afterDayNumber: 2 });
  expect(result.ok).toBe(true);
  expect(result.plan.days).toHaveLength(3);
  const added = result.plan.days[2];
  expect(added.stops).toEqual([]);
  expect(validateDayCompleteness(added, { required: true })).toEqual([]);
  expect(validateManualPlanIntegrity(result.plan).ok).toBe(true);
});

test('remove_day fails when only one day remains', () => {
  const oneDay = basePlan();
  oneDay.days = [oneDay.days[0]];
  const result = applyManualMutation(oneDay, { op: 'remove_day', dayId: 'day-1' });
  expect(result).toEqual({ ok: false, code: 'manual_mutation_last_day' });
});

test('remove_day renumbers remaining days', () => {
  const result = applyManualMutation(basePlan(), { op: 'remove_day', dayId: 'day-1' });
  expect(result.ok).toBe(true);
  expect(result.plan.days).toHaveLength(1);
  expect(result.plan.days[0]).toMatchObject({ id: 'day-2', dayNumber: 1, label: 'Day 1' });
});
