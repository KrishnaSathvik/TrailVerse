'use strict';

/**
 * Phase B prose consistency (verify → one bounded retry → deterministic fallback).
 * Extracted from the deleted legacy chat turn orchestrator for Stage 14.4 recovery.
 */

const { hashPayload } = require('../utils/canonicalResponse');
const { buildItineraryProseManifest } = require('../utils/itineraryProseManifest');
const { verifyProseAgainstItinerary } = require('../utils/proseConsistencyVerifier');
const { renderDeterministicItineraryResponse } = require('../utils/deterministicItineraryRenderer');
const {
  buildVerifiedProsePrompt,
  buildProseRetryHint,
  stripLegacyItineraryJsonInstruction,
  validateToolFirstPhaseBPrompt,
} = require('../prompts/proseFromItineraryPrompt');
const { sanitizeSelectedProse } = require('../utils/sanitizeSelectedProse');

/** Product-stage token for Phase B verification (maps via WP10 product stages). */
const THINKING_STAGE = Object.freeze({
  CHECKING: 'checking_response_matches_plan',
});

const HARD_CONFLICT_CODES = new Set([
  'conflicting_duration', 'conflicting_difficulty', 'conflicting_date',
  'conflicting_transition', 'conflicting_overnight',
  'removed_stop_mention', 'unsupported_plan_action', 'forbidden_itinerary_artifact',
]);

