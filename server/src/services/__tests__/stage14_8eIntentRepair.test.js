'use strict';

/**
 * Stage 14.8E.1 — contextual-recommendation intent and candidate extraction.
 *
 * Stage 14.8E was re-filed FAIL_CONTEXT_INTEGRITY because a benign request —
 *
 *   "From the places already in this trip, pick the three best photo stops and
 *    tell me why. Don't add any new stops, and don't check live conditions."
 *
 * — entered destination-change resolution:
 *
 *   `pick` + `trip`                  → destinationChangeIntent: true
 *   compare-option extraction split  → candidate "and don't check live conditions."
 *   canonical-identity guard         → mutation rejected (the only thing that saved it)
 *
 * The outcome was correct, but a junk candidate reached the mutation pipeline.
 * These tests close the two upstream holes while keeping the canonical guard.
 *
 * No provider is constructed or dispatched anywhere in this suite.
 */

const {
  extractUserOrderedCompareOptions,
  resolveActiveTripContext,
} = require('../activeTripContextService');
const {
  DESTINATION_REJECTION,
  classifyDestinationChangeIntent,
  isEligibleDestinationOption,
  resolveDestinationMutation,
} = require('../destinationIntegrity');

const STAGE_14_8E_MESSAGE =
  'From the places already in this trip, pick the three best photo stops and tell me why. '
  + "Don't add any new stops, and don't check live conditions.";

const YOSEMITE = { name: 'Yosemite', parkCode: 'yose', type: 'nps', confidence: 'high' };

describe('Stage 14.8E.1 §2 — the exact defect no longer occurs', () => {
  it('does not read the Stage 14.8E message as destination-change intent', () => {
    expect(classifyDestinationChangeIntent(STAGE_14_8E_MESSAGE)).toMatchObject({ intent: false });
  });

  it('extracts no compare options from it', () => {
    expect(extractUserOrderedCompareOptions(STAGE_14_8E_MESSAGE)).toEqual([]);
  });

  it('never admits the junk trailing clause as a destination candidate', () => {
    const verdict = isEligibleDestinationOption({ name: "and don't check live conditions." });
    expect(verdict.eligible).toBe(false);
  });

  it('holds Yosemite for the exact message', () => {
    const result = resolveActiveTripContext({
      lastUserMessage: STAGE_14_8E_MESSAGE,
      storedContext: { primaryDestination: YOSEMITE, lockedPlanDestination: YOSEMITE },
    });
    expect(result.activeTripContext.primaryDestination).toMatchObject({
      name: 'Yosemite', parkCode: 'yose',
    });
    expect(result.activeTripContext.destinationMutation?.candidateDestination ?? null).toBeNull();
  });
});

describe('Stage 14.8E.1 §3 — the OBJECT of the action decides, not the verb', () => {
  it.each([
    'pick the three best photo stops',
    'choose two viewpoints',
    'select the easiest walks',
    'recommend a restaurant',
    'rank the stops',
    'pick the best day',
    'choose what to pack',
  ])('%s is not a destination change', (message) => {
    expect(classifyDestinationChangeIntent(message).intent).toBe(false);
  });

  it.each([
    'pick Zion instead',
    'choose the second park',
    'select Yosemite',
    'go with the other destination',
    'switch this trip to Zion',
  ])('%s is a destination change', (message) => {
    expect(classifyDestinationChangeIntent(message).intent).toBe(true);
  });
});

describe('Stage 14.8E.1 §4 — "this trip" references the existing trip', () => {
  it.each([
    'from the places already in this trip, pick the three best photo stops',
    'for this trip, what should I bring',
    'given this same trip, what should I pack if I want to keep it light',
    'what should I pack for the trip',
  ])('%s preserves the locked destination', (message) => {
    expect(classifyDestinationChangeIntent(message).intent).toBe(false);
    const result = resolveActiveTripContext({
      lastUserMessage: message,
      storedContext: { primaryDestination: YOSEMITE, lockedPlanDestination: YOSEMITE },
    });
    expect(result.activeTripContext.primaryDestination).toMatchObject({ parkCode: 'yose' });
  });

  it.each([
    'switch this trip to Zion',
    'change the trip to Yellowstone',
    'make this a Grand Canyon trip instead',
  ])('%s does enter destination-change handling', (message) => {
    expect(classifyDestinationChangeIntent(message).intent).toBe(true);
  });
});

