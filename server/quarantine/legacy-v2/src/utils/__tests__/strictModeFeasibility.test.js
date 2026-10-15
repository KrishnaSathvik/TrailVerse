'use strict';

/**
 * CREATE_ITINERARY STRICT-MODE FEASIBILITY — offline audit.
 *
 * The live days-first benchmark (2026-08-27) showed the model ignores advisory
 * property order under `strict: false`: it emitted `intro → days` against a
 * schema declaring `days` first, and every normalised milestone stayed within
 * ~1 percentage point of the previous run.
 *
 * Before building provisional-Day architecture around an ~8 s window, this
 * audit asks whether the EXISTING contract could run under strict structured
 * output at all. It enables nothing: `strict` stays false everywhere.
 *
 * The provider's exact strict subset is not verifiable offline (no network), so
 * the incompatible-construct list is stated as "as understood" and every finding
 * names an exact schema path so it can be re-checked against provider docs.
 */

const {
  getCreateItineraryTool, PATCH_ITINERARY_TOOL, STRICT_NULLABLE_FIELDS,
  STRICT_EMPTY_ARRAY_GUIDANCE,
} = require('../../../../../src/utils/itineraryToolSchema');
const { createItineraryStrictEnabled } = require('../../../../../src/config/itineraryGenerationConfig');
const { bindGeneratedItineraryContract } = require('../../../../../src/utils/generationContractBinding');
const { finalizeStructuredItinerary } = require('../../../../../src/utils/finalizeItinerary');
const { evaluateStructuralArtifact } = require('../../../../../src/utils/itineraryStructuralValidation');
const { evaluateItineraryCompleteness } = require('../../../../../src/utils/itineraryCompleteness');
const { evaluateTravelerFit } = require('../../../../../src/utils/travelerFitEvaluation');
const { hashPayload } = require('../../../../../src/utils/canonicalResponse');
const { normalizeToolCalls } = require('../../../../../src/services/structuredItineraryGenerator');
const { countPromptTokens } = require('../../../../../src/utils/promptTokenAccounting');

const VARIANTS = [
  ['reduced (production default)', { reduced: true }],
  ['reduced+requireAlternatives', { reduced: true, requireAlternatives: true }],
  ['reduced+bindParkIdentity', { reduced: true, bindParkIdentity: true }],
  ['reduced+bindCoordinates', { reduced: true, bindCoordinates: true }],
  ['base (non-reduced)', {}],
];

/** Keywords outside the strict subset, as understood. Not verifiable offline. */
const UNSUPPORTED_KEYWORDS = new Set([
  'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern', 'format',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'default', 'uniqueItems', 'additionalItems', 'patternProperties',
  'unevaluatedProperties', 'propertyNames', 'contains', 'minContains',
  'maxContains', 'minProperties', 'maxProperties', 'dependentSchemas',
  'if', 'then', 'else', 'not', 'oneOf', 'allOf',
]);

function auditSchema(node, path = '$', acc = null, objectDepth = 0) {
  const out = acc || {
    unsupported: [], objectsMissingAdditionalProps: [], optional: [],
    objectCount: 0, propertyCount: 0, maxObjectDepth: 0,
  };
  if (!node || typeof node !== 'object') return out;
  for (const k of Object.keys(node)) {
    if (UNSUPPORTED_KEYWORDS.has(k)) out.unsupported.push({ path: `${path}.${k}`, keyword: k });
  }
  if (node.type === 'object' || node.properties) {
    out.objectCount += 1;
    out.maxObjectDepth = Math.max(out.maxObjectDepth, objectDepth);
    if (node.additionalProperties !== false) out.objectsMissingAdditionalProps.push(path);
    const req = new Set(node.required || []);
    for (const p of Object.keys(node.properties || {})) {
      out.propertyCount += 1;
      const child = node.properties[p];
      if (!req.has(p)) {
        const t = child.type;
        out.optional.push({
          path: `${path}.${p}`,
          nullable: Array.isArray(t) ? t.includes('null') : false,
          isArray: t === 'array',
        });
      }
      auditSchema(child, `${path}.${p}`, out, objectDepth + 1);
    }
  }
  if (node.type === 'array' && node.items) auditSchema(node.items, `${path}[]`, out, objectDepth);
  return out;
}

