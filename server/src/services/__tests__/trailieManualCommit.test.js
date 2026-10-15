'use strict';

const { hashPayload } = require('../../utils/canonicalResponse');
const { extractStoredItineraryData } = require('../../utils/storedRevisionValidation');
const { prepareManualPlanCommit } = require('../trailieManualCommit');
const { applyManualMutation } = require('../manualTripMutation');

function snapshotWithPlan() {
  const plan = {
    type: 'itinerary',
    version: 1,
    intro: 'A short visit.',
    responseId: 'resp-m',
    responseVersion: 2,
    contentHash: 'content-hash',
    itineraryHash: 'stale',
    responseRevision: 2,
    lifecycleStatus: 'prose_ready',
    tripSchemaVersion: 1,
    days: [{
      id: 'day-1',
      dayNumber: 1,
      label: 'Day 1',
      overnightLocation: '',
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
    }],
  };
  return {
    _id: 'trip-1',
    userId: 'user-1',
    plan,
    conversation: [{
      id: 1,
      role: 'user',
      content: 'Plan a day',
    }, {
      id: 2,
      role: 'assistant',
      content: 'Here is your day.',
      responseId: 'resp-m',
      responseVersion: 2,
      responseRevision: 2,
      lifecycleStatus: 'prose_ready',
      contentHash: 'content-hash',
      itineraryHash: 'stale',
      canonicalPlan: extractStoredItineraryData(plan),
    }],
  };
}

test('prepareManualPlanCommit recomputes itineraryHash and syncs assistant identity', () => {
  const snapshot = snapshotWithPlan();
  const applied = applyManualMutation(snapshot.plan, { op: 'add_day', afterDayNumber: 1 });
  expect(applied.ok).toBe(true);

  const prepared = prepareManualPlanCommit({
    snapshot,
    plan: applied.plan,
    targetTripId: 'trip-1',
  });
  expect(prepared.ok).toBe(true);
  expect(prepared.plan.responseId).toBe('resp-m');
  expect(prepared.plan.responseVersion).toBe(2);
  expect(prepared.plan.contentHash).toBe('content-hash');
  expect(prepared.plan.itineraryHash).toBe(
    hashPayload(extractStoredItineraryData(prepared.plan)),
  );
  expect(prepared.plan.itineraryHash).not.toBe('stale');

  const assistant = prepared.conversation.find((m) => m.role === 'assistant');
  expect(assistant.itineraryHash).toBe(prepared.plan.itineraryHash);
  expect(prepared.conversation).toHaveLength(2);
  expect(prepared.conversation[0].role).toBe('user');
});

test('prepareManualPlanCommit does not invent chat turns', () => {
  const snapshot = snapshotWithPlan();
  const prepared = prepareManualPlanCommit({
    snapshot,
    plan: snapshot.plan,
    targetTripId: 'trip-1',
  });
  expect(prepared.ok).toBe(true);
  expect(prepared.conversation.map((m) => m.role)).toEqual(['user', 'assistant']);
});
