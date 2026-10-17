'use strict';

/**
 * Phase 12H2-C — comparison-selection obligation.
 * Synthetic destination pairs only. No Acadia/Shenandoah goldens.
 */

const {
  resolveComparisonSelection,
  evaluateComparisonSelectionAnswer,
  buildComparisonSelectionRepairInstructions,
  REASON_CODE,
} = require('../comparisonSelectionObligation');
const { buildTurnUnderstanding } = require('../../services/turnUnderstanding');
const { resolveTravelerJob } = require('../../services/trailieTravelerJobResolver');

const CUYAHOGA = { displayName: 'Cuyahoga Valley National Park', parkCode: 'cuva' };
const CONGAREE = { displayName: 'Congaree National Park', parkCode: 'cong' };
const TORTUGAS = { displayName: 'Dry Tortugas National Park', parkCode: 'drto' };
const BISCAYNE = { displayName: 'Biscayne National Park', parkCode: 'bisc' };

function obligation(prompt, destinations = [CUYAHOGA, CONGAREE]) {
  return resolveComparisonSelection({ text: prompt, destinations });
}

function turn(prompt) {
  const understanding = buildTurnUnderstanding({ userPrompt: prompt });
  const resolved = resolveTravelerJob({ userPrompt: prompt, understanding });
  return { understanding, resolved };
}

describe('selection-required detection', () => {
  test.each([
    ['Olympic or Mount Rainier — pick one and explain why.'],
    ['Decide for me between Joshua Tree and Death Valley.'],
    ['Which would you choose, Redwood or North Cascades?'],
    ['Recommend one: White Sands or Carlsbad Caverns for a photography trip.'],
    ['Kings Canyon or Sequoia — choose the better fit for easy walking and photography.'],
    ['Give me your choice between Zion and Bryce Canyon.'],
    ['Tell me which you would pick, Olympic or Mount Rainier.'],
    ['Joshua Tree or Death Valley — which is better for this trip?'],
  ])('%s → selection required; job stays destination_compare', (prompt) => {
    const detected = obligation(prompt);
    expect(detected.required).toBe(true);
    const { understanding, resolved } = turn(prompt);
    expect(resolved.job).toBe('destination_compare');
    expect(understanding.comparisonSelectionRequired).toBe(true);
    expect(understanding.taskFamily).toBe('comparison');
  });
});

describe('ordinary comparison is not forced', () => {
  test.each([
    ['Compare Olympic and Mount Rainier for rainforest walks.'],
    ['What are the tradeoffs between Joshua Tree and Death Valley?'],
    ['How are Redwood and North Cascades different?'],
    ['White Sands vs Carlsbad Caverns — pros and cons?'],
    ['Help me understand the tradeoffs between Kings Canyon and Sequoia.'],
    ['Which is better for wildflower season, Joshua Tree or Death Valley?'],
  ])('%s → comparison only', (prompt) => {
    const detected = obligation(prompt);
    expect(detected.required).toBe(false);
    const { understanding, resolved } = turn(prompt);
    expect(resolved.job).toBe('destination_compare');
    expect(understanding.comparisonSelectionRequired).toBe(false);
  });

  test('traveler-only-one constraint is not an assistant selection ask', () => {
    const prompt = 'We were considering Cuyahoga and Congaree, but can probably only choose one.';
    expect(obligation(prompt).required).toBe(false);
    expect(turn(prompt).understanding.comparisonSelectionRequired).toBe(false);
  });
});

describe('compare + explicit selection still requires a choice', () => {
  test('compare-and-pick-one does not drop the selection obligation', () => {
    const prompt = 'Compare Olympic and Mount Rainier for easy hikes, then pick one.';
    expect(obligation(prompt).required).toBe(true);
    const { understanding, resolved } = turn(prompt);
    expect(resolved.job).toBe('destination_compare');
    expect(understanding.comparisonSelectionRequired).toBe(true);
    expect(understanding.destinationRelationship).toBe('compare');
  });
});

