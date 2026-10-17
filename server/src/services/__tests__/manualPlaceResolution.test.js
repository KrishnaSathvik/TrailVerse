'use strict';

const { createNamedPlaceEvidenceProvider } = require('../providers/namedPlaceEvidenceProvider');
const {
  resolveManualPlace,
  rejectForgeAttempt,
} = require('../manualPlaceResolution');
const { applyManualMutation } = require('../manualTripMutation');
const { validateManualPlanIntegrity } = require('../manualPlanIntegrity');
const { hashPayload } = require('../../utils/canonicalResponse');
const { extractStoredItineraryData } = require('../../utils/storedRevisionValidation');
const { prepareManualPlanCommit } = require('../trailieManualCommit');

const NOW = new Date('2026-10-11T12:00:00Z');
const point = (name, id, types = ['point_of_interest']) => ({
  name,
  place_id: id,
  types,
  address_components: [
    { short_name: 'US', types: ['country'] },
    { short_name: 'CA', types: ['administrative_area_level_1'] },
  ],
  formatted_address: `${name}, CA, USA`,
  geometry: { location: { lat: 37.7, lng: -119.6 } },
});

function providerFor(results) {
  return createNamedPlaceEvidenceProvider({
    catalog: {},
    officialLookup: async () => [],
    lookup: async () => results,
    now: () => NOW,
  });
}

const trip = {
  parkCode: 'yose',
  parkName: 'Yosemite National Park',
  planningState: {
    destination: { parkCode: 'yose', parkName: 'Yosemite National Park', state: 'CA' },
  },
};

function basePlan() {
  return {
    intro: 'A visit.',
    responseId: 'resp-1',
    responseVersion: 1,
    contentHash: 'ch',
    itineraryHash: 'stale',
    tripSchemaVersion: 1,
    days: [{
      id: 'day-1',
      dayNumber: 1,
      label: 'Day 1',
      overnightLocation: '',
      stops: [],
      dayStructure: {
        type: 'rest',
        startPeriod: 'morning',
        endPeriod: 'evening',
        summary: 'Open day.',
        blocks: [{
          kind: 'downtime',
          periods: ['morning', 'midday', 'afternoon', 'evening'],
          label: 'Open',
          note: 'Flexible.',
          stopIds: [],
        }],
      },
      travelEdges: [{
        sourceStopId: 'gone',
        targetStopId: 'also-gone',
        relationship: 'transfer',
        status: 'verified',
        durationSeconds: 600,
      }],
    }, {
      id: 'day-2',
      dayNumber: 2,
      label: 'Day 2',
      overnightLocation: '',
      stops: [{
        id: 's-keep',
        order: 1,
        type: 'viewpoint',
        name: 'Kept',
        note: '',
        timeWindow: 'Morning',
        duration: 30,
        evidenceRef: 'e-keep',
        canonicalPlaceId: 'google:place:keep',
        location: {
          lat: 37.8, lon: -119.5, status: 'resolved',
          source: 'geocoder', authority: 'commercial_structured', sourceRef: 'e-keep',
        },
      }],
      dayStructure: {
        type: 'sightseeing',
        startPeriod: 'morning',
        endPeriod: 'evening',
        summary: 'One stop.',
        blocks: [
          {
            kind: 'outing',
            periods: ['morning', 'midday', 'afternoon'],
            label: 'Outing',
            note: 'Visit.',
            stopIds: ['s-keep'],
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

test('rejectForgeAttempt catches client-authored identity fields', () => {
  expect(rejectForgeAttempt({ op: 'add_place', query: 'x', latitude: 1 })).toBe(true);
  expect(rejectForgeAttempt({ op: 'add_place', query: 'Tunnel View', dayId: 'd' })).toBe(false);
});

test('exact place resolves to a map-eligible stop seed', async () => {
  const result = await resolveManualPlace({
    query: 'Tunnel View',
    trip,
    provider: providerFor([point('Tunnel View', 'tunnel')]),
  });
  expect(result.status).toBe('resolved');
  expect(result.stopSeed).toMatchObject({
    name: 'Tunnel View',
    canonicalPlaceId: 'google:place:tunnel',
    resolutionStatus: 'resolved',
    location: { status: 'resolved', lat: 37.7, lon: -119.6 },
  });
  expect(result.stopSeed.latitude).toBeUndefined();
});

test('ambiguous place returns choices and does not invent a winner', async () => {
  const result = await resolveManualPlace({
    query: 'Pine Loop',
    trip,
    provider: providerFor([
      point('Pine Loop', 'pine-a'),
      point('Pine Loop', 'pine-b'),
    ]),
  });
  expect(result.status).toBe('ambiguous');
  expect(result.code).toBe('place_ambiguous');
  expect(result.choices.length).toBeGreaterThan(1);
  expect(result.choices.every((c) => c.candidateId && c.name)).toBe(true);
});

test('candidateId confirms a prior ambiguous choice', async () => {
  const provider = providerFor([
    point('Pine Loop', 'pine-a'),
    point('Pine Loop', 'pine-b'),
  ]);
  const ambiguous = await resolveManualPlace({
    query: 'Pine Loop',
    trip,
    provider,
  });
  expect(ambiguous.status).toBe('ambiguous');
  const pick = ambiguous.choices[0].candidateId;
  const confirmed = await resolveManualPlace({
    query: 'Pine Loop',
    trip,
    candidateId: pick,
    provider,
  });
  expect(confirmed.status).toBe('resolved');
  expect(confirmed.stopSeed.canonicalPlaceId).toBe(pick);
});

test('unresolved place creates nothing', async () => {
  const result = await resolveManualPlace({
    query: 'Completely Unknown Place XYZ',
    trip,
    provider: providerFor([]),
  });
  expect(result).toMatchObject({ status: 'unresolved', code: 'place_unresolved' });
});

test('add_place rebuilds stopIds, clears touched-day edges, leaves other days alone', async () => {
  const resolved = await resolveManualPlace({
    query: 'Tunnel View',
    trip,
    provider: providerFor([point('Tunnel View', 'tunnel')]),
  });
  const priorHash = 'stale';
  const plan = basePlan();
  const otherEdges = plan.days[1].travelEdges;
  const applied = applyManualMutation(plan, {
    op: 'add_place',
    dayId: 'day-1',
    stop: resolved.stopSeed,
  });
  expect(applied.ok).toBe(true);
  const day1 = applied.plan.days[0];
  expect(day1.stops).toHaveLength(1);
  expect(day1.dayStructure.blocks.find((b) => b.kind === 'outing').stopIds)
    .toEqual([day1.stops[0].id]);
  expect(day1.travelEdges).toEqual([]);
  expect(applied.plan.days[1].stops[0].id).toBe('s-keep');
  expect(applied.plan.days[1].travelEdges).toEqual(otherEdges);
  expect(validateManualPlanIntegrity(applied.plan).ok).toBe(true);

  const prepared = prepareManualPlanCommit({
    snapshot: {
      plan: { ...plan, itineraryHash: priorHash },
      conversation: [{
        id: 1, role: 'assistant', content: 'Plan',
        responseId: 'resp-1', responseVersion: 1, contentHash: 'ch',
        itineraryHash: priorHash, responseRevision: 2, lifecycleStatus: 'prose_ready',
      }],
    },
    plan: applied.plan,
    targetTripId: 'trip-1',
  });
  expect(prepared.ok).toBe(true);
  expect(prepared.plan.itineraryHash).toBe(
    hashPayload(extractStoredItineraryData(prepared.plan)),
  );
  expect(prepared.plan.itineraryHash).not.toBe(priorHash);
});
