'use strict';

jest.mock('../../models/TripPlan');
jest.mock('../../services/manualPlaceResolution', () => {
  const actual = jest.requireActual('../../services/manualPlaceResolution');
  return {
    ...actual,
    resolveManualPlace: jest.fn(),
  };
});

const TripPlan = require('../../models/TripPlan');
const { hashPayload } = require('../../utils/canonicalResponse');
const { extractStoredItineraryData } = require('../../utils/storedRevisionValidation');
const { resolveManualPlace } = require('../../services/manualPlaceResolution');
const { applyManualTripMutation } = require('../manualTripMutationController');
const controller = require('../tripController');

const OWNER = 'user-1';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

const reqFor = (body, params = {}) => ({
  body,
  params: { tripId: 'trip-1', ...params },
  user: { _id: OWNER, id: OWNER },
  app: { get: () => null },
});

function makePlan() {
  return {
    type: 'itinerary',
    version: 1,
    intro: 'A short visit.',
    responseId: 'resp-1',
    responseVersion: 1,
    contentHash: 'ch1',
    itineraryHash: 'stale-hash',
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
      }, {
        id: 's2',
        order: 2,
        type: 'viewpoint',
        name: 'Second',
        note: '',
        timeWindow: 'Afternoon',
        duration: 30,
      }],
      dayStructure: {
        type: 'sightseeing',
        startPeriod: 'morning',
        endPeriod: 'evening',
        summary: 'Two viewpoints.',
        blocks: [
          {
            kind: 'outing',
            periods: ['morning', 'midday', 'afternoon'],
            label: 'Overlooks',
            note: 'See both.',
            stopIds: ['s1', 's2'],
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
}

function storedTrip() {
  const plan = makePlan();
  return {
    _id: 'trip-1',
    userId: OWNER,
    updatedAt: new Date('2026-10-11T12:00:00Z'),
    __v: 3,
    plan,
    conversation: [{
      id: 1,
      role: 'user',
      content: 'Plan a day',
    }, {
      id: 2,
      role: 'assistant',
      content: 'Here is your day.',
      responseId: 'resp-1',
      responseVersion: 1,
      responseRevision: 2,
      lifecycleStatus: 'prose_ready',
      contentHash: 'ch1',
      itineraryHash: 'stale-hash',
    }],
    toObject() { return JSON.parse(JSON.stringify(this)); },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  TripPlan.findById = jest.fn();
  TripPlan.findOneAndUpdate = jest.fn();
  resolveManualPlace.mockReset();
});

test('plan-only PUT is rejected with manual_mutation_required', async () => {
  TripPlan.findById.mockResolvedValue(storedTrip());
  const res = mockRes();
  await controller.updateTrip(reqFor({ plan: makePlan() }), res, jest.fn());
  expect(res.statusCode).toBe(400);
  expect(res.body.code).toBe('manual_mutation_required');
  expect(TripPlan.findOneAndUpdate).not.toHaveBeenCalled();
});

test('remove_stop persists and recomputes itineraryHash', async () => {
  const stored = storedTrip();
  TripPlan.findById.mockResolvedValue(stored);
  let written;
  TripPlan.findOneAndUpdate.mockImplementation((_filter, update) => {
    written = update.$set;
    const next = { ...stored, ...update.$set, __v: stored.__v + 1 };
    return { toObject: () => next };
  });

  const res = mockRes();
  await applyManualTripMutation(reqFor({ op: 'remove_stop', stopId: 's1' }), res, jest.fn());

  expect(res.statusCode).toBe(200);
  expect(written.plan.days[0].stops.map((s) => s.id)).toEqual(['s2']);
  expect(written.plan.days[0].dayStructure.blocks[0].stopIds).toEqual(['s2']);
  expect(written.plan.itineraryHash).toBe(hashPayload(extractStoredItineraryData(written.plan)));
  expect(written.plan.itineraryHash).not.toBe('stale-hash');
  expect(written.conversation.find((m) => m.role === 'assistant').itineraryHash)
    .toBe(written.plan.itineraryHash);
});

test('CAS conflict returns 409', async () => {
  TripPlan.findById.mockResolvedValue(storedTrip());
  TripPlan.findOneAndUpdate.mockResolvedValue(null);
  const res = mockRes();
  await applyManualTripMutation(reqFor({ op: 'remove_stop', stopId: 's1' }), res, jest.fn());
  expect(res.statusCode).toBe(409);
  expect(res.body.code).toBe('canonical_write_conflict');
});

test('removing the last day fails', async () => {
  TripPlan.findById.mockResolvedValue(storedTrip());
  const res = mockRes();
  await applyManualTripMutation(reqFor({ op: 'remove_day', dayId: 'day-1' }), res, jest.fn());
  expect(res.statusCode).toBe(400);
  expect(res.body.code).toBe('manual_mutation_last_day');
  expect(TripPlan.findOneAndUpdate).not.toHaveBeenCalled();
});

test('client-forged coordinates are rejected', async () => {
  TripPlan.findById.mockResolvedValue(storedTrip());
  const res = mockRes();
  await applyManualTripMutation(reqFor({
    op: 'add_place',
    dayId: 'day-1',
    query: 'Tunnel View',
    latitude: 37.7,
    longitude: -119.6,
  }), res, jest.fn());
  expect(res.statusCode).toBe(400);
  expect(res.body.code).toBe('place_forge_rejected');
  expect(resolveManualPlace).not.toHaveBeenCalled();
  expect(TripPlan.findOneAndUpdate).not.toHaveBeenCalled();
});

test('add_place ambiguous returns choices without writing', async () => {
  TripPlan.findById.mockResolvedValue(storedTrip());
  resolveManualPlace.mockResolvedValue({
    status: 'ambiguous',
    code: 'place_ambiguous',
    query: 'Pine Loop',
    choices: [
      { candidateId: 'google:place:a', name: 'Pine Loop' },
      { candidateId: 'google:place:b', name: 'Pine Loop' },
    ],
  });
  const res = mockRes();
  await applyManualTripMutation(reqFor({
    op: 'add_place',
    dayId: 'day-1',
    query: 'Pine Loop',
  }), res, jest.fn());
  expect(res.statusCode).toBe(400);
  expect(res.body.code).toBe('place_ambiguous');
  expect(res.body.choices).toHaveLength(2);
  expect(TripPlan.findOneAndUpdate).not.toHaveBeenCalled();
});

test('add_place resolved persists grounded stop', async () => {
  const stored = storedTrip();
  TripPlan.findById.mockResolvedValue(stored);
  resolveManualPlace.mockResolvedValue({
    status: 'resolved',
    stopSeed: {
      name: 'Tunnel View',
      canonicalPlaceName: 'Tunnel View',
      displayName: 'Tunnel View',
      canonicalPlaceId: 'google:place:tunnel',
      evidenceRef: 'manual-place:google:place:tunnel',
      resolutionStatus: 'resolved',
      location: {
        lat: 37.7, lon: -119.6, status: 'resolved',
        source: 'geocoder', authority: 'commercial_structured',
        sourceRef: 'manual-place:google:place:tunnel',
      },
      sourceReferences: [],
      type: 'viewpoint',
      note: '',
      timeWindow: 'Morning',
      duration: 45,
      startTime: '',
    },
  });
  let written;
  TripPlan.findOneAndUpdate.mockImplementation((_filter, update) => {
    written = update.$set;
    return { toObject: () => ({ ...stored, ...update.$set }) };
  });
  const res = mockRes();
  await applyManualTripMutation(reqFor({
    op: 'add_place',
    dayId: 'day-1',
    query: 'Tunnel View',
  }), res, jest.fn());
  expect(res.statusCode).toBe(200);
  expect(written.plan.days[0].stops.some((s) => s.canonicalPlaceId === 'google:place:tunnel')).toBe(true);
  expect(written.plan.days[0].stops.every((s) => s.latitude === undefined)).toBe(true);
  expect(written.plan.itineraryHash).not.toBe('stale-hash');
});
