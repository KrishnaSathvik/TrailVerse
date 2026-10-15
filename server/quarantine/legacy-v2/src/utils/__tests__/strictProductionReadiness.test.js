'use strict';

/**
 * STRICT CREATE_ITINERARY — PRODUCTION READINESS.
 *
 * Four pieces that are now ONE generation-contract feature, not miscellaneous
 * schema helpers. They are load-bearing together and meaningless apart:
 *
 *   TRAILIE_CREATE_ITINERARY_STRICT   the rollout switch (default OFF)
 *   TOP_LEVEL_OUTPUT_ORDER            days → intro → narrativeSections → alternatives
 *   toStrictSchema                    strict-compatible normalisation
 *   STRICT_EMPTY_ARRAY_GUIDANCE       schema-required ≠ content-required
 *
 * Measured basis (2026-08-27/28, four live runs):
 *   strict:false + declared order  ->  order IGNORED (intro → days)
 *   strict:true  + declared order  ->  order OBEYED, n=3
 *   Day 1 availability             ->  ~49% of the artifact stream -> ~25-27%
 *   hidden-work window             ->  ~7.5-8.5 s -> ~11.4-12.2 s
 *   uncorrected strict             ->  stop alternatives 0/9 -> 9/9 (junk)
 *   corrected strict, no backup    ->  all forced arrays []
 *   corrected strict, backup asked ->  exactly the 3 scenic_drive stops
 *
 * These tests do not re-measure any of that. They pin the contract so the
 * feature cannot drift, half-land, or leak into paths it was never scoped to.
 */

const fs = require('fs');
const path = require('path');
const {
  getCreateItineraryTool,
  PATCH_ITINERARY_TOOL,
  TOP_LEVEL_OUTPUT_ORDER,
  STRICT_EMPTY_ARRAY_GUIDANCE,
  STRICT_NULLABLE_FIELDS,
} = require('../../../../../src/utils/itineraryToolSchema');
const {
  createItineraryStrictEnabled,
  getItineraryGenerationConfig,
} = require('../../../../../src/config/itineraryGenerationConfig');

const VARIANTS = [
  ['default', {}],
  ['reduced', { reduced: true }],
  ['reducedRequireAlternatives', { reduced: true, requireAlternatives: true }],
  ['reducedBindParkIdentity', { reduced: true, bindParkIdentity: true }],
  ['reducedBindCoordinates', { reduced: true, bindCoordinates: true }],
];

const withFlag = (value, fn) => {
  const prior = process.env.TRAILIE_CREATE_ITINERARY_STRICT;
  try {
    if (value === undefined) delete process.env.TRAILIE_CREATE_ITINERARY_STRICT;
    else process.env.TRAILIE_CREATE_ITINERARY_STRICT = value;
    return fn();
  } finally {
    if (prior === undefined) delete process.env.TRAILIE_CREATE_ITINERARY_STRICT;
    else process.env.TRAILIE_CREATE_ITINERARY_STRICT = prior;
  }
};

// ---------------------------------------------------------------------------
// §2 — ONE contract test for the whole strict shape
// ---------------------------------------------------------------------------

