'use strict';

/**
 * EXPOSURE ACCEPTANCE POLARITY.
 *
 * `EXPOSURE_ACCEPTANCE` is checked BEFORE `EXPOSURE_AVOIDANCE` precisely so a
 * traveler withdrawing an aversion is not read as restating it. But its
 * target-first branch accepted only the CONTRACTIONS `don't` / `doesn't`, while
 * its verb-first branch accepted `do not`. So an uncontracted, target-first
 * acceptance missed acceptance — and then the bare word `not`, which is itself
 * listed in AVERSION_VERBS, matched the aversion pattern inside "do not bother":
 *
 *     "The drop-offs do not bother us actually."   ->  avoidExposure = TRUE
 *
 * The traveler saying the drop-offs are fine had the aversion RE-ASSERTED. That
 * is a semantic inversion, not a missing feature, and it is the only reversible
 * constraint Trailie has — so it has to be right.
 *
 * Scope note: this fixes exposure ONLY. It is deliberately NOT a precedent for
 * `walkingTolerance` reversal — see artifacts/trailie-phase4h-reversal-semantics.
 * Walking language is ordinary English and a measured candidate pattern cleared
 * "Driving is fine, walking is the problem."
 */

const { extractExplicitConstraints } = require('../constraintSemantics');

const exposure = (text) => {
  const hit = extractExplicitConstraints(text).find((c) => c.field === 'avoidExposure');
  return hit ? hit.value : null;
};

describe('an uncontracted acceptance is an acceptance', () => {
  test.each([
    ['The drop-offs do not bother us actually.'],
    ['The ledges do not bother us.'],
    ['The exposure does not bother her.'],
    ['The sheer drops do not bother me at all.'],
  ])('%s', (text) => {
    expect(exposure(text)).toBe(false);
  });
});

describe('the contracted forms keep working', () => {
  test.each([
    ["The drop-offs don't bother us actually."],
    ["The exposure doesn't bother her."],
    ['We do not mind the drop-offs.'],
    ['We are fine with exposed drop-offs now.'],
    ['The ledges are totally fine.'],
  ])('%s', (text) => {
    expect(exposure(text)).toBe(false);
  });
});

describe('a genuine aversion is still an aversion', () => {
  test.each([
    ['Please avoid exposed drop-offs.'],
    ['No exposed drop-offs please.'],
    ['We are nervous about the narrow ledges.'],
    ['We are not comfortable with sheer drops.'],
    ['My mom is afraid of heights.'],
    ['Avoid anything with exposure.'],
  ])('%s', (text) => {
    expect(exposure(text)).toBe(true);
  });
});

/**
 * Out of scope, recorded so it is not mistaken for a regression: `bother`,
 * `scare` and `skip` are not in AVERSION_VERBS, so these state no constraint at
 * all today. That is a recall gap in the AVOIDANCE pattern, a separate question
 * from the acceptance polarity fixed here, and it is deliberately not touched.
 */
describe('known aversion recall gaps (characterized, not fixed)', () => {
  test.each([
    ['The sheer drops really bother us.'],
    ['Narrow ledges scare my mom.'],
    ['We want to skip anything with exposure.'],
  ])('%s states no exposure constraint today', (text) => {
    expect(exposure(text)).toBeNull();
  });
});

describe('the false-positive guard is unaffected', () => {
  test('metaphorical exposure produces no constraint either way', () => {
    expect(exposure('Exposure to social media is our real problem.')).toBeNull();
    expect(exposure('We want a break from exposure to the news.')).toBeNull();
  });
});
