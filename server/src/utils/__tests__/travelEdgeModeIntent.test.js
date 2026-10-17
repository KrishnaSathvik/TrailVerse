'use strict';

/**
 * Phase 9C.1F.2 — optional edge-level transport intent `modeIntent:'drive'`.
 *
 * Canonical same-destination edge becomes
 *   { sourceStopId, targetStopId, relationship:'transfer', modeIntent?:'drive' }
 * `drive` is the ONLY V1 positive mode; unknown is the field being ABSENT.
 *
 * Authority layering:
 *   model  — may propose `drive` for one specific edge (edge-specific intent)
 *   server — keeps it only when the durable Phase-9C.1F.1 policy authorizes:
 *              drivingPolicy === 'prohibited'  → absolute veto
 *              rentalCar === false              → non-authorizing
 *              mode === 'drive' || rentalCar === true → authorized
 *   server — NEVER synthesizes `drive` from availability alone
 *   routing — a preserved modeIntent is planning intent, not route evidence;
 *             Phase 9C.2 must re-check the current policy before any dispatch
 */

jest.mock('node-fetch');
const nodeFetch = require('node-fetch');

const { canAuthorizeDrivingIntent } = require('../transportConstraintContract');
const { normalizeDayTravelEdges, normalizeItineraryTravelEdges } = require('../travelEdgeValidation');
const { applyPlanPatch } = require('../itineraryPlanPatch');
const { finalizeStructuredItinerary } = require('../finalizeItinerary');
const { bindGeneratedItineraryContract } = require('../generationContractBinding');
const { getCreateItineraryTool, PATCH_ITINERARY_TOOL } = require('../itineraryToolSchema');
const { parseConstraints } = require('../constraintEngine');
const { emptyPlanningState } = require('../planningState');
const { normalizeCanonicalBackup } = require('../backupCandidateContext');
const {
  enrichItineraryDrivingTimes,
  hasAuthoritativeDrivingTransition,
} = require('../../services/drivingTimesContextService');

const T = (s, t, extra = {}) => ({ sourceStopId: s, targetStopId: t, relationship: 'transfer', ...extra });
const DRIVE = { modeIntent: 'drive' };

const transport = (overrides = {}) => ({ ...emptyPlanningState().transportation, ...overrides });
const AVAIL_MODE = transport({ mode: 'drive' });
const AVAIL_RENTAL = transport({ rentalCar: true });
const NONE = transport();

function yellDay({ travelEdges, activityGroups, stops } = {}) {
  return {
    id: 'd1', dayNumber: 1, label: 'Upper Geyser Basin + Midway',
    stops: stops || [
      { id: 'old-faithful', order: 0, type: 'geothermal', name: 'Old Faithful', note: 'n', duration: 60, parkCode: 'yell', parkName: 'Yellowstone', latitude: 44.4605, longitude: -110.8281 },
      { id: 'grand-prismatic', order: 1, type: 'geothermal', name: 'Grand Prismatic Spring', note: 'n', duration: 60, parkCode: 'yell', parkName: 'Yellowstone', latitude: 44.5251, longitude: -110.8382 },
    ],
    ...(activityGroups !== undefined ? { activityGroups } : {}),
    ...(travelEdges !== undefined ? { travelEdges } : {}),
  };
}
const artifact = (dayOpts) => ({ intro: 'A geyser morning.', days: [yellDay(dayOpts)] });

const stateAfter = (text, previous = null) => parseConstraints({ planningState: previous }, text).planningState;

// ---------------------------------------------------------------------------
// authorization rule
// ---------------------------------------------------------------------------

