import { describe, expect, it } from 'vitest';
import {
  buildTripMapModel,
  findMapStopById,
  hasCanonicalCoordinates,
  hasAuthoritativeCoordinates,
  isDrawableTransferEdge,
  isMappableStop,
  stopHasBadgeworthyRequirement,
} from '@/lib/itineraryMapStops';

const CATALOG = 'trailverse_catalog';
const pin = (id, name, type, lat, lng, extra = {}) => ({
  id, name, type, latitude: lat, longitude: lng, coordinateSource: CATALOG, ...extra,
});
const transfer = (sourceStopId, targetStopId, extra = {}) => ({
  sourceStopId, targetStopId, relationship: 'transfer', ...extra,
});

describe('itineraryMapStops', () => {
  describe('isMappableStop', () => {
    it('treats a trail/overlook/visitor center/beach/campground as mappable', () => {
      expect(isMappableStop({ type: 'trail', name: 'Notch Trail' })).toBe(true);
      expect(isMappableStop({ name: 'Sunset overlook' })).toBe(true);
      expect(isMappableStop({ type: 'visitor_center', name: 'Ben Reifel Visitor Center' })).toBe(true);
      expect(isMappableStop({ name: 'Cliff Shelf beach walk' })).toBe(true);
      expect(isMappableStop({ type: 'campground', name: 'Cedar Pass Campground' })).toBe(true);
    });

    it('excludes lunch/rest/flex-time/conditions-check/generic transit', () => {
      expect(isMappableStop({ name: 'Lunch break' })).toBe(false);
      expect(isMappableStop({ type: 'meal', name: 'Picnic' })).toBe(false);
      expect(isMappableStop({ name: 'Check current road conditions' })).toBe(false);
      expect(isMappableStop({ type: 'transport', name: 'Drive to Rapid City' })).toBe(false);
      expect(isMappableStop({ name: 'Rest and recovery' })).toBe(false);
    });
  });

  describe('hasCanonicalCoordinates', () => {
    it('requires finite numeric lat/long, never a truthy non-number', () => {
      expect(hasCanonicalCoordinates({ latitude: 43.75, longitude: -101.94 })).toBe(true);
      expect(hasCanonicalCoordinates({ latitude: null, longitude: -101.94 })).toBe(false);
      expect(hasCanonicalCoordinates({ latitude: '43.75', longitude: -101.94 })).toBe(false);
      expect(hasCanonicalCoordinates({})).toBe(false);
    });
  });

  describe('hasAuthoritativeCoordinates (Phase 9B.1)', () => {
    it('requires coordinates AND a provenance the geographic-authority policy trusts', () => {
      expect(hasAuthoritativeCoordinates({ latitude: 43.75, longitude: -101.94, coordinateSource: 'resolved_metadata' })).toBe(true);
      expect(hasAuthoritativeCoordinates({ latitude: 43.75, longitude: -101.94, coordinateSource: 'trailverse_catalog' })).toBe(true);
      expect(hasAuthoritativeCoordinates({ latitude: 43.75, longitude: -101.94, coordinateSource: 'geocoder' })).toBe(true);
      expect(hasAuthoritativeCoordinates({ latitude: 43.75, longitude: -101.94, coordinateSource: 'stored' })).toBe(true);
    });

    it('a model/tool-emitted coordinate is real data but not map/route authority', () => {
      expect(hasAuthoritativeCoordinates({ latitude: 43.75, longitude: -101.94, coordinateSource: 'tool' })).toBe(false);
    });

    it('an unlabeled or unknown-provenance coordinate is not authoritative either', () => {
      expect(hasAuthoritativeCoordinates({ latitude: 43.75, longitude: -101.94 })).toBe(false);
      expect(hasAuthoritativeCoordinates({ latitude: 43.75, longitude: -101.94, coordinateSource: 'unknown' })).toBe(false);
    });

    it('still requires actual finite coordinates regardless of a trusted-looking source', () => {
      expect(hasAuthoritativeCoordinates({ latitude: null, longitude: null, coordinateSource: 'stored' })).toBe(false);
    });
  });

  describe('stopHasBadgeworthyRequirement', () => {
    it('is true only for action_required/condition_check categories', () => {
      expect(stopHasBadgeworthyRequirement({ requirements: [{ category: 'action_required' }] })).toBe(true);
      expect(stopHasBadgeworthyRequirement({ requirements: [{ category: 'condition_check' }] })).toBe(true);
      expect(stopHasBadgeworthyRequirement({ requirements: [{ category: 'hard_incompatibility' }] })).toBe(false);
      expect(stopHasBadgeworthyRequirement({})).toBe(false);
    });
  });

  describe('buildTripMapModel', () => {
    const PLAN = {
      parkName: 'Badlands National Park',
      days: [
        {
          dayNumber: 1,
          stops: [
            { id: 's1', name: 'Notch Trail', type: 'trail', latitude: 43.75, longitude: -101.94, coordinateSource: 'resolved_metadata' },
            { name: 'Lunch break', type: 'meal' },
            { id: 's3', name: 'Door Trail', type: 'trail' }, // mappable, missing coords
          ],
        },
        {
          dayNumber: 2,
          stops: [
            { id: 's4', name: 'Sage Creek Rim Road', type: 'scenic_drive', latitude: 43.8, longitude: -102.2, coordinateSource: 'trailverse_catalog' },
          ],
        },
      ],
    };

    it('numbers stops per-day starting at 1, matching itinerary card order exactly', () => {
      const model = buildTripMapModel(PLAN);
      expect(model.days[0].stops.map((s) => s.pinNumber)).toEqual([1, 2, 3]);
      expect(model.days[1].stops.map((s) => s.pinNumber)).toEqual([1]);
    });

    it('only carries coordinates through for mappable+coordinate-bearing stops', () => {
      const model = buildTripMapModel(PLAN);
      const [notch, lunch, door] = model.days[0].stops;
      expect(notch.mapped).toBe(true);
      expect(notch.latitude).toBe(43.75);
      expect(lunch.mappable).toBe(false);
      expect(lunch.mapped).toBe(false);
      expect(lunch.latitude).toBeUndefined();
      expect(door.mappable).toBe(true);
      expect(door.mapped).toBe(false); // mappable but no coordinates — degrades gracefully
      expect(door.latitude).toBeUndefined();
    });

    it('Phase 9B.1 — a mappable stop with only tool-authored coordinates is NOT an authoritative pin', () => {
      const planWithToolStop = {
        days: [
          {
            dayNumber: 1,
            stops: [
              { id: 'g1', name: 'Guessed Overlook', type: 'viewpoint', latitude: 43.75, longitude: -101.94, coordinateSource: 'tool' },
            ],
          },
        ],
      };
      const model = buildTripMapModel(planWithToolStop);
      const stop = model.days[0].stops[0];
      expect(stop.mappable).toBe(true);
      expect(stop.mapped).toBe(false); // real data, just not verified enough to plot
      expect(stop.latitude).toBeUndefined();
      expect(stop.longitude).toBeUndefined();
    });

    it('computes the mappable/mapped coverage metric', () => {
      const model = buildTripMapModel(PLAN);
      // mappable: Notch Trail, Door Trail, Sage Creek Rim Road = 3; mapped: Notch, Sage Creek = 2
      expect(model.mappableCount).toBe(3);
      expect(model.mappedCount).toBe(2);
      expect(model.coveragePercent).toBe(67);
      expect(model.hasAnyMappedStop).toBe(true);
    });

    it('is a pure function — recomputing from an updated plan drops stale pins with no leftover state', () => {
      const before = buildTripMapModel(PLAN);
      expect(before.days[1].stops).toHaveLength(1);

      const refinedPlan = {
        ...PLAN,
        days: [
          PLAN.days[0],
          { dayNumber: 2, stops: [{ id: 's5', name: 'Cliff Shelf Nature Trail', type: 'trail', latitude: 43.9, longitude: -101.8, coordinateSource: 'resolved_metadata' }] },
        ],
      };
      const after = buildTripMapModel(refinedPlan);
      expect(after.days[1].stops[0].id).toBe('s5');
      expect(after.days[1].stops[0].name).toBe('Cliff Shelf Nature Trail');
      // Day 1 pins are untouched by the Day-2-only refinement.
      expect(after.days[0].stops.map((s) => s.id)).toEqual(before.days[0].stops.map((s) => s.id));
    });

    it('returns an empty, non-crashing model for a plan with no days', () => {
      const model = buildTripMapModel({ days: [] });
      expect(model.days).toEqual([]);
      expect(model.mappableCount).toBe(0);
      expect(model.hasAnyMappedStop).toBe(false);
    });
  });

  describe('findMapStopById', () => {
    it('finds a stop across days by id, or returns nulls', () => {
      const model = buildTripMapModel({
        days: [{ dayNumber: 1, stops: [{ id: 'a', name: 'A', type: 'trail', latitude: 1, longitude: 2 }] }],
      });
      expect(findMapStopById(model, 'a').stop?.name).toBe('A');
      expect(findMapStopById(model, 'missing').stop).toBeNull();
      expect(findMapStopById(model, null).stop).toBeNull();
    });
  });

  describe('Phase 9D.2 — groups, transfer edges, minutes binding', () => {
    const YOSEMITE = {
      parkName: 'Yosemite National Park',
      days: [{
        id: 'yose-day-1',
        dayNumber: 1,
        activityGroups: [{ id: 'mist-trail', stopIds: ['mist', 'footbridge', 'vernal'] }],
        travelEdges: [transfer('vernal', 'glacier-point')],
        stops: [
          pin('mist', 'Mist Trail', 'trail', 37.7329, -119.5583),
          pin('footbridge', 'Vernal Fall Footbridge', 'landmark', 37.7262, -119.5444),
          pin('vernal', 'Vernal Fall', 'viewpoint', 37.7274, -119.5436),
          pin('glacier-point', 'Glacier Point', 'viewpoint', 37.7307, -119.5733),
        ],
      }],
    };

    const YELLOWSTONE = {
      parkName: 'Yellowstone National Park',
      days: [{
        id: 'yell-day-1',
        dayNumber: 1,
        travelEdges: [
          transfer('old-faithful', 'visitor-center'),
          transfer('norris', 'info-station'),
        ],
        stops: [
          pin('old-faithful', 'Old Faithful', 'landmark', 44.4605, -110.8281),
          pin('visitor-center', 'Old Faithful Visitor Center', 'visitor_center', 44.4616, -110.8297),
          pin('norris', 'Norris Geyser Basin', 'geothermal', 44.7264, -110.7035),
          pin('info-station', 'Norris Information Station', 'visitor_center', 44.7269, -110.7008),
        ],
      }],
    };

    const zionPlan = (minutes) => ({
      parkName: 'Zion National Park',
      days: [{
        id: 'zion-day-1',
        dayNumber: 1,
        travelEdges: [transfer('canyon-overlook', 'parus-trail', { modeIntent: 'drive' })],
        stops: [
          pin('canyon-overlook', 'Canyon Overlook', 'viewpoint', 37.2132, -112.9401),
          pin('parus-trail', "Pa'rus Trail", 'trail', 37.2002, -112.9869, {
            drivingTimeFromPreviousMin: minutes,
          }),
        ],
      }],
    });

    it('Yosemite: three distinct group pins, no internal drawable connector, outgoing transfer only', () => {
      const model = buildTripMapModel(YOSEMITE);
      const day = model.days[0];
      expect(day.stops.filter((s) => s.mapped).map((s) => s.id)).toEqual([
        'mist', 'footbridge', 'vernal', 'glacier-point',
      ]);
      expect(day.stops.map((s) => s.pinNumber)).toEqual([1, 2, 3, 4]);
      expect(day.activityGroups).toEqual([{ id: 'mist-trail', stopIds: ['mist', 'footbridge', 'vernal'] }]);
      expect(day.transferEdges).toHaveLength(1);
      expect(day.transferEdges[0]).toMatchObject({
        sourceStopId: 'vernal', targetStopId: 'glacier-point', minutes: null,
        sourceMapped: true, targetMapped: true,
      });
      expect(isDrawableTransferEdge(day.transferEdges[0], day.activityGroups)).toBe(true);
    });

    it('suppresses a malformed internal activity-group edge without mutating the plan', () => {
      const plan = {
        days: [{
          ...YOSEMITE.days[0],
          travelEdges: [transfer('mist', 'vernal'), transfer('vernal', 'glacier-point')],
        }],
      };
      const snapshot = JSON.stringify(plan);
      const model = buildTripMapModel(plan);
      expect(JSON.stringify(plan)).toBe(snapshot);
      const internal = model.days[0].transferEdges.find((e) => e.targetStopId === 'vernal');
      const outgoing = model.days[0].transferEdges.find((e) => e.targetStopId === 'glacier-point');
      expect(internal).toMatchObject({ sourceMapped: true, targetMapped: true });
      expect(isDrawableTransferEdge(internal, model.days[0].activityGroups)).toBe(false);
      expect(isDrawableTransferEdge(outgoing, model.days[0].activityGroups)).toBe(true);
    });

    it('Yellowstone: independent pins and transfer connectors, never an activity group', () => {
      const model = buildTripMapModel(YELLOWSTONE);
      const day = model.days[0];
      expect(day.activityGroups).toEqual([]);
      expect(day.stops.filter((s) => s.mapped)).toHaveLength(4);
      expect(day.stops.filter((s) => s.type === 'visitor_center').every((s) => s.mapped)).toBe(true);
      expect(day.transferEdges.map((e) => `${e.sourceStopId}->${e.targetStopId}`)).toEqual([
        'old-faithful->visitor-center',
        'norris->info-station',
      ]);
      expect(day.transferEdges.every((e) => isDrawableTransferEdge(e, day.activityGroups))).toBe(true);
      expect(day.transferEdges.every((e) => e.minutes === null)).toBe(true);
    });

    it('Zion unverified drive: two catalog pins, unlabeled drive-intent edge, no minutes', () => {
      const model = buildTripMapModel(zionPlan(null));
      const edge = model.days[0].transferEdges[0];
      expect(model.days[0].stops.filter((s) => s.mapped)).toHaveLength(2);
      expect(edge).toMatchObject({
        sourceStopId: 'canyon-overlook',
        targetStopId: 'parus-trail',
        modeIntent: 'drive',
        minutes: null,
        sourceMapped: true,
        targetMapped: true,
      });
      expect(isDrawableTransferEdge(edge, model.days[0].activityGroups)).toBe(true);
      expect(model.days[0].stops.every((s) => s.drivingTimeFromPreviousMin === undefined)).toBe(true);
    });

    it('legacy predecessor minutes without provider provenance remain hidden', () => {
      const model = buildTripMapModel(zionPlan(18));
      expect(model.days[0].transferEdges[0].minutes).toBeNull();
    });

    it('does not annotate minutes when the edge source is not the target\'s previous stop', () => {
      const model = buildTripMapModel({
        days: [{
          dayNumber: 1,
          travelEdges: [transfer('a', 'c', { modeIntent: 'drive' })],
          stops: [
            pin('a', 'A', 'trail', 37.1, -112.9),
            pin('b', 'B', 'trail', 37.2, -112.8),
            pin('c', 'C', 'trail', 37.3, -112.7, { drivingTimeFromPreviousMin: 18 }),
          ],
        }],
      });
      expect(model.days[0].transferEdges[0]).toMatchObject({
        sourceStopId: 'a', targetStopId: 'c', modeIntent: 'drive', minutes: null,
        sourceMapped: true, targetMapped: true,
      });
    });

    it('does not invent a connector for adjacent mapped stops without a travelEdge', () => {
      const model = buildTripMapModel({
        days: [{
          dayNumber: 1,
          stops: [
            pin('a', 'A', 'trail', 37.1, -112.9),
            pin('b', 'B', 'trail', 37.2, -112.8),
          ],
        }],
      });
      expect(model.days[0].transferEdges).toEqual([]);
    });

    it('marks an edge undrawable when either endpoint lacks authoritative coordinates', () => {
      const model = buildTripMapModel({
        days: [{
          dayNumber: 1,
          travelEdges: [transfer('a', 'b', { modeIntent: 'drive' })],
          stops: [
            pin('a', 'A', 'trail', 37.1, -112.9),
            { id: 'b', name: 'B', type: 'trail', latitude: 37.2, longitude: -112.8, coordinateSource: 'tool' },
          ],
        }],
      });
      const edge = model.days[0].transferEdges[0];
      expect(model.days[0].stops[1].mapped).toBe(false);
      expect(edge).toMatchObject({ sourceMapped: true, targetMapped: false, minutes: null });
      expect(isDrawableTransferEdge(edge, [])).toBe(false);
    });

    it('keeps evidence/route internals out of the presentation model', () => {
      const model = buildTripMapModel({
        days: [{
          dayNumber: 1,
          travelEdges: [transfer('a', 'b')],
          stops: [
            pin('a', 'A', 'trail', 37.1, -112.9, {
              entityId: 'nps:park:zion:place:a',
              destinationEntityId: 'nps:park:zion',
              evidenceId: 'ev:secret',
              routeFingerprint: 'abc',
            }),
            pin('b', 'B', 'trail', 37.2, -112.8),
          ],
        }],
      });
      const serialized = JSON.stringify(model);
      expect(serialized).not.toMatch(/nps:park:zion:place:a/);
      expect(serialized).not.toMatch(/evidenceId/);
      expect(serialized).not.toMatch(/routeFingerprint/);
      expect(serialized).not.toMatch(/destinationEntityId/);
      expect(serialized).not.toMatch(/coordinateSource/);
    });

    it('rebuilds the same pins/edges/minutes from a persisted JSON snapshot (no provider)', () => {
      const persisted = JSON.parse(JSON.stringify(zionPlan(18)));
      expect(buildTripMapModel(persisted)).toEqual(buildTripMapModel(zionPlan(18)));
    });
  });
});