describe('§2 — the strict contract, in one place', () => {
  test.each(VARIANTS)('%s satisfies every strict requirement at once', (_label, opts) => {
    const schema = getCreateItineraryTool({ ...opts, strict: true }).input_schema;

    // (a) declared top-level order, and `required` in the same order.
    const present = TOP_LEVEL_OUTPUT_ORDER.filter((k) => k in schema.properties);
    expect(Object.keys(schema.properties)).toEqual(present);
    expect(schema.required).toEqual(Object.keys(schema.properties));

    // (b) every object closed, (c) every property required, walked recursively.
    const violations = { openObjects: [], optionalProps: [] };
    const walk = (node, at) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'object' || node.properties) {
        if (node.additionalProperties !== false) violations.openObjects.push(at);
        const req = new Set(node.required || []);
        for (const k of Object.keys(node.properties || {})) {
          if (!req.has(k)) violations.optionalProps.push(`${at}.${k}`);
          walk(node.properties[k], `${at}.${k}`);
        }
      }
      if (node.type === 'array' && node.items) walk(node.items, `${at}[]`);
    };
    walk(schema, '$');
    expect(violations).toEqual({ openObjects: [], optionalProps: [] });
  });

  test('optional SCALAR semantics survive as approved nullable fields', () => {
    const stop = getCreateItineraryTool({ reduced: true, strict: true })
      .input_schema.properties.days.items.properties.stops.items.properties;
    // Absence-means-unknown fields are nullable, not fabricated.
    for (const f of ['parkCode', 'parkName', 'timeWindow', 'exposureLevel',
      'walkingDistanceMiles', 'latitude', 'longitude', 'difficulty', 'why']) {
      expect(Array.isArray(stop[f].type) && stop[f].type.includes('null')).toBe(true);
    }
    // Fields the strict transform newly widened are exactly the declared set.
    expect([...STRICT_NULLABLE_FIELDS].sort()).toEqual(['heading', 'modeIntent', 'note', 'when']);
  });

  test('optional ARRAYS are required arrays carrying the empty-state rule', () => {
    const schema = getCreateItineraryTool({ reduced: true, strict: true }).input_schema;
    const arrays = {
      '$.narrativeSections': schema.properties.narrativeSections,
      '$.alternatives': schema.properties.alternatives,
      '$.days[].stops[].alternatives':
        schema.properties.days.items.properties.stops.items.properties.alternatives,
    };
    for (const [at, node] of Object.entries(arrays)) {
      expect(node.type).toBe('array');
      expect(node.description).toContain('SCHEMA-REQUIRED, NOT CONTENT-REQUIRED');
      expect(node.description).toContain(STRICT_EMPTY_ARRAY_GUIDANCE[at].trim().slice(0, 40));
    }
  });
});

// ---------------------------------------------------------------------------
// §3 — requireAlternatives interaction
// ---------------------------------------------------------------------------