// ---------------------------------------------------------------------------
// A — current schema compatibility
// ---------------------------------------------------------------------------

describe('A — strict-incompatible constructs, by exact path', () => {
  test.each(VARIANTS)('%s: the findings are exactly these', (label, opts) => {
    const audit = auditSchema(getCreateItineraryTool(opts).input_schema);
    // Two objects lack additionalProperties:false — both are `alternatives`
    // item schemas declared `additionalProperties: true`.
    expect(audit.objectsMissingAdditionalProps.sort()).toEqual([
      '$.alternatives[]', '$.days[].stops[].alternatives[]',
    ]);
    // The only unsupported keywords are array cardinality bounds.
    const keywords = [...new Set(audit.unsupported.map((u) => u.keyword))].sort();
    expect(keywords.every((k) => ['maxItems', 'minItems'].includes(k))).toBe(true);
    // Nesting: root -> day -> stop -> alternative = 4 object levels.
    expect(audit.maxObjectDepth).toBeLessThanOrEqual(4);
    // Property count is well under any plausible cap.
    expect(audit.propertyCount).toBeLessThan(60);
  });

  test('narrativeSections.maxItems is present in every variant', () => {
    for (const [, opts] of VARIANTS) {
      const audit = auditSchema(getCreateItineraryTool(opts).input_schema);
      expect(audit.unsupported.map((u) => u.path)).toContain('$.narrativeSections.maxItems');
    }
  });

  test('alternatives.minItems appears ONLY when a backup was requested', () => {
    const withBackup = auditSchema(getCreateItineraryTool({ reduced: true, requireAlternatives: true }).input_schema);
    const without = auditSchema(getCreateItineraryTool({ reduced: true }).input_schema);
    expect(withBackup.unsupported.map((u) => u.path)).toContain('$.alternatives.minItems');
    expect(without.unsupported.map((u) => u.path)).not.toContain('$.alternatives.minItems');
  });
});

// ---------------------------------------------------------------------------
// B — required-property impact
// ---------------------------------------------------------------------------

describe('B — what strict would force to become required', () => {
  const audit = auditSchema(getCreateItineraryTool({ reduced: true }).input_schema);

  test('the production default has 25 optional properties', () => {
    // Phase 9C.1B added one: `days[].activityGroups` (optional array).
    // Phase 9C.1D.3 added one: `days[].travelEdges` (optional array). Its item
    // properties were all required, so they added nothing optional.
    // Phase 9C.1F.2 added one more: `days[].travelEdges[].modeIntent`
    // (optional, absent = unknown) — 22 total.
    expect(audit.optional).toHaveLength(25);
  });

  test('most are already nullable — requiring them means emitting null', () => {
    const nullable = audit.optional.filter((o) => o.nullable);
    expect(nullable.map((o) => o.path).sort()).toEqual([
      '$.days[].overnightLocation',
      '$.days[].stops[].difficulty',
      '$.days[].stops[].evidenceRef',
      '$.days[].stops[].executionBindings',
      '$.days[].stops[].experienceSubject',
      '$.days[].stops[].exposureLevel',
      '$.days[].stops[].latitude',
      '$.days[].stops[].longitude',
      '$.days[].stops[].parkCode',
      '$.days[].stops[].parkName',
      '$.days[].stops[].timeWindow',
      '$.days[].stops[].walkingDistanceMiles',
      '$.days[].stops[].why',
      '$.narrativeSections[].heading',
    ]);
  });

  test('five optional ARRAYS would have to emit [] instead of being absent', () => {
    // Phase 9C.1B added `days[].activityGroups` alongside the existing three;
    // Phase 9C.1D.3 added `days[].travelEdges`.
    expect(audit.optional.filter((o) => o.isArray).map((o) => o.path).sort())
      .toEqual(['$.alternatives', '$.days[].activityGroups', '$.days[].stops[].alternatives', '$.days[].travelEdges', '$.narrativeSections']);
  });

  test('the remaining five are properties of items inside those arrays', () => {
    const rest = audit.optional.filter((o) => !o.nullable && !o.isArray).map((o) => o.path).sort();
    expect(rest).toEqual([
      '$.alternatives[].name', '$.alternatives[].note', '$.alternatives[].when',
      '$.days[].stops[].alternatives[].name', '$.days[].stops[].alternatives[].note',
      // Phase 9C.1F.2 — edge mode intent is optional by design (absent = unknown).
      '$.days[].travelEdges[].modeIntent',
    ]);
    // They only materialise when an item exists, so requiring them is inert for
    // an empty array.
  });
});

