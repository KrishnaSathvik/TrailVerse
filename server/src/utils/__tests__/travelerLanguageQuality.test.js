'use strict';

const {
  evaluateTravelerLanguage,
  buildTravelerLanguageRepairInstructions,
} = require('../travelerLanguageQuality');

describe('travelerLanguageQuality', () => {
  test('accepts ordinary uncertainty and place descriptions', () => {
    expect(evaluateTravelerLanguage({
      text: "I couldn't verify a meaningful late-September crowd advantage for either park. The CCC cabins are a good sunset stop.",
    }).ok).toBe(true);
  });

  test('rejects architecture-speak in notes and intro', () => {
    const result = evaluateTravelerLanguage({
      intro: 'Pick Sequoia. The supplied information doesn’t identify a crowd winner.',
      itineraryData: {
        days: [{
          stops: [{
            name: 'CCC cabins',
            note: 'An evidence-supported evening-light candidate and compatible support stop.',
          }],
        }],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'architecture_supplied_information',
      'architecture_evidence_supported',
      'architecture_candidate_word',
    ]));
    expect(buildTravelerLanguageRepairInstructions(result)).toMatch(/ordinary language/i);
  });

  test('rejects candidate and reasonCode architecture words', () => {
    expect(evaluateTravelerLanguage({
      text: 'This candidate is confirmed compatible.',
    }).reasonCodes).toEqual(expect.arrayContaining([
      'architecture_candidate_word',
      'architecture_confirmed_compatible',
    ]));
    expect(evaluateTravelerLanguage({
      intro: 'Internal reasonCode: empty_day.',
    }).reasonCodes).toContain('architecture_reason_code');
  });
});
