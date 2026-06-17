import { describe, expect, it } from 'vitest';
import { stripSkipOnlyParkSentences } from '../discoverySkipDismissal.js';

describe('stripSkipOnlyParkSentences', () => {
  it('removes skip-dismissal paragraph naming Great Sand Dunes', () => {
    const input = `Olympic is the pick.

Great Sand Dunes (Colorado) has Medano Creek for wading in late spring, but it typically dries up by July — so I'd skip it for your water-access goal.

**To personalize this:**`;
    const out = stripSkipOnlyParkSentences(input);
    expect(out).not.toMatch(/great sand dunes/i);
    expect(out).toMatch(/olympic is the pick/i);
  });

  it('keeps compare-style save-for-later wording', () => {
    const input = 'Go with Bryce. Save Zion for when you can plan around crowds.';
    expect(stripSkipOnlyParkSentences(input)).toBe(input);
  });
});