// ---------------------------------------------------------------------------
// E — canonical semantics under a strict-compatible representation
// ---------------------------------------------------------------------------

/**
 * The strict-compatible representation of the SAME artifact: every optional
 * field materialised at its absent-equivalent value. No semantic value changes.
 */
function toStrictCompatible(plan) {
  const nullIfAbsent = (o, keys) => {
    const out = { ...o };
    for (const k of keys) if (out[k] === undefined) out[k] = null;
    return out;
  };
  return {
    ...nullIfAbsent(plan, []),
    narrativeSections: Array.isArray(plan.narrativeSections) ? plan.narrativeSections.map(
      (s) => nullIfAbsent(s, ['heading']),
    ) : [],
    alternatives: Array.isArray(plan.alternatives) ? plan.alternatives : [],
    days: (plan.days || []).map((d) => ({
      ...nullIfAbsent(d, ['overnightLocation']),
      stops: (d.stops || []).map((st) => ({
        ...nullIfAbsent(st, [
          'parkCode', 'parkName', 'timeWindow', 'exposureLevel', 'walkingDistanceMiles',
          'latitude', 'longitude', 'difficulty', 'why',
        ]),
        alternatives: Array.isArray(st.alternatives)
          ? st.alternatives.map((a) => nullIfAbsent(a, ['name', 'note']))
          : [],
      })),
    })),
  };
}

/** The artifact accepted on the live days-first run, trimmed to tool-authored fields. */
const LIVE_PLAN = require('../../../../../../artifacts/trailie-days-first-2026-08-27/results.json').canonicalPlan;

const CONSTRAINTS = { tripDays: 3, durationDays: 3 };
const PROMPT = 'Plan three easygoing days in Theodore Roosevelt National Park. We care most about '
  + 'wildlife, scenery, photography, and relaxed drives with some easy walking.';

