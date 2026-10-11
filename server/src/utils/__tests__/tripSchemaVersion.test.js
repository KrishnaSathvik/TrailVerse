'use strict';

const path = require('path');
const {
  TRIP_SCHEMA_VERSION,
  SUPPORTED_TRIP_SCHEMA_VERSIONS,
  UNSUPPORTED_TRIP_SCHEMA_VERSION,
  readTripSchemaVersion,
  evaluateTripSchemaVersion,
  stampTripSchemaVersion,
} = require(path.join(__dirname, '../../../../shared/tripSchemaVersion.cjs'));
const { exportPublicPlan, projectPublicPlan } = require(path.join(__dirname, '../../../../shared/publicPlanExport.cjs'));
const { validateSimpleMutation } = require('../../services/trailieSimpleGuard');
const { buildPlanDocument } = require('../trailiePipelineUtils');
const { normalizeEvidenceLocation } = require('../trailieCanonicalLocation');
const { explainMutationIssues } = require('../mutationIssueMeanings');

const now = new Date('2026-10-11T12:00:00Z');

function placeEvidence(name = 'Mingus Mill', identity = 'nps:place:mingus') {
  return normalizeEvidenceLocation({
    evidenceId: 'place-1',
    entityId: identity,
    topic: 'activities',
    claim: {
      identity,
      normalizedValue: {
        name,
        canonicalPlaceName: name,
        latitude: 35.5,
        longitude: -83.3,
        providerSource: 'nps',
        requestedName: name,
        resolutionKind: 'exact',
      },
    },
    source: { provider: 'named_place', sourceClass: 'official_owner', url: 'https://www.nps.gov/places/example.htm' },
    observation: { observedAt: now.toISOString(), expiresAt: new Date(+now + 86400000).toISOString() },
    quality: { authorityClass: 'official_owner', conflictStatus: 'none' },
  });
}

function dayPlan(stops, blocks) {
  return {
    intro: 'A short trip.',
    days: [{
      id: 'd1',
      dayNumber: 1,
      label: 'A day',
      overnightLocation: 'Park base',
      stops,
      dayStructure: {
        type: stops.length ? 'sightseeing' : 'rest',
        startPeriod: 'morning',
        endPeriod: 'evening',
        summary: 'Purpose of the day.',
        blocks: blocks || [
          { kind: 'outing', periods: ['morning'], label: 'Outing', note: 'Enjoy it.', stopIds: stops.map((s) => s.id) },
          { kind: 'downtime', periods: ['midday', 'afternoon', 'evening'], label: 'Rest', note: 'Lunch and rest.', stopIds: [] },
        ],
      },
    }],
  };
}

const unusualPlan = {
  intro: 'One quiet Smokies day.',
  futureContractField: { meaning: 42 },
  someFieldInventedNextQuarter: 'LEAK-unknownFuture',
  parkName: 'Great Smoky Mountains National Park',
  parkCode: 'grsm',
  days: [{
    dayNumber: 1,
    label: 'River day',
    overnightLocation: 'Cherokee area',
    stops: [
      {
        id: 's1', order: 1, type: 'viewpoint', name: 'Activity A', note: 'Morning outing.',
        duration: 75, timeWindow: 'Morning', startTime: '',
        canonicalPlaceId: 'nps:place:activity-a', canonicalPlaceName: 'Activity A',
        location: {
          lat: 35.51, lon: -83.31, source: 'nps', authority: 'official_owner',
          status: 'resolved', sourceRef: 'place-1', sourceEntity: 'nps:place:activity-a',
        },
      },
      {
        id: 's2', order: 2, type: 'viewpoint', name: 'Timed overlook', note: 'Sunrise.',
        duration: 45, timeWindow: 'Morning', startTime: '6:42 AM',
        timingReason: 'sunrise at the overlook',
        canonicalPlaceId: 'nps:place:overlook', canonicalPlaceName: 'Timed overlook',
        location: {
          lat: 35.52, lon: -83.32, source: 'nps', authority: 'official_owner',
          status: 'resolved', sourceRef: 'place-2', sourceEntity: 'nps:place:overlook',
        },
      },
    ],
    travelEdges: [{
      sourceStopId: 's1', targetStopId: 's2', relationship: 'transfer', status: 'verified',
      travelMode: 'driving', durationSeconds: 2220,
      source: { provider: 'google_maps', evidenceId: 'route-secret' },
      operationalAccess: { status: 'unknown', sources: [] },
    }],
    dayStructure: {
      type: 'sightseeing', startPeriod: 'morning', endPeriod: 'afternoon',
      summary: 'Grounded morning, flexible afternoon.',
      blocks: [
        { kind: 'outing', periods: ['morning'], label: 'Activity A', note: 'n', stopIds: ['s1'] },
        { kind: 'outing', periods: ['morning'], label: 'Timed overlook', note: 'n', stopIds: ['s2'] },
        {
          kind: 'experience', periods: ['afternoon'], label: 'Easy riverside time',
          note: 'Flexible.', stopIds: [], duration: 90,
        },
      ],
    },
  }],
};

