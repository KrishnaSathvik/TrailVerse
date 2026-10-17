'use strict';

const path = require('path');
const {
  PUBLIC_PLAN_FIELDS,
  exportPublicPlan,
  projectPublicPlan,
} = require(path.join(__dirname, '../../../../shared/publicPlanExport.cjs'));
const {
  exportPublicPlan: fromPlanProjection,
  projectPublicPlan: projectFromPlanProjection,
  PUBLIC_PLAN_FIELDS: fieldsFromPlanProjection,
} = require('../planProjection');

const location = {
  lat: 35.51,
  lon: -83.31,
  source: 'nps',
  authority: 'official_owner',
  status: 'resolved',
  sourceRef: 'place-1',
  sourceEntity: 'nps:place:activity-a',
  userId: 'PRIVATE',
};

/** Ordinary grounded trip. */
const ordinaryPlan = {
  userId: 'PRIVATE',
  itineraryHash: 'PRIVATE',
  responseId: 'PRIVATE',
  parkName: 'Great Smoky Mountains National Park',
  parkCode: 'grsm',
  intro: 'A quiet day.',
  tripGuidance: [{ text: 'Check road access.', source: 'https://www.nps.gov/grsm/', diagnostics: 'PRIVATE' }],
  days: [{
    dayNumber: 1,
    label: 'River day',
    overnightLocation: 'Cherokee area',
    privateToken: 'PRIVATE',
    stops: [{
      id: 's1',
      order: 1,
      type: 'viewpoint',
      name: 'Activity A',
      note: 'Morning outing.',
      duration: 75,
      timeWindow: 'Morning',
      startTime: '',
      canonicalPlaceId: 'nps:place:activity-a',
      canonicalPlaceName: 'Activity A',
      location: { ...location },
      sourceReferences: [{ evidenceId: 'secret-evidence', url: 'https://www.nps.gov/grsm/', token: 'PRIVATE' }],
    }],
    travelEdges: [],
    dayStructure: {
      type: 'sightseeing',
      startPeriod: 'morning',
      endPeriod: 'afternoon',
      summary: 'Grounded morning.',
      privateToken: 'PRIVATE',
      blocks: [{
        kind: 'outing',
        periods: ['morning'],
        label: 'Activity A',
        note: 'Morning — activity A',
        stopIds: ['s1'],
      }],
    },
  }],
};

/** Unusual: pinless experience, exact timed stop, road transfer, future field. */
const unusualPlan = {
  intro: 'One quiet Smokies day.',
  futureContractField: { meaning: 42, keep: true },
  someFieldInventedNextQuarter: 'LEAK-unknownFuture',
  parkName: 'Great Smoky Mountains National Park',
  parkCode: 'grsm',
  days: [{
    dayNumber: 1,
    label: 'River day',
    overnightLocation: 'Cherokee area',
    stops: [
      {
        id: 's1',
        order: 1,
        type: 'viewpoint',
        name: 'Activity A',
        note: 'Morning outing at a grounded place.',
        duration: 75,
        timeWindow: 'Morning',
        startTime: '',
        canonicalPlaceId: 'nps:place:activity-a',
        canonicalPlaceName: 'Activity A',
        location: { ...location },
      },
      {
        id: 's2',
        order: 2,
        type: 'viewpoint',
        name: 'Timed overlook',
        note: 'Only clock when the clock matters.',
        duration: 45,
        timeWindow: 'Morning',
        startTime: '6:42 AM',
        timingReason: 'sunrise at the overlook',
        canonicalPlaceId: 'nps:place:overlook',
        canonicalPlaceName: 'Timed overlook',
        location: {
          ...location,
          lat: 35.52,
          lon: -83.32,
          sourceEntity: 'nps:place:overlook',
          sourceRef: 'place-2',
        },
      },
    ],
    travelEdges: [{
      sourceStopId: 's1',
      targetStopId: 's2',
      relationship: 'transfer',
      status: 'verified',
      travelMode: 'driving',
      durationSeconds: 37 * 60,
      source: { provider: 'google_maps', evidenceId: 'route-secret', token: 'PRIVATE' },
      operationalAccess: { status: 'unknown', sources: [], diagnostic: 'PRIVATE' },
    }],
    dayStructure: {
      type: 'sightseeing',
      startPeriod: 'morning',
      endPeriod: 'afternoon',
      summary: 'Grounded morning, flexible afternoon.',
      blocks: [
        {
          kind: 'outing',
          periods: ['morning'],
          label: 'Activity A',
          note: 'Morning — activity A',
          stopIds: ['s1'],
        },
        {
          kind: 'outing',
          periods: ['morning'],
          label: 'Timed overlook',
          note: 'Exact time with timingReason.',
          stopIds: ['s2'],
        },
        {
          kind: 'experience',
          periods: ['afternoon'],
          label: 'Easy riverside time',
          note: 'Afternoon — flexible experience',
          stopIds: [],
          duration: 90,
        },
      ],
    },
  }],
};