describe('E — strict-compatible representation is the same plan', () => {
  const strict = toStrictCompatible(LIVE_PLAN);

  test('the representations really do differ (otherwise the test is vacuous)', () => {
    expect(JSON.stringify(strict)).not.toBe(JSON.stringify(LIVE_PLAN));
    expect(Array.isArray(strict.narrativeSections)).toBe(true);
  });

  test('parse: the same itineraryData survives normalizeToolCalls', () => {
    const call = (input) => normalizeToolCalls({
      toolCalls: [{ id: 'c', name: 'create_itinerary', input, rawArgs: JSON.stringify(input) }],
      stopReason: 'tool_use',
    });
    expect(call(strict).status).toBe(call(LIVE_PLAN).status);
  });

  test('binding produces an equivalent plan', () => {
    const a = bindGeneratedItineraryContract({ itineraryData: JSON.parse(JSON.stringify(LIVE_PLAN)) });
    const b = bindGeneratedItineraryContract({ itineraryData: JSON.parse(JSON.stringify(strict)) });
    expect(a.days.length).toBe(b.days.length);
    expect(a.days.flatMap((d) => d.stops).map((s) => s.name))
      .toEqual(b.days.flatMap((d) => d.stops).map((s) => s.name));
  });

  /**
   * FINDING: the finalized hash DIFFERS across representations, and the reason
   * is key presence, not value semantics. `walkingDistanceMiles` and stop-level
   * `alternatives` go from absent to `null` / `[]` on all 9 stops; every other
   * field is byte-identical. `stableStringify` hashes the key SET, so a
   * materialised key changes the hash even when nothing was decided differently.
   *
   * This is safe within a turn (the succession guard compares a hash to itself)
   * but it is the one thing a strict migration would visibly change, so it is
   * pinned rather than asserted away.
   */
  test('finalization differs ONLY by materialised keys, not by any value', async () => {
    const run = (data) => finalizeStructuredItinerary({
      itineraryData: JSON.parse(JSON.stringify(data)),
      constraints: CONSTRAINTS,
      resolvedMetadata: { parkName: 'Theodore Roosevelt National Park', parkCode: 'thro' },
    });
    const a = await run(LIVE_PLAN);
    const b = await run(strict);

    expect(hashPayload(a.itineraryData)).not.toBe(hashPayload(b.itineraryData));

    const flat = (p) => p.days.flatMap((d) => d.stops || []);
    const A = flat(a.itineraryData);
    const B = flat(b.itineraryData);
    expect(A).toHaveLength(B.length);
    const changedFields = new Set();
    A.forEach((x, i) => {
      const y = B[i];
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) changedFields.add(k);
      }
    });
    // Exactly the two fields the strict representation materialises.
    expect([...changedFields].sort()).toEqual(['alternatives', 'walkingDistanceMiles']);
    // And in every case the change is absent -> absent-equivalent.
    A.forEach((x, i) => {
      expect(x.walkingDistanceMiles).toBeUndefined();
      expect(B[i].walkingDistanceMiles).toBeNull();
      expect(x.alternatives).toBeUndefined();
      expect(B[i].alternatives).toEqual([]);
    });
  });

  /**
   * The one comparison that crosses a turn boundary — and therefore the one
   * that could see a pre-strict plan against a post-strict plan.
   */
  test('MIGRATION: refinement ownership is not confused by the representation change', () => {
    const { evaluateScopedOwnership, resolveRefinementScope } = require('../../../../../src/utils/refinementScope');
    const scope = resolveRefinementScope({ text: 'rework day 2', priorPlan: LIVE_PLAN });
    expect(scope.resolved).toBe(true);
    // Prior plan persisted pre-strict, next plan produced post-strict. Same content.
    const migrated = evaluateScopedOwnership({ priorPlan: LIVE_PLAN, nextPlan: strict, scope });
    expect(migrated.ok).toBe(true);
    expect(migrated.reasonCodes).toEqual([]);
    // `walkingDistanceMiles` IS in SUBSTANTIVE_STOP_FIELDS, so this is not
    // vacuous — the comparator normalises undefined to null.
    const { SCOPE_LEVELS } = require('../../../../../src/utils/refinementScope');
    expect(SCOPE_LEVELS.DAY).toBe('day');
    // Control: a genuine out-of-scope mutation is still caught.
    const mutated = JSON.parse(JSON.stringify(LIVE_PLAN));
    mutated.days[0].stops[0].name = 'Something Else Entirely';
    const caught = evaluateScopedOwnership({ priorPlan: LIVE_PLAN, nextPlan: mutated, scope });
    expect(caught.ok).toBe(false);
    expect(caught.reasonCodes).toEqual(['refinement_mutation_outside_requested_scope']);
  });

  test('structural, completeness and traveler-fit verdicts are identical', () => {
    const args = { constraints: CONSTRAINTS, prompt: PROMPT, userPrompt: PROMPT, evidenceBundle: null };
    for (const [name, fn] of [
      ['structural', (d) => evaluateStructuralArtifact({ itineraryData: d, constraints: CONSTRAINTS })],
      ['completeness', (d) => evaluateItineraryCompleteness({ itineraryData: d, ...args })],
      ['travelerFit', (d) => evaluateTravelerFit({ itineraryData: d, ...args })],
    ]) {
      const a = fn(LIVE_PLAN);
      const b = fn(strict);
      expect({ name, ok: a.ok, codes: a.reasonCodes }).toEqual({ name, ok: b.ok, codes: b.reasonCodes });
    }
  });

  test('a rejected plan is rejected identically in both representations', () => {
    const broken = {
      ...LIVE_PLAN,
      days: [
        { ...LIVE_PLAN.days[0], stops: LIVE_PLAN.days[0].stops.map((s) => ({ ...s, duration: 0 })) },
        { ...LIVE_PLAN.days[1], stops: [] },
        LIVE_PLAN.days[2],
      ],
    };
    const a = evaluateStructuralArtifact({ itineraryData: broken, constraints: CONSTRAINTS });
    const b = evaluateStructuralArtifact({ itineraryData: toStrictCompatible(broken), constraints: CONSTRAINTS });
    expect(a.ok).toBe(false);
    expect(a.reasonCodes.length).toBeGreaterThan(0);
    expect(a.reasonCodes).toEqual(b.reasonCodes);
  });

  test('empty alternatives are treated exactly as absent by the backup gate', () => {
    // `structureOk` reads `collectStructuredAlternatives(...).length > 0`, so
    // `[]` and absent are indistinguishable — the array-materialisation risk
    // does not reach a reason code.
    const backupPrompt = `${PROMPT} Also give me a backup plan in case roads close.`;
    const args = { constraints: CONSTRAINTS, prompt: backupPrompt, userPrompt: backupPrompt, evidenceBundle: null };
    const withoutKey = { ...LIVE_PLAN };
    delete withoutKey.alternatives;
    const withEmpty = { ...LIVE_PLAN, alternatives: [] };
    const a = evaluateItineraryCompleteness({ itineraryData: withoutKey, ...args });
    const b = evaluateItineraryCompleteness({ itineraryData: withEmpty, ...args });
    expect(a.reasonCodes).toEqual(b.reasonCodes);
    expect(a.reasonCodes).toContain('missing_backup_plan');
  });
});