describe('canAuthorizeDrivingIntent — pure policy over durable 9C.1F.1 state', () => {
  test('prohibition is an absolute veto, even over stale positive fields', () => {
    expect(canAuthorizeDrivingIntent(transport({ drivingPolicy: 'prohibited', drivingPolicyReason: 'no_car', mode: 'drive', rentalCar: true }))).toBe(false);
    for (const reason of ['no_car', 'no_driving', 'shuttle_only', 'walking_only', 'bike_only']) {
      expect(canAuthorizeDrivingIntent(transport({ drivingPolicy: 'prohibited', drivingPolicyReason: reason, mode: 'drive' }))).toBe(false);
    }
  });
  test('positive availability authorizes: mode=drive or rentalCar=true', () => {
    expect(canAuthorizeDrivingIntent(AVAIL_MODE)).toBe(true);
    expect(canAuthorizeDrivingIntent(AVAIL_RENTAL)).toBe(true);
  });
  test('nothing durable → not authorized; rentalCar=false → not authorized; fly alone → not authorized', () => {
    expect(canAuthorizeDrivingIntent(NONE)).toBe(false);
    expect(canAuthorizeDrivingIntent(null)).toBe(false);
    expect(canAuthorizeDrivingIntent(undefined)).toBe(false);
    expect(canAuthorizeDrivingIntent(transport({ rentalCar: false }))).toBe(false);
    expect(canAuthorizeDrivingIntent(transport({ rentalCar: false, mode: 'drive' }))).toBe(false);
    expect(canAuthorizeDrivingIntent(transport({ mode: 'fly' }))).toBe(false);
  });
  test('(10) tripScope.transportMode is not an input to authorization', () => {
    // The helper only reads planningState.transportation; a tripScope-shaped
    // object carries no authority whatever it says.
    expect(canAuthorizeDrivingIntent({ transportMode: 'drive' })).toBe(false);
    expect(canAuthorizeDrivingIntent({ tripScope: { transportMode: 'drive' } })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (1)–(11) validator behaviour
// ---------------------------------------------------------------------------

describe('normalizeDayTravelEdges — mode intent is authorized, never synthesized', () => {
  test('(1) a transfer with no mode remains valid, with or without policy context', () => {
    expect(normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic')] }))).toEqual([T('old-faithful', 'grand-prismatic')]);
    expect(normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic')] }), { transportation: AVAIL_MODE })).toEqual([T('old-faithful', 'grand-prismatic')]);
    expect(normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic')] }), { transportation: transport({ drivingPolicy: 'prohibited', drivingPolicyReason: 'no_car' }) })).toEqual([T('old-faithful', 'grand-prismatic')]);
  });

  test('(2) model drive intent + mode=drive + no prohibition survives', () => {
    const out = normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] }), { transportation: AVAIL_MODE });
    expect(out).toEqual([T('old-faithful', 'grand-prismatic', DRIVE)]);
    expect(Object.keys(out[0]).sort()).toEqual(['modeIntent', 'relationship', 'sourceStopId', 'targetStopId']);
  });

  test('(3) model drive intent + rentalCar=true survives', () => {
    expect(normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] }), { transportation: AVAIL_RENTAL }))
      .toEqual([T('old-faithful', 'grand-prismatic', DRIVE)]);
  });

  test('(4) availability with no model edge intent does NOT synthesize drive', () => {
    expect(normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic')] }), { transportation: transport({ mode: 'drive', rentalCar: true }) }))
      .toEqual([T('old-faithful', 'grand-prismatic')]);
  });

  test('(5) no positive availability + model drive intent strips the mode but keeps the transfer', () => {
    expect(normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] }), { transportation: NONE }))
      .toEqual([T('old-faithful', 'grand-prismatic')]);
    // No context at all is the same as no authority.
    expect(normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] })))
      .toEqual([T('old-faithful', 'grand-prismatic')]);
  });

  test('(6) drivingPolicy=prohibited strips drive even when mode=drive', () => {
    expect(normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] }), { transportation: transport({ mode: 'drive', drivingPolicy: 'prohibited', drivingPolicyReason: 'no_driving' }) }))
      .toEqual([T('old-faithful', 'grand-prismatic')]);
  });

  test('(7) prohibition strips drive even when rentalCar=true', () => {
    expect(normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] }), { transportation: transport({ rentalCar: true, drivingPolicy: 'prohibited', drivingPolicyReason: 'shuttle_only' }) }))
      .toEqual([T('old-faithful', 'grand-prismatic')]);
  });

  test('(8) rentalCar=false does not authorize drive', () => {
    expect(normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] }), { transportation: transport({ rentalCar: false }) }))
      .toEqual([T('old-faithful', 'grand-prismatic')]);
  });

  test('(9) every prohibition reason vetoes and none creates its own positive edge mode', () => {
    for (const reason of ['shuttle_only', 'walking_only', 'bike_only', 'no_car', 'no_driving']) {
      const out = normalizeDayTravelEdges(
        yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] }),
        { transportation: transport({ mode: 'drive', rentalCar: true, drivingPolicy: 'prohibited', drivingPolicyReason: reason }) }
      );
      expect(out).toEqual([T('old-faithful', 'grand-prismatic')]);
      expect(out[0]).not.toHaveProperty('modeIntent');
    }
  });

  test('(10) tripScope.transportMode=drive alone does not authorize', () => {
    expect(normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] }), { transportation: NONE, tripScope: { transportMode: 'drive' } }))
      .toEqual([T('old-faithful', 'grand-prismatic')]);
  });

  test('(11) unsupported model values are stripped while the transfer remains', () => {
    for (const bad of ['walking', 'walk', 'shuttle', 'transit', 'bike', 'boat', 'unknown', 'DRIVE', '', null, 7, {}]) {
      expect(normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', { modeIntent: bad })] }), { transportation: AVAIL_MODE }))
        .toEqual([T('old-faithful', 'grand-prismatic')]);
    }
    // Any other stray field is still dropped by the minimal reconstruction.
    expect(normalizeDayTravelEdges(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', { modeIntent: 'drive', durationMin: 25, verified: true })] }), { transportation: AVAIL_MODE }))
      .toEqual([T('old-faithful', 'grand-prismatic', DRIVE)]);
  });

  test('(12) structurally invalid edges stay invalid exactly as before, mode or not', () => {
    const stops = [
      { id: 'lodge', order: 0, type: 'lodge', name: 'Many Glacier Hotel', duration: 30, parkCode: 'glac' },
      { id: 'trailhead', order: 1, type: 'trail', name: 'Grinnell Glacier Trailhead', duration: 30, parkCode: 'glac' },
      { id: 'glacier', order: 2, type: 'trail', name: 'Grinnell Glacier', duration: 240, parkCode: 'glac' },
      { id: 'zion', order: 3, type: 'trail', name: 'The Narrows', duration: 120, parkCode: 'zion' },
    ];
    const day = { id: 'd1', dayNumber: 1, stops, activityGroups: [{ id: 'g', stopIds: ['trailhead', 'glacier'] }] };
    const cases = [
      T('trailhead', 'glacier', DRIVE),   // same activity group
      T('glacier', 'zion', DRIVE),        // cross-destination
      T('glacier', 'lodge', DRIVE),       // backward
      T('lodge', 'nowhere', DRIVE),       // dangling
      T('lodge', 'glacier', DRIVE),       // enters group at a non-first member
      { sourceStopId: 'lodge', targetStopId: 'trailhead', relationship: 'drive', modeIntent: 'drive' }, // bad relationship
    ];
    for (const bad of cases) {
      expect(normalizeDayTravelEdges({ ...day, travelEdges: [bad] }, { transportation: AVAIL_MODE })).toEqual([]);
    }
  });

  test('(13) a valid group-boundary edge may carry drive intent only when authorized', () => {
    const stops = [
      { id: 'lodge', order: 0, type: 'lodge', name: 'Many Glacier Hotel', duration: 30, parkCode: 'glac' },
      { id: 'trailhead', order: 1, type: 'trail', name: 'Grinnell Glacier Trailhead', duration: 30, parkCode: 'glac' },
      { id: 'glacier', order: 2, type: 'trail', name: 'Grinnell Glacier', duration: 240, parkCode: 'glac' },
      { id: 'swiftcurrent', order: 3, type: 'lake', name: 'Swiftcurrent Lake', duration: 45, parkCode: 'glac' },
    ];
    const day = {
      id: 'd1', dayNumber: 1, stops,
      activityGroups: [{ id: 'grinnell', stopIds: ['trailhead', 'glacier'] }],
      travelEdges: [T('lodge', 'trailhead', DRIVE), T('glacier', 'swiftcurrent', DRIVE)],
    };
    expect(normalizeDayTravelEdges(day, { transportation: AVAIL_RENTAL }))
      .toEqual([T('lodge', 'trailhead', DRIVE), T('glacier', 'swiftcurrent', DRIVE)]);
    expect(normalizeDayTravelEdges(day, { transportation: transport({ rentalCar: true, drivingPolicy: 'prohibited', drivingPolicyReason: 'no_car' }) }))
      .toEqual([T('lodge', 'trailhead'), T('glacier', 'swiftcurrent')]);
  });

  test('normalizeItineraryTravelEdges threads the same context to every day', () => {
    const data = { days: [yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] }), yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] })] };
    const out = normalizeItineraryTravelEdges(data, { transportation: AVAIL_MODE });
    expect(out.days[0].travelEdges).toEqual([T('old-faithful', 'grand-prismatic', DRIVE)]);
    expect(out.days[1].travelEdges).toEqual([T('old-faithful', 'grand-prismatic', DRIVE)]);
    const stripped = normalizeItineraryTravelEdges(data, { transportation: NONE });
    expect(stripped.days[1].travelEdges).toEqual([T('old-faithful', 'grand-prismatic')]);
  });
});

