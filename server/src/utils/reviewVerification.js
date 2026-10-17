'use strict';

/**
 * Stage 6B — hypothetical patch verification.
 *
 * The shadow reviewer produces policy-APPROVED hypothetical corrections. Before
 * such a correction could ever be trusted (in a future enforcing mode), we ask
 * two independent questions of each one, using the SAME real canonical evidence
 * Trailie fetched:
 *
 *   1. Does the correction actually RESOLVE the conflict? — the replacement text
 *      must not itself be contradicted by the accepted evidence.
 *   2. Is every NEW claim SUPPORTED? — each asserted claim and each concrete
 *      value the replacement introduces must trace back to accepted facts.
 *
 * This is a read-only, defense-in-depth pass. Under a correct policy layer it
 * should always pass; when it does not, `contentUnverified` is raised so the
 * response is never treated as safely correctable. It NEVER mutates content and
 * NEVER applies a patch — it only reports.
 */

const {
  POLICY_STATUS,
  CLAIM,
  classifyClaims,
  factAuthorizesClaim,
  findContradictingFact,
  findUnsupportedValues,
} = require('./responsePatchPolicy');

const VERIFICATION_FAILURE = {
  REPLACEMENT_STILL_CONTRADICTED: 'replacement_still_contradicted',
  UNSUPPORTED_CLAIM: 'unsupported_claim',
  UNSUPPORTED_VALUE: 'unsupported_value',
  NO_ACCEPTED_EVIDENCE: 'no_accepted_evidence',
};

function factsFromIds(ids, bundle) {
  return (ids || []).map((id) => bundle?.byId?.[id]).filter(Boolean);
}

/**
 * Verify one approved hypothetical patch against the real evidence it cited.
 * @returns {{verified: boolean, action: string, reasons: string[]}}
 */
function verifyApprovedPatch({ policyResult, bundle, itineraryData = null, constraints = null }) {
  const patch = policyResult.patch || {};
  const action = patch.issue?.action || policyResult.allowedAction || 'replace';
  const replacementText = patch.issue?.replacementText || '';
  const matchedText = patch.match?.matchedText || '';
  const acceptedFacts = factsFromIds(policyResult.acceptedFactIds, bundle);
  const reasons = [];

  // A deletion resolves a conflict by removal and asserts nothing new.
  if (action === 'delete') {
    return { verified: true, action, reasons: [] };
  }

  // Any replace/warning must rest on real accepted evidence.
  if (acceptedFacts.length === 0) {
    reasons.push(VERIFICATION_FAILURE.NO_ACCEPTED_EVIDENCE);
  }

  // 1. The correction must resolve the conflict — its new text must not itself
  //    be contradicted by the accepted evidence.
  if (findContradictingFact(replacementText, acceptedFacts)) {
    reasons.push(VERIFICATION_FAILURE.REPLACEMENT_STILL_CONTRADICTED);
  }

  // 2. Every new claim must be authorized by the accepted evidence.
  for (const claim of classifyClaims(replacementText)) {
    if (claim === CLAIM.NEUTRAL_VERIFICATION) continue;
    if (!acceptedFacts.some((fact) => factAuthorizesClaim(fact, claim))) {
      reasons.push(`${VERIFICATION_FAILURE.UNSUPPORTED_CLAIM}:${claim}`);
    }
  }

  // 3. Every concrete value must trace to evidence, the quote, the itinerary or
  //    explicit constraints.
  for (const value of findUnsupportedValues({
    replacementText,
    matchedText,
    acceptedFacts,
    itineraryData,
    constraints,
  })) {
    reasons.push(`${VERIFICATION_FAILURE.UNSUPPORTED_VALUE}:${value}`);
  }

  return { verified: reasons.length === 0, action, reasons };
}

/**
 * Run verification across every approved hypothetical patch produced by shadow
 * review. Read-only; emits ids/counts/reason-codes only (no canonical fact text).
 */
function runVerificationPass({
  policyResults = [],
  canonicalFactBundle = { facts: [], byId: {} },
  itineraryData = null,
  constraints = null,
}) {
  const approved = policyResults.filter((r) => r.status === POLICY_STATUS.APPROVED && r.patch);

  const verifications = approved.map((policyResult) => ({
    sectionId: policyResult.sectionId || null,
    ...verifyApprovedPatch({ policyResult, bundle: canonicalFactBundle, itineraryData, constraints }),
  }));

  const failed = verifications.filter((v) => !v.verified);

  return {
    verificationRan: approved.length > 0,
    hypotheticalPatchesVerified: verifications.length - failed.length,
    hypotheticalPatchesFailed: failed.length,
    verificationFailedSections: [...new Set(failed.map((v) => v.sectionId).filter(Boolean))],
    contentUnverified: failed.length > 0,
    verifications,
  };
}

module.exports = {
  VERIFICATION_FAILURE,
  verifyApprovedPatch,
  runVerificationPass,
};
