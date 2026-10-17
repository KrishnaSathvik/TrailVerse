'use strict';
const { executePlanItineraryRequest } = require('../fastItineraryPlannerService');
test('legacy endpoint cannot generate a separate schedule without canonical context', async () => {
  await expect(executePlanItineraryRequest({ body: {} }, { runTurn: jest.fn() }))
    .rejects.toMatchObject({ code: 'CANONICAL_CONTEXT_REQUIRED' });
});