// ---------------------------------------------------------------------------
// schema — model-authorable, server-validated
// ---------------------------------------------------------------------------

describe('schema exposes modeIntent as optional enum [drive] with conservative guidance', () => {
  const edgesOf = (schema) => schema.properties.days.items.properties.travelEdges;
  const VARIANTS = [
    ['default', {}], ['reduced', { reduced: true }], ['reducedRequireAlternatives', { reduced: true, requireAlternatives: true }],
    ['reducedBindParkIdentity', { reduced: true, bindParkIdentity: true }], ['reducedBindCoordinates', { reduced: true, bindCoordinates: true }],
  ];

  test.each(VARIANTS)('%s: create_itinerary edge items carry optional modeIntent enum [drive] only', (_l, opts) => {
    const items = edgesOf(getCreateItineraryTool(opts).input_schema).items;
    expect(items.properties.modeIntent).toEqual(expect.objectContaining({ type: 'string', enum: ['drive'] }));
    expect(items.required).toEqual(['sourceStopId', 'targetStopId', 'relationship']);
    expect(items.additionalProperties).toBe(false);
    expect(Object.keys(items.properties).sort()).toEqual(['modeIntent', 'relationship', 'sourceStopId', 'targetStopId']);
  });

  test('patch_itinerary day schema exposes the same optional modeIntent', () => {
    const items = PATCH_ITINERARY_TOOL.input_schema.properties.operations.items.properties.day.properties.travelEdges.items;
    expect(items.properties.modeIntent.enum).toEqual(['drive']);
    expect(items.required).not.toContain('modeIntent');
  });

  test('strict rewrite makes modeIntent nullable rather than forcing a mode on every edge', () => {
    const items = edgesOf(getCreateItineraryTool({ strict: true }).input_schema).items;
    expect(items.properties.modeIntent.type).toEqual(['string', 'null']);
    expect(items.properties.modeIntent.enum).toEqual(['drive', null]);
  });

  test('guidance: author drive only for an intentional private-vehicle transfer with explicit traveler support; omit when uncertain', () => {
    const edges = edgesOf(getCreateItineraryTool().input_schema);
    const guidance = [edges.description, edges.items.properties.modeIntent.description].join(' ');
    expect(guidance).toMatch(/private vehicle/i);
    expect(guidance).toMatch(/traveler (context|has said|explicitly)/i);
    expect(guidance).toMatch(/omit/i);
    expect(guidance).toMatch(/uncertain|unsure|not sure/i);
    expect(guidance).toMatch(/do not (infer|assume|add) (driving|drive|it)[^.]*(far apart|distance|apart)/i);
    expect(guidance).toMatch(/national park/i);
    expect(guidance).toMatch(/walk/i);
    expect(guidance).toMatch(/could (theoretically )?be driven|route (could|would) exist|route (is )?available/i);
    // Existing 9C.1D.3 pins must still hold: an edge itself never says how.
    expect(edges.description).toMatch(/not how|never how|does not say how/i);
    expect(edges.description).toMatch(/route is feasible|route feasibility/i);
  });
});

