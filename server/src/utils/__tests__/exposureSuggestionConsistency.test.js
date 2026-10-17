'use strict';

/**
 * Retry-pool / exposure-directive consistency (Olympic live finding 2026-09-03).
 *
 * The live constrained run failed 3/3 on `stop_identity_excluded` while the
 * machine's own retry hint offered eight suggestions that ALL had unknown
 * exposure — the retry pool and the exposure directive disagreed about what a
 * legal candidate is. These pins centralize the semantic authority: candidate
 * suggestibility is the validator's own relevance function projected onto the
 * candidate (worst-case experiential typing, since stop.type is
 * model-authored), and retry suggestions are derived from the directive
 * result, never re-filtered with independent logic.
 */

const {
  isExposureJudgedCandidate,
  classifyCandidateExposureSuggestibility,
} = require('../hardConstraintEligibility');
const { composeOperationalGenerationDirectives } = require('../operationalGenerationDirectives');
const { __testables } = require('../../services/trailieV2ExecutionService');

const candidate = (name, exposureLevel, { category = 'place', activityTypes = [], id } = {}) => ({
  evidenceId: id || `ev:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  entityId: 'nps:park:olym',
  topic: 'activities',
  claim: {
    identity: `place:${name}`,
    text: `${name}.`,
    normalizedValue: { name, exposureLevel, category, activityTypes, operationalFacts: [] },
  },
});

// The names that actually leaked into the live retry pool, plus controls.
const OBSTRUCTION = candidate('Obstruction Point Trailhead', null);
const OZETTE = candidate('Ozette Triangle Coastal Trailhead', null);
const SOL_DUC_FALLS = candidate('Sol Duc Falls', null);
const TIDEPOOLING = candidate('Tidepooling on the Olympic Coast', null, { category: 'thingstodo' });
const CIRQUE_RIM = candidate('Cirque Rim Overlook', 'low');
const SOL_DUC_TRAIL = candidate('Sol Duc Falls Trail', 'low');
const SPRUCE_NATURE = candidate('Spruce Nature Trail', 'low');
const LODGE = candidate('Lake Crescent Lodge', null, { category: 'lodging' });
const VISITOR_CENTER = candidate('Hoh Rain Forest Visitor Center', null, { category: 'visitor_center' });
const HURRICANE_HILL = candidate('Hurricane Hill Trailhead', 'moderate');

describe('central candidate-level exposure judgment (single semantic authority)', () => {
  test('worst-case experiential typing judges every non-facility candidate, Trailhead names included', () => {
    for (const c of [OBSTRUCTION, OZETTE, SOL_DUC_FALLS, TIDEPOOLING, CIRQUE_RIM, HURRICANE_HILL]) {
      expect(isExposureJudgedCandidate(c.claim.normalizedValue)).toBe(true);
    }
  });

  test('facility carve-outs stay exposure-neutral by category and by name', () => {
    expect(isExposureJudgedCandidate(LODGE.claim.normalizedValue)).toBe(false);
    expect(isExposureJudgedCandidate(VISITOR_CENTER.claim.normalizedValue)).toBe(false);
    // Name carve-out with no machine category.
    expect(isExposureJudgedCandidate({ name: 'The Zion Lodge', category: 'place' })).toBe(false);
  });

  test('suggestibility: confirmed low / neutral facility / ineligible unknown-or-hazard', () => {
    expect(classifyCandidateExposureSuggestibility(CIRQUE_RIM.claim.normalizedValue)).toBe('confirmed_low');
    expect(classifyCandidateExposureSuggestibility(LODGE.claim.normalizedValue)).toBe('exposure_neutral');
    expect(classifyCandidateExposureSuggestibility(OBSTRUCTION.claim.normalizedValue)).toBe('ineligible');
    expect(classifyCandidateExposureSuggestibility(SOL_DUC_FALLS.claim.normalizedValue)).toBe('ineligible');
    expect(classifyCandidateExposureSuggestibility(HURRICANE_HILL.claim.normalizedValue)).toBe('ineligible');
  });
});

describe('exposure directive carries identity-based suggestion sets', () => {
  const bundle = {
    evidence: [
      OBSTRUCTION, OZETTE, SOL_DUC_FALLS, TIDEPOOLING,
      CIRQUE_RIM, SOL_DUC_TRAIL, SPRUCE_NATURE, LODGE, VISITOR_CENTER, HURRICANE_HILL,
    ],
  };
  const directives = composeOperationalGenerationDirectives({
    evidenceBundle: bundle,
    constraints: { preferences: { avoidExposure: true } },
    userPrompt: '3 easy days, no scary drop-offs.',
  });

  test('confirmedLowEvidenceIds and suggestionIneligibleEvidenceIds partition by the central authority', () => {
    expect(directives.exposure.confirmedLowEvidenceIds).toEqual(
      expect.arrayContaining([CIRQUE_RIM.evidenceId, SOL_DUC_TRAIL.evidenceId, SPRUCE_NATURE.evidenceId]),
    );
    expect(directives.exposure.suggestionIneligibleEvidenceIds).toEqual(
      expect.arrayContaining([
        OBSTRUCTION.evidenceId, OZETTE.evidenceId, SOL_DUC_FALLS.evidenceId,
        TIDEPOOLING.evidenceId, HURRICANE_HILL.evidenceId,
      ]),
    );
    // Disjoint, and neutral facilities are in neither set.
    const confirmed = new Set(directives.exposure.confirmedLowEvidenceIds);
    for (const id of directives.exposure.suggestionIneligibleEvidenceIds) {
      expect(confirmed.has(id)).toBe(false);
    }
    for (const id of [LODGE.evidenceId, VISITOR_CENTER.evidenceId]) {
      expect(confirmed.has(id)).toBe(false);
      expect(directives.exposure.suggestionIneligibleEvidenceIds).not.toContain(id);
    }
  });
});

describe('retry legal-place suggestions derive from the directive result', () => {
  const bundle = {
    evidence: [
      // Bundle order puts the leaked unknowns FIRST — the live failure mode.
      OBSTRUCTION, OZETTE, SOL_DUC_FALLS, TIDEPOOLING, HURRICANE_HILL,
      CIRQUE_RIM, SOL_DUC_TRAIL, SPRUCE_NATURE, LODGE, VISITOR_CENTER,
    ],
  };
  const directives = composeOperationalGenerationDirectives({
    evidenceBundle: bundle,
    constraints: { preferences: { avoidExposure: true } },
    userPrompt: '3 easy days, no scary drop-offs.',
  });

  test('under an armed exposure directive no ineligible candidate is ever suggested and confirmed-low ranks first', () => {
    const names = __testables.legalPlaceSuggestions({
      bundle,
      excludedEvidenceIds: directives.exposure.ineligibleEvidenceIds,
      exposureDirective: directives.exposure,
    });
    // The historical leak: unknown-exposure candidates offered as legal.
    for (const leaked of [
      'Obstruction Point Trailhead', 'Ozette Triangle Coastal Trailhead',
      'Sol Duc Falls', 'Tidepooling on the Olympic Coast', 'Hurricane Hill Trailhead',
    ]) {
      expect(names).not.toContain(leaked);
    }
    // Confirmed-low candidates lead the pool.
    expect(names.slice(0, 3)).toEqual(
      expect.arrayContaining(['Cirque Rim Overlook', 'Sol Duc Falls Trail', 'Spruce Nature Trail']),
    );
    // Exposure-neutral supporting places remain eligible.
    expect(names).toContain('Lake Crescent Lodge');
  });

  test('without an armed exposure directive the pool keeps its existing behavior', () => {
    const names = __testables.legalPlaceSuggestions({ bundle, excludedEvidenceIds: [] });
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain('Obstruction Point Trailhead');
  });
});
