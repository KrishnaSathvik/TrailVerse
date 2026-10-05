'use strict';

const {
  runVerificationPass,
  verifyApprovedPatch,
  VERIFICATION_FAILURE,
} = require('../reviewVerification');
const { POLICY_STATUS } = require('../responsePatchPolicy');
const {
  makeFact,
  buildFactBundle,
  AUTHORITY,
  STATUS,
} = require('../canonicalFacts');

const RETRIEVED_AT = '2026-07-22T16:41:00.000Z';

const hohClosure = makeFact({
  source: 'nps',
  category: 'closure',
  sourceId: 'o1',
  text: 'Hoh Road closed above the ranger station',
  parkCode: 'olym',
  parkName: 'Olympic National Park',
  authority: AUTHORITY.AUTHORITATIVE,
  status: STATUS.ACTIVE_CLOSURE,
  retrievedAt: RETRIEVED_AT,
});

const BUNDLE = buildFactBundle([[hohClosure]]);

/** Shape an approved policy result the way evaluateIssuePolicy emits one. */
function approved({ action = 'replace', replacementText, matchedText, acceptedFactIds = [hohClosure.id], sectionId = 's1' }) {
  return {
    status: POLICY_STATUS.APPROVED,
    allowedAction: action,
    acceptedFactIds,
    evidenceFactIds: acceptedFactIds,
    sectionId,
    patch: { issue: { action, replacementText }, match: { matchedText } },
  };
}

describe('Stage 6B — hypothetical patch verification', () => {
  test('a correction that resolves the conflict with supported claims verifies', () => {
    const result = verifyApprovedPatch({
      policyResult: approved({
        replacementText: 'The Hoh Road is currently closed above the ranger station.',
        matchedText: 'The Hoh Road is open right now.',
      }),
      bundle: BUNDLE,
    });

    expect(result.verified).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test('a replacement still contradicted by the evidence fails verification', () => {
    const result = verifyApprovedPatch({
      policyResult: approved({
        replacementText: 'The Hoh Road is open right now.',
        matchedText: 'The Hoh Road is open right now.',
      }),
      bundle: BUNDLE,
    });

    expect(result.verified).toBe(false);
    expect(result.reasons).toContain(VERIFICATION_FAILURE.REPLACEMENT_STILL_CONTRADICTED);
  });

  test('a replacement asserting a claim no accepted fact supports fails verification', () => {
    const result = verifyApprovedPatch({
      policyResult: approved({
        replacementText: 'A wilderness permit is required for this trail.',
        matchedText: 'No permit is needed.',
      }),
      bundle: BUNDLE, // only a closure fact — nothing confirms a permit requirement
    });

    expect(result.verified).toBe(false);
    expect(result.reasons.some((r) => r.startsWith(VERIFICATION_FAILURE.UNSUPPORTED_CLAIM))).toBe(true);
  });

  test('a deletion is verified — removal resolves the conflict and asserts nothing new', () => {
    const result = verifyApprovedPatch({
      policyResult: approved({ action: 'delete', replacementText: '', matchedText: 'The Hoh Road is open right now.' }),
      bundle: BUNDLE,
    });

    expect(result.verified).toBe(true);
  });

  test('an approved patch with no accepted evidence cannot be verified', () => {
    const result = verifyApprovedPatch({
      policyResult: approved({
        replacementText: 'The Hoh Road is currently closed.',
        matchedText: 'The Hoh Road is open.',
        acceptedFactIds: [],
      }),
      bundle: BUNDLE,
    });

    expect(result.verified).toBe(false);
    expect(result.reasons).toContain(VERIFICATION_FAILURE.NO_ACCEPTED_EVIDENCE);
  });

  describe('runVerificationPass', () => {
    test('reports verificationRan=false when there are no approved patches', () => {
      const pass = runVerificationPass({
        policyResults: [{ status: POLICY_STATUS.EVIDENCE_MISSING }],
        canonicalFactBundle: BUNDLE,
      });
      expect(pass.verificationRan).toBe(false);
      expect(pass.contentUnverified).toBe(false);
      expect(pass.verificationFailedSections).toEqual([]);
    });

    test('a failed hypothetical patch marks content unverified and lists its section', () => {
      const pass = runVerificationPass({
        policyResults: [
          approved({ replacementText: 'The Hoh Road is currently closed.', matchedText: 'x', sectionId: 'day-1' }),
          approved({ replacementText: 'The Hoh Road is open right now.', matchedText: 'x', sectionId: 'day-2' }),
        ],
        canonicalFactBundle: BUNDLE,
      });

      expect(pass.verificationRan).toBe(true);
      expect(pass.hypotheticalPatchesVerified).toBe(1);
      expect(pass.hypotheticalPatchesFailed).toBe(1);
      expect(pass.verificationFailedSections).toEqual(['day-2']);
      expect(pass.contentUnverified).toBe(true);
    });

    test('verification output carries no canonical fact text', () => {
      const pass = runVerificationPass({
        policyResults: [approved({ replacementText: 'The Hoh Road is open.', matchedText: 'x' })],
        canonicalFactBundle: BUNDLE,
      });
      const serialized = JSON.stringify(pass);
      expect(serialized).not.toContain('Hoh Road closed above the ranger station');
    });
  });
});