// ---------------------------------------------------------------------------
// (14)(15) patch behaviour
// ---------------------------------------------------------------------------

describe('applyPlanPatch revalidates mode intent against the supplied policy', () => {
  const planWith = (stops, travelEdges) => ({ intro: 'x', days: [{ day: 1, dayNumber: 1, stops, ...(travelEdges ? { travelEdges } : {}) }] });
  const stops = () => [{ id: 'a', name: 'A', duration: 20, parkCode: 'yell' }, { id: 'b', name: 'B', duration: 30, parkCode: 'yell' }];
  const patch = (operations) => ({ response: 'ok', operations });

  test('(14) update_day with model drive intent keeps it only under an authorizing policy', () => {
    const op = patch([{ op: 'update_day', dayNumber: 1, day: { day: 1, dayNumber: 1, stops: stops(), travelEdges: [T('a', 'b', DRIVE)] } }]);
    const ok = applyPlanPatch({ priorPlan: planWith(stops()), planPatch: op, transportation: AVAIL_MODE });
    expect(ok.ok).toBe(true);
    expect(ok.plan.days[0].travelEdges).toEqual([T('a', 'b', DRIVE)]);

    const vetoed = applyPlanPatch({ priorPlan: planWith(stops()), planPatch: op, transportation: transport({ mode: 'drive', drivingPolicy: 'prohibited', drivingPolicyReason: 'no_car' }) });
    expect(vetoed.ok).toBe(true);
    expect(vetoed.plan.days[0].travelEdges).toEqual([T('a', 'b')]);

    const noContext = applyPlanPatch({ priorPlan: planWith(stops()), planPatch: op });
    expect(noContext.ok).toBe(true);
    expect(noContext.plan.days[0].travelEdges).toEqual([T('a', 'b')]);
  });

  test('(15) unrelated update_stop / reorder preserves a structurally valid edge and re-authorizes its mode', () => {
    const prior = planWith(stops(), [T('a', 'b', DRIVE)]);
    const upd = applyPlanPatch({ priorPlan: prior, planPatch: patch([{ op: 'update_stop', dayNumber: 1, stopId: 'b', stop: { duration: 45 } }]), transportation: AVAIL_RENTAL });
    expect(upd.plan.days[0].travelEdges).toEqual([T('a', 'b', DRIVE)]);

    // The same touch under a now-prohibited policy strips the stale mode, keeps the edge.
    const updProhibited = applyPlanPatch({ priorPlan: prior, planPatch: patch([{ op: 'update_stop', dayNumber: 1, stopId: 'b', stop: { duration: 45 } }]), transportation: transport({ rentalCar: true, drivingPolicy: 'prohibited', drivingPolicyReason: 'no_car' }) });
    expect(updProhibited.plan.days[0].travelEdges).toEqual([T('a', 'b')]);

    const flipped = applyPlanPatch({ priorPlan: prior, planPatch: patch([{ op: 'reorder_stops', dayNumber: 1, stopOrder: ['b', 'a'] }]), transportation: AVAIL_RENTAL });
    expect(flipped.plan.days[0].travelEdges).toEqual([]);
  });

  test('an untouched day keeps its persisted edge byte-for-byte (no historical rewrite)', () => {
    const prior = {
      intro: 'x',
      days: [
        { day: 1, dayNumber: 1, stops: stops(), travelEdges: [T('a', 'b', DRIVE)] },
        { day: 2, dayNumber: 2, stops: [{ id: 'c', name: 'C', duration: 20, parkCode: 'yell' }] },
      ],
    };
    const res = applyPlanPatch({ priorPlan: prior, planPatch: patch([{ op: 'update_stop', dayNumber: 2, stopId: 'c', stop: { duration: 45 } }]), transportation: transport({ drivingPolicy: 'prohibited', drivingPolicyReason: 'no_car' }) });
    expect(res.ok).toBe(true);
    expect(res.plan.days[0].travelEdges).toEqual([T('a', 'b', DRIVE)]);
  });
});

