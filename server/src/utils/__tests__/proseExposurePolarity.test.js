'use strict';

/**
 * P0 — exposure claims carry POLARITY.
 *
 * Closing the `avoidExposure` extraction defect armed this validator for the
 * first time, and it rejected three fully compliant itineraries because it
 * could not tell "this place has little exposure" (a COMPLIANCE claim) from
 * "this place is exposed" (a violation). Polarity is judged per clause, so a
 * compatible phrase cannot mask an incompatible one in the same sentence.
 */

const { evaluateProseConstraintSafety } = require('../proseConstraintSafety');

const EXPOSURE = { avoidExposure: true };
const codes = (text) => evaluateProseConstraintSafety({ text, constraints: EXPOSURE }).reasonCodes;
const CONTRADICTION = 'exposure_constraint_contradiction';

describe('compatible exposure claims are not contradictions', () => {
  test.each([
    "The Pa'rus Trail is paved, flat, and rated easy with low exposure.",
    'Lower Emerald Pool is a short walk with minimal exposure.',
    'This trail has little exposure and stays in the trees.',
    'The loop has limited exposure throughout.',
    'Negligible exposure on this path.',
    'Low exposure and no meaningful drop-offs.',
    'The walk stays well away from cliff edges.',
  ])('clean: %s', (text) => {
    expect(codes(text)).not.toContain(CONTRADICTION);
  });
});

describe('incompatible exposure claims remain contradictions', () => {
  test.each([
    'Take the exposed cliff-edge traverse for the best views.',
    'The chain section is the fun part.',
    'This trail has significant exposure near the summit.',
    'There is some exposed scrambling on the upper trail.',
    'The path follows a narrow ledge with steep drop-offs.',
  ])('violation: %s', (text) => {
    expect(codes(text)).toContain(CONTRADICTION);
  });
});

describe('a compatible clause cannot mask an incompatible one', () => {
  test.each([
    'Most of the trail has low exposure, but one section is exposed along a cliff.',
    'Generally minimal exposure, although there is a short exposed ledge.',
    'Minimal exposure except for a cliff-edge section near the top.',
    'Low exposure overall; the final stretch is an exposed ledge.',
  ])('violation: %s', (text) => {
    expect(codes(text)).toContain(CONTRADICTION);
  });
});

describe('a qualifier does not license exposure outside its scope', () => {
  // The qualifier window was widened to cover real generator output
  // ("without another trail or exposed terrain"). These pin the boundary so it
  // cannot become a laundering device.
  test.each([
    'There is no shuttle, and the trail runs along an exposed ledge.',
    'With no permit needed you can still walk the exposed cliff edge.',
    'Low exposure on day one and an exposed ledge on day two.',
    'No crowds at sunrise but the final pitch is an exposed scramble.',
  ])('violation: %s', (text) => {
    expect(codes(text)).toContain(CONTRADICTION);
  });
});

describe('unknown exposure stays unknown', () => {
  test.each([
    'The scenic trail is a good first stop.',
    'This easy trail suits a relaxed morning.',
    'A short trail leaves from the visitor center.',
  ])('no invented conclusion: %s', (text) => {
    expect(codes(text)).toEqual([]);
  });
});

describe('certification protections are preserved', () => {
  test('absolute absence claimed about an unknown place is still unsupported', () => {
    expect(codes('That trail has no exposure at all, so it is a safe pick.'))
      .toContain('unsupported_exposure_suitability_claim');
  });

  test('the original Case E prose is still rejected', () => {
    const text = 'Hike the 8-mile exposed cliff traverse at Angels Landing; the chain section is fine for everyone in your group regardless of mobility limits.';
    const result = evaluateProseConstraintSafety({
      text,
      constraints: { mobility: { maxWalkMilesPerSegment: 1 }, avoidExposure: true },
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'mobility_distance_contradiction',
      CONTRADICTION,
    ]));
  });

  test('guidance away from exposure is never a violation', () => {
    expect(codes('Avoid the exposed cliff traverse entirely.')).toEqual([]);
    expect(codes("I'd skip the chain section because it is too exposed for you.")).toEqual([]);
  });

  // NARROWED, not removed. Rejection context still does not survive a sentence
  // break — `splitSentences` treats ';' and '.' as boundaries and polarity is
  // resolved inside one sentence. What changed is that a second sentence which
  // carries its OWN rejection cue no longer needs the first one:
  // "it is too exposed for you" is an unsuitability judgement, not an offer.
  test('a follow-on sentence with its own rejection cue is now clean', () => {
    expect(codes("I'd skip the chain section; it is too exposed for you."))
      .toEqual([]);
  });

  // Rejection explanations may cross a sentence break when anaphora continues
  // the rejected entity: "Skip B. It has drop-offs."
  test('rejection explanation may cross a sentence break via anaphora', () => {
    expect(codes("I'd skip the chain section. It has drop-offs."))
      .toEqual([]);
  });

  test('a hard stance reset still allows a later unrelated exposure offer to fail', () => {
    expect(codes("I'd skip the chain section. But then take the exposed ledge."))
      .toContain(CONTRADICTION);
  });
});

/**
 * A1/A2/A3 — the live 2026-08-19 family. The validator rejected a model that
 * FOLLOWED the instruction and said so: `\bavoid\b` matches the imperative
 * "Avoid the cliff" but not "avoids"/"avoiding", because `\b` fails against the
 * following `s`. "stays clear of" was absent entirely.
 */
