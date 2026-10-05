'use strict';

/**
 * TIER-1 GENERATION CONTRACT REDUCTION.
 *
 * The CANONICAL itinerary shape is unchanged. Only what the MODEL is asked to
 * author shrinks; the server restores every removed field deterministically
 * before the first consumer that reads it.
 *
 * These tests pin both halves: the smaller generation schema, and the
 * restoration that keeps the canonical artifact identical.
 */

const fs = require('fs');
const path = require('path');

const {
  BASE_ITINERARY_SCHEMA,
  CREATE_ITINERARY_TOOL,
  PATCH_ITINERARY_TOOL,
  getCreateItineraryTool,
} = require('../itineraryToolSchema');
const {
  TIER1_MODEL_OWNED_STOP_FIELDS,
  bindGeneratedItineraryContract,
  resolveParkIdentityBinding,
} = require('../generationContractBinding');

const fullStopSchema = CREATE_ITINERARY_TOOL
  .input_schema.properties.days.items.properties.stops.items;

function stopSchemaOf(tool) {
  return tool.input_schema.properties.days.items.properties.stops.items;
}

// ---------------------------------------------------------------------------
// B — what the model is no longer asked to author
// ---------------------------------------------------------------------------

describe('reduced create_itinerary generation contract', () => {
  const reduced = stopSchemaOf(getCreateItineraryTool({
    reduced: true,
    bindParkIdentity: true,
  }));

  test('drops the derived and server-known stop fields', () => {
    for (const field of [
      'startTime',
      'drivingTimeFromPreviousMin',
      'physicalDifficulty',
      'parkCode',
      'parkName',
    ]) {
      expect(reduced.properties[field]).toBeUndefined();
    }
  });

  /**
   * MEASURED, NOT ASSUMED. The audit's premise was that the known-stop catalog
   * and evidence would supply coordinates the model stopped emitting. Replaying
   * the captured corpus falsified that: 20 of the 36 stops that carried
   * coordinates cannot be reproduced from the catalog, and a stop without
   * numeric coordinates renders no map pin and no maps link.
   */
  test('coordinates stay model-authored unless the lever is explicitly set', () => {
    expect(reduced.properties.latitude).toEqual(fullStopSchema.properties.latitude);
    expect(reduced.properties.longitude).toEqual(fullStopSchema.properties.longitude);

    const withLever = stopSchemaOf(getCreateItineraryTool({
      reduced: true, bindParkIdentity: true, bindCoordinates: true,
    }));
    expect(withLever.properties.latitude).toBeUndefined();
    expect(withLever.properties.longitude).toBeUndefined();
  });

  test('startTime is no longer a required stop field', () => {
    expect(fullStopSchema.required).toContain('startTime');
    expect(reduced.required).toEqual(['id', 'order', 'type', 'name', 'note', 'duration']);
  });

  test('coordinateSource stays unauthorable — additionalProperties is closed', () => {
    expect(reduced.additionalProperties).toBe(false);
    expect(reduced.properties.coordinateSource).toBeUndefined();
    // It was never in the contract; finalizeItinerary has always owned it.
    expect(fullStopSchema.properties.coordinateSource).toBeUndefined();
  });

  // J — note/why quality lock. Not shortened, not reworded, not removed.
  test('traveler-value and evidence-bound fields are byte-identical to the full contract', () => {
    for (const field of [
      'note',
      'why',
      'difficulty',
      'exposureLevel',
      'walkingDistanceMiles',
      'timeWindow',
      'latitude',
      'longitude',
      'id',
      'order',
      'type',
      'name',
      'duration',
      'alternatives',
    ]) {
      expect(reduced.properties[field]).toEqual(fullStopSchema.properties[field]);
    }
  });

  test('plan-level prose and day shape are untouched', () => {
    const tool = getCreateItineraryTool({ reduced: true, bindParkIdentity: true });
    expect(tool.input_schema.properties.intro)
      .toEqual(CREATE_ITINERARY_TOOL.input_schema.properties.intro);
    expect(tool.input_schema.properties.narrativeSections)
      .toEqual(CREATE_ITINERARY_TOOL.input_schema.properties.narrativeSections);
    // The required SET is what this test cares about. Its ORDER carries the
    // days-first production-order signal (2026-08-27) and is asserted there.
    expect([...tool.input_schema.required].sort()).toEqual(['days', 'intro']);
    expect(tool.input_schema.required[0]).toBe('days');

    const day = tool.input_schema.properties.days.items;
    const fullDay = CREATE_ITINERARY_TOOL.input_schema.properties.days.items;
    expect(day.required).toEqual(fullDay.required);
    expect(day.properties.overnightLocation).toEqual(fullDay.properties.overnightLocation);
  });

  test('the reduced contract still supports a required backup plan', () => {
    const tool = getCreateItineraryTool({
      reduced: true,
      bindParkIdentity: true,
      requireAlternatives: true,
    });
    expect(tool.input_schema.required).toContain('alternatives');
    expect(tool.input_schema.properties.alternatives.minItems).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// D / L — the multi-destination branch keeps model-authored park identity
// ---------------------------------------------------------------------------

describe('park identity branch', () => {
  test('without a server binding the model still authors stop-level park identity', () => {
    const reduced = stopSchemaOf(getCreateItineraryTool({
      reduced: true,
      bindParkIdentity: false,
    }));
    expect(reduced.properties.parkCode).toEqual(fullStopSchema.properties.parkCode);
    expect(reduced.properties.parkName).toEqual(fullStopSchema.properties.parkName);
    // The rest of Tier 1 is still removed on a multi-park turn.
    expect(reduced.properties.startTime).toBeUndefined();
    expect(reduced.properties.physicalDifficulty).toBeUndefined();
    expect(reduced.properties.drivingTimeFromPreviousMin).toBeUndefined();
  });

  test('a single resolved NPS destination produces a binding', () => {
    const binding = resolveParkIdentityBinding({
      resolvedEntities: [{ entityId: 'nps:park:thro', displayName: 'Theodore Roosevelt National Park' }],
      primaryPark: { parkCode: 'thro', parkName: 'Theodore Roosevelt National Park' },
      destinationCount: 1,
    });
    expect(binding).toEqual({ parkCode: 'thro', parkName: 'Theodore Roosevelt National Park' });
  });

  test('two resolved destinations produce no binding', () => {
    expect(resolveParkIdentityBinding({
      resolvedEntities: [
        { entityId: 'nps:park:yose' },
        { entityId: 'nps:park:sequ' },
      ],
      primaryPark: { parkCode: 'yose', parkName: 'Yosemite National Park' },
      destinationCount: 2,
    })).toBeNull();
  });

  test('a park plus a non-park destination produces no binding', () => {
    expect(resolveParkIdentityBinding({
      resolvedEntities: [
        { entityId: 'nps:park:zion' },
        { entityId: 'place:known:valley-of-fire' },
      ],
      primaryPark: { parkCode: 'zion', parkName: 'Zion National Park' },
      destinationCount: 2,
    })).toBeNull();
  });

  test('a resolved destination that is not the primary park produces no binding', () => {
    expect(resolveParkIdentityBinding({
      resolvedEntities: [{ entityId: 'place:known:valley-of-fire' }],
      primaryPark: { parkCode: 'zion', parkName: 'Zion National Park' },
      destinationCount: 1,
    })).toBeNull();
  });

  test('an unresolved destination produces no binding', () => {
    expect(resolveParkIdentityBinding({})).toBeNull();
    expect(resolveParkIdentityBinding(null)).toBeNull();
    expect(resolveParkIdentityBinding({ primaryPark: { parkName: 'Somewhere' } })).toBeNull();
  });

  test('a declared destinationCount above one overrides a single resolved entity', () => {
    expect(resolveParkIdentityBinding({
      resolvedEntities: [{ entityId: 'nps:park:grca' }],
      primaryPark: { parkCode: 'grca', parkName: 'Grand Canyon National Park' },
      destinationCount: 3,
    })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C / F / G / H / I — server restoration of every removed field
// ---------------------------------------------------------------------------

describe('server restoration of the reduced model artifact', () => {
  function reducedPlan() {
    return {
      intro: 'Two easy days.',
      days: [{
        id: 'day-1',
        dayNumber: 1,
        label: 'Day 1',
        stops: [
          {
            id: 's1-1',
            order: 0,
            type: 'visitor_center',
            name: 'Painted Canyon Visitor Center',
            note: 'Start here for the overlook.',
            why: 'It orients the drive without any exertion.',
            duration: 45,
            timeWindow: 'Morning',
            difficulty: 'easy',
            exposureLevel: 'low',
          },
          {
            id: 's1-2',
            order: 1,
            type: 'trail',
            name: 'Wind Canyon Trail',
            note: 'Short loop above the river bend.',
            duration: 40,
            difficulty: 'moderate',
          },
        ],
      }],
    };
  }

  test('the exported field list is exactly the Tier-1 set', () => {
    expect([...TIER1_MODEL_OWNED_STOP_FIELDS].sort()).toEqual([
      'drivingTimeFromPreviousMin',
      'physicalDifficulty',
      'startTime',
    ]);
  });

  test('startTime is restored to the canonical empty string, never a clock time', () => {
    const bound = bindGeneratedItineraryContract({ itineraryData: reducedPlan() });
    for (const stop of bound.days[0].stops) {
      expect(stop.startTime).toBe('');
    }
  });

  test('drive time is restored as a canonical null', () => {
    const bound = bindGeneratedItineraryContract({ itineraryData: reducedPlan() });
    for (const stop of bound.days[0].stops) {
      expect(stop.drivingTimeFromPreviousMin).toBeNull();
    }
  });

  /**
   * Phase 9B.1 — absent and explicit-null coordinates are now treated the
   * SAME by `enrichKnownStopLocations`: neither carries authoritative
   * provenance (no `coordinateSource` at all), so both let the trusted
   * catalog attempt resolution. Before 9B.1, `Number(null) === 0` was
   * quietly "finite," which made an explicit null skip the catalog
   * entirely while an absent key did not — an accidental asymmetry, not a
   * deliberate design. `finalizeItinerary` still produces the canonical
   * null downstream regardless.
   */
  test('coordinates are left absent so catalog enrichment still runs', () => {
    const bound = bindGeneratedItineraryContract({ itineraryData: reducedPlan() });
    for (const stop of bound.days[0].stops) {
      expect(Object.prototype.hasOwnProperty.call(stop, 'latitude')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(stop, 'longitude')).toBe(false);
    }

    const { enrichKnownStopLocations } = require('../knownOutdoorLocations');
    const nulled = JSON.parse(JSON.stringify(bound));
    for (const stop of nulled.days[0].stops) { stop.latitude = null; stop.longitude = null; }
    const fromAbsent = enrichKnownStopLocations(JSON.parse(JSON.stringify(bound)));
    const fromNull = enrichKnownStopLocations(nulled);
    expect(fromAbsent.every((d) => d.locationResolutionSource !== undefined)).toBe(true);
    // Explicit null now behaves identically to absent — same catalog attempt,
    // same diagnostics, not silently skipped.
    expect(fromNull).toEqual(fromAbsent);
  });

  test('binding never stamps coordinateSource — finalizeItinerary owns provenance', () => {
    const bound = bindGeneratedItineraryContract({ itineraryData: reducedPlan() });
    for (const stop of bound.days[0].stops) {
      expect(Object.prototype.hasOwnProperty.call(stop, 'coordinateSource')).toBe(false);
    }
  });

  /**
   * COMPATIBILITY PROJECTION, NOT A SEMANTIC CLAIM.
   *
   * `physicalDifficulty` was identical to `difficulty` on 111/111 stops that
   * carried both, and its only reader is an eval-capture alias fallback. The
   * projection preserves that observed behavior. If `physicalDifficulty` is
   * ever given an independent meaning, this projection must be revisited
   * deliberately — the pins below exist so that cannot happen silently.
   */
  test('physicalDifficulty is projected from difficulty as a compatibility alias', () => {
    const bound = bindGeneratedItineraryContract({ itineraryData: reducedPlan() });
    expect(bound.days[0].stops[0].physicalDifficulty).toBe('easy');
    expect(bound.days[0].stops[1].physicalDifficulty).toBe('moderate');
  });

  test('physicalDifficulty is null when the model states no difficulty', () => {
    const plan = reducedPlan();
    delete plan.days[0].stops[0].difficulty;
    const bound = bindGeneratedItineraryContract({ itineraryData: plan });
    expect(bound.days[0].stops[0].difficulty).toBeUndefined();
    expect(bound.days[0].stops[0].physicalDifficulty).toBeNull();
  });

  test('the only real consumer — the capture alias — still resolves', () => {
    const { sanitizeStop } = require('../planStageCapture');
    const bound = bindGeneratedItineraryContract({ itineraryData: reducedPlan() });
    // planStageCapture reads `stop.difficulty || stop.physicalDifficulty`.
    // Both stay readable and equal, so the capture is unchanged.
    expect(bound.days[0].stops.map((stop) => sanitizeStop(stop).difficulty))
      .toEqual(['easy', 'moderate']);
  });

  test('no new source file starts reading physicalDifficulty', () => {
    // §F pin: a future traveler-fit design giving this field independent meaning
    // must revisit the projection instead of silently inheriting an alias.
    const srcRoot = path.resolve(__dirname, '..', '..');
    const hits = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
          walk(full);
        } else if (entry.name.endsWith('.js')
          && fs.readFileSync(full, 'utf8').includes('physicalDifficulty')) {
          hits.push(path.relative(srcRoot, full));
        }
      }
    };
    walk(srcRoot);

    expect(hits.sort()).toEqual([
      // Writer of the compatibility projection.
      'utils/generationContractBinding.js',
      // Generic field-name lists that guard the field, never read its meaning.
      'utils/itineraryPlanPatch.js',
      'utils/itineraryToolSchema.js',
      'utils/mutationSummary.js',
      'utils/refinementScope.js',
      'utils/stopMutationScope.js',
      // The one real reader: an eval-capture alias fallback.
      'utils/planStageCapture.js',
    ].sort());
  });

  test('values the model did supply are never overwritten', () => {
    const plan = reducedPlan();
    plan.days[0].stops[0].latitude = 46.89;
    plan.days[0].stops[0].longitude = -103.38;
    plan.days[0].stops[0].startTime = '07:30';
    plan.days[0].stops[0].drivingTimeFromPreviousMin = 25;
    plan.days[0].stops[0].physicalDifficulty = 'strenuous';

    const bound = bindGeneratedItineraryContract({ itineraryData: plan });
    const stop = bound.days[0].stops[0];
    expect(stop.latitude).toBe(46.89);
    expect(stop.longitude).toBe(-103.38);
    expect(stop.startTime).toBe('07:30');
    expect(stop.drivingTimeFromPreviousMin).toBe(25);
    expect(stop.physicalDifficulty).toBe('strenuous');
  });

  test('binding does not mutate the caller\'s artifact', () => {
    const plan = reducedPlan();
    const before = JSON.stringify(plan);
    bindGeneratedItineraryContract({ itineraryData: plan });
    expect(JSON.stringify(plan)).toBe(before);
  });

  test('note, why and evidence-bound fields pass through unchanged', () => {
    const bound = bindGeneratedItineraryContract({ itineraryData: reducedPlan() });
    const stop = bound.days[0].stops[0];
    expect(stop.note).toBe('Start here for the overlook.');
    expect(stop.why).toBe('It orients the drive without any exertion.');
    expect(stop.difficulty).toBe('easy');
    expect(stop.exposureLevel).toBe('low');
    expect(stop.timeWindow).toBe('Morning');
  });

  test('a malformed or empty artifact is returned untouched', () => {
    expect(bindGeneratedItineraryContract({ itineraryData: null })).toBeNull();
    expect(bindGeneratedItineraryContract({ itineraryData: { days: [] } })).toEqual({ days: [] });
  });
});

// ---------------------------------------------------------------------------
// D / L — park identity injection, and the multi-park control
// ---------------------------------------------------------------------------

describe('deterministic park identity injection', () => {
  function plan(stops) {
    return { days: [{ id: 'day-1', dayNumber: 1, label: 'Day 1', stops }] };
  }

  test('a single-destination binding stamps park identity on park stops', () => {
    const bound = bindGeneratedItineraryContract({
      itineraryData: plan([
        { id: 's1', order: 0, type: 'trail', name: 'Wind Canyon Trail', note: 'x', duration: 40 },
        { id: 's2', order: 1, type: 'scenic_drive', name: 'Scenic Loop Drive', note: 'y', duration: 90 },
      ]),
      parkIdentityBinding: { parkCode: 'thro', parkName: 'Theodore Roosevelt National Park' },
    });
    for (const stop of bound.days[0].stops) {
      expect(stop.parkCode).toBe('thro');
      expect(stop.parkName).toBe('Theodore Roosevelt National Park');
    }
  });

  test('injection uses the resolved display name, not only the code lookup table', () => {
    const bound = bindGeneratedItineraryContract({
      itineraryData: plan([
        { id: 's1', order: 0, type: 'historic', name: 'Lighthouse overlook', note: 'x', duration: 60 },
      ]),
      // A site code the national-park name table does not carry.
      parkIdentityBinding: { parkCode: 'came', parkName: 'Cape Meares' },
    });
    expect(bound.days[0].stops[0].parkCode).toBe('came');
    expect(bound.days[0].stops[0].parkName).toBe('Cape Meares');
  });

  test('stops that are never inside a park boundary stay unassigned', () => {
    const bound = bindGeneratedItineraryContract({
      itineraryData: plan([
        { id: 's1', order: 0, type: 'restaurant', name: 'Medora diner', note: 'x', duration: 60 },
        { id: 's2', order: 1, type: 'lodging', name: 'Rough Riders Hotel', note: 'y', duration: 30 },
      ]),
      parkIdentityBinding: { parkCode: 'thro', parkName: 'Theodore Roosevelt National Park' },
    });
    expect(bound.days[0].stops[0].parkCode).toBeNull();
    expect(bound.days[0].stops[1].parkCode).toBeNull();
  });

  /**
   * L — MULTI-PARK CONTROL. The corpus contains 0/20 multi-park plans, so this
   * branch is unexercised by real traffic and must be proven by construction:
   * a plan spanning two parks must never receive one park's identity.
   */
  test('a multi-park plan cannot receive a single-destination identity', () => {
    const multiPark = {
      days: [
        {
          id: 'day-1',
          dayNumber: 1,
          label: 'Day 1 — Olympic',
          stops: [{ id: 's1', order: 0, type: 'trail', name: 'Hall of Mosses', note: 'x', duration: 60, parkCode: 'olym', parkName: 'Olympic National Park' }],
        },
        {
          id: 'day-2',
          dayNumber: 2,
          label: 'Day 2 — Glacier',
          stops: [{ id: 's2', order: 0, type: 'viewpoint', name: 'Logan Pass', note: 'y', duration: 90, parkCode: 'glac', parkName: 'Glacier National Park' }],
        },
      ],
    };

    // No binding is resolvable for a two-destination turn…
    const binding = resolveParkIdentityBinding({
      resolvedEntities: [{ entityId: 'nps:park:olym' }, { entityId: 'nps:park:glac' }],
      primaryPark: { parkCode: 'olym', parkName: 'Olympic National Park' },
      destinationCount: 2,
    });
    expect(binding).toBeNull();

    // …so the model-authored identity is what survives, unchanged.
    const bound = bindGeneratedItineraryContract({
      itineraryData: multiPark,
      parkIdentityBinding: binding,
    });
    expect(bound.days.map((day) => day.stops[0].parkCode)).toEqual(['olym', 'glac']);
  });

  test('without a binding, park identity is left exactly as the model authored it', () => {
    const bound = bindGeneratedItineraryContract({
      itineraryData: plan([
        { id: 's1', order: 0, type: 'trail', name: 'Hall of Mosses', note: 'x', duration: 60 },
      ]),
    });
    expect(Object.prototype.hasOwnProperty.call(bound.days[0].stops[0], 'parkCode')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A / N — the canonical contract and the refinement path are untouched
// ---------------------------------------------------------------------------

describe('untouched contracts', () => {
  test('the canonical base schema still carries every Tier-1 field', () => {
    const base = BASE_ITINERARY_SCHEMA
      .properties.days.items.properties.stops.items;
    for (const field of [
      'startTime', 'latitude', 'longitude',
      'drivingTimeFromPreviousMin', 'physicalDifficulty', 'parkCode', 'parkName',
    ]) {
      expect(base.properties[field]).toBeDefined();
    }
    expect(base.required).toContain('startTime');
  });

  test('the default create_itinerary tool is still the full contract', () => {
    for (const field of [
      'startTime', 'latitude', 'longitude',
      'drivingTimeFromPreviousMin', 'physicalDifficulty', 'parkCode', 'parkName',
    ]) {
      expect(fullStopSchema.properties[field]).toBeDefined();
    }
  });

  test('the refinement patch contract keeps every stop field', () => {
    const patchStop = PATCH_ITINERARY_TOOL
      .input_schema.properties.operations.items.properties.stop;
    for (const field of [
      'startTime', 'latitude', 'longitude',
      'drivingTimeFromPreviousMin', 'physicalDifficulty', 'parkCode', 'parkName',
      'note', 'why', 'difficulty', 'exposureLevel', 'walkingDistanceMiles',
    ]) {
      expect(patchStop.properties[field]).toBeDefined();
    }

    const patchDay = PATCH_ITINERARY_TOOL
      .input_schema.properties.operations.items.properties.day;
    expect(patchDay.properties.stops.items.properties.startTime).toBeDefined();
    expect(patchDay.properties.stops.items.properties.parkCode).toBeDefined();
  });
});
