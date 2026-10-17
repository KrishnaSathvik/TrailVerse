'use strict';

/**
 * Planning Readiness Pass #1 — offline input/override contract tests.
 * No provider or model calls.
 */

const {
  extractNumericBudget,
  extractGroupSizeFromMessage,
  userAvoidsTrailExposure,
  parseCountToken,
} = require('../planningInputContract');
const {
  extractMessageConstraintOverrides,
  applyMessageConstraintOverrides,
} = require('../messageConstraintOverrides');
const { parseConstraints } = require('../constraintEngine');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const { userRejectsExposure } = require('../trailieOperationalConstraints');
const { buildTripState } = require('../tripStateBuilder');

describe('Planning Readiness Pass #1 — planningInputContract', () => {
  test('A — under $600 parses numerically', () => {
    expect(extractNumericBudget('under $600')).toBe('600');
    expect(parseConstraints({}, '3-day trip under $600 total for two people.').budget).toBe('600');
  });

  test('B — budget of $600 parses numerically', () => {
    expect(extractNumericBudget('budget of $600')).toBe('600');
    expect(parseConstraints({}, 'Plan a trip with budget of $600 for two people.').budget).toBe('600');
  });

  test('C — Keep it under $700 instead overrides stale 1200', () => {
    const formData = {
      parkCode: 'zion',
      budget: '1200',
      accommodation: 'hotel',
      fitnessLevel: 'moderate',
      groupSize: 2,
      numDays: 3,
    };
    const msg = 'Keep it under $700 instead.';
    expect(extractMessageConstraintOverrides(msg).budget).toBe('700');
    const constraints = parseConstraints({ formData }, msg);
    expect(constraints.budget).toBe('700');
    expect(constraints.accommodation).toBe('hotel');
    expect(constraints.groupSize).toBe(2);
    expect(constraints.fitnessLevel).toBe('moderate');
  });

  test('does not collapse $700 to tier word budget', () => {
    expect(extractNumericBudget('maximum $800')).toBe('800');
    expect(extractNumericBudget('spend up to $800')).toBe('800');
    expect(extractNumericBudget('max $800')).toBe('800');
    expect(extractMessageConstraintOverrides('Actually make the budget $700.').budget).toBe('700');
  });

  test('D — family of four → groupSize 4', () => {
    expect(extractGroupSizeFromMessage('family of four')).toBe(4);
    const c = parseConstraints({}, 'Plan 3 days for a family of four with two young kids. Easy activities and a hotel.');
    expect(c.groupSize).toBe(4);
    expect(c.hasChildren).toBe(true);
  });

  test('E — Four friends → groupSize 4 with travelParty friends (Pass #2)', () => {
    expect(extractGroupSizeFromMessage('Four friends')).toBe(4);
    const c = parseConstraints({}, 'Four friends, moderate hikes, packed trip.');
    expect(c.groupSize).toBe(4);
    expect(c.travelParty).toBe('friends');
    const tripState = buildTripState({ metadata: {}, constraints: c, lastUserMessage: 'Four friends, moderate hikes, packed trip.' });
    expect(tripState.travelers.count).toBe(4);
    expect(tripState.travelers.groupType).toBe('friends');
  });

  test('word numbers one..twelve', () => {
    expect(parseCountToken('one')).toBe(1);
    expect(parseCountToken('twelve')).toBe(12);
    expect(extractGroupSizeFromMessage('three people')).toBe(3);
  });

  test('F — Actually let’s camp overrides hotel', () => {
    const formData = {
      parkCode: 'zion',
      groupSize: 2,
      budget: '1000',
      fitnessLevel: 'moderate',
      accommodation: 'hotel',
      interests: ['hiking'],
    };
    const msg = "Actually let's camp.";
    expect(extractMessageConstraintOverrides(msg).accommodation).toBe('camping');
    const c = parseConstraints({ formData }, msg);
    expect(c.accommodation).toBe('camping');
    expect(c.groupSize).toBe(2);
    expect(c.budget).toBe('1000');
    expect(c.fitnessLevel).toBe('moderate');
    expect(c.interests).toEqual(['hiking']);
  });

  test('G — Switch to a hotel → lodging', () => {
    const formData = { accommodation: 'camping', budget: '500', groupSize: 2 };
    const msg = 'Switch to a hotel.';
    expect(extractMessageConstraintOverrides(msg).accommodation).toBe('lodging');
    const c = parseConstraints({ formData }, msg);
    expect(c.accommodation).toBe('lodging');
    expect(c.budget).toBe('500');
  });

  test('H/I/J — exposure avoid phrases arm the gate', () => {
    expect(userAvoidsTrailExposure('no exposed trails')).toBe(true);
    expect(userAvoidsTrailExposure('avoid exposed trails')).toBe(true);
    expect(userAvoidsTrailExposure('without exposed sections')).toBe(true);
    expect(userAvoidsTrailExposure('avoid exposure')).toBe(true);
    expect(userAvoidsTrailExposure('no exposure')).toBe(true);
    expect(userAvoidsTrailExposure('no scary trails')).toBe(true);
    expect(userAvoidsTrailExposure('avoid cliff-edge trails')).toBe(true);
    expect(userRejectsExposure('Easy hikes only, no exposed trails.')).toBe(true);

    const high = evaluateItineraryCompleteness({
      itineraryData: {
        days: [
          {
            dayNumber: 1,
            stops: [
              { name: 'Ridge Path', type: 'trail', difficulty: 'moderate', exposureLevel: 'high', duration: 120 },
            ],
          },
        ],
      },
      userPrompt: 'Easy hikes only, no exposed trails.',
    });
    expect(high.ok).toBe(false);
    expect(high.reasonCodes).toContain('exposure_constraint_violation');
  });

  test('K — social media exposure does not arm trail gate', () => {
    expect(userAvoidsTrailExposure('No exposure to social media during the trip')).toBe(false);
    expect(userAvoidsTrailExposure('avoid exposure to Instagram')).toBe(false);
  });

  test('K+ — social media scrub does not suppress real trail avoid', () => {
    expect(
      userAvoidsTrailExposure('No exposed trails, and no exposure to social media either.')
    ).toBe(true);
  });

  test('L — multi-field override preserves untouched Quick Fill fields', () => {
    const formData = {
      parkCode: 'yose',
      numDays: 3,
      groupSize: 4,
      budget: '1000',
      fitnessLevel: 'moderate',
      accommodation: 'hotel',
      interests: ['hiking', 'photography'],
      startDate: '2026-09-12',
      endDate: '2026-09-14',
    };
    const msg = "Actually make it 4 days, let's camp, and keep it under $700.";
    const overrides = extractMessageConstraintOverrides(msg);
    expect(overrides).toMatchObject({
      numDays: 4,
      accommodation: 'camping',
      budget: '700',
    });
    expect(overrides.groupSize).toBeUndefined();
    expect(overrides.fitnessLevel).toBeUndefined();
    expect(overrides.interests).toBeUndefined();

    const merged = applyMessageConstraintOverrides(formData, msg);
    expect(merged).toMatchObject({
      parkCode: 'yose',
      numDays: 4,
      groupSize: 4,
      budget: '700',
      fitnessLevel: 'moderate',
      accommodation: 'camping',
      interests: ['hiking', 'photography'],
    });

    const constraints = parseConstraints({ formData }, msg);
    expect(constraints.dates.numDays).toBe(4);
    expect(constraints.groupSize).toBe(4);
    expect(constraints.budget).toBe('700');
    expect(constraints.fitnessLevel).toBe('moderate');
    expect(constraints.accommodation).toBe('camping');
    expect(constraints.interests).toEqual(['hiking', 'photography']);
  });

  test('cheaper still maps to tier budget when no dollar amount', () => {
    expect(extractMessageConstraintOverrides('Actually make it cheaper.').budget).toBe('budget');
  });
});
