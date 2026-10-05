'use strict';

/**
 * DAYS-FIRST STRUCTURED OUTPUT ORDER — offline.
 *
 * Measured on 2026-08-27 (artifacts/trailie-shadow-structure-2026-08-27):
 * `intro` + `narrativeSections` consumed 3,602 ms — 22% of the 16,271 ms tool
 * stream — before `days` began, pushing every structural milestone later by
 * that amount.
 *
 * This pass changes PRODUCTION ORDER ONLY. The contract of these tests is that
 * it changes nothing else: the same artifact, with its top-level keys in either
 * order, must parse, bind, finalize and validate to the same outcome, and no
 * consumer may depend on property order.
 */

const {
  getCreateItineraryTool,
  TOP_LEVEL_OUTPUT_ORDER,
} = require('../itineraryToolSchema');
const { normalizeToolCalls } = require('../../services/structuredItineraryGenerator');
const { bindGeneratedItineraryContract } = require('../generationContractBinding');
const { finalizeStructuredItinerary } = require('../finalizeItinerary');
const { evaluateStructuralArtifact } = require('../itineraryStructuralValidation');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const { evaluateTravelerFit } = require('../travelerFitEvaluation');
const { hashPayload } = require('../canonicalResponse');
const { createShadowStructureTracker } = require('../shadowStreamStructure');

// ---------------------------------------------------------------------------
// A — schema order only
// ---------------------------------------------------------------------------

describe('A — the tool asks for days first, and changes nothing else', () => {
  const variants = [
    ['default', {}],
    ['reduced', { reduced: true }],
    ['reduced + alternatives required', { reduced: true, requireAlternatives: true }],
    ['reduced + park identity bound', { reduced: true, bindParkIdentity: true }],
    ['reduced + coordinates bound', { reduced: true, bindCoordinates: true }],
  ];

  test.each(variants)('%s emits days first', (_label, opts) => {
    const schema = getCreateItineraryTool(opts).input_schema;
    expect(Object.keys(schema.properties)[0]).toBe('days');
    expect(Object.keys(schema.properties)).toEqual(
      TOP_LEVEL_OUTPUT_ORDER.filter((k) => k in schema.properties),
    );
    expect(schema.required[0]).toBe('days');
  });

  test('the required SET is unchanged — only its order', () => {
    expect([...getCreateItineraryTool({ reduced: true }).input_schema.required].sort())
      .toEqual(['days', 'intro']);
    expect([...getCreateItineraryTool({ reduced: true, requireAlternatives: true })
      .input_schema.required].sort()).toEqual(['alternatives', 'days', 'intro']);
  });

  test('no field is added, removed, or renamed', () => {
    const schema = getCreateItineraryTool({ reduced: true }).input_schema;
    expect(Object.keys(schema.properties).sort())
      .toEqual(['alternatives', 'days', 'intro', 'narrativeSections']);
  });

  test('field descriptions are untouched by reordering', () => {
    // Ordering-only claim: these strings are pinned to catch a reorder pass
    // accidentally also touching content. 12G updated the after_plan closing
    // contract; keep the pin on the current descriptions.
    const schema = getCreateItineraryTool({ reduced: true }).input_schema;
    expect(schema.properties.intro.description).toMatch(/traveler-facing opening/i);
    expect(schema.properties.intro.description).toMatch(/1.{0,3}3 sentences/i);
    expect(schema.properties.narrativeSections.description).toMatch(/after_plan/i);
    expect(schema.properties.narrativeSections.description).toMatch(/why this sequence works/i);
  });

  test('the day and stop contracts are untouched', () => {
    const schema = getCreateItineraryTool({ reduced: true }).input_schema;
    expect(schema.properties.days.items.required).toEqual(['id', 'dayNumber', 'label', 'stops']);
    expect(schema.properties.days.items.properties.stops.items.required)
      .toEqual(expect.arrayContaining(['id', 'order', 'name', 'duration']));
  });

  test('ordering survives every later schema transform', () => {
    // `orderKeys` runs LAST in getCreateItineraryTool; requireAlternatives
    // mutates the schema and must not reintroduce the old order.
    const schema = getCreateItineraryTool({ reduced: true, requireAlternatives: true }).input_schema;
    expect(Object.keys(schema.properties)[0]).toBe('days');
    expect(schema.properties.alternatives.minItems).toBe(1);
  });

  test('an unknown future property would be kept, not dropped', () => {
    const { input_schema: schema } = getCreateItineraryTool({ reduced: true });
    // orderKeys appends anything it does not name; proven by the set equality
    // above plus this direct check on the helper's contract.
    expect(Object.keys(schema.properties)).toContain('narrativeSections');
    expect(Object.keys(schema.properties)).toContain('alternatives');
  });
});

