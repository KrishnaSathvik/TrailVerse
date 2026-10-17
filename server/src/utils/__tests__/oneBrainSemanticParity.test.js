'use strict';

/**
 * Step 9 Gate 8 — semantic projection parity.
 * One rich canonical fixture through every public projection; compare meaning,
 * not UI layout. Provider-disabled / fixture-only.
 */
const path = require('path');
const {
  exportPublicPlan,
  projectPublicPlan,
  PUBLIC_PLAN_FIELDS,
} = require(path.join(__dirname, '../../../../shared/publicPlanExport.cjs'));
const {
  TRIP_SCHEMA_VERSION,
  evaluateTripSchemaVersion,
  stampTripSchemaVersion,
} = require(path.join(__dirname, '../../../../shared/tripSchemaVersion.cjs'));
const { buildSharedTripPayload } = require('../sharedTripPayload');
const { verifiedTransferLabel } = (() => {
  // Mirror the road-label contract used by frontend tripPresentation without
  // importing ESM. Keep the assertion local and deterministic.
  return {
    verifiedTransferLabel(edge) {
      if (edge?.status !== 'verified' || !Number.isFinite(edge.durationSeconds)) return null;
      if (edge.travelMode === 'driving') {
        return `${Math.round(edge.durationSeconds / 60)} min by road`;
      }
      return null;
    },
  };
})();

const RICH = stampTripSchemaVersion({
  parkName: 'Great Smoky Mountains National Park',
  parkCode: 'grsm',
  intro: 'A multi-shape Smokies trip.',
  destinations: [
    { name: 'Great Smoky Mountains National Park', type: 'park', parkCode: 'grsm' },
    { name: 'Cherokee', type: 'town', parkCode: null },
  ],
  tripGuidance: [{
    text: 'Confirm road access for your dates.',
    source: 'https://www.nps.gov/grsm/',
    applicability: 'date_dependent',
    diagnostics: 'PRIVATE',
  }],
  userId: 'PRIVATE',
  itineraryHash: 'PRIVATE',
  someFieldInventedNextQuarter: 'LEAK-unknownFuture',
  days: [
    {
      dayNumber: 1,
      label: 'Sightseeing',
      overnightLocation: 'Cherokee area',
      privateToken: 'PRIVATE',
      stops: [
        {
          id: 's1', order: 1, type: 'viewpoint', name: 'Mingus Mill',
          note: 'Grounded morning outing.', duration: 60, timeWindow: 'Morning', startTime: '',
          canonicalPlaceId: 'nps:place:mingus', canonicalPlaceName: 'Mingus Mill',
          location: {
            lat: 35.51, lon: -83.31, source: 'nps', authority: 'official_owner',
            status: 'resolved', sourceRef: 'place-1', sourceEntity: 'nps:place:mingus', userId: 'PRIVATE',
          },
        },
        {
          id: 's2', order: 2, type: 'walk', name: 'Oconaluftee River Trail',
          note: 'Experience at a supported access point.', duration: 90, timeWindow: 'Morning',
          startTime: '6:42 AM', timingReason: 'sunrise at the river',
          canonicalPlaceId: 'nps:place:trailhead', canonicalPlaceName: 'Oconaluftee River Trailhead',
          experience: { id: 'nps:experience:river', name: 'Oconaluftee River Trail', userId: 'PRIVATE' },
          mapAnchor: {
            canonicalPlaceId: 'nps:place:trailhead', name: 'Oconaluftee River Trailhead',
            relationship: 'trailhead_for', sourceUrl: 'https://www.nps.gov/places/trailhead.htm', debug: 'PRIVATE',
          },
          location: {
            lat: 35.52, lon: -83.32, source: 'nps', authority: 'official_owner',
            status: 'resolved', sourceRef: 'place-2', sourceEntity: 'nps:place:trailhead',
          },
        },
      ],
      travelEdges: [{
        sourceStopId: 's1', targetStopId: 's2', relationship: 'transfer', status: 'verified',
        travelMode: 'driving', durationSeconds: 37 * 60,
        source: { provider: 'google_maps', evidenceId: 'route-secret', token: 'PRIVATE' },
        operationalAccess: { status: 'unknown', sources: [], diagnostic: 'PRIVATE' },
      }],
      dayStructure: {
        type: 'sightseeing', startPeriod: 'morning', endPeriod: 'evening',
        summary: 'Grounded morning, flexible afternoon.',
        blocks: [
          { kind: 'outing', periods: ['morning'], label: 'Mingus Mill', note: 'Mill area.', stopIds: ['s1'] },
          { kind: 'outing', periods: ['morning'], label: 'River trail', note: 'Timed sunrise.', stopIds: ['s2'] },
          {
            kind: 'experience', periods: ['afternoon'], label: 'Easy riverside time',
            note: 'Pinless flexible time.', stopIds: [], duration: 90,
          },
          { kind: 'meal', periods: ['evening'], label: 'Dinner', note: 'Flexible meal window.', stopIds: [] },
          { kind: 'downtime', periods: ['evening'], label: 'Rest', note: 'Evening ease.', stopIds: [] },
        ],
      },
    },
    {
      dayNumber: 2,
      label: 'Transfer',
      overnightLocation: 'Asheville area',
      stops: [],
      travelEdges: [],
      dayStructure: {
        type: 'transfer', startPeriod: 'morning', endPeriod: 'afternoon',
        summary: 'Move between bases.',
        blocks: [
          { kind: 'transfer', periods: ['morning', 'midday'], label: 'Drive to Asheville', note: 'Road move.', stopIds: [] },
          { kind: 'downtime', periods: ['afternoon'], label: 'Settle in', note: 'Arrival ease.', stopIds: [] },
        ],
      },
    },
    {
      dayNumber: 3,
      label: 'Departure',
      overnightLocation: 'Asheville area',
      stops: [],
      travelEdges: [],
      dayStructure: {
        type: 'departure', startPeriod: 'morning', endPeriod: 'midday',
        summary: 'Leave without inventing filler.',
        blocks: [
          { kind: 'departure', periods: ['morning', 'midday'], label: 'Depart', note: 'Travel home.', stopIds: [] },
        ],
      },
    },
  ],
});

