'use strict';

/**
 * PATCH GENERATION CONTRACT.
 *
 * `applyPlanPatch` now refuses ambiguous targets, targetless stop operations
 * and evidence-bound field rewrites. The generator has never been told any of
 * that. Shipping a validator the model cannot see turns the next live turn into
 * a test of whether the repair ladder can teach after the fact — not whether
 * the first patch is right.
 *
 * These are GENERATION instructions and schema descriptions. No validation
 * semantics are asserted here and none change.
 */

const {
  PATCH_ITINERARY_TOOL,
  PATCH_GENERATION_INSTRUCTION,
} = require('../itineraryToolSchema');
const { EVIDENCE_BOUND_STOP_FIELDS } = require('../itineraryPlanPatch');

const operationProps = PATCH_ITINERARY_TOOL.input_schema.properties.operations.items.properties;

describe('target identity is explained to the generator', () => {
  test('stopId says to copy the exact id and to prefer it', () => {
    const text = String(operationProps.stopId.description || '');
    expect(text).toMatch(/exact/i);
    expect(text).toMatch(/stopId/);
    expect(text).toMatch(/prefer|whenever it is present|when available/i);
    expect(text).toMatch(/canonical itinerary/i);
  });

  test('stopName says fallback only, copied verbatim', () => {
    const text = String(operationProps.stopName.description || '');
    expect(text).toMatch(/fallback/i);
    expect(text).toMatch(/exact/i);
    expect(text).toMatch(/abbreviat/i);
    expect(text).toMatch(/paraphras|rename/i);
  });

  test('a stop mutation without a target is called out as invalid', () => {
    const text = `${PATCH_GENERATION_INSTRUCTION} ${PATCH_ITINERARY_TOOL.description}`;
    expect(text).toMatch(/update_stop|remove_stop|stop operation/i);
    expect(text).toMatch(/without a target|never omit|must identify|always include/i);
  });
});

describe('evidence-bound fields are explained to the generator', () => {
  const text = PATCH_GENERATION_INSTRUCTION;

  test('the instruction names the preserved properties', () => {
    expect(text).toMatch(/exposure/i);
    expect(text).toMatch(/difficulty/i);
    expect(text).toMatch(/access|walking/i);
  });

  test('it says preferences change the plan, not facts about the place', () => {
    expect(text).toMatch(/same stop|same place|identity/i);
    expect(text).toMatch(/preserve/i);
    expect(text).toMatch(/authoritative evidence/i);
  });

  test('it names what to change instead', () => {
    expect(text).toMatch(/duration/i);
    expect(text).toMatch(/timing|time window/i);
    expect(text).toMatch(/scope|sequenc|selection/i);
  });

  test('every guarded field is either named or covered by the wording', () => {
    // The traveler-visible vocabulary, not the field identifiers.
    const covered = { exposureLevel: /exposure/i, exposure: /exposure/i,
      difficulty: /difficulty/i, physicalDifficulty: /difficulty/i,
      walkingDistanceMiles: /walking|access/i };
    for (const field of EVIDENCE_BOUND_STOP_FIELDS) {
      expect(covered[field]).toBeDefined();
      expect(text).toMatch(covered[field]);
    }
  });
});

describe('delta-true prose is asked for, not enforced', () => {
  test('the instruction asks the response to describe only real changes', () => {
    expect(PATCH_GENERATION_INSTRUCTION).toMatch(/did not (actually )?(occur|happen)|only.*actually changed/i);
  });
});

describe('the schema stays structured-output safe', () => {
  test('shape is unchanged apart from descriptions', () => {
    const schema = PATCH_ITINERARY_TOOL.input_schema;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['response', 'operations']);
    expect(schema.properties.operations.items.required).toEqual(['op', 'dayNumber']);
    expect(schema.properties.operations.items.additionalProperties).toBe(false);
    expect(JSON.stringify(schema)).not.toMatch(/"oneOf"|"anyOf"|"allOf"|"not"/);
    expect(operationProps.stopId.type).toEqual(['string', 'null']);
    expect(operationProps.stopName.type).toEqual(['string', 'null']);
  });

  test('the bounded patch rule the tool already carried is still there', () => {
    expect(PATCH_ITINERARY_TOOL.description).toMatch(/unaffected days/i);
  });
});