describe('Step 8 — tripSchemaVersion contract', () => {
  test('shared constant is the only supported current version', () => {
    expect(TRIP_SCHEMA_VERSION).toBe(1);
    expect(SUPPORTED_TRIP_SCHEMA_VERSIONS).toEqual([1]);
  });

  test('legacy missing version is readable as current without fabricating a migration rewrite', () => {
    const legacy = { days: [{ dayNumber: 1, stops: [] }] };
    expect(readTripSchemaVersion(legacy)).toBeNull();
    expect(evaluateTripSchemaVersion(legacy)).toEqual({
      ok: true, version: TRIP_SCHEMA_VERSION, legacy: true, code: null,
    });
    expect(stampTripSchemaVersion(legacy)).toEqual({
      ...legacy, tripSchemaVersion: TRIP_SCHEMA_VERSION,
    });
    expect(legacy.tripSchemaVersion).toBeUndefined();
  });

  test('unsupported future version is detected and never silently downgraded', () => {
    const future = { tripSchemaVersion: 99, days: [{ dayNumber: 1, stops: [] }] };
    expect(evaluateTripSchemaVersion(future)).toEqual({
      ok: false, version: 99, legacy: false, code: UNSUPPORTED_TRIP_SCHEMA_VERSION,
    });
    expect(stampTripSchemaVersion(future)).toBe(future);
    expect(future.tripSchemaVersion).toBe(99);
  });

  test('newly accepted canonical plan is stamped at the guard boundary', () => {
    const evidence = placeEvidence();
    const plan = dayPlan([{
      id: 's1', order: 1, type: 'viewpoint', name: 'Mingus Mill',
      note: 'Explore the mill.', duration: 60, timeWindow: 'Morning', startTime: '', evidenceRef: 'place-1',
    }]);
    const verdict = validateSimpleMutation({
      proposal: { response: 'Here is the day.', plan },
      message: 'Plan a day',
      evidence: [evidence],
      now,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.issues).toEqual([]);
    expect(verdict.plan.tripSchemaVersion).toBe(TRIP_SCHEMA_VERSION);
    expect(verdict.plan.days[0].stops[0].name).toBe('Mingus Mill');
  });

  test('serialization / public export preserves tripSchemaVersion and strips LEAKs', () => {
    const stamped = stampTripSchemaVersion(unusualPlan);
    const exported = exportPublicPlan(stamped);
    expect(exported.tripSchemaVersion).toBe(TRIP_SCHEMA_VERSION);
    expect(projectPublicPlan(stamped).tripSchemaVersion).toBe(TRIP_SCHEMA_VERSION);
    expect(exported.days[0].stops[1].startTime).toBe('6:42 AM');
    expect(exported.days[0].stops[1].timingReason).toBe('sunrise at the overlook');
    expect(exported.days[0].dayStructure.blocks.find((b) => b.kind === 'experience').stopIds).toEqual([]);
    expect(JSON.stringify(exported)).not.toContain('LEAK-unknownFuture');
    expect(JSON.stringify(exported)).not.toContain('PRIVATE');
    expect(exported.futureContractField).toBeUndefined();
  });

  test('legacy unversioned plan remains exportable and readable', () => {
    const legacy = structuredClone(unusualPlan);
    expect(readTripSchemaVersion(legacy)).toBeNull();
    const exported = exportPublicPlan(legacy);
    expect(exported.tripSchemaVersion).toBeUndefined();
    expect(evaluateTripSchemaVersion(legacy).ok).toBe(true);
  });

  test('refinement against unsupported prior schema is rejected; content unchanged', () => {
    const prior = stampTripSchemaVersion(dayPlan([{
      id: 's1', order: 1, type: 'viewpoint', name: 'Mingus Mill',
      note: 'Explore the mill.', duration: 60, timeWindow: 'Morning', startTime: '', evidenceRef: 'place-1',
    }]));
    prior.tripSchemaVersion = 99;
    const before = JSON.stringify(prior);
    const verdict = validateSimpleMutation({
      proposal: {
        response: 'Shorten the stop.',
        plan_patch: {
          response: 'Shorten the stop.',
          operations: [{ op: 'update_stop', dayNumber: 1, stopId: 's1', stop: { duration: 30 } }],
        },
      },
      message: 'Make it shorter',
      snapshot: { plan: prior, planningState: {} },
      evidence: [placeEvidence()],
      now,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.issues).toEqual([UNSUPPORTED_TRIP_SCHEMA_VERSION]);
    expect(JSON.stringify(prior)).toBe(before);
    expect(explainMutationIssues(verdict.issues).some((row) => row.code === UNSUPPORTED_TRIP_SCHEMA_VERSION)).toBe(true);
  });

  test('refinement of a supported plan preserves tripSchemaVersion and itinerary meaning', () => {
    const evidence = placeEvidence();
    const created = validateSimpleMutation({
      proposal: {
        response: 'Here is the day.',
        plan: dayPlan([{
          id: 's1', order: 1, type: 'viewpoint', name: 'Mingus Mill',
          note: 'Explore the mill.', duration: 60, timeWindow: 'Morning', startTime: '', evidenceRef: 'place-1',
        }]),
      },
      message: 'Plan a day',
      evidence: [evidence],
      now,
    });
    expect(created.ok).toBe(true);
    const refined = validateSimpleMutation({
      proposal: {
        response: 'Shorter visit.',
        plan_patch: {
          response: 'Shorter visit.',
          operations: [{ op: 'update_stop', dayNumber: 1, stopId: 's1', stop: { duration: 45 } }],
        },
      },
      message: 'Make it 45 minutes',
      snapshot: { plan: created.plan, planningState: created.planningState || {} },
      evidence: [evidence],
      now,
    });
    expect(refined.issues).toEqual([]);
    expect(refined.ok).toBe(true);
    expect(refined.plan.tripSchemaVersion).toBe(TRIP_SCHEMA_VERSION);
    expect(refined.plan.days[0].stops[0].duration).toBe(45);
    expect(refined.plan.days[0].stops[0].name).toBe('Mingus Mill');
  });

  test('buildPlanDocument stamps CURRENT without inventing itinerary fields', () => {
    const doc = buildPlanDocument({
      itineraryData: { parkName: 'Zion', days: [{ dayNumber: 1, stops: [{ id: 'a', name: 'VC' }] }] },
      parkName: 'Zion National Park',
      parkCode: 'zion',
      identity: { responseId: 'r1', responseVersion: 2, contentHash: 'c', itineraryHash: 'i' },
    });
    expect(doc.version).toBe(1);
    expect(doc.tripSchemaVersion).toBe(TRIP_SCHEMA_VERSION);
    expect(doc.days[0].stops[0].name).toBe('VC');
    expect(doc.responseVersion).toBe(2);
  });

  test('document envelope version remains distinct from tripSchemaVersion', () => {
    const stamped = stampTripSchemaVersion({ version: 1, days: [{ dayNumber: 1, stops: [] }] });
    expect(stamped.version).toBe(1);
    expect(stamped.tripSchemaVersion).toBe(TRIP_SCHEMA_VERSION);
  });
});
