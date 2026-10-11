import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  exportPublicPlan,
  projectPublicPlan,
  PUBLIC_PLAN_FIELDS,
  buildPublicSample,
  REVIEW_CHECKS,
} from '../publicItineraryExport.mjs';
import { buildTripExportPayload } from '../pdf/buildTripExportPayload';

const require = createRequire(import.meta.url);
const shared = require(path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../shared/publicPlanExport.cjs',
));
const { TRIP_SCHEMA_VERSION } = require(path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../shared/tripSchemaVersion.cjs',
));

const unusualPlan = {
  intro: 'One quiet Smokies day.',
  tripSchemaVersion: 1,
  futureContractField: { meaning: 42 },
  parkName: 'Great Smoky Mountains National Park',
  parkCode: 'grsm',
  days: [{
    dayNumber: 1,
    label: 'River day',
    overnightLocation: 'Cherokee area',
    stops: [
      {
        id: 's1', order: 1, type: 'viewpoint', name: 'Activity A', note: 'Morning.',
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

describe('Step 7 — frontend consumers share one export boundary', () => {
  it('publicItineraryExport and PDF builder use the shared module', () => {
    expect(PUBLIC_PLAN_FIELDS).toEqual(shared.PUBLIC_PLAN_FIELDS);
    expect(exportPublicPlan(unusualPlan)).toEqual(shared.exportPublicPlan(unusualPlan));
    expect(projectPublicPlan(unusualPlan)).toEqual(shared.projectPublicPlan(unusualPlan));
    expect(buildTripExportPayload({ plan: unusualPlan, conversation: [] }).plan)
      .toEqual(shared.exportPublicPlan(unusualPlan));
  });

  it('preserves pinless experience, timingReason, tripSchemaVersion, and does not invent clocks', () => {
    const exported = exportPublicPlan(unusualPlan);
    const experience = exported.days[0].dayStructure.blocks.find((b) => b.kind === 'experience');
    expect(experience.stopIds).toEqual([]);
    expect(exported.tripSchemaVersion).toBe(TRIP_SCHEMA_VERSION);
    expect(buildTripExportPayload({ plan: unusualPlan, conversation: [] }).plan.tripSchemaVersion)
      .toBe(TRIP_SCHEMA_VERSION);
    expect(exported.days[0].stops[0].startTime).toBe('');
    expect(exported.days[0].stops[1]).toMatchObject({
      startTime: '6:42 AM',
      timingReason: 'sunrise at the overlook',
    });
    expect(JSON.stringify(exported)).not.toContain('7:00 AM');
    expect(exported.futureContractField).toBeUndefined();
  });

  it('sample builder still routes through exportPublicPlan', () => {
    const location = unusualPlan.days[0].stops[0].location;
    const plan = {
      parkName: 'Yellowstone National Park',
      parkCode: 'yell',
      days: [{
        dayNumber: 1,
        label: 'Geysers',
        overnightLocation: 'Old Faithful',
        stops: [{
          id: 'a', name: 'Old Faithful', type: 'viewpoint',
          canonicalPlaceId: 'nps:place:geyser',
          location: { ...location, sourceEntity: 'nps:place:geyser', sourceRef: 'https://www.nps.gov/yell/' },
        }],
        travelEdges: [],
      }],
    };
    const concept = { slug: 'yell-test', title: 'Yellowstone', prompt: 'Plan Yellowstone', days: 1, tags: [] };
    const capture = {
      plan, saved: true, tripId: 't', itineraryHash: 'hash', prompt: concept.prompt,
      response: 'Here is your trip.', mapCoverage: { mapped: 1, missing: 0 },
      images: [{ url: 'https://www.nps.gov/image.jpg', alt: 'Geyser', verified: true }],
    };
    const review = {
      itineraryHash: 'hash',
      description: 'Geysers.',
      checks: Object.fromEntries(REVIEW_CHECKS.map((key) => [key, true])),
    };
    const sample = buildPublicSample(capture, concept, review);
    expect(sample.plan).toEqual(exportPublicPlan(plan));
  });
});
