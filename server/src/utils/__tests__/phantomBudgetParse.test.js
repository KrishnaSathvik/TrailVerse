const { extractNumericBudget } = require('../planningInputContract');
const { parseBudgetConstraint } = require('../budgetContract');

/**
 * P0-4 (audit 2026-08-31): "Should I spend 3 days in Yosemite or Sequoia?"
 * parsed as an EXPLICIT $3 trip budget, and Trailie lectured the traveler
 * about "your stated $3 total budget". A number attached to a duration unit
 * is time, never money.
 */

describe('phantom budget from duration phrases (P0-4)', () => {
  const durationPhrases = [
    'Should I spend 3 days in Yosemite or Sequoia?',
    'We want to spend 2 nights in Moab.',
    'Can we spend 4 days there?',
    'Planning to spend up to 5 days in the park.',
    'I could spend a maximum of 3 days on this trip.',
    'spending 3 weeks on the road',
    // Backtracking trap: the engine must not shrink "34" to "3" so that the
    // duration lookahead stops matching.
    'We plan to spend 34 days across the parks.',
  ];

  test.each(durationPhrases)('does not read a budget out of %j', (phrase) => {
    expect(extractNumericBudget(phrase)).toBeNull();
    const constraint = parseBudgetConstraint(phrase, {});
    expect(constraint.amount).toBeNull();
    expect(constraint.explicit).toBe(false);
  });

  const realBudgets = [
    ['My budget is $900 for the trip.', '900'],
    ['budget is 900', '900'],
    ['We can spend $200 a day.', '200'],
    ['Budget: $1,500', '1500'],
    ['keep it under $750', '750'],
    ['spend up to 1500 dollars', '1500'],
    // Duration and explicit budget in the same sentence: only the budget is money.
    ['Yosemite or Sequoia for 3 days? My budget is $900.', '900'],
  ];

  test.each(realBudgets)('still parses a real budget from %j', (phrase, expected) => {
    expect(extractNumericBudget(phrase)).toBe(expected);
    const constraint = parseBudgetConstraint(phrase, {});
    expect(String(constraint.amount)).toBe(expected);
    expect(constraint.explicit).toBe(true);
  });
});
