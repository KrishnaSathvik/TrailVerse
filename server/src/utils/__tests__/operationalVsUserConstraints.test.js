'use strict';

const { parseConstraints } = require('../constraintEngine');
const { emptyPlanningState, mergePlanningStateWithConstraints } = require('../planningState');
const { buildTripState } = require('../tripStateBuilder');
const { formatAccessRulesForPrompt } = require('../trailieOperationalConstraints');

const Q2 = "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?";

describe('operational park rules vs traveler constraints', () => {
  test('a park parking-time rule does not become the traveler drive cap', () => {
    const constraints = parseConstraints({ parkName: 'Glacier National Park' }, Q2);
    expect(constraints.maxDailyDriveMinutes).toBeNull();
    expect(constraints.tripScope?.maxDailyDriveMinutes ?? null).toBeNull();

    const operational = [{
      type: 'parking_time_limit',
      destination: 'Glacier National Park',
      subjects: ['Logan Pass'],
      maxMinutes: 180,
      plannerRule: 'Parking at this overlook is limited to 180 minutes.',
    }];

    const merged = mergePlanningStateWithConstraints(emptyPlanningState(), {
      ...constraints,
      operational,
    });
    expect(merged.preferences.maxDailyDriveMinutes).toBeNull();
    expect(merged.tripScope?.maxDailyDriveMinutes ?? null).toBeNull();

    const tripState = buildTripState({
      metadata: { parkName: 'Glacier National Park' },
      constraints: { ...constraints, operational },
      lastUserMessage: Q2,
    });
    expect(tripState.preferences.maxDailyDriveMinutes).toBeNull();
  });

  test('access-rule copy names the park rule instead of a traveler limit', () => {
    const formatted = formatAccessRulesForPrompt([{
      type: 'parking_time_limit',
      subjects: ['Logan Pass'],
      maxMinutes: 180,
      plannerRule: 'Parking is limited to 180 minutes.',
    }]);
    expect(formatted.kind).toBe('park_operating_rules');
    expect(formatted.instructions).toMatch(/not traveler (preferences|constraints)/i);
    expect(formatted.rules.some((rule) => /parking is limited/i.test(rule.travelerFacing))).toBe(true);
    expect(JSON.stringify(formatted)).not.toMatch(/your trip['’]s 180-minute|self-drive Logan Pass limit/i);
  });
});