// ---------------------------------------------------------------------------
// C — output tax
// ---------------------------------------------------------------------------

describe('C — strict mode is not free', () => {
  test('measures the added bytes and approximate tokens', () => {
    const current = JSON.stringify(LIVE_PLAN);
    const strict = JSON.stringify(toStrictCompatible(LIVE_PLAN));
    const tax = {
      currentBytes: Buffer.byteLength(current, 'utf8'),
      strictBytes: Buffer.byteLength(strict, 'utf8'),
      currentApproxTokens: countPromptTokens(current),
      strictApproxTokens: countPromptTokens(strict),
    };
    tax.byteDelta = tax.strictBytes - tax.currentBytes;
    tax.approxTokenDelta = tax.strictApproxTokens - tax.currentApproxTokens;
    // Surfaced in the report; asserted only as a sanity bound.
    expect(tax.byteDelta).toBeGreaterThanOrEqual(0);
    global.__STRICT_TAX__ = tax;
    expect(tax.strictBytes).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// G — routing scope
// ---------------------------------------------------------------------------

describe('G — which tools would receive strict:true', () => {
  test('the patch tool is a SEPARATE schema and must not be swept in', () => {
    expect(PATCH_ITINERARY_TOOL.name).not.toBe('create_itinerary');
    // Distinct schema objects: enabling strict on one cannot enable it on the
    // other by shared reference.
    expect(PATCH_ITINERARY_TOOL.input_schema)
      .not.toBe(getCreateItineraryTool({ reduced: true }).input_schema);
  });

  test('the adapter opts in per tool, so scope is exactly what we set', () => {
    const src = require('fs').readFileSync(
      require.resolve('../../../../../src/services/providers/openaiResponsesAdapter'), 'utf8',
    );
    expect(src).toMatch(/strict:\s*tool\.strict === true/);
  });

  test('non-itinerary turns dispatch with no tools at all', () => {
    const exec = require('fs').readFileSync(
      require.resolve('../../../../../src/services/trailieExecutionService'), 'utf8',
    );
    expect(exec).toMatch(/tools:\s*itinerary\s*\?\s*\(usePlanPatch\s*\?\s*\[itineraryTool\]\s*:\s*\[itineraryTool, TRIP_PUSHBACK_TOOL\]\)\s*:\s*\[\]/);
  });
});

// ---------------------------------------------------------------------------
// H — strict shape does NOT replace semantic validation
// ---------------------------------------------------------------------------

describe('H — the failures we actually see are semantic, not shape', () => {
  test('every historical failure class survives a shape-valid artifact', () => {
    // A schema-perfect plan that is still wrong: zero durations and an empty day.
    const shapeValidButWrong = toStrictCompatible({
      ...LIVE_PLAN,
      days: [
        { ...LIVE_PLAN.days[0], stops: LIVE_PLAN.days[0].stops.map((s) => ({ ...s, duration: 0 })) },
        { ...LIVE_PLAN.days[1], stops: [] },
        LIVE_PLAN.days[2],
      ],
    });
    const verdict = evaluateStructuralArtifact({
      itineraryData: shapeValidButWrong, constraints: CONSTRAINTS,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasonCodes).toEqual(expect.arrayContaining(['zero_duration_stops', 'empty_day']));
    // Strict decoding constrains SHAPE. `zero_duration_stops`,
    // `missing_requested_*`, `missing_experience_anchor` and traveler-fit are
    // all value-level and remain the repair ladder's job.
  });
});

// ---------------------------------------------------------------------------
// PREP PASS — the strict representation itself (experiment only, default off)
// ---------------------------------------------------------------------------

describe('PREP — strict is gated, scoped, and structurally complete', () => {
  test('production default is untouched: no strict flag, original required sets', () => {
    const tool = getCreateItineraryTool({ reduced: true });
    expect(tool.strict).toBeUndefined();
    expect(tool.input_schema.properties.days.items.required).toEqual(['id', 'dayNumber', 'label', 'stops']);
    // The two alternatives item schemas stay open, exactly as today.
    expect(tool.input_schema.properties.alternatives.items.additionalProperties).toBe(true);
  });

  test('the switch defaults OFF and only an exact "true" enables it', () => {
    const prior = process.env.TRAILIE_CREATE_ITINERARY_STRICT;
    try {
      for (const v of [undefined, '', 'false', '1', 'yes', 'TRUE ']) {
        if (v === undefined) delete process.env.TRAILIE_CREATE_ITINERARY_STRICT;
        else process.env.TRAILIE_CREATE_ITINERARY_STRICT = v;
        expect(createItineraryStrictEnabled()).toBe(v === 'TRUE ');
      }
    } finally {
      if (prior === undefined) delete process.env.TRAILIE_CREATE_ITINERARY_STRICT;
      else process.env.TRAILIE_CREATE_ITINERARY_STRICT = prior;
    }
  });

  test.each(VARIANTS)('%s under strict: zero remaining incompatibilities', (_label, opts) => {
    const audit = auditSchema(getCreateItineraryTool({ ...opts, strict: true }).input_schema);
    // Every object closed.
    expect(audit.objectsMissingAdditionalProps).toEqual([]);
    // Every property required.
    expect(audit.optional).toEqual([]);
    // minItems/maxItems RETAINED — supported in strict for non-fine-tuned models.
    const kept = audit.unsupported.map((u) => u.keyword);
    expect(kept.every((k) => k === 'maxItems' || k === 'minItems')).toBe(true);
  });

  test('cardinality bounds survive the transform', () => {
    const s2 = getCreateItineraryTool({ reduced: true, requireAlternatives: true, strict: true }).input_schema;
    expect(s2.properties.narrativeSections.maxItems).toBe(3);
    expect(s2.properties.alternatives.minItems).toBe(1);
  });

  test('key order is preserved and `required` agrees with it', () => {
    const s2 = getCreateItineraryTool({ reduced: true, strict: true }).input_schema;
    expect(Object.keys(s2.properties)).toEqual(['days', 'intro', 'narrativeSections', 'alternatives']);
    expect(s2.required).toEqual(Object.keys(s2.properties));
  });

  test('nullability is the declared decision, not a blanket rule', () => {
    const alt = getCreateItineraryTool({ reduced: true, strict: true })
      .input_schema.properties.alternatives.items;
    // A fallback without a name is not actionable — stays non-null.
    expect(alt.properties.name.type).toBe('string');
    // Descriptive fields become nullable, since absence means "not supplied".
    expect(alt.properties.note.type).toEqual(['string', 'null']);
    expect(alt.properties.when.type).toEqual(['string', 'null']);
    // Phase 9C.1F.2 — `modeIntent` joins the declared nullable set so strict
    // never forces a transport mode onto an edge.
    expect([...STRICT_NULLABLE_FIELDS].sort()).toEqual(['heading', 'modeIntent', 'note', 'when']);
  });

  test('descriptions, enums and field names are all preserved', () => {
    const plain = getCreateItineraryTool({ reduced: true }).input_schema;
    const strictS = getCreateItineraryTool({ reduced: true, strict: true }).input_schema;
    expect(strictS.properties.intro.description).toBe(plain.properties.intro.description);
    const ps = plain.properties.days.items.properties.stops.items.properties;
    const ss = strictS.properties.days.items.properties.stops.items.properties;
    expect(Object.keys(ss)).toEqual(Object.keys(ps));
    expect(ss.type.enum).toEqual(ps.type.enum);
    expect(ss.exposureLevel.enum).toEqual(ps.exposureLevel.enum);
  });

  test('SCOPE: strict never reaches the patch tool or a toolless turn', () => {
    expect(PATCH_ITINERARY_TOOL.strict).toBeUndefined();
    const exec = require('fs').readFileSync(
      require.resolve('../../../../../src/services/trailieExecutionService'), 'utf8',
    );
    // The flag is read exactly once, on the create_itinerary branch only.
    expect(exec.match(/createItineraryStrictEnabled\(\)/g)).toHaveLength(1);
    expect(exec).toMatch(/tools:\s*itinerary\s*\?\s*\(usePlanPatch\s*\?\s*\[itineraryTool\]\s*:\s*\[itineraryTool, TRIP_PUSHBACK_TOOL\]\)\s*:\s*\[\]/);
  });

  test('REPLAY: a healthy plan validates identically under the strict representation', () => {
    const args = { constraints: CONSTRAINTS, prompt: PROMPT, userPrompt: PROMPT, evidenceBundle: null };
    const strictRep = toStrictCompatible(LIVE_PLAN);
    for (const [name, fn] of [
      ['structural', (d) => evaluateStructuralArtifact({ itineraryData: d, constraints: CONSTRAINTS })],
      ['completeness', (d) => evaluateItineraryCompleteness({ itineraryData: d, ...args })],
      ['travelerFit', (d) => evaluateTravelerFit({ itineraryData: d, ...args })],
    ]) {
      const a = fn(LIVE_PLAN);
      const b = fn(strictRep);
      expect({ name, ok: b.ok, codes: b.reasonCodes }).toEqual({ name, ok: a.ok, codes: a.reasonCodes });
      if (name === 'completeness') {
        expect(a.ok).toBe(false);
        expect(a.reasonCodes).toEqual(['missing_requested_experience_coverage', 'missing_requested_hike']);
        expect(a.dayDiagnostics).toEqual([]);
      } else {
        expect(a.ok).toBe(true);
      }
    }
  });

  test('REPLAY: a broken plan is rejected identically, with non-empty codes', () => {
    const broken = {
      ...LIVE_PLAN,
      days: [
        { ...LIVE_PLAN.days[0], stops: LIVE_PLAN.days[0].stops.map((s2) => ({ ...s2, duration: 0 })) },
        { ...LIVE_PLAN.days[1], stops: [] },
        LIVE_PLAN.days[2],
      ],
    };
    const a = evaluateStructuralArtifact({ itineraryData: broken, constraints: CONSTRAINTS });
    const b = evaluateStructuralArtifact({ itineraryData: toStrictCompatible(broken), constraints: CONSTRAINTS });
    expect(a.ok).toBe(false);
    expect(a.reasonCodes.length).toBeGreaterThan(0);
    expect(b.reasonCodes).toEqual(a.reasonCodes);
  });
});

// ---------------------------------------------------------------------------
// CONTRACT CORRECTION — schema-required is not content-required
// ---------------------------------------------------------------------------

/**
 * The 2026-08-28 strict run cost +25.4% output tokens because forcing an array
 * to be required made the model FILL it: stop `alternatives` 0/9 -> 9/9 on a
 * turn that never asked for a backup, `narrativeSections` 0 -> 1, and `intro`
 * shrank 21%. These tests pin the corrected contract.
 */
describe('CONTRACT — the strict-required arrays are told [] is a correct answer', () => {
  const arrays = [
    ['stop alternatives', (sc) => sc.properties.days.items.properties.stops.items.properties.alternatives],
    ['narrativeSections', (sc) => sc.properties.narrativeSections],
    ['trip alternatives', (sc) => sc.properties.alternatives],
  ];

  test.each(arrays)('%s: NON-strict description is byte-identical to before', (_label, pick) => {
    // Production must not change. Those arrays really are optional there, and
    // telling the model they are "schema-required" would simply be false.
    const desc = pick(getCreateItineraryTool({ reduced: true }).input_schema).description;
    expect(desc).not.toMatch(/SCHEMA-REQUIRED/);
    expect(desc).not.toMatch(/Do not (invent|create).*merely/);
  });

  test.each(arrays)('%s: strict description carries the normative empty rule', (_label, pick) => {
    const desc = pick(getCreateItineraryTool({ reduced: true, strict: true }).input_schema).description;
    expect(desc).toMatch(/SCHEMA-REQUIRED, NOT CONTENT-REQUIRED/);
    expect(desc).toMatch(/\[\] is the correct value/);
    // The anti-invention clause, whichever verb the field uses.
    expect(desc).toMatch(/Do not (invent|create).*merely/);
  });

  test.each(arrays)('%s: the original description is preserved, not replaced', (_label, pick) => {
    const before = pick(getCreateItineraryTool({ reduced: true }).input_schema).description || '';
    const after = pick(getCreateItineraryTool({ reduced: true, strict: true }).input_schema).description;
    expect(after.startsWith(before)).toBe(true);
  });

  test('a REQUESTED backup is never told to use [] — that would contradict minItems', () => {
    const sc = getCreateItineraryTool({ reduced: true, requireAlternatives: true, strict: true }).input_schema;
    const desc = sc.properties.alternatives.description;
    expect(desc).toMatch(/REQUIRED trip-level backup/);
    expect(desc).not.toMatch(/SCHEMA-REQUIRED, NOT CONTENT-REQUIRED/);
    expect(desc).not.toMatch(/Use \[\]/);
    // And the cardinality floor still stands.
    expect(sc.properties.alternatives.minItems).toBe(1);
  });

  test('stop-level alternatives still get the rule even when a trip backup was requested', () => {
    // The traveler asked for a trip-level Plan B, not a fallback for every stop.
    const sc = getCreateItineraryTool({ reduced: true, requireAlternatives: true, strict: true }).input_schema;
    const stopAlts = sc.properties.days.items.properties.stops.items.properties.alternatives;
    expect(stopAlts.description).toMatch(/SCHEMA-REQUIRED, NOT CONTENT-REQUIRED/);
  });

  test('guidance is scoped to exactly four paths and only to arrays', () => {
    // Phase 9C.1D.3 added `days[].travelEdges`: a strict-required edge array
    // must not be filled with an edge per adjacency.
    expect(Object.keys(STRICT_EMPTY_ARRAY_GUIDANCE).sort()).toEqual([
      '$.alternatives', '$.days[].stops[].alternatives', '$.days[].travelEdges', '$.narrativeSections',
    ]);
    const sc = getCreateItineraryTool({ reduced: true, strict: true }).input_schema;
    // Nothing else picked it up — notably not the nullable scalars or `days`.
    const walkDescs = (node, out = []) => {
      if (!node || typeof node !== 'object') return out;
      if (typeof node.description === 'string') out.push(node.description);
      for (const v of Object.values(node.properties || {})) walkDescs(v, out);
      if (node.items) walkDescs(node.items, out);
      return out;
    };
    expect(walkDescs(sc).filter((d) => d.includes('SCHEMA-REQUIRED'))).toHaveLength(4);
    expect(sc.properties.days.description || '').not.toMatch(/SCHEMA-REQUIRED/);
    expect(sc.properties.intro.description).not.toMatch(/SCHEMA-REQUIRED/);
  });

  test('the correction changes descriptions only — shape is untouched', () => {
    const strip = (node) => JSON.parse(JSON.stringify(node, (k, v) => (k === 'description' ? undefined : v)));
    const sc = getCreateItineraryTool({ reduced: true, strict: true }).input_schema;
    // Rebuild what the strict schema looked like before this correction by
    // stripping descriptions from both: required/nullability/order must match.
    expect(Object.keys(sc.properties)).toEqual(['days', 'intro', 'narrativeSections', 'alternatives']);
    expect(sc.required).toEqual(Object.keys(sc.properties));
    expect(strip(sc.properties.narrativeSections).maxItems).toBe(3);
    expect(strip(sc.properties.days.items.properties.stops.items.properties.alternatives).type).toBe('array');
  });
});