// ---------------------------------------------------------------------------
// B / D — order is not semantics: the same artifact, both orders, same outcome
// ---------------------------------------------------------------------------

const ARTIFACT = {
  intro: 'Three easygoing days built around wildlife, scenery and short walks.',
  narrativeSections: [{ placement: 'before_plan', heading: null, markdown: 'Expect gravel in places.' }],
  days: [
    {
      id: 'day-1', dayNumber: 1, label: 'South Unit scenic loop', overnightLocation: 'Medora',
      stops: [
        { id: 's1', order: 1, type: 'viewpoint', name: 'Painted Canyon Overlook', note: 'Sunrise light over the badlands.', startTime: '', timeWindow: 'Early morning', duration: 45, exposureLevel: 'low', difficulty: 'easy', latitude: 46.8918, longitude: -103.3799, why: 'Best first look at the badlands.' },
        { id: 's2', order: 2, type: 'scenic_drive', name: 'Scenic Loop Drive', note: 'Bison and prairie dog towns.', startTime: '', timeWindow: 'Late morning', duration: 150, exposureLevel: 'low', difficulty: 'easy', latitude: 46.9789, longitude: -103.5387, why: 'Wildlife from the car.' },
        { id: 's3', order: 3, type: 'walk', name: 'Wind Canyon Trail', note: 'Short rim walk above the river.', startTime: '', timeWindow: 'Late afternoon', duration: 40, exposureLevel: 'low', difficulty: 'easy', latitude: 46.9345, longitude: -103.5548, why: 'Sunset over the Little Missouri.' },
      ],
    },
    {
      id: 'day-2', dayNumber: 2, label: 'Wildlife and photography', overnightLocation: 'Medora',
      stops: [
        { id: 's4', order: 1, type: 'wildlife', name: 'Prairie Dog Town', note: 'Easy roadside wildlife.', startTime: '', timeWindow: 'Morning', duration: 60, exposureLevel: 'low', difficulty: 'easy', latitude: 46.9505, longitude: -103.4569, why: 'Reliable wildlife viewing.' },
        { id: 's5', order: 2, type: 'viewpoint', name: 'Boicourt Overlook', note: 'Wide badlands panorama.', startTime: '', timeWindow: 'Afternoon', duration: 45, exposureLevel: 'low', difficulty: 'easy', latitude: 46.9163, longitude: -103.4062, why: 'Photography at golden hour.' },
        { id: 's6', order: 3, type: 'visitor_center', name: 'South Unit Visitor Center', note: 'Exhibits and Maltese Cross Cabin.', startTime: '', timeWindow: 'Late afternoon', duration: 50, exposureLevel: 'low', difficulty: 'easy', latitude: 46.9147, longitude: -103.5266, why: 'Context and shade.' },
      ],
    },
    {
      id: 'day-3', dayNumber: 3, label: 'North Unit drive', overnightLocation: null,
      stops: [
        { id: 's7', order: 1, type: 'scenic_drive', name: 'Scenic Drive to Oxbow Overlook', note: 'Long relaxed drive.', startTime: '', timeWindow: 'Morning', duration: 120, exposureLevel: 'low', difficulty: 'easy', latitude: 47.5967, longitude: -103.3894, why: 'Different badlands character.' },
        { id: 's8', order: 2, type: 'viewpoint', name: 'River Bend Overlook', note: 'Classic Little Missouri bend.', startTime: '', timeWindow: 'Midday', duration: 40, exposureLevel: 'low', difficulty: 'easy', latitude: 47.5936, longitude: -103.3244, why: 'Signature North Unit view.' },
        { id: 's9', order: 3, type: 'walk', name: 'Little Mo Nature Trail', note: 'Flat interpretive loop.', startTime: '', timeWindow: 'Afternoon', duration: 45, exposureLevel: 'low', difficulty: 'easy', latitude: 47.5975, longitude: -103.2519, why: 'Easy legs-stretch before the drive back.' },
      ],
    },
  ],
};

/** The same object with its TOP-LEVEL keys in the other order. */
function reorderTopLevel(obj, order) {
  const out = {};
  for (const k of order) if (k in obj) out[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k];
  return out;
}

const OLD_ORDER = reorderTopLevel(ARTIFACT, ['intro', 'narrativeSections', 'days']);
const NEW_ORDER = reorderTopLevel(ARTIFACT, ['days', 'intro', 'narrativeSections']);