describe('§3 — a requested backup and an unrequested one are different contracts', () => {
  test('no backup requested: trip alternatives may be [] and says so', () => {
    const alts = getCreateItineraryTool({ reduced: true, strict: true }).input_schema.properties.alternatives;
    expect(alts.minItems).toBeUndefined();
    expect(alts.description).toContain('[] is the correct value');
  });

  test('backup requested: minItems 1, and the empty-state rule is suppressed', () => {
    const schema = getCreateItineraryTool({ reduced: true, requireAlternatives: true, strict: true }).input_schema;
    expect(schema.properties.alternatives.minItems).toBe(1);
    expect(schema.properties.alternatives.description).toMatch(/REQUIRED trip-level backup/);
    // Telling the model both "you MUST populate" and "use []" would be incoherent.
    expect(schema.properties.alternatives.description).not.toContain('SCHEMA-REQUIRED, NOT CONTENT-REQUIRED');
  });

  test('stop alternatives keep INDEPENDENT empty-state semantics either way', () => {
    // A trip-level Plan B is not a request for a fallback at every stop. The
    // 2026-08-28 Case B run populated exactly the 3 scenic_drive stops the
    // traveler's closure scenario named, and left the other 6 empty.
    for (const requireAlternatives of [false, true]) {
      const stopAlts = getCreateItineraryTool({ reduced: true, requireAlternatives, strict: true })
        .input_schema.properties.days.items.properties.stops.items.properties.alternatives;
      expect(stopAlts.description).toContain('SCHEMA-REQUIRED, NOT CONTENT-REQUIRED');
      expect(stopAlts.minItems).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// §4 — production OFF, pinned byte-for-byte
// ---------------------------------------------------------------------------

describe('§4 — the shipped contract cannot drift while strict is off', () => {
  const GOLDEN = JSON.parse(fs.readFileSync(
    path.join(require('path').resolve(__dirname, '../../../../../src/utils/__tests__'), '__fixtures__/createItineraryProductionContract.json'), 'utf8',
  ));

  test.each(VARIANTS)('%s is byte-for-byte the golden production contract', (label, opts) => {
    const tool = getCreateItineraryTool(opts);
    const actual = {
      strict: tool.strict ?? null,
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    };
    // Exact serialization, so KEY ORDER is part of the pin, not just contents.
    expect(JSON.stringify(actual, null, 2)).toBe(JSON.stringify(GOLDEN.variants[label], null, 2));
  });

  test('no strict-only text can reach the production contract', () => {
    const serialized = JSON.stringify(GOLDEN.variants);
    expect(serialized).not.toContain('SCHEMA-REQUIRED');
    expect(serialized).not.toContain('merely because the field is required');
  });

  test('the golden fixture is a real pin, not an empty object', () => {
    expect(Object.keys(GOLDEN.variants).sort()).toEqual(VARIANTS.map(([l]) => l).sort());
    expect(GOLDEN.variants.reduced.input_schema.properties.days).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// §5 — the switch cannot become truthy by accident
// ---------------------------------------------------------------------------

describe('§5 — only an exact "true" enables strict', () => {
  const ENABLING = ['true', 'TRUE', 'True', ' true ', '\ttrue\n'];
  const NOT_ENABLING = [undefined, '', ' ', '0', '1', 'yes', 'YES', 'on', 'enabled',
    'false', 'FALSE', 'null', 'undefined', 'truthy', 'true1', '1true', 'y'];

  test.each(ENABLING)('%j enables', (v) => {
    expect(withFlag(v, createItineraryStrictEnabled)).toBe(true);
  });

  test.each(NOT_ENABLING)('%j does NOT enable', (v) => {
    expect(withFlag(v, createItineraryStrictEnabled)).toBe(false);
  });

  test('the config seam is the single reader — no ad hoc process.env access', () => {
    const roots = ['../../services', '../../routes', '../../utils'];
    const hits = [];
    const scan = (dir) => {
      const abs = path.join(require('path').resolve(__dirname, '../../../../../src/utils/__tests__'), dir);
      if (!fs.existsSync(abs)) return;
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (entry.name === '__tests__' || entry.name === '__fixtures__') continue;
        const full = path.join(abs, entry.name);
        if (entry.isDirectory()) { scan(path.relative(require('path').resolve(__dirname, '../../../../../src/utils/__tests__'), full)); continue; }
        if (!entry.name.endsWith('.js')) continue;
        const src = fs.readFileSync(full, 'utf8');
        if (src.includes('TRAILIE_CREATE_ITINERARY_STRICT')) hits.push(entry.name);
      }
    };
    roots.forEach(scan);
    // Only the config seam names the variable.
    expect(hits).toEqual([]);
  });

  test('the config seam surfaces it alongside the other generation flags', () => {
    expect(withFlag('true', () => getItineraryGenerationConfig().createItineraryStrict)).toBe(true);
    expect(withFlag(undefined, () => getItineraryGenerationConfig().createItineraryStrict)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §6/§7 — scope: strict reaches create_itinerary and nothing else
// ---------------------------------------------------------------------------

describe('§6/§7 — no other path inherits strict', () => {
  const EXEC = fs.readFileSync(require.resolve('../../../../../src/services/trailieExecutionService'), 'utf8');

  test('PATCH_ITINERARY_TOOL is never strict, under either flag state', () => {
    expect(PATCH_ITINERARY_TOOL.strict).toBeUndefined();
    withFlag('true', () => expect(PATCH_ITINERARY_TOOL.strict).toBeUndefined());
    // And it is a distinct object, so it cannot be strictified by reference.
    expect(PATCH_ITINERARY_TOOL.input_schema)
      .not.toBe(getCreateItineraryTool({ reduced: true, strict: true }).input_schema);
  });

  test('the flag is read exactly once, on the create_itinerary branch', () => {
    expect(EXEC.match(/createItineraryStrictEnabled\(\)/g)).toHaveLength(1);
    const at = EXEC.indexOf('createItineraryStrictEnabled()');
    const branch = EXEC.slice(EXEC.lastIndexOf('usePlanPatch', at), at);
    // The read sits inside the `: getCreateItineraryTool({...})` arm.
    expect(branch).toContain('getCreateItineraryTool');
  });

  test('non-itinerary turns dispatch no tools at all', () => {
    expect(EXEC).toMatch(/tools:\s*itinerary\s*\?\s*\[itineraryTool\]\s*:\s*\[\]/);
  });

  test('no production caller passes structuredOutput — the other strict door', () => {
    // `request.structuredOutput.strict !== false` DEFAULTS TO TRUE in the
    // adapter, so a caller that starts passing `structuredOutput` would get
    // strict structured output without asking for it. Today the only mentions
    // are the adapter's own plumbing; no request builder call site supplies it.
    const callSites = [
      require.resolve('../../../../../src/services/trailieExecutionService'),
      require.resolve('../../../../../src/eval/gpt56Benchmark'),
    ];
    for (const file of callSites) {
      const src = fs.readFileSync(file, 'utf8');
      // Find each createRequest/createResponsesRequest({ ... }) argument body.
      for (const m of src.matchAll(/create(?:Responses)?Request\(\{/g)) {
        const start = m.index + m[0].length;
        let depth = 1;
        let i = start;
        while (i < src.length && depth > 0) {
          if (src[i] === '{') depth += 1;
          else if (src[i] === '}') depth -= 1;
          i += 1;
        }
        expect(src.slice(start, i)).not.toMatch(/\bstructuredOutput\b/);
      }
    }
  });

  test('the only structuredOutput mentions are adapter plumbing', () => {
    const mentions = [];
    const scan = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { scan(full); continue; }
        if (!entry.name.endsWith('.js')) continue;
        if (/structuredOutput/.test(fs.readFileSync(full, 'utf8'))) {
          mentions.push(path.relative(path.join(require('path').resolve(__dirname, '../../../../../src/utils/__tests__'), '../../services'), full));
        }
      }
    };
    scan(path.join(require('path').resolve(__dirname, '../../../../../src/utils/__tests__'), '../../services'));
    // Exactly the request/response envelope and the OpenAI adapter that fills it.
    expect(mentions.sort()).toEqual([
      'providers/openaiResponsesAdapter.js',
      'responsesAdapter.js',
      'trailieExecutionService.js',
    ]);
  });
});

// ---------------------------------------------------------------------------
// §8 — rollout segmentation telemetry
// ---------------------------------------------------------------------------

describe('§8 — createItineraryStrict is reported as configuration metadata', () => {
  const EXEC = fs.readFileSync(require.resolve('../../../../../src/services/trailieExecutionService'), 'utf8');
  const BRIDGE = fs.readFileSync(require.resolve('../../../../../src/services/trailieRouteBridge'), 'utf8');

  test('captured at the dispatch that used it, not re-read later', () => {
    expect(EXEC).toMatch(/createItineraryStrictUsed = createItineraryStrictEnabled\(\)/);
    expect(EXEC).toMatch(/createItineraryStrict: createItineraryStrictUsed/);
  });

  test('defaults to null when create_itinerary was never built', () => {
    expect(EXEC).toMatch(/let createItineraryStrictUsed = null;/);
  });

  test('forwarded through the bounded telemetry projection', () => {
    expect(BRIDGE).toMatch(/createItineraryStrict: result\.telemetrySummary\?\.createItineraryStrict/);
  });

  test('it carries no prompt or plan content', () => {
    // A boolean or null. Nothing about the traveler, the plan, or the model.
    const line = EXEC.split('\n').find((l) => l.includes('createItineraryStrict: createItineraryStrictUsed'));
    expect(line).not.toMatch(/prompt|plan|intro|stop|user/i);
  });
});

// ---------------------------------------------------------------------------
// §10 — strict changed no validator and no repair behaviour
// ---------------------------------------------------------------------------

describe('§10 — validators and the repair ledger are untouched by strict', () => {
  test('no validator or repair module mentions strict at all', () => {
    const files = [
      '../itineraryStructuralValidation', '../itineraryCompleteness',
      '../travelerFitEvaluation', '../finalizeItinerary',
      '../itineraryPlanPatch', '../refinementScope',
    ];
    for (const f of files) {
      const src = fs.readFileSync(require.resolve(f), 'utf8');
      expect(src).not.toMatch(/CREATE_ITINERARY_STRICT|createItineraryStrict|toStrictSchema/);
    }
  });

  test('strict removes only tool_output_invalid — every semantic gate remains', () => {
    // Shape enforcement cannot decide a zero duration, a missing requested
    // experience, or a traveler-fit conflict. Those stay the ladder's job.
    const { evaluateStructuralArtifact } = require('../../../../../src/utils/itineraryStructuralValidation');
    const shapeValid = {
      days: [{ id: 'd1', dayNumber: 1, label: 'L', overnightLocation: null,
        stops: [{ id: 's1', order: 1, type: 'walk', name: 'A', note: 'n', startTime: '',
          duration: 0, timeWindow: null, exposureLevel: null, difficulty: null, why: null,
          parkCode: null, parkName: null, walkingDistanceMiles: null, latitude: null,
          longitude: null, alternatives: [] }] }],
      intro: 'x', narrativeSections: [], alternatives: [],
    };
    const verdict = evaluateStructuralArtifact({ itineraryData: shapeValid, constraints: { tripDays: 1 } });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasonCodes).toContain('zero_duration_stops');
  });
});
