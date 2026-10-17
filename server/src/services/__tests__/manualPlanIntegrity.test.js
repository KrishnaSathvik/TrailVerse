'use strict';

const { validateManualPlanIntegrity } = require('../manualPlanIntegrity');
const { applyManualMutation } = require('../manualTripMutation');

const structuredDay = (overrides = {}) => ({
  id: 'day-1',
  dayNumber: 1,
  label: 'Day 1',
  stops: [{
    id: 's1',
    order: 1,
    type: 'viewpoint',
    name: 'Overlook',
    note: '',
    timeWindow: 'Morning',
    duration: 30,
  }],
  dayStructure: {
    type: 'sightseeing',
    startPeriod: 'morning',
    endPeriod: 'evening',
    summary: 'A short outing.',
    blocks: [
      {
        kind: 'outing',
        periods: ['morning', 'midday', 'afternoon'],
        label: 'Overlook',
        note: 'Visit the overlook.',
        stopIds: ['s1'],
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
  ...overrides,
});

test('accepts a complete day', () => {
  expect(validateManualPlanIntegrity({
    tripSchemaVersion: 1,
    days: [structuredDay()],
  }).ok).toBe(true);
});

test('rejects structureless days', () => {
  const verdict = validateManualPlanIntegrity({
    tripSchemaVersion: 1,
    days: [{ id: 'd', dayNumber: 1, label: 'Day 1', stops: [] }],
  });
  expect(verdict.ok).toBe(false);
  expect(verdict.code).toBe('day_structure_invalid');
});

test('rejects dangling stopIds', () => {
  const day = structuredDay();
  day.dayStructure.blocks[0].stopIds = ['s1', 'missing'];
  const verdict = validateManualPlanIntegrity({
    tripSchemaVersion: 1,
    days: [day],
  });
  expect(verdict.ok).toBe(false);
  expect(verdict.issues).toContain('day_stop_coverage_invalid');
});

test('rejects unsupported tripSchemaVersion', () => {
  const verdict = validateManualPlanIntegrity({
    tripSchemaVersion: 999,
    days: [structuredDay()],
  });
  expect(verdict.ok).toBe(false);
  expect(verdict.code).toBe('unsupported_trip_schema_version');
});

test('applyManualMutation output stays integrity-clean after remove_stop', () => {
  const plan = {
    tripSchemaVersion: 1,
    days: [structuredDay(), structuredDay({
      id: 'day-2',
      dayNumber: 2,
      label: 'Day 2',
      stops: [{
        id: 's2',
        order: 1,
        type: 'trail',
        name: 'Trail',
        note: '',
        timeWindow: 'Morning',
        duration: 45,
      }],
      dayStructure: {
        type: 'sightseeing',
        startPeriod: 'morning',
        endPeriod: 'evening',
        summary: 'Trail day.',
        blocks: [
          {
            kind: 'outing',
            periods: ['morning', 'midday', 'afternoon'],
            label: 'Trail',
            note: 'Hike.',
            stopIds: ['s2'],
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
    })],
  };
  const applied = applyManualMutation(plan, { op: 'remove_stop', stopId: 's1' });
  expect(applied.ok).toBe(true);
  expect(validateManualPlanIntegrity(applied.plan, {
    touchedDayNumbers: applied.touchedDayNumbers,
  }).ok).toBe(true);
});