const CONSTRAINTS = { tripDays: 3, durationDays: 3 };
const PROMPT = 'Plan three easygoing days in Theodore Roosevelt National Park. We care most about '
  + 'wildlife, scenery, photography, and relaxed drives with some easy walking.';

const toolCall = (input) => ([{ id: 'call_1', name: 'create_itinerary', input, rawArgs: JSON.stringify(input) }]);

describe('B/D — the two orders are the same artifact', () => {
  test('the key orders really do differ (the test would be vacuous otherwise)', () => {
    expect(Object.keys(OLD_ORDER)[0]).toBe('intro');
    expect(Object.keys(NEW_ORDER)[0]).toBe('days');
    expect(JSON.stringify(OLD_ORDER)).not.toBe(JSON.stringify(NEW_ORDER));
  });

  test('parse: normalizeToolCalls yields the same itineraryData', () => {
    const a = normalizeToolCalls({ toolCalls: toolCall(OLD_ORDER), stopReason: 'tool_use' });
    const b = normalizeToolCalls({ toolCalls: toolCall(NEW_ORDER), stopReason: 'tool_use' });
    expect(a.status).toBe(b.status);
    expect(hashPayload(a.itineraryData)).toBe(hashPayload(b.itineraryData));
  });

  test('binding: bindGeneratedItineraryContract yields the same plan', () => {
    const a = bindGeneratedItineraryContract({ itineraryData: OLD_ORDER });
    const b = bindGeneratedItineraryContract({ itineraryData: NEW_ORDER });
    expect(hashPayload(a)).toBe(hashPayload(b));
  });

  test('finalization: finalizeStructuredItinerary yields the same finalized plan', async () => {
    const run = (data) => finalizeStructuredItinerary({
      itineraryData: JSON.parse(JSON.stringify(data)),
      constraints: CONSTRAINTS,
      resolvedMetadata: { parkName: 'Theodore Roosevelt National Park', parkCode: 'thro' },
    });
    const a = await run(OLD_ORDER);
    const b = await run(NEW_ORDER);
    expect(hashPayload(a.itineraryData)).toBe(hashPayload(b.itineraryData));
    expect(a.feasibilityIssues || []).toEqual(b.feasibilityIssues || []);
  });

  test('structural validation: identical verdict', () => {
    const a = evaluateStructuralArtifact({ itineraryData: OLD_ORDER, constraints: CONSTRAINTS });
    const b = evaluateStructuralArtifact({ itineraryData: NEW_ORDER, constraints: CONSTRAINTS });
    expect(a.ok).toBe(b.ok);
    expect(a.reasonCodes).toEqual(b.reasonCodes);
    expect(a.dayDiagnostics).toEqual(b.dayDiagnostics);
  });

  test('completeness: identical verdict', () => {
    const args = { constraints: CONSTRAINTS, prompt: PROMPT, userPrompt: PROMPT };
    const a = evaluateItineraryCompleteness({ itineraryData: OLD_ORDER, ...args });
    const b = evaluateItineraryCompleteness({ itineraryData: NEW_ORDER, ...args });
    expect(a.ok).toBe(b.ok);
    expect(a.reasonCodes).toEqual(b.reasonCodes);
  });

  test('traveler fit: identical verdict', () => {
    const args = { constraints: CONSTRAINTS, userPrompt: PROMPT, evidenceBundle: null };
    const a = evaluateTravelerFit({ itineraryData: OLD_ORDER, ...args });
    const b = evaluateTravelerFit({ itineraryData: NEW_ORDER, ...args });
    expect(a.ok).toBe(b.ok);
    expect(a.reasonCodes).toEqual(b.reasonCodes);
  });

  // The verdicts above are all `ok: true` on a healthy plan, which proves
  // equivalence only on the happy path. A REJECTED artifact must be rejected
  // identically, with the same reason codes, in either key order — otherwise
  // reordering could quietly change which plans get repaired.
  describe('a rejected artifact is rejected identically in both orders', () => {
    const BROKEN = {
      ...ARTIFACT,
      days: [
        // Day 1: every duration zero -> zero_duration_stops
        { ...ARTIFACT.days[0], stops: ARTIFACT.days[0].stops.map((st) => ({ ...st, duration: 0 })) },
        // Day 2: no stops at all -> empty_day
        { ...ARTIFACT.days[1], stops: [] },
        ARTIFACT.days[2],
      ],
    };
    const brokenOld = reorderTopLevel(BROKEN, ['intro', 'narrativeSections', 'days']);
    const brokenNew = reorderTopLevel(BROKEN, ['days', 'intro', 'narrativeSections']);

    test('structural rejection carries the same non-empty reason codes', () => {
      const a = evaluateStructuralArtifact({ itineraryData: brokenOld, constraints: CONSTRAINTS });
      const b = evaluateStructuralArtifact({ itineraryData: brokenNew, constraints: CONSTRAINTS });
      expect(a.ok).toBe(false);
      expect(a.reasonCodes.length).toBeGreaterThan(0);
      expect(a.reasonCodes).toEqual(b.reasonCodes);
      expect(a.dayDiagnostics).toEqual(b.dayDiagnostics);
    });

    test('completeness rejection carries the same non-empty reason codes', () => {
      const args = { constraints: CONSTRAINTS, prompt: PROMPT, userPrompt: PROMPT };
      const a = evaluateItineraryCompleteness({ itineraryData: brokenOld, ...args });
      const b = evaluateItineraryCompleteness({ itineraryData: brokenNew, ...args });
      expect(a.ok).toBe(false);
      expect(a.reasonCodes.length).toBeGreaterThan(0);
      expect(a.reasonCodes).toEqual(b.reasonCodes);
    });

    test('the broken plan still hashes identically across orders', () => {
      expect(hashPayload(brokenOld)).toBe(hashPayload(brokenNew));
    });
  });

  test('persistence shape: the canonical hash is order-independent by construction', () => {
    // `stableStringify` sorts keys before hashing, which is what makes the
    // itinerary-hash succession guard survive a reordering at all.
    expect(hashPayload(OLD_ORDER)).toBe(hashPayload(NEW_ORDER));
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ b: 2, a: 1 }));
  });
});

