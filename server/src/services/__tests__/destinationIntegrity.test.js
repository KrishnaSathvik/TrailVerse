'use strict';

/**
 * Stage 14.8B.1 — active-trip destination integrity.
 *
 * Stage 14.8B failed FAIL_PLAN_CONSISTENCY because a summary bullet from the
 * assistant's own answer ("Total: roughly $450-650") became a selectable
 * destination option, a modifier pronoun ("for that day") was read as
 * destination-selection intent, and the word "total" in "the total walking"
 * then matched that fake option — renaming the locked Yosemite plan to "Total"
 * while leaving parkCode as "yose".
 *
 * These tests pin every link in that chain, and the cross-field invariant that
 * a name and a parkCode can never drift apart.
 *
 * No provider is constructed or dispatched anywhere in this suite.
 */

const {
  DESTINATION_REJECTION,
  assertDestinationIdentityConsistent,
  classifyDestinationChangeIntent,
  isEligibleDestinationOption,
  resolveDestinationMutation,
} = require('../destinationIntegrity');

const YOSEMITE = { name: 'Yosemite', parkCode: 'yose', type: 'nps', confidence: 'high' };

describe('Stage 14.8B.1 §5 — offered-option eligibility', () => {
  const GENERIC = [
    'Total', 'Budget', 'Cost', 'Walking', 'Option', 'Alternative',
    'Day', 'Day 1', 'Day 2', 'At a glance', "Don't Forget", 'Estimated Costs',
    'Morning', 'Afternoon', 'Evening', 'Midday', 'Lodging', 'Food', 'Entrance',
  ];

  it.each(GENERIC)('rejects the generic label %s', (name) => {
    expect(isEligibleDestinationOption({ name }).eligible).toBe(false);
  });

  it('rejects a summary label that was followed by a colon in its bullet', () => {
    const verdict = isEligibleDestinationOption({ name: 'Total', followedByColon: true });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(DESTINATION_REJECTION.NON_DESTINATION_OPTION);
  });

  it('rejects a short Label: value bullet even when the label is not denylisted', () => {
    expect(isEligibleDestinationOption({ name: 'Parking Notes', followedByColon: true }).eligible).toBe(false);
  });

  it('accepts a canonical park option', () => {
    expect(isEligibleDestinationOption({ name: 'Zion National Park', parkCode: 'zion' }).eligible).toBe(true);
  });

  it('accepts a real non-park destination phrase', () => {
    // Regression guard: Stage 13 behaviour. A place can be a valid option
    // without an NPS park code.
    expect(isEligibleDestinationOption({ name: 'Sedona red rock country' }).eligible).toBe(true);
  });

  it('accepts a destination carrying a recognised suffix without a park code', () => {
    expect(isEligibleDestinationOption({ name: 'Cuyahoga Valley National Park' }).eligible).toBe(true);
  });

  it('rejects a bare single generic word with no destination evidence', () => {
    const verdict = isEligibleDestinationOption({ name: 'Hotel' });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(DESTINATION_REJECTION.GENERIC_TOKEN);
  });
});

describe('Stage 14.8B.1 §4 — destination-change intent', () => {
  const MODIFIERS = [
    'Can you make Day 2 even more relaxed and keep the total walking for that day under 2 miles?',
    'Keep the total cost under $800.',
    'Can you make that day easier?',
    'Make the second day more relaxed.',
    'Keep that under 2 miles.',
    'What about that hike?',
    'Make that stop shorter.',
  ];

  it.each(MODIFIERS)('does not read %s as destination selection', (message) => {
    expect(classifyDestinationChangeIntent(message).intent).toBe(false);
  });

  const SELECTIONS = [
    "Let's choose the second park instead.",
    'Switch the trip to Zion.',
    "Let's go with that park.",
    'Make that my destination.',
    'Go with the first option.',
    'Yes, the Sedona option sounds best',
  ];

  it.each(SELECTIONS)('reads %s as destination selection', (message) => {
    expect(classifyDestinationChangeIntent(message).intent).toBe(true);
  });

  it.each([
    'what about the second one?',
    'Tell me more about the second one',
    'the third one please',
  ])('treats the bare ordinal selection %s as destination intent', (message) => {
    expect(classifyDestinationChangeIntent(message).intent).toBe(true);
  });

  it('binds an ordinal to its noun so "second day" is not "second park"', () => {
    expect(classifyDestinationChangeIntent('Make the second day more relaxed.')).toMatchObject({
      intent: false, boundNoun: 'day',
    });
    expect(classifyDestinationChangeIntent("Let's choose the second park instead.")).toMatchObject({
      intent: true, boundNoun: 'park',
    });
  });

  it('reports the exact modifier noun a pronoun is bound to', () => {
    expect(classifyDestinationChangeIntent('keep the total walking for that day under 2 miles'))
      .toMatchObject({ intent: false, boundNoun: 'day' });
  });
});

