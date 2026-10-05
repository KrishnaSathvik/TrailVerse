'use strict';

const fs = require('fs');
const path = require('path');
const {
  CREATE_ITINERARY_TOOL,
  isValidToolItinerary,
  normalizeItineraryIntro,
  renderProseFromToolItinerary,
} = require('../itineraryToolSchema');
const { renderV2Content } = require('../../services/trailieV2RouteBridge');

const Q3_ENVELOPE = path.resolve(
  __dirname,
  '../../../../artifacts/trailie-q3-after-q2-inspect-2026-08-12/q3-envelope.json'
);

const Q3_INTRO =
  'For a relaxed weekend, I’d keep Valley of Fire simple: one scenic afternoon after the drive from Vegas, then an early second morning before the heat builds.';

describe('create_itinerary intro field', () => {
  test('schema requires a spoken intro without making older day payloads invalid', () => {
    // Set, not order: `intro` is still required. The order is days-first as of
    // 2026-08-27 (production order, not semantics) and is asserted in
    // daysFirstOutputOrder.test.js.
    expect([...CREATE_ITINERARY_TOOL.input_schema.required].sort()).toEqual(['days', 'intro']);
    expect(CREATE_ITINERARY_TOOL.input_schema.properties.intro).toMatchObject({ type: 'string' });
    expect(CREATE_ITINERARY_TOOL.input_schema.properties.intro.description).toMatch(/traveler-facing opening/i);
    expect(CREATE_ITINERARY_TOOL.input_schema.properties.narrativeSections.maxItems).toBe(3);
    expect(CREATE_ITINERARY_TOOL.input_schema.required).not.toContain('narrativeSections');
    expect(isValidToolItinerary({
      days: [{ id: 'day-1', dayNumber: 1, label: 'Day 1', stops: [] }],
    })).toBe(true);
  });

  test('renders the spoken intro instead of synthesizing At a glance', () => {
    const plan = {
      intro: Q3_INTRO,
      days: [{
        id: 'day-1',
        dayNumber: 1,
        label: 'Saturday — Las Vegas to Valley of Fire',
        stops: [{ id: 's1', order: 1, type: 'landmark', name: 'The Beehives', note: 'Easy stop' }],
      }],
    };
    expect(renderProseFromToolItinerary(plan)).toBe(Q3_INTRO);
    expect(renderProseFromToolItinerary(plan)).not.toMatch(/At a glance/i);
    expect(renderProseFromToolItinerary({ days: plan.days })).toBe('');
  });

  test('strips a leading At a glance heading if the model ignores the contract', () => {
    expect(normalizeItineraryIntro('**At a glance** For a relaxed weekend, keep it simple.'))
      .toBe('For a relaxed weekend, keep it simple.');
  });
});

describe('captured Q3 plan — offline intro rendering', () => {
  test('attaching intro to the captured Q3 plan yields spoken opening, not At a glance', () => {
    expect(fs.existsSync(Q3_ENVELOPE)).toBe(true);
    const captured = JSON.parse(fs.readFileSync(Q3_ENVELOPE, 'utf8'));
    const plan = { ...captured.canonicalPlan, intro: Q3_INTRO };
    expect(plan.days).toHaveLength(2);
    expect(plan.alternatives).toEqual([]);

    const content = renderV2Content({
      canonicalPlan: plan,
      response: { text: '' },
    });
    expect(content).toBe(Q3_INTRO);
    expect(content).not.toMatch(/At a glance/i);
    expect(content).not.toMatch(/The Beehives/);
  });
});
