'use strict';

/**
 * Phase 9C.1D.3 — travel-edge generation activation.
 *
 * Phase 9C.1D.2 built the canonical `day.travelEdges` contract and its
 * validator, but the field was absent from every structured generation schema,
 * so the model had no way to author one: validator-only infrastructure. These
 * tests pin that the SAME minimal shape is now authorable, that the guidance
 * the model reads states the semantic boundaries (not a mode, not a group
 * relationship, not a destination change, not every adjacency), and that the
 * existing validator — not the schema — stays the structural authority.
 */

jest.mock('node-fetch');
const nodeFetch = require('node-fetch');

const {
  BASE_ITINERARY_SCHEMA,
  PATCH_ITINERARY_TOOL,
  getCreateItineraryTool,
} = require('../itineraryToolSchema');
const { bindGeneratedItineraryContract } = require('../generationContractBinding');
const { finalizeStructuredItinerary } = require('../finalizeItinerary');
const { enrichItineraryDrivingTimes } = require('../../services/drivingTimesContextService');

const PRODUCTION_VARIANTS = [
  ['default', {}],
  ['reduced', { reduced: true }],
  ['reducedRequireAlternatives', { reduced: true, requireAlternatives: true }],
  ['reducedBindParkIdentity', { reduced: true, bindParkIdentity: true }],
  ['reducedBindCoordinates', { reduced: true, bindCoordinates: true }],
];

const dayOf = (schema) => schema.properties.days.items;
const edgesOf = (schema) => dayOf(schema).properties.travelEdges;

describe('(1) day.travelEdges is an optional supported structured field', () => {
  test.each(PRODUCTION_VARIANTS)('%s: create_itinerary exposes travelEdges as an optional array', (_l, opts) => {
    const schema = getCreateItineraryTool(opts).input_schema;
    const edges = edgesOf(schema);
    expect(edges).toBeDefined();
    expect(edges.type).toBe('array');
    expect(dayOf(schema).required).not.toContain('travelEdges');
  });

  test('the canonical base schema carries it, so update_day in the patch tool inherits the same shape', () => {
    expect(BASE_ITINERARY_SCHEMA.properties.days.items.properties.travelEdges).toBeDefined();
    const patchDay = PATCH_ITINERARY_TOOL.input_schema.properties.operations.items.properties.day;
    expect(patchDay.properties.travelEdges).toEqual(BASE_ITINERARY_SCHEMA.properties.days.items.properties.travelEdges);
  });

  test('it sits alongside activityGroups on the day, not on stops', () => {
    const day = dayOf(getCreateItineraryTool({ reduced: true }).input_schema);
    const keys = Object.keys(day.properties);
    expect(keys.indexOf('travelEdges')).toBeGreaterThan(keys.indexOf('activityGroups'));
    expect(day.properties.stops.items.properties.travelEdges).toBeUndefined();
  });
});

describe('(2)(3)(4) the edge item is exactly the canonical minimal shape', () => {
  const item = edgesOf(getCreateItineraryTool({ reduced: true }).input_schema).items;

  test('(2) relationship is the single-value enum ["transfer"]', () => {
    expect(item.properties.relationship.type).toBe('string');
    expect(item.properties.relationship.enum).toEqual(['transfer']);
  });

  test('(3) sourceStopId, targetStopId and relationship are all required strings', () => {
    expect([...item.required].sort()).toEqual(['relationship', 'sourceStopId', 'targetStopId']);
    expect(item.properties.sourceStopId.type).toBe('string');
    expect(item.properties.targetStopId.type).toBe('string');
  });

  // Phase 9C.1F.2 — `modeIntent` (optional, enum ['drive']) is the ONE
  // addition since 9C.1D.3; it stays optional and the object stays closed.
  test('(4) no other property is authorable — closed object, three required keys + optional modeIntent', () => {
    expect(item.additionalProperties).toBe(false);
    expect(Object.keys(item.properties).sort()).toEqual(['modeIntent', 'relationship', 'sourceStopId', 'targetStopId']);
    expect(item.required).toEqual(['sourceStopId', 'targetStopId', 'relationship']);
    expect(item.properties.modeIntent.enum).toEqual(['drive']);
  });

  test.each([
    'id', 'edgeId', 'mode', 'travelMode', 'duration', 'durationMin', 'drivingTimeMin',
    'distance', 'distanceMiles', 'verified', 'verificationStatus', 'routeStatus', 'provider',
    'polyline', 'latitude', 'longitude', 'coordinates', 'note',
  ])('(4) %s is not an edge property', (field) => {
    expect(item.properties[field]).toBeUndefined();
  });
});