describe('the execution service sends this exact instruction', () => {
  test('the patch turn instruction is the shared contract, not a local string', () => {
    const source = require('fs').readFileSync(
      require('path').resolve(__dirname, '..', '..', 'services', 'trailieExecutionService.js'),
      'utf8'
    );
    expect(source).toMatch(/PATCH_GENERATION_INSTRUCTION/);
    // The old inline copy must be gone, or the two drift apart silently.
    expect(source).not.toMatch(/'Call patch_itinerary\. Return only explicit operations/);
  });
});

describe('repair text matches the rule that was broken', () => {
  const { patchRepairInstruction } = require('../itineraryToolSchema');

  test('a target failure is told to use the exact stopId', () => {
    const text = patchRepairInstruction(['plan_patch_target_not_found']);
    expect(text).toMatch(/exact stopId/i);
    expect(text).toMatch(/canonical itinerary/i);
  });

  test('an ambiguous target is told why the name was not enough', () => {
    const text = patchRepairInstruction(['plan_patch_target_ambiguous']);
    expect(text).toMatch(/more than one|two stops|ambiguous/i);
    expect(text).toMatch(/stopId/);
  });

  test('a missing target is told to supply one', () => {
    expect(patchRepairInstruction(['plan_patch_target_missing'])).toMatch(/stopId or stopName/i);
  });

  test('an evidence-field mutation is told to change the plan instead', () => {
    const text = patchRepairInstruction(['plan_patch_evidence_field_mutation']);
    expect(text).toMatch(/exposure|difficulty|access/i);
    expect(text).toMatch(/preserve|unchanged/i);
    expect(text).toMatch(/duration|timing|scope/i);
  });

  test('an unrecognised code still yields the general bounded-patch rule', () => {
    const text = patchRepairInstruction(['something_else']);
    expect(text).toMatch(/bounded patch/i);
    expect(text.length).toBeGreaterThan(0);
  });
});

describe('the resolved target is offered, not requested', () => {
  const { renderRefinementTargetForPrompt } = require('../itineraryToolSchema');
  const { resolveRefinementScope } = require('../refinementScope');

  const plan = {
    days: [
      { day: 1, dayNumber: 1, stops: [
        { id: 'welcome-center', name: 'Welcome Center', timeWindow: 'Morning' },
        { id: 'steam-vents', name: 'Steam Vents', timeWindow: 'Late morning' }] },
      { day: 2, dayNumber: 2, stops: [
        { id: 'mauna-loa-road', name: 'Mauna Loa Road scenic drive', timeWindow: 'Morning through midday' },
        { id: 'kipukapuaulu', name: 'Kīpukapuaulu', timeWindow: 'Afternoon' }] },
    ],
  };

  test('a singular target tells the model it need not name it', () => {
    const scope = resolveRefinementScope({ text: 'The second morning sounds like a little too much.', priorPlan: plan });
    const text = renderRefinementTargetForPrompt(scope);
    expect(text).toMatch(/day 2/i);
    expect(text).toMatch(/morning/i);
    expect(text).toMatch(/mauna-loa-road/);
    expect(text).toMatch(/already resolved|do not need to|supplied for you/i);
  });

  test('several targets are offered as a closed list', () => {
    const scope = resolveRefinementScope({ text: 'The first morning feels rushed, can we slow it down?', priorPlan: plan });
    const text = renderRefinementTargetForPrompt(scope);
    expect(text).toMatch(/welcome-center/);
    expect(text).toMatch(/steam-vents/);
    expect(text).not.toMatch(/kipukapuaulu/);
    expect(text).toMatch(/only these|choose from/i);
  });

  test('a day-scoped request says the whole day is in scope', () => {
    const scope = resolveRefinementScope({ text: 'Redo day two, it is way too busy.', priorPlan: plan });
    expect(renderRefinementTargetForPrompt(scope)).toMatch(/whole of day 2|entire day 2|all of day 2/i);
  });

  test('an unresolved scope offers nothing at all', () => {
    const scope = resolveRefinementScope({ text: 'Can we take that part easier?', priorPlan: plan });
    expect(renderRefinementTargetForPrompt(scope)).toBe('');
  });
});