describe('answer validation — selection present and in scope', () => {
  const candidates = [CUYAHOGA, CONGAREE];

  test('a named candidate from the set satisfies the obligation', () => {
    const result = evaluateComparisonSelectionAnswer({
      required: true,
      candidates,
      text: 'Based on easy boardwalk walking, I would take Congaree. Cuyahoga has stronger waterfalls if you later want more terrain.',
    });
    expect(result.ok).toBe(true);
    expect(result.selected.parkCode).toBe('cong');
    expect(result.deferred).toBe(false);
  });

  test('uncertainty may qualify a choice but not replace it', () => {
    const result = evaluateComparisonSelectionAnswer({
      required: true,
      candidates,
      text: 'I would choose Cuyahoga for this trip. If your three days land in peak mosquito season, Congaree becomes less comfortable.',
    });
    expect(result.ok).toBe(true);
    expect(result.selected.parkCode).toBe('cuva');
  });

  test('deferring until more dates arrive fails', () => {
    const result = evaluateComparisonSelectionAnswer({
      required: true,
      candidates,
      text: 'Both can work in October. Tell me your exact dates before I can choose.',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODE.DEFERRED);
    expect(result.selected).toBeNull();
  });

  test('pure tradeoffs with no winner fail when selection is required', () => {
    const result = evaluateComparisonSelectionAnswer({
      required: true,
      candidates,
      text: 'Cuyahoga has waterfalls and a towpath. Congaree has a boardwalk and old-growth forest. It depends on what you value more.',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODE.MISSING);
  });

  test('a third destination cannot be the selected winner', () => {
    const result = evaluateComparisonSelectionAnswer({
      required: true,
      candidates,
      text: 'I would skip both and go to Yellowstone instead — it is the stronger national-park trip.',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODE.OUT_OF_SCOPE);
  });

  test('ordinary comparison answers are not forced to name a winner', () => {
    const result = evaluateComparisonSelectionAnswer({
      required: false,
      candidates,
      text: 'Cuyahoga has waterfalls and a towpath. Congaree has a boardwalk and old-growth forest.',
    });
    expect(result.ok).toBe(true);
    expect(result.selected).toBeNull();
  });
});

describe('insufficient-evidence exception', () => {
  test('unresolved candidates may refuse to choose with a structured reason', () => {
    const detected = resolveComparisonSelection({
      text: 'Pick one: Cuyahoga or Congaree.',
      destinations: [CUYAHOGA],
    });
    expect(detected.required).toBe(true);
    expect(detected.exception?.code).toBe(REASON_CODE.UNRESOLVED);

    const answer = evaluateComparisonSelectionAnswer({
      required: true,
      candidates: [CUYAHOGA, CONGAREE],
      resolvedCandidates: [CUYAHOGA],
      text: 'I cannot choose yet because Congaree did not resolve as a compared destination.',
    });
    expect(answer.ok).toBe(true);
    expect(answer.exception?.code).toBe(REASON_CODE.UNRESOLVED);
    expect(answer.selected).toBeNull();
  });

  test('missing deciding-criterion evidence for both is a structured exception, not ordinary comparison', () => {
    const answer = evaluateComparisonSelectionAnswer({
      required: true,
      candidates: [TORTUGAS, BISCAYNE],
      resolvedCandidates: [TORTUGAS, BISCAYNE],
      criterionEvidence: { available: false, reason: 'no_authoritative_crowd_signal' },
      text: 'Official sources do not establish a crowd advantage for either park, so I am not selecting a winner on that criterion.',
    });
    expect(answer.ok).toBe(true);
    expect(answer.exception?.code).toBe(REASON_CODE.CRITERION_UNAVAILABLE);
  });

  test('exact dates would help is not an insufficient-evidence escape hatch', () => {
    const answer = evaluateComparisonSelectionAnswer({
      required: true,
      candidates: [CUYAHOGA, CONGAREE],
      resolvedCandidates: [CUYAHOGA, CONGAREE],
      criterionEvidence: { available: true },
      text: 'More exact October dates would help. I will wait until you share them before choosing.',
    });
    expect(answer.ok).toBe(false);
    expect(answer.reasonCodes).toContain(REASON_CODE.DEFERRED);
  });
});

describe('repair instructions', () => {
  test('missing selection asks for a choice from existing candidates without rerunning evidence', () => {
    const text = buildComparisonSelectionRepairInstructions({
      reasonCodes: [REASON_CODE.MISSING],
      candidates: [CUYAHOGA, CONGAREE],
    });
    expect(text).toMatch(/clear selection|name one/i);
    expect(text).toMatch(/Cuyahoga|Congaree/i);
    expect(text).toMatch(/qualification, not deferral|do not replace the selection/i);
    expect(text).not.toMatch(/fetch|evidence bundle|re-run/i);
  });
});

describe('constraints remain in force', () => {
  test('selection-required comparison still carries hiking and driving preferences', () => {
    const prompt = 'Olympic or Mount Rainier for easy hikes and minimal driving — pick one.';
    const { understanding, resolved } = turn(prompt);
    expect(resolved.job).toBe('destination_compare');
    expect(understanding.comparisonSelectionRequired).toBe(true);
    expect(understanding.explicitConstraints.some((item) => item.field === 'hiking')).toBe(true);
    expect(understanding.softPreferences.some((item) => item.field === 'minimizeDriving')).toBe(true);
  });
});
