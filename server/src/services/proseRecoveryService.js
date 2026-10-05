const { runProseConsistency } = require('./proseConsistencyService');
const {
  buildRevisionOneOutbound,
  buildRevisionTwoOutbound,
  assertItineraryUnchanged,
} = require('../utils/earlyRevisionEvents');
const { renderDeterministicItineraryResponse } = require('../utils/deterministicItineraryRenderer');
const { hashPayload } = require('../utils/canonicalResponse');

/**
 * Stage 14.4 §4 — Phase B, and nothing but Phase B.
 *
 * Recovery completes an EXISTING logical response. Phase A never runs: the
 * itinerary comes from the stored plan, deep-frozen before generation, so the
 * frozen plan the user is already looking at provably cannot change underneath
 * them. `runProseConsistency` is reused verbatim — same buffering, verification,
 * single bounded retry, deterministic fallback and sanitation as a normal turn.
 *
 * This module deliberately imports no orchestrator, no structured generator, no
 * corrector, no trip model and no controller. A structural test enforces that.
 */

/** Recursively freeze so Phase B cannot mutate the stored itinerary. */
function deepFreeze(value) {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) deepFreeze(value[key]);
  return value;
}

const RECOVERY_OUTCOME = {
  PROSE_READY: 'prose_ready',
  ABORTED: 'aborted',
  FAILED: 'failed',
};

/**
 * @param {Object} params
 * @param {Object} params.storedRevision  context from evaluateStoredRevisionForRecovery
 * @param {Function} params.deliverProse  async ({systemPrompt}) => {content, provider, model, usage, aborted}
 * @returns {Promise<{outcome: string, revisionTwo?: Object, meta?: Object, code?: string}>}
 */
async function runProseRecovery({
  storedRevision,
  deliverProse,
  baseSystemPrompt = '',
  resolvedMetadata = {},
  proseConfig,
  emitThinking = () => {},
  signal,
  provider = null,
  model = null,
  onProseAttempt = null,
  now = () => new Date().toISOString(),
}) {
  const frozenItinerary = deepFreeze(storedRevision.itineraryData);
  const storedHash = storedRevision.itineraryHash;

  // Belt and braces: refuse before spending anything if the caller handed us an
  // itinerary that does not match the hash the client already persisted.
  if (hashPayload(frozenItinerary) !== storedHash) {
    return { outcome: RECOVERY_OUTCOME.FAILED, code: 'stored_itinerary_hash_mismatch' };
  }

  const responseIdentity = {
    responseId: storedRevision.responseId,
    // The SAME version slot — recovery is not a new logical turn.
    responseVersion: storedRevision.responseVersion,
  };

  // Reconstruct the revision-1 outbound purely to give the successor builder its
  // base. Nothing here is emitted or persisted; the client already holds revision 1.
  const revisionOne = buildRevisionOneOutbound({
    responseIdentity,
    finalizedItinerary: frozenItinerary,
    feasibilityIssues: storedRevision.feasibilityIssues,
    parkName: storedRevision.parkName,
    parkCode: storedRevision.parkCode,
    provider,
    model,
    now: () => storedRevision.plan?.itineraryReadyAt || now(),
  });
  if (!revisionOne) return { outcome: RECOVERY_OUTCOME.FAILED, code: 'revision_one_unavailable' };

  const outcome = await runProseConsistency({
    toolFirst: {
      itineraryData: frozenItinerary,
      correctionsApplied: [],
      removedStops: [],
      feasibilityIssues: storedRevision.feasibilityIssues,
    },
    baseSystemPrompt,
    deliverProse,
    resolvedMetadata,
    proseConfig,
    emitThinking,
    signal,
    provider,
    model,
    onProseAttempt,
  });

  if (outcome?.aborted || signal?.aborted) {
    return { outcome: RECOVERY_OUTCOME.ABORTED };
  }
  if (!outcome?.selectedProse) {
    return { outcome: RECOVERY_OUTCOME.FAILED, code: 'prose_unavailable' };
  }

  let revisionTwo = buildRevisionTwoOutbound({
    responseIdentity,
    revisionOne,
    finalizedItinerary: frozenItinerary,
    selectedProse: outcome.selectedProse,
    usedDeterministicFallback: outcome.meta?.deterministicFallbackUsed === true,
    feasibilityIssues: storedRevision.feasibilityIssues,
    parkName: storedRevision.parkName,
    parkCode: storedRevision.parkCode,
    provider: outcome.provider || provider,
    model: outcome.model || model,
    now,
  });

  // The same load-bearing guard the live route uses. On mismatch, discard the
  // candidate and fall back to deterministic prose over the STORED itinerary,
  // so the successor still matches the revision 1 the client holds.
  const immutability = assertItineraryUnchanged({ revisionOne, revisionTwo });
  if (!immutability.ok) {
    const deterministic = renderDeterministicItineraryResponse({
      itinerary: frozenItinerary,
      feasibilityIssues: storedRevision.feasibilityIssues,
      corrections: [],
      resolvedMetadata,
    });
    if (!deterministic || !deterministic.trim()) {
      return { outcome: RECOVERY_OUTCOME.FAILED, code: immutability.code };
    }
    revisionTwo = buildRevisionTwoOutbound({
      responseIdentity,
      revisionOne,
      finalizedItinerary: frozenItinerary,
      selectedProse: deterministic,
      usedDeterministicFallback: true,
      feasibilityIssues: storedRevision.feasibilityIssues,
      parkName: storedRevision.parkName,
      parkCode: storedRevision.parkCode,
      provider,
      model,
      now,
    });
    const recheck = assertItineraryUnchanged({ revisionOne, revisionTwo });
    if (!recheck.ok) return { outcome: RECOVERY_OUTCOME.FAILED, code: recheck.code };
    return {
      outcome: RECOVERY_OUTCOME.PROSE_READY,
      revisionTwo,
      meta: { ...(outcome.meta || {}), deterministicFallbackUsed: true, itineraryMismatchRecovered: true },
    };
  }

  if (revisionTwo.response.itineraryHash !== storedHash) {
    return { outcome: RECOVERY_OUTCOME.FAILED, code: 'revision_itinerary_hash_mismatch' };
  }

  return { outcome: RECOVERY_OUTCOME.PROSE_READY, revisionTwo, meta: outcome.meta };
}

module.exports = { RECOVERY_OUTCOME, runProseRecovery, deepFreeze };