function semantics(plan) {
  return {
    tripSchemaVersion: plan.tripSchemaVersion,
    destinations: plan.destinations,
    intro: plan.intro,
    tripGuidance: (plan.tripGuidance || []).map((g) => ({ text: g.text, source: g.source, applicability: g.applicability })),
    days: (plan.days || []).map((day) => ({
      dayNumber: day.dayNumber,
      label: day.label,
      overnightLocation: day.overnightLocation,
      dayStructure: day.dayStructure,
      stops: (day.stops || []).map((stop) => ({
        id: stop.id,
        name: stop.name,
        startTime: stop.startTime,
        timingReason: stop.timingReason,
        timeWindow: stop.timeWindow,
        duration: stop.duration,
        canonicalPlaceId: stop.canonicalPlaceId,
        canonicalPlaceName: stop.canonicalPlaceName,
        experience: stop.experience,
        mapAnchor: stop.mapAnchor && {
          canonicalPlaceId: stop.mapAnchor.canonicalPlaceId,
          name: stop.mapAnchor.name,
          relationship: stop.mapAnchor.relationship,
        },
        location: stop.location && {
          lat: stop.location.lat,
          lon: stop.location.lon,
          status: stop.location.status,
          sourceEntity: stop.location.sourceEntity,
        },
      })),
      travelEdges: (day.travelEdges || []).map((edge) => ({
        sourceStopId: edge.sourceStopId,
        targetStopId: edge.targetStopId,
        travelMode: edge.travelMode,
        status: edge.status,
        durationSeconds: edge.durationSeconds,
        operationalAccess: edge.operationalAccess && { status: edge.operationalAccess.status },
        label: verifiedTransferLabel(edge),
      })),
    })),
  };
}