describe('guidance the model reads (5)–(8)', () => {
  const edges = edgesOf(getCreateItineraryTool({ reduced: true }).input_schema);
  const guidance = [
    edges.description,
    edges.items.properties.sourceStopId.description,
    edges.items.properties.targetStopId.description,
    edges.items.properties.relationship.description,
  ].filter(Boolean).join(' ');

  test('the edge means a transfer between independent experiences, and says nothing about how', () => {
    expect(guidance).toMatch(/independent experiences/i);
    expect(guidance).toMatch(/not how|never how|does not say how/i);
    // Every mode / measurement the edge must not be read as asserting is named as NOT asserted.
    for (const word of ['driving', 'walking', 'shuttle', 'transit', 'duration', 'distance']) {
      expect(guidance.toLowerCase()).toContain(word);
    }
    expect(guidance).toMatch(/route is feasible|route feasibility/i);
  });

  test('(5) distinguishes transfer edges from continuous activityGroups', () => {
    expect(guidance).toMatch(/activityGroups?/);
    expect(guidance).toMatch(/continuous/i);
  });

  test('(6) forbids an edge between members of one activity group, and states the entry/exit boundary', () => {
    expect(guidance).toMatch(/never (author|add) an edge between (two )?stops (in|of) the same activity group/i);
    expect(guidance).toMatch(/first stop/i);
    expect(guidance).toMatch(/last stop/i);
  });

  test('(7) keeps destination changes out of stop-level edges', () => {
    expect(guidance).toMatch(/different destination/i);
    expect(guidance).toMatch(/(do not|never) author an edge for that change/i);
    // No separate parkCode heuristic is taught — the validator owns destination identity.
    expect(guidance).not.toMatch(/parkCode/);
  });

  test('(8) does not require an edge for every adjacency, and permits none', () => {
    expect(guidance).toMatch(/not (needed|required) for every pair of consecutive stops/i);
    expect(guidance).toMatch(/omit/i);
    // Never the mechanical instruction.
    expect(guidance).not.toMatch(/(create|add|author) an edge (between|for) (each|every) (pair|adjacent)/i);
  });

  test('guidance states the ordering rule the validator enforces (source earlier than target)', () => {
    expect(guidance).toMatch(/earlier/i);
  });
});

describe('strict representation (experiment, default OFF)', () => {
  test('non-strict production description carries no strict-only text', () => {
    const desc = edgesOf(getCreateItineraryTool({ reduced: true }).input_schema).description;
    expect(desc).not.toMatch(/SCHEMA-REQUIRED/);
  });

  test('strict forces presence, so it is told [] is correct and not to invent edges to fill it', () => {
    const edges = edgesOf(getCreateItineraryTool({ reduced: true, strict: true }).input_schema);
    expect(edges.description).toMatch(/SCHEMA-REQUIRED, NOT CONTENT-REQUIRED/);
    expect(edges.description).toMatch(/\[\] is the correct value/);
    expect(edges.description).toMatch(/Do not (invent|create).*merely/);
    expect(edges.items.additionalProperties).toBe(false);
    expect(Object.keys(edges.items.properties).sort()).toEqual(['modeIntent', 'relationship', 'sourceStopId', 'targetStopId']);
    // Strict makes the optional mode nullable — it never forces a mode per edge.
    expect(edges.items.properties.modeIntent.type).toEqual(['string', 'null']);
  });
});

// ---------------------------------------------------------------------------
// (9)(10) — a generated artifact through the real binding + finalization path
// ---------------------------------------------------------------------------