// ---------------------------------------------------------------------------
// (16)(17)(18) finalization under real cross-turn planning state
// ---------------------------------------------------------------------------

describe('finalizeStructuredItinerary reads the policy from constraints.planningState', () => {
  const finalizeWith = async (planningState, dayOpts) => {
    const bound = bindGeneratedItineraryContract({ itineraryData: artifact(dayOpts) });
    return finalizeStructuredItinerary({ itineraryData: bound, constraints: { planningState } });
  };

  test('(16) no-car continuation followed by refinement strips newly-authored drive mode', async () => {
    const turn1 = stateAfter("Road trip to Yellowstone, we'll have a rental car.");
    const turn2 = stateAfter("Actually, we won't have a car.", turn1);
    const turn3 = stateAfter('Make day 1 lighter.', turn2);
    const res = await finalizeWith(turn3, { travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] });
    expect(res.itineraryData.days[0].travelEdges).toEqual([T('old-faithful', 'grand-prismatic')]);
  });

  test('(17) later explicit car restoration allows a newly authored drive intent but does not synthesize one', async () => {
    const turn1 = stateAfter("We won't have a car.");
    const turn2 = stateAfter("Actually we're renting a car.", turn1);
    const authored = await finalizeWith(turn2, { travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] });
    expect(authored.itineraryData.days[0].travelEdges).toEqual([T('old-faithful', 'grand-prismatic', DRIVE)]);
    const unauthored = await finalizeWith(turn2, { travelEdges: [T('old-faithful', 'grand-prismatic')] });
    expect(unauthored.itineraryData.days[0].travelEdges).toEqual([T('old-faithful', 'grand-prismatic')]);
  });

  test('(18) maxDailyDriveMinutes neither authorizes nor vetoes drive intent', async () => {
    const capOnly = stateAfter('No more than 3 hours of driving per day.');
    expect(capOnly.preferences.maxDailyDriveMinutes).toBe(180);
    const res = await finalizeWith(capOnly, { travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] });
    expect(res.itineraryData.days[0].travelEdges).toEqual([T('old-faithful', 'grand-prismatic')]);

    const capAndRental = stateAfter("We'll have a rental car, no more than 3 hours of driving per day.");
    const res2 = await finalizeWith(capAndRental, { travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] });
    expect(res2.itineraryData.days[0].travelEdges).toEqual([T('old-faithful', 'grand-prismatic', DRIVE)]);
    expect(capAndRental.preferences.maxDailyDriveMinutes).toBe(180);
  });

  test('durable mode=drive is sourced only from an explicit road-trip contract, not the broad tripScope regex', () => {
    expect(stateAfter('Keep the driving realistic.').transportation.mode).toBeNull();
    expect(stateAfter('No more than 3 hours of driving per day.').transportation.mode).toBeNull();
    expect(stateAfter('Is the road to Logan Pass open?').transportation.mode).toBeNull();
    expect(stateAfter('Road trip from Denver to Yellowstone.').transportation.mode).toBe('drive');
    expect(stateAfter('Road trip from Denver to Yellowstone.').tripScope.type).toBe('road_trip');
  });

  test('constraints without planningState → no authority → mode stripped, transfer kept', async () => {
    const bound = bindGeneratedItineraryContract({ itineraryData: artifact({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] }) });
    const res = await finalizeStructuredItinerary({ itineraryData: bound });
    expect(res.itineraryData.days[0].travelEdges).toEqual([T('old-faithful', 'grand-prismatic')]);
  });
});

