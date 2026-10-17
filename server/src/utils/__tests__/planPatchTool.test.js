'use strict';

const { PATCH_ITINERARY_TOOL, isValidPlanPatch } = require('../itineraryToolSchema');
const { normalizePlanPatchToolCalls } = require('../itineraryPlanPatch');

const validPatch = {
  response: 'I slowed down Day 2.',
  operations: [{
    op: 'update_day',
    dayNumber: 2,
    day: { id: 'd2', dayNumber: 2, label: 'Slower day', stops: [] },
  }],
};

describe('patch_itinerary tool contract', () => {
  test('offers only bounded operations and requires natural response prose', () => {
    expect(PATCH_ITINERARY_TOOL.name).toBe('patch_itinerary');
    const operation = PATCH_ITINERARY_TOOL.input_schema.properties.operations.items;
    expect(operation.properties.op.enum).toEqual([
      'update_day', 'update_stop', 'add_stop', 'remove_stop', 'reorder_stops',
    ]);
    expect(isValidPlanPatch(validPatch)).toBe(true);
    expect(isValidPlanPatch({ operations: validPatch.operations })).toBe(false);
  });

  test('normalizes one valid patch call and rejects full-plan/unknown tools', () => {
    expect(normalizePlanPatchToolCalls({
      toolCalls: [{ name: 'patch_itinerary', input: validPatch }],
    })).toMatchObject({ status: 'complete', planPatchData: validPatch });

    expect(normalizePlanPatchToolCalls({
      toolCalls: [{ name: 'create_itinerary', input: { days: [] } }],
    })).toMatchObject({ status: 'malformed_tool', validationErrors: ['unknown_tool'] });
  });
});
