'use strict';

/**
 * Phase 8D.6.1 — explicit driving-feasibility constraint capture + truthful
 * degraded handling when route evidence is unavailable.
 *
 * Scope: capture the constraint and prevent false confidence in the
 * generation prompt. Does NOT implement intra-park route fetching (8D.6.2).
 */

const { detectDrivingFeasibilityConstraint, buildTripScopeFromMessage } = require('../roadTripContract');
const { parseConstraints, buildConstraintBlock } = require('../constraintEngine');

describe('detectDrivingFeasibilityConstraint — classifier', () => {
  test('captures "keep the driving realistic"', () => {
    expect(detectDrivingFeasibilityConstraint('Plan me 3 days in Yellowstone and keep the driving realistic.')).toBe(true);
  });

  test('captures "minimize driving"', () => {
    expect(detectDrivingFeasibilityConstraint('Plan Yellowstone and minimize driving.')).toBe(true);
  });

  test('captures "don\'t make us drive all day"', () => {
    expect(detectDrivingFeasibilityConstraint("Plan Yellowstone, don't make us drive all day.")).toBe(true);
  });

  test('captures "keep drives reasonable"', () => {
    expect(detectDrivingFeasibilityConstraint('Plan Yellowstone and keep drives reasonable.')).toBe(true);
  });

  test('captures "not too much driving"', () => {
    expect(detectDrivingFeasibilityConstraint('Plan Yellowstone, not too much driving please.')).toBe(true);
  });

  test('does NOT capture an ordinary driving-conditions question', () => {
    expect(detectDrivingFeasibilityConstraint('How is driving in Yellowstone in winter?')).toBe(false);
  });

  test('does NOT capture an itinerary request with no driving language', () => {
    expect(detectDrivingFeasibilityConstraint('Plan me 3 days in Yellowstone.')).toBe(false);
  });
});

describe('tripScope.drivingFeasibilityRequired', () => {
  test('true for explicit feasibility phrasing', () => {
    const scope = buildTripScopeFromMessage('Plan me 3 days in Yellowstone and keep the driving realistic.');
    expect(scope.drivingFeasibilityRequired).toBe(true);
  });

  test('false for ordinary driving question', () => {
    const scope = buildTripScopeFromMessage('How is driving in Yellowstone in winter?');
    expect(scope.drivingFeasibilityRequired).toBe(false);
  });

  test('true when traveler supplies a numeric drive cap (existing signal preserved)', () => {
    const scope = buildTripScopeFromMessage('Plan Yellowstone, no more than 2 hours driving per day.');
    expect(scope.drivingFeasibilityRequired).toBe(true);
    expect(scope.maxDailyDriveMinutes).toBe(120);
  });
});

describe('parseConstraints → drivingFeasibilityRequired', () => {
  test('captured for the Yellowstone driving-realism case', () => {
    const c = parseConstraints({}, 'Plan me 3 days in Yellowstone and keep the driving realistic.');
    expect(c.drivingFeasibilityRequired).toBe(true);
    expect(c.tripScope.drivingFeasibilityRequired).toBe(true);
  });

  test('not captured for ordinary itinerary request', () => {
    const c = parseConstraints({}, 'Plan me 3 days in Yellowstone.');
    expect(c.drivingFeasibilityRequired).toBe(false);
  });

  test('not captured for a driving-conditions question', () => {
    const c = parseConstraints({}, 'How is driving in Yellowstone in winter?');
    expect(c.drivingFeasibilityRequired).toBe(false);
  });
});

describe('buildConstraintBlock — truthful degraded handling', () => {
  test('injects an unverified-driving hard rule for single-park trip with explicit constraint', () => {
    const c = parseConstraints({}, 'Plan me 3 days in Yellowstone and keep the driving realistic.');
    const block = buildConstraintBlock(c);
    expect(block).toMatch(/HARD RULE/i);
    expect(block).toMatch(/driv(?:e|ing)/i);
    expect(block).toMatch(/not (?:currently )?(?:been )?verified|not (?:currently )?available|not verified/i);
  });

  test('does NOT inject the hard rule when the traveler never asked about driving', () => {
    const c = parseConstraints({}, 'Plan me 3 days in Yellowstone.');
    const block = buildConstraintBlock(c);
    expect(block).not.toMatch(/driving feasibility/i);
  });

  test('does NOT inject the single-park unverified rule for road trips (existing unresolvedRouteLegs rule owns that case)', () => {
    const c = parseConstraints(
      {},
      'Road trip from Denver through Rocky Mountain and Mesa Verde, keep the driving realistic.'
    );
    expect(c.drivingFeasibilityRequired).toBe(true);
    const block = buildConstraintBlock(c);
    // Road-trip scope already has its own route-leg machinery / hard rules; the
    // new single-park "no route machinery at all" rule should not also fire here.
    expect(block).not.toMatch(/Verified drive-time evidence is not available/i);
  });
});