describe('final canonical itinerary contract', () => {
  const stop = id => ({id, type:'viewpoint', name:id, location:{lat:40,lon:-110,source:'resolved_metadata',authority:'official_owner',status:'resolved',sourceRef:`e-${id}`}});
  it('projects source-bound locations and updates from the accepted plan only', () => {
    const plan={days:[{id:'d',stops:[stop('a'),stop('b')]}]};
    expect(buildTripMapModel(plan).mappedCount).toBe(2);
    plan.days[0].stops=[stop('b'),stop('c')];
    const map=buildTripMapModel(plan);
    expect(map.days[0].stops.map(s=>s.id)).toEqual(['b','c']);
    expect(map.days[0].stops[0]).toMatchObject({latitude:40,longitude:-110});
  });
  it('rejects finite coordinates with unknown provenance, without legacy fallback', () => {
    const pin={...stop('a'), latitude:40,longitude:-110,coordinateSource:'stored'};
    pin.location.authority='model';
    expect(hasAuthoritativeCoordinates(pin)).toBe(false);
  });
  it('keeps verified route metrics and explicit unknown transfer status', () => {
    const plan={days:[{id:'d',stops:[stop('a'),stop('b'),stop('c')],travelEdges:[
      {sourceStopId:'a',targetStopId:'b',relationship:'transfer',status:'verified',travelMode:'walking',durationSeconds:600,distanceMeters:700,source:{evidenceId:'route',provider:'google_maps'}},
      {sourceStopId:'b',targetStopId:'c',relationship:'transfer',status:'unverified',durationSeconds:null}
    ]}]};
    const edges=buildTripMapModel(plan).days[0].transferEdges;
    expect(edges[0]).toMatchObject({status:'verified',minutes:10,travelMode:'walking',distanceMeters:700});
    expect(edges[1]).toMatchObject({status:'unverified',minutes:null,durationSeconds:null});
  });
});

