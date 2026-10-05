'use strict';

/**
 * ATTEMPT-1 QUALITY (2026-09-02) — traveler-value-aware catalogue ranking.
 *
 * The architect's offered window is small (a handful of blocks fit the token
 * budget), so RANKING decides what a vacation is built from. Live diagnosis
 * showed a refinement pool of 18 wayside signs + 1 trailhead while 130 primary
 * experiences sat unoffered in the bundle. These tests pin the generic rule:
 *
 *   primary experiences → supporting experiences → rest/logistics → micro-POI
 *
 * as a RANKING preference, never an exclusion — a micro-POI is still offered
 * when nothing better exists, and no validator or threshold changes.
 * Synthetic, unseen names only — no park-specific rules.
 */

const { renderEvidenceBundleForPrompt } = require('../evidenceBundlePromptRenderer');

const place = (evidenceId, name, activityTypes = [], overrides = {}) => ({
  evidenceId,
  topic: 'activities',
  claim: {
    identity: `place:${name}`,
    text: `${name} is described by the official park source at moderate length for rendering.`,
    qualifiers: ['named_place_candidate'],
    normalizedValue: { name, activityTypes },
  },
  source: {
    provider: 'nps', sourceClass: 'official_owner', sourceId: `sid:${evidenceId}`,
    url: 'https://www.nps.gov/example', title: name,
  },
  observation: { observedAt: '2026-09-01T12:00:00.000Z' },
  quality: { authorityClass: 'official_owner', conflictStatus: 'none' },
  retention: { storeClaimText: true },
  ...overrides,
});

const bundleOf = (candidates) => ({
  resolutions: [{
    requirementId: 'req-activities',
    status: 'satisfied_fresh',
    evidenceIds: candidates.map((c) => c.evidenceId),
  }],
  evidence: candidates,
});

const REQ = [{ requirementId: 'req-activities', topic: 'activities' }];

const MIXED = [
  place('ev:sign1', '[Sign] Granite Story Wayside #12x'),
  place('ev:sign2', '[Sign] River Terrace Wayside #9c'),
  place('ev:sign3', 'Basin History Interpretive Panel'),
  place('ev:trail', 'Fernline Trail', ['hiking']),
  place('ev:overlook', 'Copper Basin Overlook'),
  place('ev:vc', 'Basinview Visitor Center', ['visitor_center']),
  place('ev:parking', 'Basin Rim Parking Area'),
];

describe('traveler-value ranking inside the token window', () => {
  test('a tight window offers experiences, not wayside signs', () => {
    const result = renderEvidenceBundleForPrompt({
      bundle: bundleOf(MIXED),
      requirements: REQ,
      userRequest: 'Plan 2 relaxed days here.',
      maxTokens: 160,
    });
    expect(result.includedEvidenceIds).toContain('ev:trail');
    expect(result.includedEvidenceIds).toContain('ev:overlook');
    expect(result.includedEvidenceIds).not.toContain('ev:sign1');
    expect(result.includedEvidenceIds).not.toContain('ev:sign2');
    expect(result.includedEvidenceIds).not.toContain('ev:sign3');
    expect(result.includedEvidenceIds).not.toContain('ev:parking');
  });

  test('with room to spare, experiences still come before signs in render order', () => {
    const result = renderEvidenceBundleForPrompt({
      bundle: bundleOf(MIXED),
      requirements: REQ,
      userRequest: 'Plan 2 relaxed days here.',
      maxTokens: 4000,
    });
    const order = result.includedEvidenceIds;
    const lastExperience = Math.max(order.indexOf('ev:trail'), order.indexOf('ev:overlook'), order.indexOf('ev:vc'));
    const firstSign = ['ev:sign1', 'ev:sign2', 'ev:sign3'].map((id) => order.indexOf(id)).filter((i) => i >= 0);
    for (const signIndex of firstSign) expect(signIndex).toBeGreaterThan(lastExperience);
  });

  test('ranking is not exclusion: an all-micro-POI pool is still offered', () => {
    const signsOnly = [place('ev:s1', '[Sign] Granite Story Wayside #12x'), place('ev:s2', 'Basin History Interpretive Panel')];
    const result = renderEvidenceBundleForPrompt({
      bundle: bundleOf(signsOnly),
      requirements: REQ,
      userRequest: 'Plan a day here.',
      maxTokens: 800,
    });
    expect(result.includedEvidenceIds).toContain('ev:s1');
    expect(result.includedEvidenceIds).toContain('ev:s2');
  });

  test('an access/parking decision still surfaces parking candidates', () => {
    const result = renderEvidenceBundleForPrompt({
      bundle: bundleOf(MIXED),
      requirements: [{ requirementId: 'req-activities', topic: 'activities', reasonCodes: ['access_decision'] }],
      userRequest: 'Where should I park for the Basin Rim area and how do I get in?',
      maxTokens: 600,
    });
    expect(result.includedEvidenceIds).toContain('ev:parking');
  });
});
