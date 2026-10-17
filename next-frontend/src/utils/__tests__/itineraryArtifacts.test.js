import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { stripItineraryArtifacts } from '../itineraryArtifacts';

/**
 * Frontend side of the isomorphic stripper. Reads the SAME shared fixtures the
 * server suite uses (shared/itineraryArtifacts.fixtures.json). If the two
 * strippers ever diverge, one of these suites fails.
 */
const dir = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(resolve(dir, '../../../../shared/itineraryArtifacts.fixtures.json'), 'utf8')
);

describe('stripItineraryArtifacts — shared fixtures (frontend)', () => {
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
