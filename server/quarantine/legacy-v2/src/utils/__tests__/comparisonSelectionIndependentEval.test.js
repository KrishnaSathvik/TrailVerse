'use strict';

/**
 * Phase 12H2-C held-out evaluation. Destination pairs and wording were not
 * used in development tests.
 */

const {
  resolveComparisonSelection,
  evaluateComparisonSelectionAnswer,
  REASON_CODE,
} = require('../../../../../src/utils/comparisonSelectionObligation');
const { buildTurnUnderstanding } = require('../../../../../src/services/turnUnderstanding');
const { resolveTravelerJob } = require('../../../../../src/services/trailieTravelerJobResolver');

function classify(prompt) {
  const understanding = buildTurnUnderstanding({ userPrompt: prompt });
  const resolved = resolveTravelerJob({ userPrompt: prompt, understanding });
  const detected = resolveComparisonSelection({
    text: prompt,
    destinations: understanding.subjectDestinations,
  });
  return { understanding, resolved, detected };
}

describe('12H2-C independent evaluation', () => {
  test('selection-required: make the call between Glacier and Grand Teton', () => {
    const prompt = 'Make the call between Glacier and Grand Teton for a three-day, easy-hike photography trip.';
    const got = classify(prompt);
    expect(got.detected.required).toBe(true);
    expect(got.understanding.comparisonSelectionRequired).toBe(true);
    expect(got.resolved.job).toBe('destination_compare');
    const codes = (got.understanding.subjectDestinations || []).map((d) => d.parkCode).filter(Boolean);
    expect(codes).toEqual(expect.arrayContaining(['glac', 'grte']));
  });

  test('selected candidate stays inside the compared set', () => {
    const candidates = [
      { displayName: 'Badlands National Park', parkCode: 'badl' },
      { displayName: 'Wind Cave National Park', parkCode: 'wica' },
    ];
    const result = evaluateComparisonSelectionAnswer({
      required: true,
      candidates,
      text: 'Given prairie walking and photography, I would choose Badlands. Wind Cave is the better cave day if that becomes the priority.',
    });
    expect(result.ok).toBe(true);
    expect(result.selected.parkCode).toBe('badl');
    expect(['badl', 'wica']).toContain(result.selected.parkCode);
  });

  test('choice is present even when October timing could reverse it', () => {
    const candidates = [
      { displayName: 'Arches National Park', parkCode: 'arch' },
      { displayName: 'Canyonlands National Park', parkCode: 'cany' },
    ];
    const result = evaluateComparisonSelectionAnswer({
      required: true,
      candidates,
      text: 'I would go with Arches for easier walks and photography. If your days land in a timed-entry crunch, Canyonlands becomes the calmer choice.',
    });
    expect(result.ok).toBe(true);
    expect(result.selected.parkCode).toBe('arch');
    expect(result.deferred).toBe(false);
  });

  test('ordinary side-by-side comparison is not forced', () => {
    const prompt = 'Walk me through the differences between Everglades and Dry Tortugas.';
    const got = classify(prompt);
    expect(got.detected.required).toBe(false);
    expect(got.understanding.comparisonSelectionRequired).toBe(false);
    expect(got.resolved.job).toBe('destination_compare');
  });

  test('traveler priorities remain on a selection-required turn', () => {
    const prompt = 'Saguaro or Petrified Forest for easy walking and photography? Select one.';
    const got = classify(prompt);
    expect(got.understanding.comparisonSelectionRequired).toBe(true);
    expect(got.resolved.job).toBe('destination_compare');
    expect(got.understanding.explicitConstraints.some((item) => item.field === 'hiking')
      || /easy walk/i.test(got.understanding.normalizedText)).toBe(true);
    expect(got.understanding.softPreferences.some((item) => item.field === 'photography')).toBe(true);
  });

  test('deferral without a winner still fails independently', () => {
    const result = evaluateComparisonSelectionAnswer({
      required: true,
      candidates: [
        { displayName: 'Great Sand Dunes National Park', parkCode: 'grsa' },
        { displayName: 'Black Canyon of the Gunnison National Park', parkCode: 'blca' },
      ],
      text: 'I need your exact October dates before I can choose.',
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODE.DEFERRED);
  });
});