function generatedArtifact({ travelEdges, activityGroups, stops } = {}) {
  return {
    intro: 'A geyser morning.',
    days: [{
      id: 'd1', dayNumber: 1, label: 'Upper Geyser Basin + Midway',
      stops: stops || [
        { id: 'old-faithful', order: 0, type: 'geothermal', name: 'Old Faithful', note: 'n', duration: 60, parkCode: 'yell', parkName: 'Yellowstone', latitude: 44.4605, longitude: -110.8281 },
        { id: 'grand-prismatic', order: 1, type: 'geothermal', name: 'Grand Prismatic Spring', note: 'n', duration: 60, parkCode: 'yell', parkName: 'Yellowstone', latitude: 44.5251, longitude: -110.8382 },
      ],
      ...(activityGroups !== undefined ? { activityGroups } : {}),
      ...(travelEdges !== undefined ? { travelEdges } : {}),
    }],
  };
}

async function finalizeGenerated(artifact) {
  const bound = bindGeneratedItineraryContract({ itineraryData: artifact });
  return finalizeStructuredItinerary({ itineraryData: bound });
}

const T = (s, t) => ({ sourceStopId: s, targetStopId: t, relationship: 'transfer' });

describe('(9) a valid generated edge survives binding and finalization', () => {
  test('same-destination transfer between independent experiences is kept verbatim', async () => {
    const res = await finalizeGenerated(generatedArtifact({ travelEdges: [T('old-faithful', 'grand-prismatic')] }));
    expect(res.itineraryData.days[0].travelEdges).toEqual([T('old-faithful', 'grand-prismatic')]);
  });

  test('a generated plan that authors no edges is left without a travelEdges field (absence preserved)', async () => {
    const res = await finalizeGenerated(generatedArtifact());
    expect(res.itineraryData.days[0].travelEdges).toBeUndefined();
  });

  test('entering and leaving a group at its boundary stops survives', async () => {
    const stops = [
      { id: 'lodge', order: 0, type: 'lodge', name: 'Many Glacier Hotel', note: 'n', duration: 30, parkCode: 'glac' },
      { id: 'trailhead', order: 1, type: 'trail', name: 'Grinnell Glacier Trailhead', note: 'n', duration: 30, parkCode: 'glac' },
      { id: 'glacier', order: 2, type: 'trail', name: 'Grinnell Glacier', note: 'n', duration: 240, parkCode: 'glac' },
      { id: 'swiftcurrent', order: 3, type: 'lake', name: 'Swiftcurrent Lake', note: 'n', duration: 45, parkCode: 'glac' },
    ];
    const res = await finalizeGenerated(generatedArtifact({
      stops,
      activityGroups: [{ id: 'grinnell', stopIds: ['trailhead', 'glacier'] }],
      travelEdges: [T('lodge', 'trailhead'), T('glacier', 'swiftcurrent')],
    }));
    expect(res.itineraryData.days[0].travelEdges).toEqual([T('lodge', 'trailhead'), T('glacier', 'swiftcurrent')]);
  });
});