describe('A1 — an INCOMPATIBLE RECOMMENDATION is a violation', () => {
  test.each([
    'Take the exposed cliff route.',
    'Use the trail with steep drop-offs.',
    'The exposed ledge is worth doing.',
    'Follow the cliff-edge section to the overlook.',
    'The route includes a narrow ledge above the canyon.',
  ])('violation: %s', (text) => {
    expect(codes(text)).toContain(CONTRADICTION);
  });
});

describe('A1 — an EXPLICIT REJECTION is not a violation', () => {
  test.each([
    'Avoid the exposed cliff route.',
    'This route avoids exposed terrain.',
    'Keep away from the cliff-edge section.',
    'The walk stays clear of drop-offs.',
    "We're skipping the exposed trail.",
    'Choose the paved river walk rather than the exposed route.',
    'Do not take the ledge section.',
    "It's a better fit than the overlook, which has drop-offs.",
    'A safer sunrise stop than the ridge with drop-offs.',
  ])('clean: %s', (text) => {
    expect(codes(text)).not.toContain(CONTRADICTION);
  });
});

describe('A2 — inflection is handled grammatically, not by listing strings', () => {
  // Each row is the SAME rejection in a different inflection. If any one of
  // these fails while its siblings pass, the fix has regressed to string
  // matching.
  test.each([
    ['avoid', 'Avoid the exposed ledge.'],
    ['avoids', 'The walk avoids the exposed ledge.'],
    ['avoiding', 'A gentle outing while avoiding the exposed ledge.'],
    ['avoided', 'We avoided the exposed ledge.'],
    ['skip', 'Skip the exposed ledge.'],
    ['skips', 'The plan skips the exposed ledge.'],
    ['skipping', "We're skipping the exposed ledge."],
    ['stay clear of', 'Stay clear of the cliff edges.'],
    ['stays clear of', 'This route stays clear of cliff edges.'],
    ['keep away from', 'Keep away from the drop-offs.'],
    ['keeps away from', 'The trail keeps away from the drop-offs.'],
    ['steer clear of', 'We steer clear of exposed ledges.'],
    ['steers clear of', 'The loop steers clear of exposed ledges.'],
    ['rather than', 'Take the river walk rather than the exposed ledge.'],
    ['instead of', 'Take the river walk instead of the exposed ledge.'],
    ["don't take", "Don't take the exposed ledge."],
    ['do not use', 'Do not use the trail with drop-offs.'],
    ['do not follow', 'Do not follow the cliff-edge section.'],
  ])('clean (%s): %s', (_form, text) => {
    expect(codes(text)).not.toContain(CONTRADICTION);
  });
});

describe('A3 — a rejection governs only the exposure phrase it scopes', () => {
  test.each([
    ['With no permit required, take the exposed cliff trail.', true],
    ['Low exposure on the first walk, then take an exposed ledge.', true],
    ['Avoid the exposed ledge and take the paved river walk.', false],
    ['Take the river walk instead of the exposed ledge.', false],
    ['The trail avoids exposed terrain but ends at an exposed scrambling section.', true],
    ['Skip the shuttle, and hike the exposed cliff traverse.', true],
    ['Avoid the exposed ledge; the paved river walk is the better pick.', false],
  ])('%s → violation=%s', (text, violation) => {
    expect(codes(text).includes(CONTRADICTION)).toBe(violation);
  });
});

describe('presentation does not change hard-constraint semantics', () => {
  const compliant = "The Pa'rus Trail is paved with low exposure.";
  const violating = 'Take the exposed cliff-edge traverse.';

  test('identical verdicts regardless of surrounding prose shape', () => {
    const shapes = [
      (s) => s,
      (s) => `Day 1: ${s}`,
      (s) => `Here is the updated plan.\n\n- Morning: ${s}`,
      (s) => `I couldn't update the saved plan. ${s}`,
    ];
    for (const shape of shapes) {
      expect(codes(shape(compliant))).not.toContain(CONTRADICTION);
      expect(codes(shape(violating))).toContain(CONTRADICTION);
    }
  });
});

/**
 * ADVERSARIAL LAUNDERING. The old rule flagged exposure only when the whole
 * SENTENCE contained no rejection marker anywhere, so any unrelated rejection
 * bought a free pass — "Avoid the crowds by hiking the exposed cliff traverse"
 * was CLEAN. Scoped polarity closes that.
 */
describe('an unrelated rejection cannot launder a later offer', () => {
  test.each([
    'Avoid the crowds by hiking the exposed cliff traverse at dawn.',
    'Skip breakfast and take the exposed ledge at sunrise.',
    'It is too popular to skip, so take the exposed ledge.',
    'Rather than sleeping in, hike the exposed cliff traverse.',
    'Stay clear of the parking lot and walk the exposed cliff edge.',
    'You can do this without a permit and still enjoy the exposed ledge.',
    'Without a shuttle reservation, walk the exposed cliff edge.',
    'Never mind the crowds, the exposed ledge is worth it.',
  ])('violation: %s', (text) => {
    expect(codes(text)).toContain(CONTRADICTION);
  });

  /**
   * KNOWN LIMITATION, unchanged by this work and false-negative in the same
   * direction as before: a locative prepositional phrase naming the hazard as
   * the SETTING of a negated instruction is read as part of the rejection.
   * Bounded grammar cannot separate "do not forget water" from "on the exposed
   * traverse" without a parser. Recorded so it is not rediscovered as new.
   */
  test('KNOWN LIMITATION: a negated instruction absorbs a locative hazard phrase', () => {
    expect(codes('Do not forget water on the exposed cliff traverse.'))
      .not.toContain(CONTRADICTION);
  });
});
