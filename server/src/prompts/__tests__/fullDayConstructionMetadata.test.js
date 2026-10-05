'use strict';

const { renderEvidenceBundleForPrompt } = require('../evidenceBundlePromptRenderer');
const { getTaskContractV2 } = require('../trailieTaskContractsV2');

describe('generic constrained full-day construction inputs', () => {
  test('architect contract requires geographic day structure, not stop-row counting', () => {
    const contract = getTaskContractV2('architect').text;
    expect(contract).toMatch(/morning/i);
    expect(contract).toMatch(/afternoon/i);
    expect(contract).toMatch(/geographic/i);
    expect(contract).toMatch(/lunch|rest/i);
  });

  test('packed named experiences expose duration, coordinates, and access context when evidence has them', () => {
    const result = renderEvidenceBundleForPrompt({
      bundle: {
        resolutions: [{ requirementId: 'r1', status: 'satisfied_fresh', evidenceIds: ['e1'] }],
        evidence: [{
          evidenceId: 'e1',
          topic: 'activities',
          claim: {
            text: 'River Museum has exhibits and a shaded terrace.',
            normalizedValue: {
              name: 'River Museum',
              activityTypes: ['museum'],
              duration: '60–90 minutes',
              coordinates: { latitude: 37.1, longitude: -112.9 },
              accessibility: 'Step-free main floor',
              currentStatus: 'unknown',
            },
            qualifiers: ['named_activity_candidate'],
          },
          source: { provider: 'nps', sourceClass: 'official_owner' },
          quality: { authorityClass: 'official_owner' },
          observation: { observedAt: '2026-08-13T00:00:00.000Z' },
        }],
      },
      requirements: [{
        requirementId: 'r1',
        topic: 'activities',
        reasonCodes: ['requested_low_exposure_candidates'],
      }],
      maxTokens: 300,
    });
    expect(result.text).toContain('duration=60–90 minutes');
    expect(result.text).toContain('coordinates=37.1,-112.9');
    expect(result.text).toContain('accessibility=Step-free main floor');
    expect(result.text).toContain('currentStatus=unknown');
  });
});