// ---------------------------------------------------------------------------
// (19)(20) zero routing, persistence
// ---------------------------------------------------------------------------

describe('(19) a validated drive-intent edge is still not routing authority', () => {
  let savedKey;
  beforeEach(() => { savedKey = process.env.GMAPS_SERVER_KEY; process.env.GMAPS_SERVER_KEY = 'test-key'; nodeFetch.mockClear(); });
  afterEach(() => { if (savedKey) process.env.GMAPS_SERVER_KEY = savedKey; else delete process.env.GMAPS_SERVER_KEY; });

  test('finalization with the real driving-times enricher makes zero Distance Matrix requests', async () => {
    const bound = bindGeneratedItineraryContract({ itineraryData: artifact({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] }) });
    const res = await finalizeStructuredItinerary({
      itineraryData: bound,
      constraints: { planningState: { ...emptyPlanningState(), transportation: AVAIL_MODE } },
      enrichDrivingTimes: (data, prefix) => enrichItineraryDrivingTimes(data, prefix),
    });
    expect(res.itineraryData.days[0].travelEdges).toEqual([T('old-faithful', 'grand-prismatic', DRIVE)]);
    expect(nodeFetch).not.toHaveBeenCalled();
    expect(res.itineraryData.days[0].stops[1].drivingTimeFromPreviousMin ?? null).toBeNull();
  });

  test('hasAuthoritativeDrivingTransition stays false for a drive-intent edge', () => {
    const day = yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] });
    expect(hasAuthoritativeDrivingTransition(day, day.stops[0], day.stops[1])).toBe(false);
  });
});

describe('(20) persistence preserves an accepted modeIntent without treating it as evidence', () => {
  test('canonical-backup normalization round-trips the field and adds nothing', () => {
    const data = artifact({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] });
    const out = normalizeCanonicalBackup(data);
    expect(out.days[0].travelEdges).toEqual([T('old-faithful', 'grand-prismatic', DRIVE)]);
    expect(Object.keys(out.days[0].travelEdges[0]).sort()).toEqual(['modeIntent', 'relationship', 'sourceStopId', 'targetStopId']);
  });

  test('a restored edge re-normalized under a prohibition loses only its mode (the 9C.2 invariant)', () => {
    const restored = JSON.parse(JSON.stringify(yellDay({ travelEdges: [T('old-faithful', 'grand-prismatic', DRIVE)] })));
    expect(normalizeDayTravelEdges(restored, { transportation: transport({ drivingPolicy: 'prohibited', drivingPolicyReason: 'no_car' }) }))
      .toEqual([T('old-faithful', 'grand-prismatic')]);
    expect(normalizeDayTravelEdges(restored, { transportation: AVAIL_MODE }))
      .toEqual([T('old-faithful', 'grand-prismatic', DRIVE)]);
  });
});
