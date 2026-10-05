/**
 * Adapted from the Stage 1 repair-output guards. The repair LLM is gone, but
 * these checks still gate any candidate final response.
 */
const {
  REJECTION,
  getFinalResponseRejectionReason,
} = require('../finalResponseGuards');

describe('final-response guards', () => {
  const original = 'A'.repeat(1000);

  test('accepts a candidate that preserves the response', () => {
    expect(getFinalResponseRejectionReason(original, 'B'.repeat(1000))).toBeNull();
  });

  test('rejects the placeholder leak seen in production', () => {
    const candidate = `${'B'.repeat(1000)}\n\n[ITERARY note continues in structured data]`;
    expect(getFinalResponseRejectionReason(original, candidate)).toBe(REJECTION.PLACEHOLDER_LEAK);
  });

  test('rejects other bracketed hand-off notes', () => {
    for (const note of [
      '[remainder of the plan omitted]',
      '[rest of the itinerary in structured data]',
      '[Day 3-4 continues below]',
      '...[truncated]',
    ]) {
      expect(getFinalResponseRejectionReason(original, `${'B'.repeat(1000)}\n${note}`)).toBe(
        REJECTION.PLACEHOLDER_LEAK
      );
    }
  });

  test('rejects a candidate that dropped most of the response', () => {
    expect(getFinalResponseRejectionReason(original, 'B'.repeat(400))).toBe(REJECTION.TOO_SHORT);
  });

  test('accepts a mild trim just above the ratio floor', () => {
    expect(getFinalResponseRejectionReason(original, 'B'.repeat(700))).toBeNull();
  });

  test('rejects empty or non-string candidates', () => {
    expect(getFinalResponseRejectionReason(original, '   ')).toBe(REJECTION.EMPTY);
    expect(getFinalResponseRejectionReason(original, null)).toBe(REJECTION.EMPTY);
  });

  test('does not flag ordinary prose containing the trigger words', () => {
    const prose = `${'B'.repeat(900)}\nThe trail continues in the Hoh Rain Forest — see [Olympic](/parks/olympic-national-park).`;
    expect(getFinalResponseRejectionReason(original, prose)).toBeNull();
  });

  test('a markdown link whose label matches the pattern is preserved', () => {
    const prose = `${'B'.repeat(900)}\nSee [the plan continues in the Hoh](/parks/olympic-national-park).`;
    expect(getFinalResponseRejectionReason(original, prose)).toBeNull();
  });

  describe('audited mutation accounting', () => {
    test('an audited shortening passes when the length matches the plan', () => {
      const candidate = 'B'.repeat(200);
      expect(
        getFinalResponseRejectionReason(original, candidate, { expectedLength: 200 })
      ).toBeNull();
    });

    test('an unexplained length still fails under audited accounting', () => {
      const candidate = 'B'.repeat(200);
      expect(
        getFinalResponseRejectionReason(original, candidate, { expectedLength: 900 })
      ).toBe(REJECTION.TOO_SHORT);
    });

    test('a placeholder is rejected even when the length is audited', () => {
      const candidate = '[rest of the itinerary omitted]';
      expect(
        getFinalResponseRejectionReason(original, candidate, { expectedLength: candidate.length })
      ).toBe(REJECTION.PLACEHOLDER_LEAK);
    });
  });
});