const partialPlan = {
  parkName: 'Zion National Park',
  parkCode: 'zion',
  days: [{
    dayNumber: 1,
    label: 'Partial',
    overnightLocation: 'Springdale',
    stops: [{
      id: 's1',
      order: 1,
      type: 'viewpoint',
      name: 'Canyon Overlook',
      duration: 60,
      timeWindow: 'Morning',
      startTime: '',
      note: 'One grounded stop.',
      canonicalPlaceId: 'nps:place:overlook',
      location: {
        lat: 37.2,
        lon: -112.9,
        status: 'resolved',
        source: 'nps',
        authority: 'official_owner',
        sourceEntity: 'nps:place:overlook',
        sourceRef: 'https://www.nps.gov/zion/',
      },
    }],
    travelEdges: [],
  }],
};

describe('Step 7 — one public export boundary', () => {
  test('planProjection re-exports the shared module', () => {
    expect(fieldsFromPlanProjection).toBe(PUBLIC_PLAN_FIELDS);
    expect(fromPlanProjection(ordinaryPlan)).toEqual(exportPublicPlan(ordinaryPlan));
    expect(projectFromPlanProjection(ordinaryPlan)).toEqual(projectPublicPlan(ordinaryPlan));
  });

  test('ordinary plan strips private nested fields and preserves traveler content', () => {
    const before = JSON.stringify(ordinaryPlan);
    const exported = exportPublicPlan(ordinaryPlan);
    expect(JSON.stringify(ordinaryPlan)).toBe(before);
    expect(JSON.stringify(exported)).not.toContain('PRIVATE');
    expect(exported.intro).toBe('A quiet day.');
    expect(exported.days[0].stops[0].name).toBe('Activity A');
    expect(exported.days[0].stops[0].location.lat).toBe(35.51);
    expect(exported.days[0].dayStructure.blocks[0].kind).toBe('outing');
    expect(exported.tripGuidance[0].text).toBe('Check road access.');
    expect(exported.days[0].stops[0].sourceReferences[0].evidenceId).toMatch(/^public-evidence-/);
  });

  test('pinless experience, exact time, and road transfer survive without invention', () => {
    const exported = exportPublicPlan(unusualPlan);
    const experience = exported.days[0].dayStructure.blocks.find((b) => b.kind === 'experience');
    expect(experience.stopIds).toEqual([]);
    expect(experience.label).toBe('Easy riverside time');
    expect(exported.days[0].stops.map((s) => s.name)).toEqual(['Activity A', 'Timed overlook']);
    expect(exported.days[0].stops[0].startTime).toBe('');
    expect(exported.days[0].stops[0].timingReason).toBeUndefined();
    expect(exported.days[0].stops[1].startTime).toBe('6:42 AM');
    expect(exported.days[0].stops[1].timingReason).toBe('sunrise at the overlook');
    expect(exported.days[0].travelEdges[0].durationSeconds).toBe(37 * 60);
    expect(exported.days[0].travelEdges[0].travelMode).toBe('driving');
    expect(exported.days[0].travelEdges[0].operationalAccess.status).toBe('unknown');
    expect(JSON.stringify(exported)).not.toContain('LEAK-unknownFuture');
    expect(exported.futureContractField).toBeUndefined();
    expect(JSON.stringify(exported)).not.toContain('PRIVATE');
  });

  test('partial plan exports without inventing restaurants, clocks, or pins', () => {
    const exported = exportPublicPlan(partialPlan);
    expect(exported.days).toHaveLength(1);
    expect(exported.days[0].stops).toHaveLength(1);
    expect(exported.days[0].dayStructure).toBeUndefined();
    expect(JSON.stringify(exported).toLowerCase()).not.toMatch(/restaurant|7:00 am|budget/);
  });

  test('projectPublicPlan matches exportPublicPlan and stays null-safe', () => {
    expect(projectPublicPlan(unusualPlan)).toEqual(exportPublicPlan(unusualPlan));
    expect(projectPublicPlan(null)).toBeNull();
    expect(projectPublicPlan(undefined)).toBeNull();
    expect(projectPublicPlan({ parkName: 'Zion' })).toBeNull();
  });

  test('top-level keys stay within the public allowlist', () => {
    const exported = exportPublicPlan(unusualPlan);
    expect(Object.keys(exported).every((key) => PUBLIC_PLAN_FIELDS.includes(key))).toBe(true);
  });

  test('experience + mapAnchor relationship fields are preserved when present', () => {
    const plan = structuredClone(ordinaryPlan);
    Object.assign(plan.days[0].stops[0], {
      name: 'River Trail',
      canonicalPlaceName: 'River Trailhead',
      experience: { id: 'nps:experience:river', name: 'River Trail', userId: 'PRIVATE' },
      mapAnchor: {
        canonicalPlaceId: 'nps:place:activity-a',
        name: 'River Trailhead',
        relationship: 'trailhead_for',
        sourceUrl: 'https://www.nps.gov/places/access.htm',
        debug: 'PRIVATE',
      },
    });
    const exported = exportPublicPlan(plan);
    expect(exported.days[0].stops[0].experience).toEqual({
      id: 'nps:experience:river',
      name: 'River Trail',
    });
    expect(exported.days[0].stops[0].mapAnchor).toEqual({
      canonicalPlaceId: 'nps:place:activity-a',
      name: 'River Trailhead',
      relationship: 'trailhead_for',
      sourceUrl: 'https://www.nps.gov/places/access.htm',
    });
  });
});