describe('Step 9 — One-Brain semantic projection parity', () => {
  test('rich fixture has the intended unusual semantics before projection', () => {
    expect(RICH.tripSchemaVersion).toBe(TRIP_SCHEMA_VERSION);
    expect(evaluateTripSchemaVersion(RICH).ok).toBe(true);
    const experience = RICH.days[0].dayStructure.blocks.find((b) => b.kind === 'experience');
    expect(experience.stopIds).toEqual([]);
    expect(RICH.days[0].stops[1].startTime).toBe('6:42 AM');
    expect(RICH.days[0].stops[1].timingReason).toBe('sunrise at the river');
    expect(verifiedTransferLabel(RICH.days[0].travelEdges[0])).toBe('37 min by road');
    expect(RICH.days[0].travelEdges[0].operationalAccess.status).toBe('unknown');
    expect(RICH.days.map((d) => d.dayStructure.type)).toEqual(['sightseeing', 'transfer', 'departure']);
  });

  test('exportPublicPlan and projectPublicPlan preserve the same travel meaning', () => {
    const exported = exportPublicPlan(RICH);
    const projected = projectPublicPlan(RICH);
    expect(exported).toEqual(projected);
    expect(Object.keys(exported).every((key) => PUBLIC_PLAN_FIELDS.includes(key))).toBe(true);
    expect(JSON.stringify(exported)).not.toContain('PRIVATE');
    expect(JSON.stringify(exported)).not.toContain('LEAK-unknownFuture');

    const meaning = semantics(exported);
    expect(meaning.tripSchemaVersion).toBe(1);
    expect(meaning.destinations).toEqual([
      { name: 'Great Smoky Mountains National Park', type: 'park', parkCode: 'grsm' },
      { name: 'Cherokee', type: 'town' },
    ]);
    expect(meaning.days[0].stops[0].name).toBe('Mingus Mill');
    expect(meaning.days[0].stops[1]).toMatchObject({
      name: 'Oconaluftee River Trail',
      startTime: '6:42 AM',
      timingReason: 'sunrise at the river',
      experience: { id: 'nps:experience:river', name: 'Oconaluftee River Trail' },
      mapAnchor: {
        canonicalPlaceId: 'nps:place:trailhead',
        name: 'Oconaluftee River Trailhead',
        relationship: 'trailhead_for',
      },
    });
    expect(meaning.days[0].dayStructure.blocks.find((b) => b.kind === 'experience')).toMatchObject({
      label: 'Easy riverside time',
      stopIds: [],
    });
    expect(meaning.days[0].travelEdges[0]).toMatchObject({
      durationSeconds: 2220,
      travelMode: 'driving',
      label: '37 min by road',
      operationalAccess: { status: 'unknown' },
    });
    expect(meaning.days[1].dayStructure.type).toBe('transfer');
    expect(meaning.days[2].dayStructure.type).toBe('departure');
    expect(meaning.tripGuidance[0].text).toBe('Confirm road access for your dates.');
  });

  test('shared-trip payload uses the same public plan meaning', () => {
    const shared = buildSharedTripPayload(
      { title: 'Smokies', parkName: RICH.parkName, plan: RICH, conversation: [], createdAt: '2026-10-11T00:00:00.000Z' },
      { scope: 'plan_only' },
    );
    expect(shared.plan).toEqual(exportPublicPlan(RICH));
    expect(semantics(shared.plan).days[0].travelEdges[0].label).toBe('37 min by road');
    expect(JSON.stringify(shared)).not.toContain('PRIVATE');
  });

  test('unsupported future schema is never rewritten by export', () => {
    const future = { ...RICH, tripSchemaVersion: 999 };
    expect(evaluateTripSchemaVersion(future).ok).toBe(false);
    expect(exportPublicPlan(future).tripSchemaVersion).toBe(999);
  });
});