describe('Stage 14.8E.1 §5 — candidate extraction rejects clause debris', () => {
  const DEBRIS = [
    "and don't check live conditions",
    'but keep it easy',
    'and tell me why',
    'without adding new stops',
    'if possible',
    'for this trip',
    'from the places already here',
    'the three best photo stops and tell me why',
  ];

  it.each(DEBRIS)('%s is not a destination candidate', (fragment) => {
    expect(isEligibleDestinationOption({ name: fragment }).eligible).toBe(false);
  });

  it('extracts no options from an instruction sentence with commas', () => {
    expect(extractUserOrderedCompareOptions(
      "pick the easiest walks, and don't add new stops, and keep it short"
    )).toEqual([]);
  });

  it('still extracts a genuine user compare list', () => {
    const options = extractUserOrderedCompareOptions(
      'For a first national park trip with my wife, should we choose Acadia, Shenandoah, or Great Smoky Mountains?'
    );
    expect(options.map((o) => o.parkCode)).toEqual(['acad', 'shen', 'grsm']);
  });
});

describe('Stage 14.8E.1 §6 — candidates need positive destination evidence', () => {
  it('accepts a canonical park', () => {
    expect(isEligibleDestinationOption({ name: 'Zion National Park', parkCode: 'zion' }).eligible).toBe(true);
  });

  it('accepts a proper-noun place phrase offered as a destination', () => {
    expect(isEligibleDestinationOption({ name: 'Sedona red rock country' }).eligible).toBe(true);
  });

  it('rejects a lowercase prose phrase that merely avoids the denylist', () => {
    const verdict = isEligibleDestinationOption({ name: 'the best photo stops' });
    expect(verdict.eligible).toBe(false);
    expect(Object.values(DESTINATION_REJECTION)).toContain(verdict.reason);
  });

  it('rejects a negated instruction fragment', () => {
    expect(isEligibleDestinationOption({ name: "don't check live conditions" }).eligible).toBe(false);
  });
});

describe('Stage 14.8E.1 §7 — explicit destination changes still work', () => {
  const withOptions = (message, list) => resolveActiveTripContext({
    lastUserMessage: message,
    storedContext: {
      primaryDestination: YOSEMITE,
      lockedPlanDestination: YOSEMITE,
      lastRecommendationList: list,
    },
  }).activeTripContext.primaryDestination;

  it('Switch this trip to Zion → Zion / zion', () => {
    expect(withOptions('Switch this trip to Zion.', [])).toMatchObject({ parkCode: 'zion' });
  });

  it("Let's choose the second park instead → the validated second park", () => {
    expect(withOptions("Let's choose the second park instead.", [
      { name: 'Zion National Park', parkCode: 'zion', confidence: 'high' },
      { name: 'Bryce Canyon National Park', parkCode: 'brca', confidence: 'high' },
    ])).toMatchObject({ parkCode: 'brca' });
  });

  it("Let's go with Yosemite → Yosemite / yose", () => {
    expect(withOptions("Let's go with Yosemite.", [])).toMatchObject({ parkCode: 'yose' });
  });

  it('Pick Glacier instead → only when Glacier is an eligible destination', () => {
    expect(withOptions('Pick Glacier instead.', [])).toMatchObject({ parkCode: 'glac' });
  });
});

describe('Stage 14.8E.1 §8 — defense in depth is unchanged', () => {
  it('still refuses a mixed identity', () => {
    const verdict = resolveDestinationMutation({
      previous: YOSEMITE,
      candidate: { name: 'Total', parkCode: 'yose' },
      intent: { intent: true },
    });
    expect(verdict.mutationAccepted).toBe(false);
    expect(verdict.destination).toEqual(YOSEMITE);
  });

  it('still refuses an eligible candidate whose code disagrees with its name', () => {
    const verdict = resolveDestinationMutation({
      previous: YOSEMITE,
      candidate: { name: 'Zion National Park', parkCode: 'yose' },
      intent: { intent: true },
    });
    expect(verdict.rejectionReason).toBe(DESTINATION_REJECTION.CANONICAL_IDENTITY_MISMATCH);
  });

  it('an invalid candidate cannot mutate even when intent is asserted', () => {
    const verdict = resolveDestinationMutation({
      previous: YOSEMITE,
      candidate: { name: "and don't check live conditions." },
      intent: { intent: true },
    });
    expect(verdict.mutationAccepted).toBe(false);
    expect(verdict.destination).toEqual(YOSEMITE);
  });
});