async function runProseConsistency({
  toolFirst, baseSystemPrompt, deliverProse, resolvedMetadata, proseConfig, emitThinking, signal, provider, model,
  onProseAttempt = null,
}) {
  const itineraryHash = hashPayload(toolFirst.itineraryData);
  const manifest = buildItineraryProseManifest({
    itinerary: toolFirst.itineraryData,
    itineraryHash,
    correctionsApplied: toolFirst.correctionsApplied,
    removedStops: toolFirst.removedStops || [],
    feasibilityIssues: toolFirst.feasibilityIssues,
    resolvedMetadata,
  });
  // Stage 13.8 §2 — tool-first Phase B must NOT inherit the legacy inline-JSON
  // mandate from the base (buddy/architect) prompt, which conflicts with the
  // "do NOT output JSON" contract below and made Claude emit [ITINERARY_JSON].
  const phaseBBase = stripLegacyItineraryJsonInstruction(baseSystemPrompt).prompt;
  const verifiedPrompt = phaseBBase + buildVerifiedProsePrompt({
    manifest,
    correctionsApplied: toolFirst.correctionsApplied,
    feasibilityIssues: toolFirst.feasibilityIssues,
  });

  const meta = {
    proseConsistencyMode: proseConfig.mode,
    proseConsistencyStatus: 'not_applicable',
    proseAttemptCount: 0,
    proseRetryUsed: false,
    // Sanitized per-call usage. Required for full-turn accounting because a
    // rejected first draft is still a real billable provider call.
    proseAttempts: [],
    deterministicFallbackUsed: false,
    manifestVersion: manifest.manifestVersion,
    issueTypeCounts: {},
    missingDayCount: 0,
    missingStopCount: 0,
    orderViolationCount: 0,
    removedStopMentionCount: 0,
    verificationDurationMs: 0,
  };
  const renderFallback = () =>
    renderDeterministicItineraryResponse({
      itinerary: toolFirst.itineraryData,
      feasibilityIssues: toolFirst.feasibilityIssues,
      corrections: toolFirst.correctionsApplied,
      resolvedMetadata,
    });

  // Stage 13.8 §3 — every returned prose goes through the ONE sanitation seam
  // (alignment markers + Stage 8 itinerary artifacts) so the replayed content
  // equals the canonical/persisted content. Defense-in-depth: even if the
  // verifier missed an artifact, it can never reach the user or canonical store.
  const finalize = (text) => {
    const s = sanitizeSelectedProse({ content: text, generationMode: 'tool_first' });
    if (s.itineraryArtifactsRemoved) {
      meta.selectedProseArtifactSanitized = true;
      meta.selectedProseArtifactTypes = s.artifactTypes;
    }
    return s.content;
  };

  const generate = async (systemPrompt) => {
    meta.proseAttemptCount += 1;
    const attempt = meta.proseAttemptCount;
    const startedAt = Date.now();
    let draft;
    try {
      draft = await deliverProse({ systemPrompt, buffered: true, toolFirstActive: true });
    } catch (error) {
      meta.proseAttempts.push({
        attempt,
        provider: provider || null,
        model: model || null,
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        cacheCreationInputTokens: null,
        cacheReadInputTokens: null,
        ttftMs: null,
        durationMs: Date.now() - startedAt,
        status: 'provider_error',
        errorCode: 'provider_error',
      });
      throw error;
    }
    const usage = draft?.usage || {};
    meta.proseAttempts.push({
      attempt,
      provider: draft?.provider || provider || null,
      model: draft?.model || model || null,
      inputTokens: Number.isFinite(usage.inputTokens) ? usage.inputTokens : null,
      outputTokens: Number.isFinite(usage.outputTokens) ? usage.outputTokens : null,
      reasoningTokens: Number.isFinite(usage.reasoningTokens) ? usage.reasoningTokens : null,
      cacheCreationInputTokens: Number.isFinite(usage.cacheCreationInputTokens)
        ? usage.cacheCreationInputTokens : null,
      cacheReadInputTokens: Number.isFinite(usage.cacheReadInputTokens)
        ? usage.cacheReadInputTokens : null,
      ttftMs: Number.isFinite(draft?.ttftMs) ? draft.ttftMs : null,
      durationMs: Date.now() - startedAt,
      status: draft?.aborted ? 'aborted' : 'complete',
      errorCode: null,
    });
    if (draft?.aborted || signal?.aborted) return { aborted: true };
    const content = draft?.content || '';
    if (!content) return { oversized: false, empty: true, draft };
    if (content.length > proseConfig.maxChars) return { oversized: true, draft };
    return { draft };
  };
  const verify = (content, attempt) => {
    const t0 = Date.now();
    const v = verifyProseAgainstItinerary({ proseWithMarkers: content, manifest });
    meta.verificationDurationMs += Date.now() - t0;
    for (const code of v.issueCodes) meta.issueTypeCounts[code] = (meta.issueTypeCounts[code] || 0) + 1;
    meta.missingDayCount += v.missingDayIds.length;
    meta.missingStopCount += v.missingStopIds.length;
    meta.orderViolationCount += v.orderViolations.length;
    meta.removedStopMentionCount += v.removedStopMentions.length;
    // Evaluation-only draft capture (default off; production never supplies this).
    if (typeof onProseAttempt === 'function') {
      try { onProseAttempt({ attempt, markerBearingDraft: content, verifierResult: v, manifest }); } catch { /* capture must never affect the turn */ }
    }
    return v;
  };

  // Stage 13.8A §2 — fail closed. If the assembled tool-first Phase B prompt
  // still carries a legacy structured-output mandate (a future prompt edit the
  // stripper does not recognize), do NOT call the provider: record the violation
  // and serve the deterministic plan. Never a user-facing error.
  const contract = validateToolFirstPhaseBPrompt(verifiedPrompt);
  if (!contract.ok) {
    console.error('[Trailie] phase_b_prompt_contract_violation:', contract.violations.join(','));
    meta.promptContractViolation = true;
    meta.promptContractViolations = contract.violations;
    meta.issueTypeCounts.phase_b_prompt_contract_violation = 1;
    meta.proseConsistencyStatus = 'fallback_used';
    meta.deterministicFallbackUsed = true;
    return { selectedProse: finalize(renderFallback()), provider, model, usage: null, meta };
  }

  emitThinking?.(THINKING_STAGE.CHECKING);
  const a1 = await generate(verifiedPrompt);
  if (a1.aborted) return { aborted: true };
  const v1 = a1.oversized || a1.empty
    ? { status: 'failed', sanitizedProse: '', issueCodes: ['oversized_or_empty_output'], missingDayIds: [], missingStopIds: [], orderViolations: [], removedStopMentions: [], duplicateDayIds: [], duplicateStopIds: [], wrongDayAssignments: [] }
    : verify(a1.draft.content, 1);

  const pick = (draft) => ({ provider: draft?.provider || provider, model: draft?.model || model, usage: draft?.usage || null });

  if (v1.status === 'passed') {
    meta.proseConsistencyStatus = 'passed';
    return { selectedProse: finalize(v1.sanitizedProse), ...pick(a1.draft), meta };
  }
  if (proseConfig.isVerify) {
    // Evaluation only: display the (sanitized) draft, record the failure. If the
    // draft was oversized/empty, we still must not display garbage → fallback.
    meta.proseConsistencyStatus = 'failed_observed';
    const selectedProse = a1.oversized || a1.empty ? finalize(renderFallback()) : finalize(v1.sanitizedProse);
    if (a1.oversized || a1.empty) { meta.deterministicFallbackUsed = true; }
    return { selectedProse, ...pick(a1.draft), meta };
  }

  // enforce — exactly one prose retry with a compact correction list.
  if (proseConfig.retryEnabled) {
    const retryHint = buildProseRetryHint({
      missingDayIds: v1.missingDayIds || [],
      missingStopIds: v1.missingStopIds || [],
      misplacedStopIds: (v1.wrongDayAssignments || []).map((w) => w.stopId),
      duplicateIds: [...(v1.duplicateDayIds || []), ...(v1.duplicateStopIds || [])],
      hardConflictCodes: (v1.issueCodes || []).filter((c) => HARD_CONFLICT_CODES.has(c)),
    });
    const a2 = await generate(verifiedPrompt + retryHint);
    if (a2.aborted) return { aborted: true };
    meta.proseRetryUsed = true;
    const v2 = a2.oversized || a2.empty
      ? { status: 'failed', sanitizedProse: '' }
      : verify(a2.draft.content, 2);
    if (v2.status === 'passed') {
      meta.proseConsistencyStatus = 'retry_passed';
      return { selectedProse: finalize(v2.sanitizedProse), ...pick(a2.draft), meta };
    }
  }
  meta.proseConsistencyStatus = 'fallback_used';
  meta.deterministicFallbackUsed = true;
  return { selectedProse: finalize(renderFallback()), provider, model, usage: null, meta };
}

/**
 * @param {Object} params
 * @param {Object} params.preparedContext        result of prepareChatContext
 * @param {Function} params.deliverProse         async ({systemPrompt}) => {content,provider,model,usage,aborted}
 * @param {Function} params.processPrepared      = processPreparedTrailieResponse
 * @param {Function} params.makeProcessorArgs    (response, toolFirstOptions) => processorArgs
 * @param {Function} [params.emitThinking]       (stage) => void
 * @returns {Promise<Object>} { toolFirst, response, processed, itineraryGenerationMeta,
 *   aborted, empty, proseResult, structuredRequirement }
 */

module.exports = { runProseConsistency, THINKING_STAGE };