describe('(10) malformed / invalid generated edges are still dropped by existing validation', () => {
  test.each([
    ['extra mode field is stripped by minimal reconstruction', { ...T('old-faithful', 'grand-prismatic'), mode: 'drive', durationMin: 25 }, [T('old-faithful', 'grand-prismatic')]],
    ['non-transfer relationship', { ...T('old-faithful', 'grand-prismatic'), relationship: 'drive' }, []],
    ['missing target', { sourceStopId: 'old-faithful', relationship: 'transfer' }, []],
    ['dangling id', T('old-faithful', 'nonexistent'), []],
    ['backward', T('grand-prismatic', 'old-faithful'), []],
    ['self edge', T('old-faithful', 'old-faithful'), []],
  ])('%s', async (_label, raw, expected) => {
    const res = await finalizeGenerated(generatedArtifact({ travelEdges: [raw] }));
    expect(res.itineraryData.days[0].travelEdges).toEqual(expected);
  });

  test('a continuous hike fixture survives without an edge; an authored internal transfer defeats it', async () => {
    const stops = [
      { id: 'trailhead', name: 'Highline Trailhead', type: 'trail', duration: 30, parkCode: 'glac' },
      { id: 'chalet', name: 'Granite Park Chalet', type: 'lodge', duration: 60, parkCode: 'glac' },
    ];
    const activityGroups = [{ id: 'highline', stopIds: ['trailhead', 'chalet'] }];
    const valid = await finalizeGenerated(generatedArtifact({ stops, activityGroups }));
    expect(valid.itineraryData.days[0].activityGroups).toEqual(activityGroups);
    const conflict = await finalizeGenerated(generatedArtifact({
      stops, activityGroups, travelEdges: [T('trailhead', 'chalet')],
    }));
    expect(conflict.itineraryData.days[0].activityGroups).toEqual([]);
    expect(conflict.itineraryData.days[0].travelEdges).toEqual([T('trailhead', 'chalet')]);
  });

  test('a cross-destination edge on one day is dropped', async () => {
    const stops = [
      { id: 'zion-narrows', order: 0, type: 'trail', name: 'The Narrows', note: 'n', duration: 180, parkCode: 'zion', evidenceEntityId: 'nps:park:zion' },
      { id: 'bryce-sunset', order: 1, type: 'viewpoint', name: 'Sunset Point', note: 'n', duration: 45, parkCode: 'brca', evidenceEntityId: 'nps:park:brca' },
    ];
    const res = await finalizeGenerated(generatedArtifact({ stops, travelEdges: [T('zion-narrows', 'bryce-sunset')] }));
    expect(res.itineraryData.days[0].travelEdges).toEqual([]);
  });

  test('a non-array travelEdges value normalizes to []', async () => {
    const res = await finalizeGenerated(generatedArtifact({ travelEdges: 'old-faithful->grand-prismatic' }));
    expect(res.itineraryData.days[0].travelEdges).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (11)(12) — a generated edge authorizes no routing and restores no drive minutes
// ---------------------------------------------------------------------------

describe('(11)(12) a generated semantic edge is not routing authority', () => {
  let savedKey;
  beforeEach(() => {
    savedKey = process.env.GMAPS_SERVER_KEY;
    process.env.GMAPS_SERVER_KEY = 'test-key';
    nodeFetch.mockClear();
  });
  afterEach(() => {
    if (savedKey) process.env.GMAPS_SERVER_KEY = savedKey;
    else delete process.env.GMAPS_SERVER_KEY;
  });

  test('(11) finalization with the real driving-times enricher makes zero Distance Matrix requests', async () => {
    const artifact = generatedArtifact({ travelEdges: [T('old-faithful', 'grand-prismatic')] });
    const bound = bindGeneratedItineraryContract({ itineraryData: artifact });
    const res = await finalizeStructuredItinerary({
      itineraryData: bound,
      enrichDrivingTimes: (data, prefix) => enrichItineraryDrivingTimes(data, prefix),
    });
    expect(nodeFetch).not.toHaveBeenCalled();
    expect(res.itineraryData.days[0].travelEdges).toEqual([T('old-faithful', 'grand-prismatic')]);
  });

  test('(12) model-authored drive minutes are still stripped even when a valid edge covers that leg', async () => {
    const artifact = generatedArtifact({ travelEdges: [T('old-faithful', 'grand-prismatic')] });
    artifact.days[0].stops[1].drivingTimeFromPreviousMin = 25;
    const bound = bindGeneratedItineraryContract({ itineraryData: artifact });
    const res = await finalizeStructuredItinerary({
      itineraryData: bound,
      enrichDrivingTimes: (data, prefix) => enrichItineraryDrivingTimes(data, prefix),
    });
    expect(nodeFetch).not.toHaveBeenCalled();
    expect(res.itineraryData.days[0].stops[1].drivingTimeFromPreviousMin).toBeNull();
    expect(res.itineraryData.days[0].travelEdges).toEqual([T('old-faithful', 'grand-prismatic')]);
  });
});