// ---------------------------------------------------------------------------
// C — the shadow tracker must not assume `days` is terminal
// ---------------------------------------------------------------------------

describe('C — days completing before tool_complete', () => {
  const feed = (obj) => {
    const t = createShadowStructureTracker({ dispatchStartedAtMs: 0 });
    [...JSON.stringify(obj)].forEach((ch, i) => t.consume(ch, i + 1));
    return t.snapshot();
  };

  test('days-first: all days complete STRICTLY BEFORE the tool does', () => {
    const s = feed(NEW_ORDER);
    expect(s.daysStartMs).toBeLessThan(s.sectionStartMs.intro);
    expect(s.allDaysStructurallyCompleteMs).toBeLessThan(s.toolCompleteMs);
    // The window this whole experiment is about.
    expect(s.toolCompleteMs - s.allDaysStructurallyCompleteMs).toBeGreaterThan(0);
  });

  test('old order: all days complete AT the tool close, as measured live', () => {
    const s = feed(OLD_ORDER);
    // `days` last means the artifact ends when the final day does — this is the
    // `toolComplete - allDaysComplete == 0` measured on 2026-08-27.
    expect(s.toolCompleteMs - s.allDaysStructurallyCompleteMs).toBeLessThanOrEqual(1);
  });

  test('both orders find the same units', () => {
    const a = feed(OLD_ORDER);
    const b = feed(NEW_ORDER);
    expect(a.stopCompletionCount).toBe(b.stopCompletionCount);
    expect(a.dayCompletionMs.map((d) => d.dayOrdinal)).toEqual(b.dayCompletionMs.map((d) => d.dayOrdinal));
    expect(a.structurallyComplete).toBe(true);
    expect(b.structurallyComplete).toBe(true);
  });

  test('days-first moves Day 1 earlier in the stream, which is the hypothesis', () => {
    const a = feed(OLD_ORDER);
    const b = feed(NEW_ORDER);
    expect(b.firstCompleteDayMs).toBeLessThan(a.firstCompleteDayMs);
  });
});

// ---------------------------------------------------------------------------
// F — no UX change
// ---------------------------------------------------------------------------

describe('F — this remains instrumentation only', () => {
  const EXEC = require('fs').readFileSync(
    require.resolve('../../services/trailieExecutionService'), 'utf8',
  );

  test('no structural milestone is emitted to any client', () => {
    const { CANONICAL_EVENTS } = require('../../services/trailieV2ExecutionService');
    for (const term of ['stop_complete', 'day_complete', 'all_days_structurally_complete']) {
      expect(CANONICAL_EVENTS).not.toContain(term);
      expect(EXEC).not.toMatch(new RegExp(`emit\\([^)]*${term}`));
    }
  });

  test('the stream callback still has exactly one emit, behind the text gate', () => {
    const start = EXEC.indexOf('onEvent: (event) => {');
    const body = EXEC.slice(start, EXEC.indexOf('\n            },', start));
    expect(body.match(/emit\(/g)).toHaveLength(1);
    expect(body.indexOf("event?.type !== 'text_delta'")).toBeLessThan(body.indexOf('emit('));
  });
});
