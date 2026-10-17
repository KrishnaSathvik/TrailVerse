'use strict';

/**
 * Phase 8E — small generation-quality pass.
 *
 * Scope: prompt/schema-description authoring only (no new fields, no routing,
 * no evidence, no presentation changes). Targets: concise opening, experience-
 * first stop selection, grounded (not generic) overnightLocation, non-canned
 * endings. Also pins that the Phase 8D.6.1 unverified-driving hedge survives
 * untouched.
 */

const { getCreateItineraryTool } = require('../itineraryToolSchema');
const { TASK_CONTRACTS } = require('../../prompts/trailieTaskContractsV2');
const { countPromptTokens } = require('../promptTokenAccounting');
const { parseConstraints, buildConstraintBlock } = require('../constraintEngine');

function schemaFor(options = {}) {
  return getCreateItineraryTool(options).input_schema;
}

describe('Phase 8E — intro (opening) authoring', () => {
  test('guides toward a normally-short opening, not a mandatory long one', () => {
    const { intro } = schemaFor().properties;
    expect(intro.description).toMatch(/1.{0,3}3 sentences/i);
    expect(intro.description).not.toMatch(/not a 1.{0,3}3 sentence stub/i);
  });

  test('forbids restating the itinerary or advertising Trailie in the opening', () => {
    const { intro } = schemaFor().properties;
    expect(intro.description).toMatch(/restat/i);
    expect(intro.description).toMatch(/advertis/i);
  });

  test('discourages mechanical "designed to optimize" planning-process voice', () => {
    const { intro } = schemaFor().properties;
    expect(intro.description).toMatch(/designed to optimize/i);
  });

  test('survives the reduced (Tier-1) production schema unchanged', () => {
    const { intro } = schemaFor({ reduced: true }).properties;
    expect(intro.description).toMatch(/1.{0,3}3 sentences/i);
  });
});

describe('Phase 8E — experience-first stop selection', () => {
  test('stops array guidance prefers park-defining experiences over operational stops', () => {
    const day = schemaFor().properties.days.items;
    const { stops } = day.properties;
    expect(stops.description).toMatch(/park-defining|experience/i);
    expect(stops.description).toMatch(/visitor_center|operational/i);
  });

  test('operational stops remain allowed when useful, not banned outright', () => {
    const day = schemaFor().properties.days.items;
    expect(day.properties.stops.description).toMatch(/when (?:the traveler asked|useful|requested)/i);
  });
});

describe('Phase 8E — overnightLocation authoring', () => {
  test('has a description guiding toward a grounded concrete base', () => {
    const day = schemaFor().properties.days.items;
    expect(day.properties.overnightLocation.description).toBeTruthy();
    expect(day.properties.overnightLocation.description).toMatch(/concrete/i);
  });

  test('discourages generic filler like "near the park"', () => {
    const day = schemaFor().properties.days.items;
    expect(day.properties.overnightLocation.description).toMatch(/near the park/i);
  });

  test('still allows null when no base is grounded', () => {
    const day = schemaFor().properties.days.items;
    expect(day.properties.overnightLocation.type).toEqual(expect.arrayContaining(['null']));
    expect(day.properties.overnightLocation.description).toMatch(/null/i);
  });
});

describe('Phase 8E — non-canned endings', () => {
  test('narrativeSections guidance forbids a generic "let me know" style close', () => {
    const { narrativeSections } = schemaFor().properties;
    expect(narrativeSections.description).toMatch(/let me know/i);
  });

  test('narrativeSections guidance keeps after_plan conditional for full itineraries', () => {
    const { narrativeSections } = schemaFor().properties;
    expect(narrativeSections.description).toMatch(/after_plan/i);
    expect(narrativeSections.description).toMatch(/material issue/i);
    expect(narrativeSections.description).not.toMatch(/omit entirely \(empty array\)/i);
  });
});

describe('Phase 8E — architect task contract stays within token budget', () => {
  test('architect contract plus task-contract header still fits the 800-token section budget', () => {
    const header = '--- TASK CONTRACT: architect ---';
    expect(countPromptTokens(`${header}\n${TASK_CONTRACTS.architect.text}`)).toBeLessThanOrEqual(800);
  });
});

describe('Phase 8E — Phase 8D.6.1 unverified-driving hedge is untouched', () => {
  test('explicit driving-feasibility constraint on a single-park trip still gets the truthful hedge', () => {
    const c = parseConstraints({}, 'Plan me 3 days in Yellowstone and keep the driving realistic.');
    const block = buildConstraintBlock(c);
    expect(block).toMatch(/HARD RULE/i);
    expect(block).toMatch(/not (?:currently )?available|not verified/i);
  });
});