describe('Stage 14.8B.1 §6 — canonical park identity is authoritative', () => {
  it('rejects a name mutation that does not canonicalize to the asserted parkCode', () => {
    // An ELIGIBLE candidate whose name and code disagree — this isolates the
    // canonical guard from the eligibility guard.
    const verdict = resolveDestinationMutation({
      previous: YOSEMITE,
      candidate: { name: 'Zion National Park', parkCode: 'yose', source: 'named_pick', confidence: 'high' },
      intent: { intent: true },
    });

    expect(verdict.mutationAccepted).toBe(false);
    expect(verdict.rejectionReason).toBe(DESTINATION_REJECTION.CANONICAL_IDENTITY_MISMATCH);
    expect(verdict.destination).toEqual(YOSEMITE);
  });

  it('rejects the exact Stage 14.8B candidate even under asserted destination intent', () => {
    const verdict = resolveDestinationMutation({
      previous: YOSEMITE,
      candidate: { name: 'Total', parkCode: 'yose', source: 'named_pick', confidence: 'high' },
      intent: { intent: true },
    });

    expect(verdict.mutationAccepted).toBe(false);
    expect(verdict.rejectionReason).toBe(DESTINATION_REJECTION.GENERIC_TOKEN);
    expect(verdict.destination).toEqual(YOSEMITE);
  });

  it('never emits a mixed identity', () => {
    const verdict = resolveDestinationMutation({
      previous: YOSEMITE,
      candidate: { name: 'Total', parkCode: 'yose' },
      intent: { intent: true },
    });
    expect(assertDestinationIdentityConsistent(verdict.destination).consistent).toBe(true);
  });

  it('accepts a genuine destination change to a different canonical park', () => {
    const verdict = resolveDestinationMutation({
      previous: YOSEMITE,
      candidate: { name: 'Zion National Park', parkCode: 'zion', source: 'user_switch' },
      intent: { intent: true },
    });
    expect(verdict.mutationAccepted).toBe(true);
    expect(verdict.destination).toMatchObject({ name: 'Zion National Park', parkCode: 'zion' });
  });

  it('accepts a name that canonicalizes to the same park code', () => {
    const verdict = resolveDestinationMutation({
      previous: YOSEMITE,
      candidate: { name: 'Yosemite National Park', parkCode: 'yose', source: 'named_pick' },
      intent: { intent: true },
    });
    expect(verdict.mutationAccepted).toBe(true);
    expect(verdict.destination.parkCode).toBe('yose');
  });
});

describe('Stage 14.8B.1 §7 — locked-plan destination protection', () => {
  it('preserves the locked destination for a modifier-only request', () => {
    const verdict = resolveDestinationMutation({
      previous: YOSEMITE,
      candidate: { name: 'Total', source: 'named_pick', confidence: 'high' },
      intent: classifyDestinationChangeIntent(
        'Can you make Day 2 even more relaxed and keep the total walking for that day under 2 miles?'
      ),
    });

    expect(verdict.mutationAccepted).toBe(false);
    expect(verdict.rejectionReason).toBe(DESTINATION_REJECTION.NOT_DESTINATION_INTENT);
    expect(verdict.destination).toEqual(YOSEMITE);
  });

  it.each(['day', 'walking distance', 'pace', 'stop', 'lodging', 'activity'])(
    'preserves the locked destination when the request modifies %s',
    (aspect) => {
      const verdict = resolveDestinationMutation({
        previous: YOSEMITE,
        candidate: { name: 'Total', source: 'named_pick' },
        intent: classifyDestinationChangeIntent(`Please adjust the ${aspect} for that day.`),
      });
      expect(verdict.destination).toEqual(YOSEMITE);
      expect(verdict.mutationAccepted).toBe(false);
    }
  );

  it('emits bounded diagnostics for every decision', () => {
    const verdict = resolveDestinationMutation({
      previous: YOSEMITE,
      candidate: { name: 'Total', source: 'named_pick', confidence: 'high' },
      intent: classifyDestinationChangeIntent('keep the total walking for that day under 2 miles'),
    });

    expect(verdict.diagnostics).toEqual({
      previousDestination: 'Yosemite',
      candidateDestination: 'Total',
      candidateSource: 'named_pick',
      candidateEntityType: 'unknown',
      destinationChangeIntent: false,
      candidateCanonicalizationResult: null,
      mutationAccepted: false,
      rejectionReason: DESTINATION_REJECTION.NOT_DESTINATION_INTENT,
    });
    // No conversation text leaks into diagnostics.
    expect(JSON.stringify(verdict.diagnostics)).not.toMatch(/under 2 miles/);
  });

  it('allows the first destination when none is locked yet', () => {
    const verdict = resolveDestinationMutation({
      previous: null,
      candidate: { name: 'Yosemite', parkCode: 'yose', source: 'user_message' },
      intent: { intent: true },
    });
    expect(verdict.mutationAccepted).toBe(true);
  });
});

describe('Stage 14.8B.1 §11 — cross-field identity consistency fails closed', () => {
  it('accepts a coherent identity', () => {
    expect(assertDestinationIdentityConsistent(YOSEMITE)).toEqual({
      consistent: true, canonicalNameMatchesParkCode: true, mismatches: [],
    });
  });

  it('rejects a name that does not canonicalize to its park code', () => {
    const result = assertDestinationIdentityConsistent({ name: 'Total', parkCode: 'yose' });
    expect(result.consistent).toBe(false);
    expect(result.canonicalNameMatchesParkCode).toBe(false);
    expect(result.mismatches).toContain('name_park_code');
  });

  it('rejects when primary and locked destinations disagree', () => {
    const result = assertDestinationIdentityConsistent(YOSEMITE, {
      lockedPlanDestination: { name: 'Zion National Park', parkCode: 'zion' },
    });
    expect(result.consistent).toBe(false);
    expect(result.mismatches).toContain('primary_vs_locked');
  });

  it('rejects when the itinerary destination disagrees with the active destination', () => {
    const result = assertDestinationIdentityConsistent(YOSEMITE, {
      itineraryDestination: { name: 'Zion National Park', parkCode: 'zion' },
    });
    expect(result.consistent).toBe(false);
    expect(result.mismatches).toContain('itinerary_vs_active');
  });

  it('is satisfied when all three agree', () => {
    const result = assertDestinationIdentityConsistent(YOSEMITE, {
      lockedPlanDestination: YOSEMITE,
      itineraryDestination: { name: 'Yosemite National Park', parkCode: 'yose' },
    });
    expect(result).toMatchObject({ consistent: true, mismatches: [] });
  });
});
