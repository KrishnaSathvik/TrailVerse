'use strict';

const { FEEDBACK_VALUES, buildFeedbackUpdate } = require('../feedbackCommand');

describe('buildFeedbackUpdate', () => {
  test('accepts up / down / null', () => {
    for (const v of FEEDBACK_VALUES) {
      expect(buildFeedbackUpdate(v, 7).valid).toBe(true);
    }
  });

  test('rejects any other value', () => {
    expect(buildFeedbackUpdate('love', 7).valid).toBe(false);
    expect(buildFeedbackUpdate({}, 7).valid).toBe(false);
  });

  test('only ever sets userFeedback and feedbackAt — never content/plan/hashes/version', () => {
    const { setDoc } = buildFeedbackUpdate('up', 7);
    const keys = Object.keys(setDoc);
    expect(keys).toEqual(['conversation.$[m].userFeedback', 'conversation.$[m].feedbackAt']);
    // Explicitly prove none of the protected fields can be touched.
    for (const forbidden of ['content', 'responseId', 'responseVersion', 'contentHash', 'itineraryHash', 'plan']) {
      expect(keys.some((k) => k.includes(forbidden))).toBe(false);
    }
  });

  test('targets the message by id via arrayFilters', () => {
    const { arrayFilters } = buildFeedbackUpdate('down', 42);
    expect(arrayFilters).toEqual([{ 'm.id': 42 }]);
  });
});
