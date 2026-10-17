'use strict';

/**
 * Server side of the isomorphic itinerary-artifact stripper. The SAME fixtures
 * drive the frontend suite (next-frontend/src/utils/__tests__/itineraryArtifacts.test.js);
 * any divergence in `content` or `artifactTypes` fails one of the two suites.
 */

const fixtures = require('../../../../shared/itineraryArtifacts.fixtures.json');
const { stripItineraryArtifacts } = require('../itineraryArtifacts');

describe('stripItineraryArtifacts — shared fixtures (server)', () => {
  for (const testCase of fixtures.cases) {
    test(testCase.name, () => {
      const result = stripItineraryArtifacts(testCase.input);
      expect(result.content).toBe(testCase.expected.content);
      expect(result.changed).toBe(testCase.expected.changed);
      expect([...result.artifactTypes].sort()).toEqual(
        [...testCase.expected.artifactTypes].sort()
      );
    });
  }
});

describe('stripItineraryArtifacts — server diagnostics', () => {
  test('removedSpans carries the removed text tagged by type', () => {
    const result = stripItineraryArtifacts(
      'Intro.\n\n[ITINERARY_JSON]{"days":[]}[/ITINERARY_JSON]\n\nOutro.'
    );
    expect(result.removedSpans).toEqual([
      { type: 'complete_block', text: '[ITINERARY_JSON]{"days":[]}[/ITINERARY_JSON]' },
    ]);
  });

  test('is idempotent — stripping already-clean content changes nothing', () => {
    const once = stripItineraryArtifacts(
      'Plan below.\n\n[ITINERARY_JSON]{"days":[]}[/ITINERARY_JSON]'
    ).content;
    const twice = stripItineraryArtifacts(once);
    expect(twice.content).toBe(once);
    expect(twice.changed).toBe(false);
  });
});