it('maps the exact saved backend v2 fixture without a second artifact', async () => {
  const {readFileSync} = await import('node:fs');
  const fixture=JSON.parse(readFileSync((await import('node:path')).resolve(process.cwd(),'../artifacts/trailie-final-merge-gpt61-2026-09-30/contract-fixture.json'),'utf8'));
  const before=JSON.stringify(fixture.canonicalPlan);
  const map=buildTripMapModel(fixture.canonicalPlan);
  expect(map.mappedCount).toBe(2);
  expect(map.days[1].stops[0].id).toBe('s2');
  expect(fixture.canonicalPlan.itineraryHash).toBe(fixture.itineraryHash);
  expect(JSON.stringify(fixture.canonicalPlan)).toBe(before);
});

 it('maps a resolved overnight town as an area, without a fictional hotel identity', () => {
   const town={id:'base',name:'Example Town',type:'custom',placeKind:'area',location:{lat:39.8,lon:-105.5,source:'geocoder',authority:'commercial_structured',status:'resolved',sourceRef:'place:town'}};
   const map=buildTripMapModel({days:[{id:'day',stops:[town]}]});
   expect(map.mappedCount).toBe(1);
   expect(map.days[0].stops[0]).toMatchObject({name:'Example Town',placeKind:'area',type:'custom'});
   town.location.status='unresolved';
   expect(buildTripMapModel({days:[{id:'day',stops:[town]}]}).mappedCount).toBe(0);
 });
