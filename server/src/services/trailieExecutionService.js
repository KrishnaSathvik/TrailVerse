'use strict';

/**
 * Canonical Trailie execution engine, invoked by the shared route bridge.
 *
 * This service connects the frozen WP2–WP9 components into one executable runtime
 * that turns a *prepared, admitted* turn into a canonical execution result. It owns
 * AI execution AFTER admission/preparation and BEFORE transport/persistence.
 *
 * Explicitly OUT of scope (stay upstream/downstream, never here): auth, guest
 * admission, quota, rate limits, idempotency, Express req/res, SSE serialization,
 * TripPlan persistence, response persistence.
 *
 * Reused frozen components (never reimplemented here):
 *   - WP2 intent classifier ....... services/trailieIntentClassifier
 *   - WP4 evidence planner ........ services/evidencePlannerService
 *   - WP5/6 layered broker ........ services/evidenceBrokerRuntime (resolver)
 *   - WP7 Prompt v2 ............... prompts/trailiePromptV2
 *   - WP8 Responses contract ...... services/responsesAdapter
 *   - WP9 model router/lifecycle .. services/trailieModelRoutingService
 *   - deterministic finalization .. utils/finalizeItinerary + structuredItineraryGenerator
 *   - itinerary freeze/hash ....... utils/canonicalResponse (hashPayload)
 *   - telemetry cost .............. services/trailieTurnLedger (priceProviderCall)
 *
 * Invariants proven by tests:
 *   - evidence is resolved exactly once per turn; model failure NEVER refetches it;
 *   - the SAME frozen EvidenceBundle / TripState / constraints / Prompt-v2 snapshot
 *     reaches every attempt (primary, same-model retry, Sol escalation);
 *   - exactly one provider dispatch per model attempt (no hidden retry);
 *   - the router owns all model rules — this service implements none;
 *   - the canonical result leaks no TripState/constraints/prompt/raw evidence/
 *     provider payloads/secrets.
 */

const { TRIP_PUSHBACK_TOOL, PUSHBACK_INSTRUCTION, parseTripPushback, recommendationContract } = require('../utils/tripPushback');

const { classifyTrailieIntent } = require('./trailieIntentClassifier');
const {
  deriveExecutionContract,
  summarizeExecutionContract,
} = require('./trailieExecutionContract');
const {
  buildArtifactNotAppliedMessage,
  validateArtifactFulfillment,
} = require('./artifactFulfillment');
const {
  shouldForceStructuredItinerary,
  REFINEMENT_JOBS,
} = require('./trailieTravelerJobResolver');
const { resolveDestinationsFromMessage } = require('../utils/genericDestinationResolver');
const { resolveTargetTripId } = require('./targetTripResolver');
// WP-TU Phase 4 Task 10D/10E — cross-plan target mutation. `buildPlanDocument`
// is reused verbatim, unmodified: it already embeds identity onto a plan
// object exactly the way `extractPlanIdentity`/`resolveCanonicalResponsePersistence`
// read it — confirmed in the Task 10C design recon, not assumed.
//
// Task 10D minted a SECOND `createTurnResponseIdentity` call here for the
// target plan. Task 10E corrected that: `responseIdentity.js`'s own header
// comment is explicit — "exactly one identity per logical server turn...
// NO second identity is minted during canonical-envelope construction."
// Calling it again, even with an existing id, still reads as minting and
// violates that contract's letter. `createTurnResponseIdentity` is
// therefore NOT imported here at all anymore — see `projectTargetPlanVersion`
// below, a target-LOCAL version projection of the one identity the turn
// already has (threaded in as `turnResponseId`), never identity creation.
const { buildPlanDocument } = require('../utils/trailiePipelineUtils');
const { planEvidenceRequirements } = require('./evidencePlannerService');
const { runTrailieModelRouting } = require('./trailieModelRoutingService');
const { buildTrailiePromptV2 } = require('../prompts/trailiePromptV2');
const {
  createResponsesRequest,
  executeResponses: executeResponsesImpl,
  streamResponses: streamResponsesImpl,
} = require('./responsesAdapter');
const {
  STRUCTURED_STATUS,
  normalizeToolCalls,
} = require('./structuredItineraryGenerator');
const {
  boundedValidationDiagnostics,
  structuralDiagnosticsFromNormalized,
  structuredOutputRepairInstructions,
} = require('../utils/generationDiagnostics');
const {
  PATCH_ITINERARY_TOOL,
  PATCH_GENERATION_INSTRUCTION,
  patchRepairInstruction,
  renderRefinementTargetForPrompt,
  getCreateItineraryTool,
} = require('../utils/itineraryToolSchema');
const { finalizeStructuredItinerary } = require('../utils/finalizeItinerary');
const { bindDerivedSurfaces } = require('../utils/planDerivedState');
const { createItineraryStrictEnabled } = require('../config/itineraryGenerationConfig');
const {
  bindGeneratedItineraryContract,
  resolveParkIdentityBinding,
} = require('../utils/generationContractBinding');
const {
  evaluateItineraryCompleteness,
  classifyStop,
  isLighterRefinementRequest,
  buildCompletenessRepairInstructions,
  userRequestsBackupPlan,
} = require('../utils/itineraryCompleteness');
const {
  evaluateStructuralArtifact,
  buildStructuralRepairInstructions,
  STRUCTURAL_OBLIGATIONS,
} = require('../utils/itineraryStructuralValidation');
const { createRepairLedger } = require('../utils/repairLedger');
const {
  evaluateComparisonSelectionAnswer,
  buildComparisonSelectionRepairInstructions,
  comparisonSelectionPromptBlock,
  candidatesFromUnderstanding,
} = require('../utils/comparisonSelectionObligation');
const {
  evaluateActionableContingencyAnswer,
  buildActionableContingencyRepairInstructions,
  actionableContingencyPromptBlock,
  extractNamedFromEvidence,
} = require('../utils/actionableContingencyAnswer');
const {
  ZERO_DURATION_REPAIR_TOOL,
  collectZeroDurationTargets,
  buildZeroDurationRepairInstruction,
  applyZeroDurationRepair,
} = require('../utils/zeroDurationRepair');
const {
  DAY_CONTAINED_ANCHOR_REPAIR_TOOL,
  resolveAnchorRepairScope,
  buildAnchorRepairInstruction,
  applyDayContainedAnchorRepair,
  frozenFingerprint,
} = require('../utils/dayContainedAnchorRepair');
const {
  LEGAL_STOP_SUBSTITUTION_TOOL,
  resolveSubstitutionScope,
  buildLegalSubstitutionCatalog,
  buildSubstitutionInstruction,
  applyLegalStopSubstitution,
  untargetedFingerprint,
} = require('../utils/legalStopSubstitutionRepair');
const {
  evaluateTravelerFit,
  buildTravelerFitRepairInstructions,
  buildTravelerFitDayDiagnostics,
} = require('../utils/travelerFitEvaluation');
const { operationalFactsFromBundle } = require('../utils/operationalFactExtraction');
const { attachTravelerRequirements } = require('../utils/travelerRequirementsContract');

/**
 * WHICH acceptance obligations a validation stage actually got to judge.
 *
 * The repair ledger may only credit a candidate with obligations some validator
 * really evaluated. Validation short-circuits on the first failing stage, so an
 * attempt refused at `structured_artifact_structure` never reached the
 * requested-experience checks and proves nothing about them. `null` means "the
 * whole contract was judged" — the caller substitutes the ledger's own ids.
 */
const STAGE_EVALUATED_OBLIGATIONS = Object.freeze({
  // No structured plan was produced or applied — nothing was judged.
  structured_output: [],
  plan_patch_apply: [],
  plan_patch_scope: [],
  refinement_ownership: [],
  refinement_scope_ownership: [],
  prose_output_empty: [],
  prose_contradiction: [],
  // The structural gate ran; everything downstream of it did not.
  structured_artifact_structure: STRUCTURAL_OBLIGATIONS,
  itinerary_contradiction: STRUCTURAL_OBLIGATIONS,
  itinerary_feasibility: STRUCTURAL_OBLIGATIONS,
  operational_eligibility: Object.freeze([...STRUCTURAL_OBLIGATIONS, 'exposure_eligibility']),
  // Phase 9C.1D.5B — identity runs after the structural gate and BEFORE
  // completeness. Absent from this map, an identity rejection fell through to
  // "every obligation was judged" and marked requested_hike (and everything
  // else) demonstrated on a plan completeness never saw. The stage itself adds
  // any named obligations it actually evaluated.
  stop_identity: STRUCTURAL_OBLIGATIONS,
  // Completeness ran, so the full contract was judged.
  itinerary_completeness: null,
  traveler_fit: null,
  mobility_claim_consistency: null,
  prose_constraint_safety: null,
  traveler_language: null,
  budget_claim: null,
  actionable_contingency: null,
});

/** Repair text sent to the model is bounded; the ledger contract leads. */
/**
 * ZERO-DURATION MICRO-REPAIR (Phase 1).
 *
 * `zero_duration_stops` is 45.7% of all retry output tokens in the corpus, and
 * the full-regeneration repair that answers it rebuilds stops it was explicitly
 * told to keep, 7 times out of 10. This asks the model for integers instead of
 * for a plan, and lets the MACHINE decide what those integers may touch.
 *
 * STRICTLY AN OPTIMIZATION. Every failure path here leaves the original failed
 * candidate exactly as it was and returns null, so the pre-existing repair
 * ladder runs unchanged. Nothing about correctness depends on this succeeding.
 *
 * @returns {Promise<Object|null>} a telemetry row when a merge was applied,
 *   otherwise null (caller keeps its original validation verdict).
 */
async function dispatchZeroDurationMicroRepair({
  validation, route, attempt, signal, dispatchIndex,
  createRequest, executeResponses, responseAdapters, normalizeTool, priceCall, liveBudget, now,
}) {
  const startedAt = Date.now();
  const row = {
    action: 'zero_duration_micro_repair',
    kind: 'zero_duration_micro_repair',
    attempt,
    dispatchIndex,
    targetCount: 0,
    acceptedCount: 0,
    mergeStatus: 'not_attempted',
    reasonCodes: [],
    dispatchMs: null,
    outputTokens: null,
    costUsd: null,
    costStatus: null,
  };

  const resolution = collectZeroDurationTargets({
    itineraryData: validation.candidatePlan,
    dayDiagnostics: validation.dayDiagnostics,
  });
  if (!resolution.ok) {
    return { ...row, mergeStatus: 'targets_unresolved', reasonCodes: resolution.reasonCodes };
  }
  const { targets } = resolution;
  row.targetCount = targets.length;

  let result;
  try {
    const request = createRequest({
      provider: route.provider,
      model: route.model,
      instructions: 'You are repairing one field of an itinerary that is otherwise final.',
      requestMetadata: { purpose: 'zero_duration_micro_repair' },
      input: [{ role: 'user', content: buildZeroDurationRepairInstruction({ targets }) }],
      // The artifact is a list of integers. It does not need a plan-sized budget.
      maxOutputTokens: Math.max(256, 24 * targets.length),
      tools: [ZERO_DURATION_REPAIR_TOOL],
      toolChoice: { type: 'tool', name: ZERO_DURATION_REPAIR_TOOL.name },
    });
    if (liveBudget) {
      const verdict = liveBudget.authorize({ provider: route.provider, model: route.model });
      if (!verdict?.ok) return { ...row, mergeStatus: 'budget_refused', reasonCodes: ['budget_refused'] };
      row.budgetTicket = verdict.ticket;
    }
    row.dispatched = true;
    row.purpose = row.kind || row.action;
    result = await executeResponses(request, { adapters: responseAdapters, signal });
  } catch (_error) {
    return { ...row, mergeStatus: 'dispatch_failed',
      ...require('../utils/qualificationDispatchPolicy').harnessBlockTelemetry(_error), dispatchMs: Date.now() - startedAt };
  }
  row.dispatchMs = Date.now() - startedAt;

  const usage = mapResponsesUsage(result?.usage);
  row.outputTokens = Number.isFinite(usage?.outputTokens) ? usage.outputTokens : null;
  const priced = priceCall({ provider: route.provider, model: route.model, usage: result?.usage, at: now() });
  row.costUsd = priced?.costUsd ?? null;
  row.costComponents = priced?.components || null;
  row.costStatus = priced?.costStatus ?? null;
  if (liveBudget && row.budgetTicket) {
    liveBudget.record({ ticket: row.budgetTicket, costUsd: row.costUsd, costStatus: row.costStatus });
  }

  const call = (result?.toolCalls || []).find((c) => c?.name === ZERO_DURATION_REPAIR_TOOL.name);
  let durationUpdates = null;
  try {
    // Adapters differ: the Responses shape carries parsed `input`, others carry
    // a JSON `arguments` string. Accept both, trust neither — the merge below
    // re-checks every value regardless of how it arrived.
    const raw = call?.input ?? call?.arguments;
    const args = typeof raw === 'string' ? JSON.parse(raw) : raw;
    durationUpdates = args?.durationUpdates ?? null;
  } catch (_error) {
    durationUpdates = null;
  }
  if (!Array.isArray(durationUpdates)) {
    return { ...row, mergeStatus: 'artifact_malformed', reasonCodes: ['zero_duration_repair_artifact_malformed'] };
  }

  const merged = applyZeroDurationRepair({
    itineraryData: validation.candidatePlan, targets, durationUpdates,
  });
  if (!merged.ok) {
    return { ...row, mergeStatus: 'merge_refused', reasonCodes: merged.reasonCodes };
  }
  return { ...row, mergeStatus: 'applied', acceptedCount: merged.applied, plan: merged.plan };
}

/**
 * DAY-CONTAINED ANCHOR REPAIR (Phase 3B).
 *
 * Same discipline as the duration micro-repair, a wider surface. The model is
 * asked for one experience per failing day; the MACHINE decides which days it
 * may touch and refuses everything else. Frozen days are proved byte-identical
 * after the merge rather than assumed.
 *
 * CONTAINMENT IS NOT SAFETY. A contained repair can still be a bad
 * recommendation — the 2026-08-24 "Maze district" anchor was entirely inside the
 * day that legitimately needed repair. Traveler fit, completeness and the
 * evidence contract judge the merged plan afterwards, exactly as before.
 *
 * STRICTLY AN OPTIMIZATION. Every failure path leaves the candidate untouched
 * and returns a telemetry row with no plan, so the existing ladder runs on.
 */
async function dispatchAnchorContainedRepair({
  validation, route, attempt, signal, dispatchIndex, bundle, constraints,
  createRequest, executeResponses, responseAdapters, priceCall, liveBudget, now,
}) {
  const startedAt = Date.now();
  const row = {
    action: 'missing_experience_anchor_repair',
    kind: 'missing_experience_anchor_repair',
    attempt,
    dispatchIndex,
    affectedDayCount: 0,
    affectedDays: [],
    operationBudgetPerDay: null,
    operationBudgetTotal: null,
    returnedOperationCount: 0,
    acceptedOperationCount: 0,
    operationTypes: [],
    mergeStatus: 'not_attempted',
    reasonCodes: [],
    dispatchMs: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    costStatus: null,
    frozenDayMutationCount: null,
    untargetedStopMutationCount: null,
    // PHASE 4M — provable selection: WHICH catalogue, how big, and which refs the
    // model chose. Never the place content itself.
    repairCandidateCount: null,
    repairCandidateSetFingerprint: null,
    selectedPlaceRefs: [],
    // Which frozen evidence this repair was given. Present says a bundle was
    // inherited; the FINGERPRINT says WHICH — so a trace can prove it is the
    // parent attempt's and not a refetch. The coverage row has always carried
    // both; this row carried only presence, which made "one bundle across every
    // sub-dispatch" unprovable for a chain that began with anchor repair.
    evidenceBundlePresent: Boolean(bundle),
    evidenceBundleFingerprint: bundle
      ? hashPayload({ requestId: bundle.requestId ?? null, evidenceIds: (bundle.evidence || []).map((e) => e?.evidenceId ?? null) })
      : null,
  };

  const scope = resolveAnchorRepairScope({
    itineraryData: validation.candidatePlan,
    dayDiagnostics: validation.dayDiagnostics,
  });
  if (!scope.ok) {
    // `anchor_repair_whole_plan_scope` is the intended boundary, not a defect:
    // containment freezes nothing when every day is in scope.
    return { ...row, mergeStatus: 'scope_declined', reasonCodes: scope.reasonCodes };
  }
  row.affectedDays = scope.affectedDays.map((d) => d.dayRef);
  row.affectedDayCount = row.affectedDays.length;
  row.operationBudgetPerDay = scope.maxOperationsPerDay;
  row.operationBudgetTotal = scope.maxOperationsPerDay * row.affectedDayCount;

  // PHASE 4M — THE RECOMMENDATION BOUNDARY. The frozen bundle already fixes what
  // is TRUE; it now also fixes which identities a repair may introduce. An empty
  // catalogue is an intentional NON-ACTIVATION, resolved before any spend: with
  // no place the evidence vouches for, letting the model invent one is exactly
  // the state Phase 4L found reads as `compatible`.
  // PHASE 4O — `missing_experience_anchor` is an EXPERIENTIAL obligation, so the
  // machine must positively classify a candidate before offering it. Held to the
  // same bar as coverage repair: unknown is ineligible, not permitted by default.
  const catalog = buildEvidenceBoundRepairCandidates({
    bundle,
    constraints,
    candidatePlan: validation.candidatePlan,
    repairScope: scope,
    requireExperiential: true,
    requireExecutablePrimary: true,
  });
  row.repairCandidateCount = catalog.count;
  row.repairCandidateSetFingerprint = catalog.fingerprint;
  if (!catalog.ok) {
    return { ...row, mergeStatus: 'catalog_declined', reasonCodes: catalog.reasonCodes };
  }

  let result;
  try {
    const request = createRequest({
      provider: route.provider,
      model: route.model,
      instructions: 'You are adding one missing experience to specific days of an itinerary that is otherwise final.',
      requestMetadata: { purpose: 'missing_experience_anchor_repair' },
      input: [{ role: 'user', content: buildAnchorRepairInstruction({ scope, candidates: catalog.candidates }) }],
      maxOutputTokens: Math.max(512, 320 * row.affectedDayCount),
      tools: [DAY_CONTAINED_ANCHOR_REPAIR_TOOL],
      toolChoice: { type: 'tool', name: DAY_CONTAINED_ANCHOR_REPAIR_TOOL.name },
    });
    if (liveBudget) {
      const verdict = liveBudget.authorize({ provider: route.provider, model: route.model });
      if (!verdict?.ok) return { ...row, mergeStatus: 'budget_refused', reasonCodes: ['budget_refused'] };
      row.budgetTicket = verdict.ticket;
    }
    row.dispatched = true;
    row.purpose = row.kind || row.action;
    result = await executeResponses(request, { adapters: responseAdapters, signal });
  } catch (_error) {
    return { ...row, mergeStatus: 'dispatch_failed',
      ...require('../utils/qualificationDispatchPolicy').harnessBlockTelemetry(_error), dispatchMs: Date.now() - startedAt };
  }
  row.dispatchMs = Date.now() - startedAt;

  const usage = mapResponsesUsage(result?.usage);
  row.inputTokens = Number.isFinite(usage?.inputTokens) ? usage.inputTokens : null;
  row.outputTokens = Number.isFinite(usage?.outputTokens) ? usage.outputTokens : null;
  const priced = priceCall({ provider: route.provider, model: route.model, usage: result?.usage, at: now() });
  row.costUsd = priced?.costUsd ?? null;
  row.costComponents = priced?.components || null;
  row.costStatus = priced?.costStatus ?? null;
  if (liveBudget && row.budgetTicket) {
    liveBudget.record({ ticket: row.budgetTicket, costUsd: row.costUsd, costStatus: row.costStatus });
  }

  const call = (result?.toolCalls || []).find((c) => c?.name === DAY_CONTAINED_ANCHOR_REPAIR_TOOL.name);
  let dayRepairs = null;
  try {
    const raw = call?.input ?? call?.arguments;
    dayRepairs = (typeof raw === 'string' ? JSON.parse(raw) : raw)?.dayRepairs ?? null;
  } catch (_error) {
    dayRepairs = null;
  }
  if (!Array.isArray(dayRepairs)) {
    return { ...row, mergeStatus: 'artifact_malformed', reasonCodes: ['anchor_repair_artifact_malformed'] };
  }
  const operations = dayRepairs.flatMap((d) => (Array.isArray(d?.operations) ? d.operations : []));
  row.returnedOperationCount = operations.length;
  row.operationTypes = [...new Set(operations.map((o) => (typeof o?.op === 'string' ? o.op : 'unknown')))];
  row.selectedPlaceRefs = operations
    .map((o) => o?.stop?.placeRef)
    .filter((r) => Number.isInteger(r));

  const merged = applyDayContainedAnchorRepair({
    itineraryData: validation.candidatePlan, scope, dayRepairs, candidates: catalog.candidates,
  });
  if (!merged.ok) return { ...row, mergeStatus: 'merge_refused', reasonCodes: merged.reasonCodes };

  // CONTAINMENT MEASURED, NOT CLAIMED. Both must be zero on a successful merge.
  row.acceptedOperationCount = merged.applied;
  row.frozenDayMutationCount = frozenFingerprint(merged.plan, scope.frozenDayNumbers)
    === frozenFingerprint(validation.candidatePlan, scope.frozenDayNumbers) ? 0 : 1;
  row.untargetedStopMutationCount = countUntargetedStopMutations({
    before: validation.candidatePlan, after: merged.plan, scope,
  });
  if (row.frozenDayMutationCount !== 0 || row.untargetedStopMutationCount !== 0) {
    return { ...row, mergeStatus: 'containment_violation', reasonCodes: ['anchor_repair_containment_violation'] };
  }
  return { ...row, mergeStatus: 'applied', plan: merged.plan };
}

/** Surviving stops on affected days that changed despite not being targeted. */
function countUntargetedStopMutations({ before, after, scope }) {
  const key = (s) => String(s?.name || '').trim().toLowerCase();
  const dayNum = (d, i) => (Number.isFinite(Number(d?.day ?? d?.dayNumber)) ? Number(d.day ?? d.dayNumber) : i + 1);
  const findDay = (plan, n) => (plan?.days || []).find((d, i) => dayNum(d, i) === n) || null;
  let count = 0;
  for (const d of scope.affectedDays) {
    const b = findDay(before, d.dayRef)?.stops || [];
    const a = findDay(after, d.dayRef)?.stops || [];
    for (const stop of b) {
      const match = a.find((x) => key(x) === key(stop));
      if (!match) continue;                       // targeted: replaced or removed
      const { order: _o1, ...rest } = match;
      const { order: _o2, ...orig } = stop;
      if (JSON.stringify(rest) !== JSON.stringify(orig)) count += 1;
    }
  }
  return count;
}

/**
 * LEGAL-STOP SUBSTITUTION DISPATCH (2026-09-03). One-for-one replacement of
 * stops that failed `stop_identity_excluded` or exposure
 * `constraint_eligibility_unknown`. The replacement pool derives from the
 * SAME exposure-directive identity sets that govern construction and retry
 * steering — never an independent relevance test — and the merge preserves
 * every untargeted stop byte-for-byte. Declines (rather than degrades) when
 * scope is ambiguous or no legal role-compatible replacement exists.
 */
async function dispatchStopSubstitutionRepair({
  validation, route, attempt, signal, dispatchIndex, bundle, constraints,
  exposureDirective, excludedEvidenceIds, repairPlanning,
  createRequest, executeResponses, responseAdapters, priceCall, liveBudget, now,
}) {
  const startedAt = Date.now();
  const row = {
    action: 'legal_stop_substitution_repair',
    kind: 'legal_stop_substitution_repair',
    dispatched: false,
    attempt,
    dispatchIndex,
    targetCount: 0,
    targets: [],
    returnedOperationCount: 0,
    acceptedOperationCount: 0,
    mergeStatus: 'not_attempted',
    reasonCodes: [],
    dispatchMs: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    costStatus: null,
    untargetedMutationCount: null,
    repairCandidateCount: null,
    repairCandidateSetFingerprint: null,
    confirmedLowCandidateCount: null,
    selectedPlaceRefs: [],
    evidenceBundlePresent: Boolean(bundle),
    evidenceBundleFingerprint: bundle
      ? hashPayload({ requestId: bundle.requestId ?? null, evidenceIds: (bundle.evidence || []).map((e) => e?.evidenceId ?? null) })
      : null,
  };

  const scope = resolveSubstitutionScope({
    itineraryData: validation.candidatePlan,
    offendingStops: validation.offendingStops,
  });
  if (!scope.ok) {
    return { ...row, mergeStatus: 'scope_declined', reasonCodes: scope.reasonCodes };
  }
  row.targets = scope.targets.map((t) => ({ dayRef: t.dayRef, stopRef: t.stopRef }));
  row.targetCount = scope.targets.length;

  const catalog = buildLegalSubstitutionCatalog({
    bundle,
    constraints,
    candidatePlan: validation.candidatePlan,
    repairScope: scope,
    exposureDirective: exposureDirective || null,
    excludedEvidenceIds: excludedEvidenceIds || [],
  });
  row.repairCandidateCount = catalog.count;
  row.repairCandidateSetFingerprint = catalog.fingerprint;
  row.confirmedLowCandidateCount = catalog.ok
    ? catalog.candidates.filter((c) => c.confirmedLow).length
    : 0;
  if (!catalog.ok) {
    // No legal role-compatible replacement: DECLINE and let the failure stand.
    return { ...row, mergeStatus: 'catalog_declined', reasonCodes: catalog.reasonCodes };
  }

  const planner = require('../utils/downstreamRepairPlanner');
  const pool = repairPlanning ? planner.candidatePool({ plan: validation.candidatePlan,
    targets: scope.targets.map(t => ({ dayNumber: t.dayRef, stopIndex: t.stopRef - 1 })),
    candidates: catalog.candidates, context: repairPlanning.context, identity: true, ...repairPlanning,
    followupPossible:(plan, projection)=>require('../utils/planViabilityRepair').buildPlanViabilitySnapshot({
      plan,projection,context:repairPlanning.context,focusedRepairBudgetRemaining:repairPlanning.focusedRepairBudgetRemaining-1,existenceOnly:true,
    }) }) : null;
  if (pool) {
    row.candidateViability = pool.byScope;
    row.offeredCandidateCount = pool.candidates.length;
    if (!pool.ok) return { ...row, mergeStatus: 'catalog_declined', reasonCodes: ['repair_no_viable_candidate'] };
    catalog.candidates = pool.candidates;
  }
  let result;
  try {
    const request = createRequest({
      provider: route.provider,
      model: route.model,
      instructions: 'You are replacing specific disallowed stops in an itinerary that is otherwise final.',
      requestMetadata: { purpose: 'legal_stop_substitution_repair' },
      input: [{ role: 'user', content: buildSubstitutionInstruction({ scope, candidates: catalog.candidates }) + (pool ? "\nPer-target eligibility (mandatory): " + JSON.stringify(planner.compactScopes(pool)) + "\nProjection fields: " + JSON.stringify(planner.VIABILITY_FIELDS) : "") }],
      maxOutputTokens: Math.max(2048, 512 * row.targetCount) + (route.reasoningEffort ? 3000 : 0),
      reasoning: route.reasoningEffort ? { effort: route.reasoningEffort } : null,
      tools: [LEGAL_STOP_SUBSTITUTION_TOOL],
      toolChoice: { type: 'tool', name: LEGAL_STOP_SUBSTITUTION_TOOL.name },
    });
    if (liveBudget) {
      const verdict = liveBudget.authorize({ provider: route.provider, model: route.model });
      if (!verdict?.ok) return { ...row, mergeStatus: 'budget_refused', reasonCodes: ['budget_refused'] };
      row.budgetTicket = verdict.ticket;
    }
    row.dispatched = true;
    row.purpose = row.kind || row.action;
    result = await executeResponses(request, { adapters: responseAdapters, signal });
  } catch (_error) {
    return { ...row, mergeStatus: 'dispatch_failed',
      ...require('../utils/qualificationDispatchPolicy').harnessBlockTelemetry(_error), dispatchMs: Date.now() - startedAt };
  }
  row.dispatchMs = Date.now() - startedAt;

  const usage = mapResponsesUsage(result?.usage);
  row.inputTokens = Number.isFinite(usage?.inputTokens) ? usage.inputTokens : null;
  row.outputTokens = Number.isFinite(usage?.outputTokens) ? usage.outputTokens : null;
  const priced = priceCall({ provider: route.provider, model: route.model, usage: result?.usage, at: now() });
  row.costUsd = priced?.costUsd ?? null;
  row.costComponents = priced?.components || null;
  row.costStatus = priced?.costStatus ?? null;
  if (liveBudget && row.budgetTicket) {
    liveBudget.record({ ticket: row.budgetTicket, costUsd: row.costUsd, costStatus: row.costStatus });
  }

  if (result?.refusal || !['complete', 'completed'].includes(result?.completionStatus)) {
    return { ...row, mergeStatus: 'artifact_malformed', reasonCodes: ['substitution_repair_artifact_incomplete'] };
  }
  const call = (result?.toolCalls || []).find((c) => c?.name === LEGAL_STOP_SUBSTITUTION_TOOL.name);
  let substitutions = null;
  try {
    const raw = call?.input ?? call?.arguments;
    substitutions = (typeof raw === 'string' ? JSON.parse(raw) : raw)?.substitutions ?? null;
  } catch (_error) {
    substitutions = null;
  }
  if (!Array.isArray(substitutions)) {
    return { ...row, mergeStatus: 'artifact_malformed', reasonCodes: ['substitution_repair_artifact_malformed'] };
  }
  row.returnedOperationCount = substitutions.length;
  row.selectedPlaceRefs = substitutions
    .map((s) => s?.replacement?.placeRef)
    .filter((r) => Number.isInteger(r));

  if (pool && substitutions.some(s => !planner.selectionAllowed(pool, s.dayRef, s.stopRef - 1, s.replacement?.placeRef))) {
    return { ...row, mergeStatus: 'merge_refused', reasonCodes: ['repair_candidate_not_viable'] };
  }
  if (pool && substitutions.some(s => pool.byScope.find(t => t.dayNumber === s.dayRef && t.stopIndex === s.stopRef - 1)
    ?.options.find(o => o.candidateRef === s.replacement.placeRef)?.expectedFollowupOperator)) {
    row.expectedFollowupOperator = 'PLAN_VIABILITY_EDIT';row.expectedFollowupFamily = 'coverage';
  }
  const merged = applyLegalStopSubstitution({
    itineraryData: validation.candidatePlan, scope, substitutions, candidates: catalog.candidates,
  });
  if (!merged.ok) return { ...row, mergeStatus: 'merge_refused', reasonCodes: merged.reasonCodes };

  if (pool) {
    const before = planner.projectPlan(validation.candidatePlan, repairPlanning.context);
    const after = planner.projectPlan(merged.plan, repairPlanning.context);
    const regressions = planner.progress(before, after, scope.targets.map(t => t.dayRef)).regressions;
    if (regressions.some(k => !(row.expectedFollowupOperator === 'PLAN_VIABILITY_EDIT' && require('../utils/repairOperators').STRUCTURAL_REASONS.has(k.split(':').slice(1).join(':')))))
      return { ...row, mergeStatus: 'merge_refused', reasonCodes: ['repair_projected_validation_failed'] };
  }
  row.acceptedOperationCount = merged.applied;
  row.untargetedMutationCount = untargetedFingerprint(merged.plan, scope)
    === untargetedFingerprint(validation.candidatePlan, scope) ? 0 : 1;
  if (row.untargetedMutationCount !== 0) {
    return { ...row, mergeStatus: 'containment_violation', reasonCodes: ['substitution_repair_containment_violation'] };
  }
  return { ...row, mergeStatus: 'applied', plan: merged.plan };
}

/** Stops that moved to a different day. Add-only repair must never produce one. */
function countCrossDayMoves({ before, after }) {
  const key = (x) => String(x?.name || '').trim().toLowerCase();
  const dayNum = (d, i) => (Number.isFinite(Number(d?.day ?? d?.dayNumber)) ? Number(d.day ?? d.dayNumber) : i + 1);
  const index = (plan) => {
    const map = new Map();
    for (const [i, d] of (plan?.days || []).entries()) {
      for (const st of (d?.stops || [])) map.set(key(st), dayNum(d, i));
    }
    return map;
  };
  const b = index(before);
  const a = index(after);
  let moved = 0;
  for (const [name, day] of b) {
    if (a.has(name) && a.get(name) !== day) moved += 1;
  }
  return moved;
}

/**
 * Every stop that existed before the repair, anywhere in the plan, compared
 * field for field. THE distinguishing invariant of this repair class: anchor
 * repair may legitimately replace a stop, coverage repair may not touch one.
 */
function countExistingStopMutations({ before, after }) {
  const key = (x) => String(x?.name || '').trim().toLowerCase();
  const dayNum = (d, i) => (Number.isFinite(Number(d?.day ?? d?.dayNumber)) ? Number(d.day ?? d.dayNumber) : i + 1);
  const findDay = (plan, n) => (plan?.days || []).find((d, i) => dayNum(d, i) === n) || null;
  let count = 0;
  for (const [i, day] of (before?.days || []).entries()) {
    const n = dayNum(day, i);
    const afterStops = findDay(after, n)?.stops || [];
    for (const original of (day?.stops || [])) {
      const match = afterStops.find((x) => key(x) === key(original));
      // A missing stop is a removal, which is itself a mutation of what existed.
      if (!match) { count += 1; continue; }
      const { order: _o1, ...rest } = match;
      const { order: _o2, ...orig } = original;
      if (JSON.stringify(rest) !== JSON.stringify(orig)) count += 1;
    }
  }
  return count;
}

/**
 * PHASE 4J — ADD-ONLY DAY-CONTAINED COVERAGE REPAIR.
 *
 * Third machine-owned sub-dispatch. Consumes whatever candidate the chain has
 * reached, and inherits the parent generation attempt's FROZEN EvidenceBundle —
 * it never resolves evidence of its own.
 *
 * Carrying the bundle is NECESSARY, NOT SUFFICIENT: a newly proposed place may
 * not be represented in it at all, so `mergeStatus: applied` says containment
 * held and says nothing about whether the recommendation is safe. The caller
 * revalidates the merged plan through the identical downstream path.
 */
async function dispatchCoverageContainedRepair({
  validation, route, attempt, signal, dispatchIndex, bundle, constraints, repairPlanning,
  createRequest, executeResponses, responseAdapters, priceCall, liveBudget, now,
}) {
  if (validation.actionability) {
    return require('../utils/focusedTripQualityRepair').dispatchTripQualityRepair({
      validation: { ...validation, tripQuality: validation.actionability }, route, attempt, signal, dispatchIndex,
      createRequest, executeResponses, responseAdapters, priceCall, liveBudget, now,
      bundle, constraints, repairPlanning, purpose: 'insufficient_day_coverage_repair',
    });
  }
  const startedAt = Date.now();
  const row = {
    action: 'insufficient_day_coverage_repair',
    kind: 'insufficient_day_coverage_repair',
    attempt,
    dispatchIndex,
    affectedDayCount: 0,
    affectedDays: [],
    operationBudgetPerDay: null,
    operationBudgetTotal: null,
    returnedOperationCount: 0,
    acceptedOperationCount: 0,
    operationTypes: [],
    mergeStatus: 'not_attempted',
    reasonCodes: [],
    dispatchMs: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    costStatus: null,
    frozenDayMutationCount: null,
    existingStopMutationCount: null,
    crossDayMoveCount: null,
    // Which frozen evidence this repair was given. Present says a bundle was
    // inherited; the fingerprint says WHICH, so a trace can prove it is the
    // parent attempt's and not a refetch.
    evidenceBundlePresent: Boolean(bundle),
    evidenceBundleFingerprint: bundle
      ? hashPayload({ requestId: bundle.requestId ?? null, evidenceIds: (bundle.evidence || []).map((e) => e?.evidenceId ?? null) })
      : null,
    repairCandidateCount: null,
    repairCandidateSetFingerprint: null,
    selectedPlaceRefs: [],
  };

  const scope = resolveCoverageRepairScope({
    itineraryData: validation.candidatePlan,
    dayDiagnostics: validation.dayDiagnostics,
    reasonCodes: validation.reasonCodes,
  });
  if (!scope.ok) {
    // `coverage_repair_whole_plan_scope` is the intended boundary, not a defect,
    // and it is resolved BEFORE any provider dispatch.
    return { ...row, mergeStatus: 'scope_declined', reasonCodes: scope.reasonCodes };
  }
  if (repairPlanning) scope.maxOperationsPerDay = 1;
  row.affectedDays = scope.affectedDays.map((d) => d.dayRef);
  row.affectedDayCount = row.affectedDays.length;
  row.operationBudgetPerDay = scope.maxOperationsPerDay;
  row.operationBudgetTotal = scope.maxOperationsPerDay * row.affectedDayCount;

  // PHASE 4M — THE RECOMMENDATION BOUNDARY. The frozen bundle already fixes what
  // is TRUE; it now also fixes which identities a repair may introduce. An empty
  // catalogue is an intentional NON-ACTIVATION, resolved before any spend: with
  // no place the evidence vouches for, letting the model invent one is exactly
  // the state Phase 4L found reads as `compatible`.
  const catalog = buildEvidenceBoundRepairCandidates({
    bundle,
    constraints,
    candidatePlan: validation.candidatePlan,
    repairScope: scope,
    requireExperiential: true,
    includeExisting: true,
    requireExecutablePrimary: true,
  });
  catalog.candidates = catalog.candidates.filter(candidate => {
    const existing = (validation.candidatePlan?.days || []).flatMap(day => day.stops || [])
      .filter(stop => String(stop.canonicalPlaceName || stop.name).toLowerCase() === candidate.canonicalName.toLowerCase());
    return !existing.length || scope.affectedDays.some(day => day.stops.some(stop =>
      stop.name.toLowerCase() === candidate.canonicalName.toLowerCase()
      && candidate.maxDurationMinutes > stop.duration));
  });
  catalog.count = catalog.candidates.length;
  catalog.ok = catalog.count > 0;
  if (!catalog.ok) catalog.reasonCodes = ['repair_evidence_catalog_unavailable'];
  catalog.fingerprint = hashPayload(catalog.candidates);
  row.repairCandidateCount = catalog.count;
  row.repairCandidateSetFingerprint = catalog.fingerprint;
  if (!catalog.ok) {
    return { ...row, mergeStatus: 'catalog_declined', reasonCodes: catalog.reasonCodes };
  }

  const planner = require('../utils/downstreamRepairPlanner');
  const pool = repairPlanning ? planner.candidatePool({ plan: validation.candidatePlan,
    targets: scope.affectedDays.flatMap(d => [{ dayNumber: d.dayRef, stopIndex: -1, operation: 'add_stop' },
      ...d.stops.map((stop, index) => ({ dayNumber: d.dayRef, stopIndex: index,
        operation: d.dayValue?.roles?.[index]?.role === 'primary_experience' && !d.dayValue.roles[index].repeated ? 'deepen_stop' : 'replace_support' }))]),
    candidates: catalog.candidates, context: repairPlanning.context, ...repairPlanning,
    simulateReplacement: ({ target, candidate, duration }) => applyDayContainedCoverageRepair({
      itineraryData: validation.candidatePlan, scope, candidates: catalog.candidates,
      dayRepairs: [{ dayRef: target.dayNumber, operations: [{ op: target.operation,
        ...(target.stopIndex >= 0 ? { stopRef: target.stopIndex + 1 } : {}),
        stop: { placeRef: candidate.ref, durationMinutes: duration, note: candidate.canonicalName, why: candidate.canonicalName } }] }],
    }) }) : null;
  if (pool) {
    row.candidateViability = pool.byScope;
    row.offeredCandidateCount = pool.candidates.length;
    if (scope.affectedDays.some(d => !pool.byScope.some(t => t.dayNumber === d.dayRef && t.eligibleCandidateRefs.length)))
      return { ...row, mergeStatus: 'catalog_declined', reasonCodes: ['repair_no_viable_candidate'] };
    catalog.candidates = pool.candidates;
  }
  let result;
  try {
    const request = createRequest({
      provider: route.provider,
      model: route.model,
      instructions: 'Make only flagged days worthwhile with the smallest evidence-bounded adjustment. Preserve valid days and never add filler.',
      requestMetadata: { purpose: 'insufficient_day_coverage_repair' },
      input: [{ role: 'user', content: buildCoverageRepairInstruction({ scope, candidates: catalog.candidates, constraints, candidatePlan: validation.candidatePlan }) + (pool ? "\nPer-scope eligibility (mandatory): " + JSON.stringify(planner.compactScopes(pool)) + "\nProjection fields: " + JSON.stringify(planner.VIABILITY_FIELDS) : "") }],
      maxOutputTokens: Math.max(640, 420 * row.affectedDayCount),
      tools: [DAY_CONTAINED_COVERAGE_REPAIR_TOOL],
      toolChoice: { type: 'tool', name: DAY_CONTAINED_COVERAGE_REPAIR_TOOL.name },
    });
    const { countPromptTokens, PROMPT_TOKENIZER_ID } = require('../utils/promptTokenAccounting');
    row.candidateCardTokens = countPromptTokens(JSON.stringify(catalog.candidates.map(c => require('../utils/compactRepairContext').candidateCard(c,bundle))));
    row.repairPromptTokens = countPromptTokens(request.instructions + JSON.stringify(request.input) + JSON.stringify(request.tools));
    row.nonCandidateContextTokens = Math.max(0,row.repairPromptTokens-row.candidateCardTokens);
    row.repairPromptTokenizer = PROMPT_TOKENIZER_ID; row.repairPromptTokensEstimated = true;
    if (liveBudget) {
      const verdict = liveBudget.authorize({ provider: route.provider, model: route.model });
      if (!verdict?.ok) return { ...row, mergeStatus: 'budget_refused', reasonCodes: ['budget_refused'] };
      row.budgetTicket = verdict.ticket;
    }
    row.dispatched = true;
    row.purpose = row.kind || row.action;
    result = await executeResponses(request, { adapters: responseAdapters, signal });
  } catch (_error) {
    return { ...row, mergeStatus: 'dispatch_failed',
      ...require('../utils/qualificationDispatchPolicy').harnessBlockTelemetry(_error), dispatchMs: Date.now() - startedAt };
  }
  row.dispatchMs = Date.now() - startedAt;

  const usage = mapResponsesUsage(result?.usage);
  row.inputTokens = Number.isFinite(usage?.inputTokens) ? usage.inputTokens : null;
  row.cacheWriteTokens = result?.usage?.cacheCreationInputTokens ?? result?.usage?.cacheWriteTokens ?? 0;
  row.outputTokens = Number.isFinite(usage?.outputTokens) ? usage.outputTokens : null;
  const priced = priceCall({ provider: route.provider, model: route.model, usage: result?.usage, at: now() });
  row.costUsd = priced?.costUsd ?? null;
  row.costComponents = priced?.components || null;
  row.costStatus = priced?.costStatus ?? null;
  if (liveBudget && row.budgetTicket) {
    liveBudget.record({ ticket: row.budgetTicket, costUsd: row.costUsd, costStatus: row.costStatus });
  }

  const call = (result?.toolCalls || []).find((c) => c?.name === DAY_CONTAINED_COVERAGE_REPAIR_TOOL.name);
  let dayRepairs = null;
  try {
    const raw = call?.input ?? call?.arguments;
    dayRepairs = (typeof raw === 'string' ? JSON.parse(raw) : raw)?.dayRepairs ?? null;
  } catch (_error) {
    dayRepairs = null;
  }
  if (!Array.isArray(dayRepairs)) {
    return { ...row, mergeStatus: 'artifact_malformed', reasonCodes: ['coverage_repair_artifact_malformed'] };
  }
  const operations = dayRepairs.flatMap((d) => (Array.isArray(d?.operations) ? d.operations : []));
  row.returnedOperationCount = operations.length;
  row.operationTypes = [...new Set(operations.map((o) => (typeof o?.op === 'string' ? o.op : 'unknown')))];
  row.selectedPlaceRefs = operations
    .map((o) => o?.stop?.placeRef)
    .filter((r) => Number.isInteger(r));

  const merged = applyDayContainedCoverageRepair({
    itineraryData: validation.candidatePlan, scope, dayRepairs, candidates: catalog.candidates,
  });
  if (!merged.ok) return { ...row, mergeStatus: 'merge_refused', reasonCodes: merged.reasonCodes };
  if (pool && dayRepairs.some(d => d.operations.length > 1 || d.operations.some(op => op.op !== 'remove_support'
    && !planner.selectionAllowed(pool, d.dayRef, op.op === 'add_stop' ? -1 : op.stopRef - 1, op.stop?.placeRef))))
    return { ...row, mergeStatus: 'merge_refused', reasonCodes: ['repair_candidate_not_viable'] };

  if (pool) {
    const before = planner.projectPlan(validation.candidatePlan, repairPlanning.context);
    const after = planner.projectPlan(merged.plan, repairPlanning.context);
    row.projectedProgress = planner.progress(before, after, row.affectedDays);
    row.projectedRemainingReasonCodes = after.reasonCodes;
    if (after.days.some(d => row.affectedDays.includes(d.dayNumber) && d.codes.length)
      || row.projectedProgress.regressions.length)
      return { ...row, mergeStatus: 'merge_refused', reasonCodes: ['repair_projected_validation_failed'] };
  }
  // CONTAINMENT MEASURED, NOT CLAIMED. All three must be zero.
  row.acceptedOperationCount = merged.applied;
  row.frozenDayMutationCount = frozenFingerprint(merged.plan, scope.frozenDayNumbers)
    === frozenFingerprint(validation.candidatePlan, scope.frozenDayNumbers) ? 0 : 1;
  row.existingStopMutationCount = countExistingStopMutations({
    before: validation.candidatePlan, after: merged.plan,
  });
  row.crossDayMoveCount = countCrossDayMoves({
    before: validation.candidatePlan, after: merged.plan,
  });
  if (row.frozenDayMutationCount !== 0 || row.crossDayMoveCount !== 0) {
    return { ...row, mergeStatus: 'containment_violation', reasonCodes: ['coverage_repair_containment_violation'] };
  }
  return { ...row, mergeStatus: 'applied', plan: merged.plan };
}

const MAX_REPAIR_INSTRUCTION_CHARS = 4000;
const { MAX_FOCUSED_REPAIRS } = require('../utils/focusedRepairBudget');
const { buildEvidenceBoundRepairCandidates } = require('../utils/evidenceBoundRepairCandidates');
const { bindRepairPatch, buildBoundRepairTool } = require('../utils/boundRepairPatch');
const { classifyRepairRetryability, blockerSignature } = require('../utils/repairRetryability');
const { isAcceptedCanonicalPlan } = require('../utils/canonicalPlanAcceptance');
const {
  DAY_CONTAINED_COVERAGE_REPAIR_TOOL,
  resolveCoverageRepairScope,
  buildCoverageRepairInstruction,
  applyDayContainedCoverageRepair,
} = require('../utils/dayContainedCoverageRepair');
const {
  buildBackupCandidateContext,
  normalizeCanonicalBackup,
} = require('../utils/backupCandidateContext');
const {
  validateBudgetClaim,
  buildBudgetClaimRepairInstructions,
} = require('../utils/budgetContract');
const {
  evaluateTravelerLanguage,
  buildTravelerLanguageRepairInstructions,
} = require('../utils/travelerLanguageQuality');
const {
  enrichItineraryExposureFromEvidenceBundle,
  enrichItineraryMobilityFromEvidenceBundle,
  evaluateMobilityClaimConsistency,
} = require('../utils/hardConstraintEligibility');
const {
  evaluateProseConstraintSafety,
  buildProseConstraintRepairInstructions,
} = require('../utils/proseConstraintSafety');
const {
  shouldResolveSemantically,
  resolveTurnSemantically,
} = require('./semanticTurnResolver');
const {
  applyPlanPatch,
  evaluateRefinementOwnership,
  isExplicitPlanRestructure,
  normalizePlanPatchToolCalls,
  preserveUntouchedDays,
} = require('../utils/itineraryPlanPatch');
const {
  buildRouteLegCapInfeasibleMessage,
  detectRouteEvidenceProseConflict,
  enrichItineraryWithRouteEvidence,
  evaluateRouteLegsAgainstDailyDriveCap,
  extractDrivingLegsFromEvidenceBundle,
} = require('../utils/routeEvidenceDriveBridge');
const { isPriorityContingencyAdvice } = require('../utils/priorityContingencyAdvice');
const { composeOperationalGenerationDirectives } = require('../utils/operationalGenerationDirectives');
const { resolveStopIdentities } = require('../utils/stopIdentityResolution');
const { degradeUnresolvedModelStops } = require('../utils/modelSelectedIdentityDegradation');
const {
  extractNamedExperienceRequests,
  resolveNamedExperienceRequirements,
  evaluateNamedExperienceSatisfaction,
  namedRequirementsRepairLine,
  buildRequestedExperienceUnavailableMessage,
} = require('../utils/namedExperienceRequirements');
const { getTrustedRelationshipReviewers } = require('../config/trustedRelationshipReviewers');
const { buildOfficialPlaceIndex } = require('../utils/officialPlaceIndex');
const { resolveGeoArtifactForAttempt, fingerprintCandidateStops } = require('../utils/geoResolutionArtifact');
const { emptyRouteCounts, captureDestinationRouteOwnership, departureBucket, resolveStopRouteArtifact } = require('../utils/stopRouteArtifact');
const { drivingVerificationInstruction, drivingCoverageClaimConflict } = require('../utils/drivingVerificationCoverage');
const { makePlanStageCapturer } = require('../utils/planStageCapture');
const {
  resolveRefinementScope,
  bindOperationsToScope,
  scopeAllowsOperation,
  evaluateScopedOwnership,
  describeRefinementTarget,
} = require('../utils/refinementScope');
const { buildMutationSummary } = require('../utils/mutationSummary');
const { createTurnTimeline } = require('../utils/turnTimeline');
const {
  summarizeModelDispatch,
  summarizePromptPayload,
  createToolArgumentStreamRecorder,
} = require('../utils/modelLatencyAnatomy');
const { createShadowStructureTracker } = require('../utils/shadowStreamStructure');
const { hashPayload } = require('../utils/canonicalResponse');
const { priceProviderCall } = require('./trailieTurnLedger');
const { LIVE_BUDGET_BLOCK_REASON } = require('./liveBudgetGuard');
const {
  buildTravelLogisticsForTurn,
} = require('./travelLogisticsOrchestrator');
const { resolveLogisticsNeeds } = require('../utils/logisticsNeedsResolver');
const { normalizeTripScope, emptyPlanningState } = require('../utils/planningState');
const { buildTripScopeFromMessage } = require('../utils/roadTripContract');
const {
  buildPresentationManifest,
  validatePresentationManifest,
} = require('../utils/presentationManifest');
const {
  reconcileRefinementClaims,
  alignRefinementProse,
} = require('../utils/refinementClaimFidelity');
const { sanitizeTrailieCitations } = require('../utils/sanitizeTrailieCitations');

const EXECUTION_RESULT_VERSION = 'trailie.v2.execution.result.v1';

// Product-level lifecycle vocabulary (WP10). Model/provider names never appear.
// Provider-native OpenAI event names are NEVER members of this set — WP8 owns
// that normalization and WP11A only emits these product events upward.
const CANONICAL_EVENTS = Object.freeze([
  'response_started', 'progress', 'evidence_ready', 'content_delta',
  'attempt_started', 'attempt_rejected',
  'itinerary_ready', 'prose_ready', 'response_finalized', 'error',
]);

/**
 * WHICH KIND OF LOOKUP IS THIS TURN ACTUALLY DOING?
 *
 * The evidence phase fetches many topics at once, so any single label is a
 * simplification — but it must be a TRUE one. Precedence runs most
 * decision-critical first: a turn resolving road closures is "checking current
 * conditions" even though it also pulls the park overview, because closures are
 * what the traveler is waiting on.
 *
 * Derived from the requirements the planner actually produced. Never guessed,
 * never time-based, and it falls back to the most general true statement rather
 * than to a more specific claim.
 */
const EVIDENCE_STAGE_BY_TOPIC = Object.freeze([
  ['checking_current_conditions', new Set([
    'alerts_closures', 'roads', 'trail_conditions', 'wildfire_smoke',
    'weather_current', 'weather_forecast',
  ])],
  ['checking_permits', new Set(['permits_reservations', 'campgrounds'])],
  ['checking_transport', new Set(['transit', 'parking', 'driving_time'])],
]);

function evidenceStageFor(requirements = []) {
  const topics = new Set(requirements.map((requirement) => requirement?.topic).filter(Boolean));
  for (const [stage, members] of EVIDENCE_STAGE_BY_TOPIC) {
    for (const topic of topics) if (members.has(topic)) return stage;
  }
  return 'checking_park_information';
}

/**
 * OUTPUT BUDGET POLICY.
 *
 * `maxOutputTokens` used to mean two incompatible things at once: the room the
 * ARTIFACT needs, and the room the model's REASONING consumes. On 2026-08-19 a
 * correctly-requested two-day itinerary escalated to `sol_medium`, which spent
 * 1,908 of its 3,000 output tokens reasoning and had ~1,092 left for the tool
 * call. The turn returned no plan at all.
 *
 * So the two are now separate terms:
 *
 *     requestMaxOutputTokens = artifactOutputBudgetTokens + reasoningHeadroomTokens
 *
 * `artifactOutputBudgetTokens` is what the serialized artifact (or prose) may
 * use. It is UNCHANGED — 3,000 for architect, 1,200 for everything else — and
 * is what `MAX_OUTPUT_TOKENS` still exports.
 *
 * `reasoningHeadroomTokens` is extra allowance for reasoning tokens, granted
 * per ROUTE TIER. It is 0 by default, so Terra architect attempts and every
 * buddy/default attempt keep exactly the limits they had. Only the tier whose
 * reasoning demonstrably crowded out the artifact gets headroom.
 *
 * This is NOT a licence to buy a bigger budget out of a wrong task contract: a
 * plain-answer turn never reaches the architect budget at all, because the
 * artifact term is chosen by `itinerary`, not by tier.
 */
const OUTPUT_BUDGET_POLICY = Object.freeze({
  artifactOutputBudgetTokens: Object.freeze({ architect: 3000, default: 1200 }),
  // Measured, not guessed: `sol_medium` reasoning was 1,908 tokens on the one
  // live sample. A reserve equal to the whole artifact budget is ~1.57x that,
  // leaves the full 3,000-token artifact allowance intact, and is 2x the old
  // cap rather than anywhere near the model maximum. If a future run reports
  // `artifactHeadroomTokens` at or below zero, THIS number is the one knob.
  reasoningHeadroomTokens: Object.freeze({ sol_medium: 3000, astra_medium: 3000 }),
  defaultReasoningHeadroomTokens: 0,
});

/** Artifact-side allowance only. Kept as the published constant. */
const MAX_OUTPUT_TOKENS = OUTPUT_BUDGET_POLICY.artifactOutputBudgetTokens;

/**
 * THE single source of the output ceiling. Both the Responses request and the
 * pre-dispatch budget guard must call this: a second output-limit source is how
 * pricing came to bound a number the provider never saw.
 */
function resolveOutputBudget({ itinerary, tier = null } = {}) {
  const artifactOutputBudgetTokens = itinerary
    ? OUTPUT_BUDGET_POLICY.artifactOutputBudgetTokens.architect
    : OUTPUT_BUDGET_POLICY.artifactOutputBudgetTokens.default;
  // Headroom is architect-only: a prose turn has no artifact to crowd out, and
  // granting it there would reward a misclassified task with a bigger budget.
  const reasoningHeadroomTokens = itinerary
    ? (OUTPUT_BUDGET_POLICY.reasoningHeadroomTokens[tier]
      ?? OUTPUT_BUDGET_POLICY.defaultReasoningHeadroomTokens)
    : OUTPUT_BUDGET_POLICY.defaultReasoningHeadroomTokens;
  return {
    artifactOutputBudgetTokens,
    reasoningHeadroomTokens,
    requestMaxOutputTokens: artifactOutputBudgetTokens + reasoningHeadroomTokens,
  };
}
const SAFE_REASON = /^[a-z0-9_]{1,64}$/;

// ---------------------------------------------------------------------------
// Immutability helpers
// ---------------------------------------------------------------------------

function cloneValue(value, seen = new WeakMap()) {
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value.getTime());
  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);
  for (const [key, child] of Object.entries(value)) clone[key] = cloneValue(child, seen);
  return clone;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function frozenSnapshot(value) {
  return deepFreeze(cloneValue(value));
}

function boundedReasons(reasonCodes) {
  if (!Array.isArray(reasonCodes)) return [];
  return reasonCodes.filter((code) => typeof code === 'string' && SAFE_REASON.test(code)).slice(0, 8);
}

/**
 * WP-TU Phase 4 Task 10E — a TARGET-LOCAL version projection, deliberately
 * NOT identity creation. `createTurnResponseIdentity` (utils/responseIdentity.js)
 * mints exactly ONE identity per logical server turn; that contract is
 * unambiguous and this file must not call it a second time for any reason,
 * even with an existing id (Task 10D did, and it was a real defect — see the
 * Task 10E report). A cross-plan mutation still belongs to that SAME one
 * turn — it never gets its own identity. This projects the turn's
 * ALREADY-MINTED `responseId` (threaded in from ai.js, the one place that
 * identity is ever minted) onto the TARGET trip's own next version number —
 * a pure numeric step over a value this function never generates.
 */
function projectTargetPlanVersion({ turnResponseId, priorResponseVersion }) {
  const prior = Number(priorResponseVersion);
  return {
    responseId: turnResponseId,
    responseVersion: (Number.isFinite(prior) && prior > 0 ? prior : 0) + 1,
  };
}

// ---------------------------------------------------------------------------
// Pure mapping helpers (exported test seams)
// ---------------------------------------------------------------------------

const ARCHITECT_INTENTS = new Set(['simple_itinerary', 'full_trip', 'deep_research', 'trip_refinement']);
const LIVE_INTENTS = new Set(['live_in_trip_assistance', 'hotel_live_search', 'flight_live_search']);

function intentToPromptMode(intent) {
  const job = intent?.travelerJob;
  if (job === 'trip_skeleton' || job === 'trip_duration_advice' || job === 'access_contingency') {
    return 'buddy';
  }
  if (shouldForceStructuredItinerary({ job })) return 'architect';
  const primary = intent?.primaryIntent;
  if (ARCHITECT_INTENTS.has(primary) && job !== 'trip_skeleton') return 'architect';
  if (primary === 'compare') return 'compare';
  if (LIVE_INTENTS.has(primary)) return 'live';
  return 'buddy';
}

function isItineraryMode(mode) {
  return mode === 'architect';
}

// ---------------------------------------------------------------------------
// WP-TU Phase 2 Task 4 — tripScope destination sync.
//
// tripScope is made a CONSUMER of the single authoritative classification
// (Task 3's `intent`) instead of an independent destination resolver:
//
//   current user turn -> classifyIntent (once) -> understanding.subjectDestinations
//                                               + understanding.primaryDestination
//                                               + understanding.destinationRelationship
//                                               + tripContext.activeContextAction
//                                               -> tripScope synchronization
//
// Only `activeContextAction === 'set'` (a genuine NEW itinerary build naming
// a destination that differs from whatever trip is currently active — see
// trailieTravelerJobResolver's resolveTripContext) rewrites the active
// destination. `'preserve'` (side queries, comparisons, continuations,
// historical references to a DIFFERENT stored trip) leaves tripScope exactly
// as frozen — this function is a no-op for those turns.
//
// Local/turn-scoped only: this reads `tripScope` (already derived from the
// frozen constraints/planningState/tripState) and returns a NEW value for
// this turn's use. It never mutates frozenConstraints/frozenPlanningState/
// frozenTripState, so a previously stored trip's plan identity (e.g.
// Redwood's saved plan, while Badlands becomes the active destination) is
// never touched here — persistence of the new active destination, if any,
// happens downstream of this execution service, not in it.
//
// A 'set' rebuilds tripScope around ALL destinations the classifier named
// this turn (`understanding.subjectDestinations`, Task 1c), never just
// `primaryDestination` (the first of that set) alone — collapsing to the
// first destination here would silently reintroduce, one layer later, the
// exact bug Task 1c already fixed for `subjectDestinations`/
// `destinationRelationship` themselves.
//
// `hydrateSubjectDestination` (turnUnderstanding.js) projects each entry to
// `{ name, parkCode, lat, lon, source, confidence }` — note the field is
// `name`, NOT `displayName`/`canonicalName`/`parkName`, and it carries no
// `entityId`. Mapped explicitly below (never passed through un-mapped) so
// display names and route-leg entity ids don't silently come out null/
// unresolved.
function subjectDestinationToEntity(d, order) {
  if (!d) return null;
  const parkCode = d.parkCode ? String(d.parkCode).toLowerCase() : null;
  const latitude = Number.isFinite(Number(d.lat)) ? Number(d.lat) : null;
  const longitude = Number.isFinite(Number(d.lon)) ? Number(d.lon) : null;
  return {
    entityId: parkCode ? `nps:park:${parkCode}` : null,
    entityType: parkCode ? 'national_park' : 'place',
    parkCode,
    displayName: d.name || null,
    latitude,
    longitude,
    resolutionConfidence: d.confidence ?? null,
    order,
    status: latitude != null && longitude != null ? 'resolved' : 'unresolved_coords',
    source: d.source || null,
  };
}

function syncTripScopeDestinationFromIntent(tripScope, intent) {
  if (intent?.tripContext?.activeContextAction !== 'set') return tripScope;
  const understanding = intent?.understanding || null;
  const subjectDestinations = Array.isArray(understanding?.subjectDestinations)
    ? understanding.subjectDestinations.filter(Boolean)
    : [];
  const primaryDestination = understanding?.primaryDestination || null;
  // subjectDestinations is the full named set for this turn; fall back to
  // primaryDestination alone only if it was never populated.
  const rawDestinations = subjectDestinations.length > 0
    ? subjectDestinations
    : (primaryDestination ? [primaryDestination] : []);
  if (rawDestinations.length === 0) return tripScope;

  const mappedDestinations = rawDestinations
    .map((d, i) => subjectDestinationToEntity(d, i))
    .filter(Boolean);
  if (mappedDestinations.length === 0) return tripScope;

  if (mappedDestinations.length === 1) {
    return normalizeTripScope({
      ...(tripScope || {}),
      type: 'single_destination',
      destinations: mappedDestinations,
    });
  }

  // 2+ destinations named in a 'set' turn — reuse the EXISTING multi-
  // destination/route/comparison contract (`buildTripScopeFromMessage`)
  // rather than inventing a new scope shape. Passing `options.destinations`
  // + `options.destinationRelationship` makes it skip its own raw-message
  // destination/relationship resolution ENTIRELY (see roadTripContract.js) —
  // destinations and their relationship come only from the authoritative
  // `intent`, never re-derived here.
  //
  // The one thing still read from text is `understanding.originalText` —
  // the SAME text the classifier already read, already carried on this same
  // authoritative `intent` object (not a new raw-message parameter on this
  // function). It is needed only for the sub-fields `destinationRelationship`
  // doesn't itself carry: explicit road-trip/loop/one-way phrasing, a stated
  // daily-drive cap, and drive-word transport mode. Confirmed via the real
  // classifier (see Task 4 follow-up report):
  //   - "Let's plan Yellowstone and Grand Teton instead." -> relationship
  //     'combine' -> type stays 'multi_destination' (no "road trip"/"drive"
  //     wording), with adjacent route legs still built because 'combine'
  //     implies travel between the destinations.
  //   - "Plan a Yellowstone and Grand Teton road trip." -> relationship
  //     'route', explicit "road trip" wording -> type 'road_trip',
  //     transportMode 'drive', route legs built origin-less.
  // If a future 'set' turn names 2+ destinations with a travel-implying
  // relationship but NO road-trip/drive wording at all, `type` will read
  // 'multi_destination' rather than 'road_trip' even when the relationship
  // is 'route' — a known limitation of reusing this text-driven sub-field
  // logic unchanged, not something this task invents a new detector for.
  return buildTripScopeFromMessage(understanding?.originalText || '', {
    destinations: mappedDestinations,
    destinationRelationship: understanding?.destinationRelationship || 'unknown',
    destinationRelationshipConfidence: understanding?.destinationRelationshipConfidence ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// WP-TU Phase 3 Task 7 — planningState.destination is a CONSUMER of the same
// single authoritative classification `tripScope` already reads (Task 4),
// gated by the SAME `activeContextAction` field — the exact sibling helper,
// not a new mechanism.
//
// `planningState.destination` is SINGULAR by its existing schema
// (`emptyPlanningState()`/`normalizePersistedPlanningState`/
// `buildPlanningStateFromRuntime` all read/write `{parkCode, parkName,
// region, state}`). On a 'set' naming 2+ destinations
// (`understanding.subjectDestinations.length >= 2`), this deliberately
// stores only the authoritative `primaryDestination` (the first-named) as
// the anchor — it does NOT redesign the field into an array, and it never
// reads or touches `tripScope` (Task 4's own machinery, which DOES carry
// every named destination) at all.
//
// `region`/`state`: `primaryDestination` carries no region/state, and no
// reliable source for them was found (checked genericDestinationResolver.js).
// No consumer anywhere in the codebase actually reads
// `planningState.destination.region`/`.state` today (grep-confirmed — only
// `normalizePersistedPlanningState` itself round-trips them). Still, a value
// describing the OLD destination sitting on the record for a DIFFERENT park
// is factually wrong data, not an inert one — cleared to null on a 'set'
// rather than silently carried over.
function syncPlanningStateDestinationFromIntent(planningState, intent) {
  if (intent?.tripContext?.activeContextAction !== 'set') return planningState;
  const primaryDestination = intent?.understanding?.primaryDestination;
  if (!primaryDestination) return planningState;

  // A 'set' with a null/absent input planningState still needs a fully-
  // shaped record (every OTHER field intact per the existing normalization
  // contract), not a sparse `{destination: {...}}` patch object downstream
  // consumers were never written to tolerate.
  const base = planningState && typeof planningState === 'object' ? planningState : emptyPlanningState();

  return {
    ...base,
    destination: {
      ...(base.destination || {}),
      parkCode: primaryDestination.parkCode || null,
      parkName: primaryDestination.name || null,
      region: null,
      state: null,
    },
  };
}

// ---------------------------------------------------------------------------
// WP-TU Phase 3 Task 6 — resolvedEntities as a CONSUMER of the single
// authoritative classification too, not just Task 5's already-correct
// pre-intent baseline (tripScope -> allExtractedParks -> entry -> geocode).
//
// Two override rules, checked in order. If neither fires, the baseline is
// returned untouched — it already handles the genuinely-empty-turn case.
//
//   Rule 1 — the current turn explicitly names destinations
//     (`understanding.subjectDestinations.length > 0`): project ALL of them,
//     outranking the baseline UNCONDITIONALLY — even for an edit/refinement
//     turn ("For my Redwood trip, change Day 2" names Redwood and must win
//     even though it targets a DIFFERENT active plan, Badlands).
//
//   Rule 2 — the current turn names nothing of its own, AND this is not a
//     plan-targeting refinement (`REFINEMENT_JOBS`, or
//     `requestedArtifact === 'itinerary_patch'` — the SAME gate
//     `resolveTripContext` already uses for its own `historical_reference`
//     branch): fall back to `understanding.priorConversationalSubject`'s
//     destinations (the immediately-preceding conversational SUBJECT, which
//     may differ from the persisted active trip — "Redwood active -> 'Is
//     October good in Acadia?' -> 'What about November?'" must keep reading
//     Acadia, not Redwood). Its destinations are the BOUNDED
//     `{name, parkCode}` shape only (no coordinates) — hydrated via the
//     catalog before becoming valid resolvedEntities, same pattern
//     `resolveEntitiesFromContext`'s own entry/allExtractedParks blocks
//     already use.
//
//   If subjectDestinations is empty AND the job IS a plan-targeting
//   refinement ("Make Day 2 easier" against an active Badlands itinerary):
//   apply NEITHER rule. The baseline already correctly resolves to the
//   active plan via tripScope (Task 5's fix) — this is a deliberate absence
//   of an override, not a third rule.
// ---------------------------------------------------------------------------

/** Canonical minimal resolvedEntities shape — matches what
 * `resolveEntitiesFromContext`'s allExtractedParks/entry blocks already
 * produce, so every existing consumer (evidence planner, buildLogistics,
 * resolveParkIdentityBinding) sees the same shape regardless of which path
 * built it. */
function toResolvedEntity(mapped) {
  if (!mapped?.entityId || mapped.latitude == null || mapped.longitude == null) return null;
  return {
    entityId: mapped.entityId,
    displayName: mapped.displayName,
    latitude: mapped.latitude,
    longitude: mapped.longitude,
    resolutionConfidence: mapped.resolutionConfidence ?? 1,
  };
}

function subjectDestinationsToResolvedEntities(destinations) {
  return destinations
    .map((d, i) => subjectDestinationToEntity(d, i))
    .map(toResolvedEntity)
    .filter(Boolean);
}

/** `priorConversationalSubject.subjectDestinations` carries only
 * `{name, parkCode}` — hydrate lat/lon via the local catalog, exactly the
 * pattern `trailieV2RouteBridge.js`'s `resolveEntitiesFromContext` already
 * uses for its own entry/allExtractedParks blocks (join names, resolve
 * against the catalog, match by parkCode). Entries the catalog cannot
 * resolve are dropped rather than shipped with null coordinates — the same
 * 0,0-collision risk that code already guards against. */
function hydratePriorSubjectDestinations(destinations) {
  const joined = destinations.map((d) => d.name || d.parkCode).filter(Boolean).join(' and ');
  const catalogByCode = new Map(
    (joined ? resolveDestinationsFromMessage(joined) : []).map((item) => [item.parkCode, item])
  );
  const entities = [];
  const seen = new Set();
  for (const d of destinations) {
    const code = d?.parkCode ? String(d.parkCode).toLowerCase() : null;
    const catalog = code ? catalogByCode.get(code) : null;
    const latitude = Number.isFinite(Number(catalog?.latitude)) ? Number(catalog.latitude) : null;
    const longitude = Number.isFinite(Number(catalog?.longitude)) ? Number(catalog.longitude) : null;
    const entity = toResolvedEntity({
      entityId: code ? `nps:park:${code}` : null,
      displayName: d.name || catalog?.displayName || null,
      latitude,
      longitude,
      resolutionConfidence: 1,
    });
    if (!entity || seen.has(entity.entityId)) continue;
    seen.add(entity.entityId);
    entities.push(entity);
  }
  return entities;
}

function parkCodeFromEntityId(entityId) {
  const prefix = 'nps:park:';
  return typeof entityId === 'string' && entityId.startsWith(prefix) ? entityId.slice(prefix.length) : null;
}

/** Keep `resolvedContext` internally consistent when overriding
 * `resolvedEntities`: `primaryPark`/`destinationCount` are DERIVED FIELDS of
 * the same entity list (this mirrors exactly how `buildResolvedContext`
 * itself builds them from `allExtractedParks` — no new logic). Left stale,
 * `resolveParkIdentityBinding` (which cross-checks `resolvedEntities[0]`
 * against `primaryPark.parkCode`) would silently fail closed on precisely
 * the turns this task fixes (a destination switch), and `buildLogistics`
 * would keep planning around the WRONG park via a stale `primaryPark`. */
function withOverriddenResolvedEntities(resolvedContext, entities) {
  const primary = entities[0] || null;
  return {
    ...(resolvedContext || {}),
    resolvedEntities: entities,
    primaryPark: primary ? {
      parkCode: parkCodeFromEntityId(primary.entityId),
      parkName: primary.displayName || null,
      entityId: primary.entityId,
      latitude: primary.latitude,
      longitude: primary.longitude,
    } : (resolvedContext?.primaryPark || null),
    destinationCount: entities.length,
  };
}

function applyResolvedEntitiesOverride(resolvedContext, intent) {
  const understanding = intent?.understanding || null;
  const subjectDestinations = Array.isArray(understanding?.subjectDestinations)
    ? understanding.subjectDestinations.filter(Boolean)
    : [];

  // Rule 1.
  if (subjectDestinations.length > 0) {
    const entities = subjectDestinationsToResolvedEntities(subjectDestinations);
    if (entities.length > 0) return withOverriddenResolvedEntities(resolvedContext, entities);
    return resolvedContext;
  }

  // Neither rule applies to a plan-targeting refinement — deliberate absence.
  const job = intent?.travelerJob;
  const isPlanTargetingRefinement = REFINEMENT_JOBS.has(job)
    || understanding?.requestedArtifact === 'itinerary_patch';
  if (isPlanTargetingRefinement) return resolvedContext;

  // Rule 2.
  const priorSubjectDestinations = Array.isArray(understanding?.priorConversationalSubject?.subjectDestinations)
    ? understanding.priorConversationalSubject.subjectDestinations.filter(Boolean)
    : [];
  if (priorSubjectDestinations.length === 0) return resolvedContext;

  const hydrated = hydratePriorSubjectDestinations(priorSubjectDestinations);
  if (hydrated.length === 0) return resolvedContext;
  return withOverriddenResolvedEntities(resolvedContext, hydrated);
}

// ---------------------------------------------------------------------------
// Failure classes — repeated generation must be driven by WHY an attempt
// failed, not by a single "it failed" bit. Spending three expensive attempts
// re-requesting a structure nobody asked for is how a good prose answer became
// a 51-character error.
// ---------------------------------------------------------------------------

const FAILURE_CLASSES = Object.freeze({
  OUTPUT_INCOMPLETE: 'output_incomplete',
  SCHEMA_INVALID: 'schema_invalid',
  ARTIFACT_MISSING: 'artifact_missing',
  TRUTH_OR_CONSTRAINT: 'truth_or_constraint',
  UNKNOWN: 'unknown',
});

const SCHEMA_FAILURE_CODES = new Set(['tool_output_invalid']);
/** The mutation could not be applied to the prior canonical plan. */
const ARTIFACT_MISSING_PREFIX = /^plan_patch_/;
const ARTIFACT_MISSING_CODES = new Set([
  'refinement_dropped_unaffected_days',
  'refinement_changed_unaffected_days',
]);
function isArtifactMissingCode(code) {
  return ARTIFACT_MISSING_CODES.has(code) || ARTIFACT_MISSING_PREFIX.test(code);
}

function classifyValidationFailure(reasonCodes) {
  const codes = (reasonCodes || []).filter(Boolean);
  if (codes.length === 0) return FAILURE_CLASSES.UNKNOWN;
  if (codes.every((code) => code === 'output_incomplete')) return FAILURE_CLASSES.OUTPUT_INCOMPLETE;
  if (codes.every((code) => SCHEMA_FAILURE_CODES.has(code) || code === 'output_incomplete')) {
    return FAILURE_CLASSES.SCHEMA_INVALID;
  }
  if (codes.every(isArtifactMissingCode)) return FAILURE_CLASSES.ARTIFACT_MISSING;
  return FAILURE_CLASSES.TRUTH_OR_CONSTRAINT;
}

function isStructuralFailureClass(failureClass) {
  return failureClass === FAILURE_CLASSES.OUTPUT_INCOMPLETE
    || failureClass === FAILURE_CLASSES.SCHEMA_INVALID;
}

/**
 * May this failure spend another STRUCTURE attempt?
 *
 * required  -> yes, bounded repair is the right answer for a promised artifact.
 * optional /
 * preferred -> no. The traveler did not ask for structure; a validated prose
 *              answer already satisfies the request, and retrying burns money
 *              to chase an artifact nobody wanted.
 * truth / safety / hard-constraint failures are never "structure" failures and
 * are handled by the escalation ladder, never by prose degradation.
 */
function structureRetryAllowed({ failureClass, structurePolicy, hasSafeProse = false }) {
  // Truth, safety and hard-constraint failures are not structure failures. They
  // follow the escalation ladder and are never degraded into prose.
  if (!isStructuralFailureClass(failureClass)) return true;
  // A promised artifact earns bounded repair.
  if (structurePolicy === 'required') return true;
  // Nobody asked for structure and a validated, safe prose answer already
  // satisfies the request — spending another expensive attempt chasing an
  // artifact the traveler never wanted is pure waste.
  return !hasSafeProse;
}

function countHardConstraints(constraints) {
  // The WP9 `hardConstraintCount` signal means USER-imposed hard constraints
  // (e.g. "no drives over 4h", wheelchair, budget) — NOT the broker's resolved
  // operational access rules, which legacy constraint objects also stamp with
  // `hard:true`. Only an explicit user hard-constraint list counts here.
  if (!constraints || typeof constraints !== 'object') return 0;
  if (Array.isArray(constraints.hard)) return constraints.hard.length;
  return 0;
}

function nonNegIntOrNull(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function deriveRouterSignals({
  intent, coverage, tripDays, destinationCount, hardConstraintCount, deterministicRender,
}) {
  return {
    intent: intent?.primaryIntent,
    depth: intent?.depth,
    tripDays: nonNegIntOrNull(tripDays),
    destinationCount: nonNegIntOrNull(destinationCount),
    verticalCount: Array.isArray(intent?.verticals) ? intent.verticals.length : 0,
    hardConstraintCount: nonNegIntOrNull(hardConstraintCount) ?? 0,
    ambiguity: Number(intent?.confidence) < 0.8 ? 'high' : 'low',
    evidenceCompleteness: coverage === 'complete' ? 'complete' : 'partial',
    taskPhase: 'initial',
    deterministicRender: deterministicRender || { eligible: false },
  };
}

// ---------------------------------------------------------------------------
// Evidence coverage evaluation (no re-fetch; reads the frozen bundle only)
// ---------------------------------------------------------------------------

function isSatisfied(status) {
  return typeof status === 'string' && status.startsWith('satisfied_');
}

const NON_TERMINATING_HARD_TOPICS = new Set([
  'destination_identity',
  'permits_reservations',
]);

function hardTopicsFromGate(gate) {
  return (gate?.unmetHardReasons || [])
    .map((reason) => String(reason || '').replace(/^unmet_hard_/, ''))
    .filter(Boolean);
}

function evidenceGapTerminatesTurn(gate) {
  if (!gate || gate.hardComplete) return false;
  const topics = hardTopicsFromGate(gate);
  if (topics.length === 0) return true;
  return topics.some((topic) => !NON_TERMINATING_HARD_TOPICS.has(topic));
}

function nonTerminatingEvidenceGaps(gate) {
  return hardTopicsFromGate(gate).filter((topic) => NON_TERMINATING_HARD_TOPICS.has(topic));
}

function evaluateEvidenceGate(requirements, bundle) {
  const resolutionByReq = new Map((bundle?.resolutions || []).map((r) => [r.requirementId, r]));
  let unmetHard = 0;
  let unmetNonHard = 0;
  const unmetHardReasons = [];
  for (const requirement of requirements || []) {
    const resolution = resolutionByReq.get(requirement.requirementId);
    if (isSatisfied(resolution?.status)) continue;
    if (requirement.criticality === 'hard') {
      unmetHard += 1;
      unmetHardReasons.push(`unmet_hard_${requirement.topic || 'evidence'}`);
    } else {
      unmetNonHard += 1;
    }
  }
  const complete = unmetHard === 0 && unmetNonHard === 0;
  return {
    hardComplete: unmetHard === 0,
    coverage: unmetHard > 0 ? 'incomplete' : complete ? 'complete' : 'partial',
    unmetHardReasons: boundedReasons(unmetHardReasons),
  };
}

/**
 * Turn-level semantic cache observability. `freshness` above answers "how old
 * is the source"; this answers "which producer contract wrote what we read",
 * which is a different question and the one Gate #5 got wrong.
 */
function normalizationContractSummary(resolutions = []) {
  const blocks = resolutions.map((item) => item?.normalizationContract).filter(Boolean);
  if (blocks.length === 0) return null;
  const cached = new Set();
  for (const block of blocks) {
    for (const version of block.supersededVersions || []) cached.add(version);
    if ((block.supersededVersions || []).length === 0) {
      for (const version of block.observedVersions || []) cached.add(version);
    }
  }
  return Object.freeze({
    expectedVersion: blocks[0].expectedVersion || null,
    cachedVersions: Object.freeze([...cached].sort().slice(0, 4)),
    staleContractCandidates: blocks.reduce((sum, b) => sum + (b.mismatchedCandidates || 0), 0),
    cacheAccepted: blocks.some((b) => b.accepted === true),
    renormalized: blocks.some((b) => b.renormalized === true),
  });
}

function evidenceSummary(bundle, coverage) {
  const summary = bundle?.summary || {};
  const freshness = summary.satisfiedStaleSafe > 0
    ? 'stale_safe'
    : summary.satisfiedFresh > 0 ? 'fresh' : 'none';
  const publicSources = [...new Set(
    (bundle?.evidence || []).map((item) => item?.source?.provider).filter(Boolean),
  )].sort();
  return Object.freeze({
    coverage,
    freshness,
    publicSources: Object.freeze(publicSources),
    normalizationContract: normalizationContractSummary(bundle?.resolutions || []),
    requirementCount: summary.requirementCount || 0,
    resolvedOnce: true,
  });
}

// ---------------------------------------------------------------------------
// Cost aggregation
// ---------------------------------------------------------------------------

function aggregateAttemptCost(attempts) {
  const priced = [];
  for (const attempt of attempts || []) {
    if (attempt?.costStatus !== 'priced' || !Number.isFinite(attempt.costUsd)) {
      return { costStatus: 'cost_unknown', costUsd: null };
    }
    priced.push(attempt.costUsd);
  }
  return { costStatus: 'priced', costUsd: priced.reduce((sum, value) => sum + value, 0) };
}

// ---------------------------------------------------------------------------
// Deterministic exact-fact detector (narrow; conservative default)
// ---------------------------------------------------------------------------

function defaultResolveDeterministicRender({ resolvedContext, intent }) {
  const exact = resolvedContext?.exactFact;
  if (!exact || intent?.depth !== 'quick') return { eligible: false };
  if (!exact.factType || exact.value == null) return { eligible: false };
  return Object.freeze({
    eligible: true,
    exactValueAvailable: true,
    languageAddsValue: false,
    factType: exact.factType,
    text: String(exact.text || exact.value),
  });
}

// ---------------------------------------------------------------------------
// Contradiction detector (deterministic; rejects operational claims contradicted
// by selected official negative-polarity evidence). Conservative by default.
// ---------------------------------------------------------------------------

const OPEN_ASSERTION = /\b(open|available|running|accessible|reservable)\b/i;
const OPERATIONAL_TOPICS = new Set(['roads', 'alerts_closures', 'trail_conditions', 'transit']);

function defaultDetectContradiction({ text, itineraryData, bundle }) {
  const proseConflicts = detectRouteEvidenceProseConflict(text, bundle);
  if (proseConflicts.length > 0) return proseConflicts;

  const blob = `${String(text || '')} ${itineraryData ? JSON.stringify(itineraryData) : ''}`.toLowerCase();
  if (!blob.trim() || !OPEN_ASSERTION.test(blob)) return [];
  for (const evidence of bundle?.evidence || []) {
    if (evidence?.claim?.polarity !== 'negative') continue;
    if (!OPERATIONAL_TOPICS.has(evidence.topic)) continue;
    const subject = String(evidence?.claim?.subject || evidence?.scope?.geographicEntityIds?.[0] || '')
      // Strip a leading canonical id token (e.g. "nps:park:yose ") so we match on
      // the human-readable operational subject that would appear in model output.
      .replace(/^[a-z0-9]+:[a-z0-9]+:[a-z0-9]+\s*/i, '')
      .toLowerCase()
      .trim();
    if (subject && blob.includes(subject)) return ['evidence_contradiction'];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Attempt output normalization
// ---------------------------------------------------------------------------

function mapResponsesUsage(usage) {
  if (!usage) return null;
  return {
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    reasoningTokens: usage.reasoningTokens ?? null,
    cachedTokens: usage.cachedInputTokens ?? usage.cachedTokens ?? null,
    cacheWriteTokens: usage.cacheCreationInputTokens ?? usage.cacheWriteTokens ?? null,
  };
}

// ---------------------------------------------------------------------------
// Terminal-reason mapping (bounded error categories — no raw provider errors)
// ---------------------------------------------------------------------------

const ROUTER_REASON_TO_TERMINAL = Object.freeze({
  request_cancelled: 'cancelled',
  provider_attempt_failed: 'provider_unavailable',
  model_escalation_exhausted: 'routing_exhausted',
  deterministic_render_failed: 'deterministic_render_failed',
  deterministic_blocker: 'validation_failed',
  evidence_blocker: 'evidence_incomplete',
  repeated_input_blocker: 'evidence_incomplete',
});

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

async function executeTrailieTurn(input = {}, deps = {}) {
  const {
    userMessage = '',
    officialPlaces = null,
    conversationContext = null,
    tripState = null,
    // WP-TU Phase 3 Task 7 — renamed at destructure so a corrected local
    // `planningState` (synced from `intent`, see
    // syncPlanningStateDestinationFromIntent) can be introduced later at the
    // Task 4 tripScope seam without colliding with this raw input binding.
    planningState: inputPlanningState = null,
    constraints = null,
    // WP-TU Phase 3 Task 6 — renamed at destructure so the local binding can
    // be reassigned once `intent` is final (applyResolvedEntitiesOverride);
    // see the mutable `let resolvedContext` below.
    resolvedContext: initialResolvedContext = {},
    // WP-TU Phase 4 Task 10 — bounded metadata for the user's OTHER saved
    // plans (id/title/parkCode/parkName/formData dates/status/planningState.
    // destination), fetched once by the caller (Task 10's candidate-plan
    // discovery in prepareChatContext) BEFORE classification exists. This
    // service never queries a database itself — it only consumes what it is
    // handed, exactly like tripState/planningState/constraints.
    candidatePlans: inputCandidatePlans = [],
    // The trip currently loaded/active for this turn (mirrors ai.js's
    // `metadata.tripId || body.tripId || body.conversationId`).
    activeTripId = null,
    // WP-TU Phase 4 Task 10B — the owner `candidatePlans`/`activeTripId`
    // were scoped under (prepareChatContext's `httpReq.user._id`). Read only
    // by the cross-plan hydration fetch below; null for guests, exactly
    // like `candidatePlans` is always `[]` for them.
    userId = null,
    // WP-TU Phase 4 Task 10E — the ONE logical identity this turn already
    // has, minted exactly once by `createTurnResponseIdentity` in ai.js
    // (never here). Read ONLY by the cross-plan target-plan-mutation block
    // in `finalize()`, via `projectTargetPlanVersion` — never used to mint
    // a second identity. Null for every turn that never reaches that block
    // (including every guest turn, which never threads this through).
    turnResponseId = null,
    turnId: providedTurnId,
    signal = null,
    emitCanonicalEvent = null,
  } = input;

  const enabled = deps.enabled === true;
  if (!enabled) return { status: 'disabled', reasonCode: 'wp11a_disabled', version: EXECUTION_RESULT_VERSION };

  const {
    classifyIntent = classifyTrailieIntent,
    // Injected only. With no dispatcher the semantic seam is inert and the
    // deterministic understanding is used unchanged — nothing here can make a
    // live call on its own.
    semanticDispatch = null,
    planRequirements = planEvidenceRequirements,
    resolveEvidence,
    // WP-TU Phase 4 Task 10B — single-document hydration for a RESOLVED
    // target that differs from the active trip (Task 9/10's
    // `resolveTargetTripId` fail-closed gate). No default, mirroring
    // `resolveEvidence` immediately above: the real DB implementation is
    // supplied only by `runTrailieV2FromPreparedContext`; tests inject a
    // scripted mock. Absent (as in every pre-Task-10B caller/test) is
    // treated as "hydration unavailable" — the gate below fails closed
    // exactly as it did before this dependency existed.
    loadTargetPlan = null,
    // Phase 9B.2B — evidence-bound coordinate resolution. No default,
    // mirroring `resolveEvidence`/`loadTargetPlan` above: absent means "no
    // resolver available," when no dependency is supplied — every
    // requested entry is left unresolved and zero calls are made. Only a
    // caller that explicitly wires a real resolver (via
    // `geocodeCoordinateEvidenceProvider.js`) turns this on.
    resolveStopCoordinates = null,
    resolveStopRoute = null,
    runModelRouting = runTrailieModelRouting,
    buildPrompt = buildTrailiePromptV2,
    createRequest = createResponsesRequest,
    executeResponses = executeResponsesImpl,
    streamResponses = streamResponsesImpl,
    responseAdapters = {},
    normalizeTool = normalizeToolCalls,
    finalizeItinerary = finalizeStructuredItinerary,
    hashItinerary = hashPayload,
    priceCall = priceProviderCall,
    // Live-gate only. Absent in production, so no dispatch is ever gated by
    // budget there. When a gate injects one, EVERY paid dispatch — primary,
    // repair, escalation — must fit the remaining authorized budget.
    liveBudget = null,
    // PHASE 1 — ZERO-DURATION MICRO-REPAIR. ON by default since 2026-08-28.
    //
    // Proven live against the historical gate4 B1-pairB-run1 candidate, whose
    // full regeneration had replaced every stop on every day to supply a missing
    // integer:
    //
    //   output tokens      2,010  ->     85   (-95.8%)
    //   model time         23.7s  ->   6.9s   (-70.8%)
    //   cost             $0.0555  -> $0.0048  (-91.4%)
    //   stop preservation  0/0/0/0 -> 100/100/100/100
    //   non-duration edits accepted            0
    //
    // Pass `false` to roll back to full-regeneration repair. That kill switch is
    // the seam this flag exists for — the branch is an optimization, and every
    // failure inside it already falls through to the untouched repair ladder.
    enableZeroDurationMicroRepair = true,
    // PHASE 3B — DAY-CONTAINED ANCHOR REPAIR. ON by default since ROLLOUT GATE 6.
    //
    // The sequence this flag was waiting on completed: utility proof (offline,
    // 4 of 5 historical repairs; the fifth is whole-plan scope and correctly
    // declined) -> wiring proof -> ROLLOUT GATE 6, one live chained replay on a
    // real non-empty frozen bundle. 4U then narrowed the surface further, so the
    // guarantee is no longer merely containment:
    //
    //     add_stop is the only operation      EVERY PRE-EXISTING STOP IS IMMUTABLE
    //     1 addition per affected day         budget derived from the obligation
    //     identity from the frozen catalogue  the model selects a placeRef
    //     identity AND type server-owned      the model authors neither
    //
    // GATE 6 (2026-08-31, A1/Canyonlands, $0.0099 for this dispatch): the anchor
    // repair cleared `missing_experience_anchor` on days 2 and 3, revealed the
    // `insufficient_day_coverage` underneath, and left day 1 byte-identical.
    // existingStopMutation 0 - frozenDayMutation 0 - crossDayMove 0.
    //
    // SHIPPED AS ONE COUPLED CHAIN WITH COVERAGE. Anchor can reveal a coverage
    // defect, and coverage is the thing built to repair it; enabling anchor
    // alone would sometimes convert a cheap contained sequence into
    // anchor repair -> coverage failure -> the full regeneration ladder.
    //
    // Pass `false` to disable this class independently. That kill switch is the
    // rollback path, it is pinned by test, and it does not touch coverage.
    enableAnchorContainedRepair = true,
    // PHASE 4J — ADD-ONLY CONTAINED COVERAGE REPAIR. ON by default since
    // ROLLOUT GATE 6.
    //
    // `add_stop` is the only operation, so an existing recommendation cannot be
    // rewritten. That is not caution for its own sake — the cheapest way to clear
    // `insufficient_day_coverage` is to lengthen a stop that already exists, and
    // the model has taken that route historically, twice.
    //
    // GATE 6 (2026-08-31, A1/Canyonlands, $0.0099 for this dispatch) closed the
    // last item: utility proof (46 tests) -> wiring proof -> one live replay.
    // The run also showed the coupling in the shape the design predicted —
    // the anchor repair gave day 2 a 90-minute hike and day 3 a 45-minute one,
    // so the coverage scope NARROWED ITSELF to day 3 and carried day 2 in as a
    // FROZEN day. Anchor-introduced stops are immutable input to coverage by
    // scope resolution, not merely by measurement afterwards.
    //
    // Pass `false` to disable this class independently. Anchor stays on; a
    // revealed coverage defect then falls through to the untouched ladder.
    enableCoverageContainedRepair = true,
    // LEGAL-STOP SUBSTITUTION (2026-09-03). One-for-one replacement of a stop
    // the validators positively identified as illegal under a hard constraint
    // (`stop_identity_excluded`, exposure `constraint_eligibility_unknown`),
    // with the replacement identity drawn from the same frozen catalogue and
    // the same exposure-directive eligibility sets that govern construction
    // and retry steering. Built after the 2026-09-03 Olympic chain proved
    // supply, feasibility, and machine steering all correct while the model
    // kept making one bounded illegal selection per attempt. Slot preserved,
    // untargeted stops byte-identical, declines when no legal role-compatible
    // replacement exists. Pass `false` to disable this class independently.
    enableStopSubstitutionRepair = true,
    resolveDeterministicRender = defaultResolveDeterministicRender,
    detectContradiction = defaultDetectContradiction,
    buildTravelLogisticsForTurn: buildLogistics = buildTravelLogisticsForTurn,
    logisticsDeps = {},
    now = () => new Date(),
    newTurnId = () => `trailie-v2-${Date.now()}`,
    onAttemptContext = null,
    resolveLogisticsNeeds: resolveNeeds = resolveLogisticsNeeds,
  } = deps;
  // LATENCY ATTRIBUTION. Stage spans, so a slow turn can be pointed at rather
  // than split into "generation" (which already includes validation) and a
  // residual. Declared here so `finalize` can read it.
  const timeline = createTurnTimeline({ now: () => Date.now() });
  const turnStartedAtMs = Date.now();
  // One row per model dispatch: when it started, when the first streamed event
  // arrived, when it completed. The split at the first token is the whole
  // question — a 24s wait and a 24s write need opposite fixes.
  const modelDispatches = [];
  const routeResolution = { ...emptyRouteCounts(), noneChecked: 0, partiallyChecked: 0, fullyChecked: 0 };
  const recordRouteResolution = (artifact) => {
    for (const [key, count] of Object.entries(artifact.counts)) routeResolution[key] += count;
    const coverageKey = { none_checked: 'noneChecked', partially_checked: 'partiallyChecked', fully_checked: 'fullyChecked' }[artifact.coverage.status];
    routeResolution[coverageKey] += 1;
  };
  const coordinateResolution = {
    eligibleStops: 0, dispatches: 0, authoritative: 0, rejectedByAuthority: 0,
    noResult: 0, providerFailure: 0, cancelled: 0,
  };
  const recordCoordinateResolution = (counts) => {
    for (const key of Object.keys(coordinateResolution)) coordinateResolution[key] += counts[key] || 0;
  };

  // ZERO-DURATION MICRO-REPAIR STATE (turn-scoped, so the telemetry summary can
  // read it). `attemptsMicroRepaired` is the loop guard: ONE micro-repair per
  // original generation attempt, tracked explicitly rather than inferred from
  // the attempt counter, which was never designed around sub-dispatches. A
  // pathological provider that keeps returning zeros cannot spin here.
  // PROVIDER-DISPATCH AXIS. Attempt identity and provider-dispatch identity used
  // to be the same number; micro-repair makes them different by design. This
  // counter is the dispatch axis, and it is deliberately NOT the attempt axis.
  let providerDispatchSeq = 0;
  // ORDERED sub-dispatch record. Every bounded repair that runs INSIDE a
  // generation attempt lands here in dispatch order, whatever its class.
  const subDispatchLog = [];
  let tripQualityDiagnostics = null;
  let experienceDiagnostics = null;
  let finalValidationSnapshot = null;
  let validationSequence = 0;
  const validationHistory = [];
  // PER-CLASS ONE-SHOT GUARD, keyed by generation attempt. Each repair class
  // gets one allowance per attempt and running one does not consume another's,
  // so a legitimate mixed-defect turn can do duration-then-anchor while a
  // pathological one cannot repeat either class.
  const subRepairGuards = new Map();
  // Default ON: live OpenAI adapter streams; tests without adapter.stream fall
  // back inside streamResponses → execute. Set false to force non-stream execute.
  const streamGeneration = deps.streamGeneration !== false;

  const emit = (type, payload) => {
    if (typeof emitCanonicalEvent !== 'function' || !CANONICAL_EVENTS.includes(type)) return;
    try { emitCanonicalEvent(Object.freeze({ type, ...(payload ? { payload } : {}) })); } catch { /* best-effort */ }
  };

  const turnId = providedTurnId || newTurnId();
  const nowAt = now();

  // Phase 1 — immutable private snapshot (kept separate from public evidence).
  const frozenTripState = frozenSnapshot(tripState);
  const frozenPlanningState = frozenSnapshot(inputPlanningState);
  const frozenConstraints = frozenSnapshot(constraints);
  const frozenHistory = frozenSnapshot(conversationContext?.history || []);
  const frozenCandidatePlans = frozenSnapshot(inputCandidatePlans);

  const cancelledResult = (attempts = []) => finalize({
    status: 'cancelled', terminalReason: 'cancelled', routing: { attempts },
  });

  // Assemble a canonical, privacy-safe execution result (single exit funnel).
  // WP-TU Phase 3 Task 6 — mutable so `applyResolvedEntitiesOverride` can
  // reassign it once `intent` is final; every downstream read (all inside
  // this same function/closure) sees the corrected value automatically.
  let resolvedContext = initialResolvedContext;
  // WP-TU Phase 3 Task 7B — lifted to the top of the function (same pattern
  // as `resolvedContext` above) so `finalize`'s `result` construction, which
  // is DEFINED here but only INVOKED after the try block runs, can see the
  // Task-7-synced value via closure. A `const` declared inside the try block
  // would be invisible here — block scope, not execution order.
  let planningState = null;
  let intent = null;
  // WP-TU Phase 4 Task 10 — lifted the same way, so `finalize`'s `result`
  // can see the resolved plan target (or its absence) via closure. Null
  // whenever no plan-targeting turn ever ran resolveTargetTripId, or when
  // resolution never reached a `resolved` status.
  let targetTripId = null;
  // WP-TU Phase 4 Task 10D — cross-plan target mutation. `hydratedTargetPlan`
  // is the EFFECTIVE prior-plan input for generation when a resolved target
  // differs from the active trip and hydration succeeded — consumed ONLY by
  // the `priorItineraryData` computation below, never substituted into
  // `frozenTripState`/`planningState`/`tripScope` themselves (those stay the
  // active trip's own, untouched). `hydratedTargetMeta` carries what
  // `finalize()` needs to stamp and address the target's own plan document
  // (tripId/parkCode/parkName/its own priorResponseVersion) without ever
  // reading `frozenTripState` for it. `isCrossPlanTargetMutation` is the one
  // flag `finalize()` uses to decide whether a fulfilled artifact belongs on
  // the public `canonicalPlan` channel (active trip) or `targetPlanMutation`
  // (the hydrated target) — see the gate below and `finalize()`.
  let hydratedTargetPlan = null;
  let hydratedTargetMeta = null;
  let isCrossPlanTargetMutation = false;
  let semanticTelemetry = null;
  let promptSnapshot = null;
  let primaryPackingFailure = null;
  let evidence = null;
  let routeSignals = null;
  let finalizedPlan = null;
  let travelLogistics = null;
  let logisticsNeeds = {};
  // Execution contract + artifact bookkeeping. Declared here so the single exit
  // funnel can validate artifact fulfillment for every terminal status.
  let executionContract = null;
  let priorCanonicalPlanRef = null;
  // See ROLLOUT SEGMENTATION below. `null` = create_itinerary was never built.
  let createItineraryStrictUsed = null;
  let patchResultRef = null;
  let failureClasses = [];
  // R2 acceptance telemetry — bounded summary of the machine-composed attempt-1
  // directives: rule counts, the exposure legal pool (public place names from
  // evidence, machine-selected), and how many exposure-relevant candidates were
  // removed from the construction catalogue BEFORE generation. Never prompt
  // text, never traveler language. Null on ordinary turns.
  let operationalDirectivesTelemetry = null;
  /**
   * P0-L — bounded PROGRESS / NO_PROGRESS / REGRESSION verdict per attempt.
   * Obligation ids and a verdict only: no plan content, no model reasoning.
   */
  const attemptProgressLog = [];
  const validationBlockersSeen = new Set();

  function finalize({ status, terminalReason = null, routing = {}, response = null, validation = null }) {
    // Per-attempt windows include validation, so the model half is what is left
    // once the measured deterministic half is removed. Reported, not inferred
    // into a single misleading "generation" number.
    const attemptWindowMs = (routing.attempts || [])
      .reduce((total, record) => total + (Number(record.latencyMs) || 0), 0);
    const turnWallClockMs = Date.now() - turnStartedAtMs;
    const timelineSnapshot = timeline.snapshot({ totalMs: turnWallClockMs });
    const validationMs = (timelineSnapshot.stages
      .find((row) => row.stage === 'artifact_validation') || {}).totalMs ?? null;
    const latencyBreakdown = Object.freeze({
      stages: Object.freeze(timelineSnapshot.stages.map((row) => Object.freeze({ ...row }))),
      // Bounded per-span intervals. The aggregate says how much work happened;
      // only these say in what SHAPE — which is what the 2026-08-26 evidence
      // audit needed to see the three broker waves and could not get.
      spans: Object.freeze(timelineSnapshot.spans.map((row) => Object.freeze({ ...row }))),
      spansTruncated: timelineSnapshot.spansTruncated,
      criticalPathMs: timelineSnapshot.criticalPathMs,
      accumulatedWorkMs: timelineSnapshot.accumulatedWorkMs,
      attemptWindowMs,
      modelTimeMs: validationMs == null ? null : Math.max(0, attemptWindowMs - validationMs),
      deterministicValidationMs: validationMs,
      openStages: Object.freeze([...timelineSnapshot.openStages]),
      turnWallClockMs,
      unattributedMs: timelineSnapshot.unattributedMs,
      coverageRatio: timelineSnapshot.coverageRatio,
      // WHY the model half is long: waiting, or producing.
      modelDispatchCount: modelDispatches.filter(row => row.dispatched).length + subDispatchLog.filter(row => row.dispatched).length,
      namedDispatchPurposes: [...modelDispatches.filter(row => row.dispatched).map(row => row.purpose),
        ...subDispatchLog.filter(row => row.dispatched).map(row => row.purpose)],
      unattributedModelDispatches: [...modelDispatches.filter(row => row.dispatched), ...subDispatchLog.filter(row => row.dispatched)].filter(row => !row.purpose).length,
      modelDispatches: Object.freeze(modelDispatches.map((row) => Object.freeze({
        attempt: row.attempt, tier: row.tier, model: row.model, purpose: row.purpose,
        // `summarizeModelDispatch` derives every interval; it is passed the whole
        // row and returns integers, slugs and the bounded byte curve only.
        ...summarizeModelDispatch(row),
      }))),
      // WHAT we ship it. `buildTrailiePromptV2` has computed this all along and
      // nothing surfaced it, so the input size has never actually been looked at.
      primaryEvidencePacking: promptSnapshot?.evidence?.primaryPacking || primaryPackingFailure,
      refinementEvidencePacking: promptSnapshot?.evidence?.refinementPacking || null,
      promptPayload: summarizePromptPayload({
        accounting: promptSnapshot?.accounting || null,
      }),
    });
    const attempts = (routing.attempts || []).map((record) => ({
      tier: record.tier || null,
      provider: record.provider || null,
      model: record.model || null,
      reasoningEffort: record.reasoningEffort || null,
      attemptKind: record.retry ? 'same_model_retry' : record.fallback ? 'escalation' : 'primary',
      // ATTEMPT AXIS vs DISPATCH AXIS. `attempts.length` is still the attempt
      // count — a micro-repair is work INSIDE an attempt, never a rung of the
      // ladder. But `dispatch N === attempt N` is false by design now, so the
      // dispatch that produced this attempt is named, and any sub-dispatch that
      // ran inside it is listed rather than left invisible to a future trace.
      action: 'generation',
      dispatchIndex: (modelDispatches.find((d) => d.attempt === record.attempt) || {}).dispatchIndex ?? null,
      subDispatches: subDispatchLog
        .filter((r) => r.attempt === record.attempt)
        .map((r) => ({
          action: r.action,
          kind: r.kind,
          dispatchIndex: r.dispatchIndex ?? null,
          mergeStatus: r.mergeStatus,
          outputTokens: r.outputTokens ?? null,
          latencyMs: r.dispatchMs ?? null,
          costUsd: r.costUsd ?? null,
          resolvedReasonCodes: [...(r.resolvedReasonCodes || [])],
          ...(r.kind === 'zero_duration_micro_repair'
            ? { targetCount: r.targetCount, acceptedCount: r.acceptedCount }
            : {
              affectedDayCount: r.affectedDayCount,
              affectedDays: [...(r.affectedDays || [])],
              operationBudgetPerDay: r.operationBudgetPerDay ?? null,
              operationBudgetTotal: r.operationBudgetTotal ?? null,
              returnedOperationCount: r.returnedOperationCount,
              acceptedOperationCount: r.acceptedOperationCount,
              operationTypes: [...(r.operationTypes || [])],
              frozenDayMutationCount: r.frozenDayMutationCount ?? null,
              untargetedStopMutationCount: r.untargetedStopMutationCount ?? null,
            }),
        })),
      validationStatus: record.validationStatus || null,
      // ONE SOURCE OF TRUTH. These are the codes and the stage the attempt's own
      // validation produced, forwarded verbatim from the router's attempt record.
      // Nothing downstream may re-derive them: on 2026-08-20 attempt 2 of the
      // Zion turn failed for a reason no artifact retained, because the public
      // attempt shape dropped the codes the router had already computed.
      validationReasonCodes: [...(record.validationReasonCodes || [])],
      retryability: record.retryability || null,
      blockerSignature: record.blockerSignature || null,
      purpose: record.purpose,
      validationStage: record.validationStage || null,
      // WHAT the failing target actually was. A reason code alone made the
      // 2026-08-25 terra patch failures unattributable after the fact.
      validationTargetDiagnostics: record.validationTargetDiagnostics || null,
      // Bounded, allowlisted failure details owned by this exact attempt.
      // This is internal repair/debug context; traveler-facing prose never
      // reads it and raw tool/model payloads cannot enter the envelope.
      validationDiagnostics: record.validationDiagnostics || null,
      retryOrEscalation: record.retry ? 'retry' : record.fallback ? 'escalation' : null,
      // MONOTONIC REPAIR ATTRIBUTION. Says whether this attempt moved the turn
      // forward, stood still, or gave back a requirement an earlier candidate
      // had already satisfied — the distinction a satisfied/failed count cannot
      // make. Bounded obligation ids only.
      repairProgress: (() => {
        const row = attemptProgressLog.find((r) => r.attempt === record.attempt);
        return row
          ? {
            progress: row.progress,
            satisfied: [...row.satisfied],
            failed: [...row.failed],
            regressed: [...row.regressed],
            discovered: [...row.discovered],
            ...(row.requestedExperienceCoverage ? {
              unavailable: [...row.unavailable],
              requestedExperienceCoverage: row.requestedExperienceCoverage,
            } : {}),
          }
          : null;
      })(),
      latencyMs: record.latencyMs ?? null,
      usage: {
        inputTokens: record.inputTokens ?? null,
        cachedTokens: record.cachedTokens ?? null,
        cacheWriteTokens: record.cacheWriteTokens ?? null,
        outputTokens: record.outputTokens ?? null,
        reasoningTokens: record.reasoningTokens ?? null,
      },
      // What the attempt was ALLOWED, what reasoning consumed, and what was
      // therefore left for the artifact. `artifactHeadroomTokens` at or below
      // zero on an `output_incomplete` attempt is the 2026-08-19 signature.
      outputPolicy: {
        maxOutputTokens: record.maxOutputTokens ?? null,
        artifactOutputBudgetTokens: record.artifactOutputBudgetTokens ?? null,
        reasoningHeadroomTokens: record.reasoningHeadroomTokens ?? null,
        artifactHeadroomTokens: record.artifactHeadroomTokens ?? null,
      },
      completion: {
        status: record.completionStatus || null,
        incompleteReason: record.incompleteReason || null,
      },
      cost: { costStatus: record.costStatus || 'cost_unknown', costUsd: record.costUsd ?? null },
    }));
    const totalCost = aggregateAttemptCost([...(routing.attempts || []), ...subDispatchLog.filter(row => row.dispatched)]);
    totalCost.breakdown = {
      generation: aggregateAttemptCost(routing.attempts || []),
      repair: aggregateAttemptCost(subDispatchLog.filter(row => row.dispatched)),
      helper: { costUsd: 0, scope: 'execution_dispatches_only; auxiliary calls tracked by turn ledger' },
      components: [...(routing.attempts || []), ...subDispatchLog.filter(row => row.dispatched)]
        .map(row => ({ purpose: row.purpose || row.kind || 'primary_generation', costUsd: row.costUsd, components: row.costComponents || null })),
      unsettledDispatches: [...(routing.attempts || []), ...subDispatchLog.filter(row => row.dispatched)]
        .filter(row => row.costStatus !== 'priced').length,
    };
    const publicIntent = intent ? {
      primaryIntent: intent.primaryIntent,
      travelerJob: intent.travelerJob || null,
      verticals: intent.verticals,
      depth: intent.depth,
      freshness: intent.freshness,
      confidence: intent.confidence,
    } : null;
    let canonicalPlan = finalizedPlan ? finalizedPlan.itineraryData : null;
    let content = response?.text || '';
    let effectiveValidation = validation;

    // ---- required-artifact fulfillment invariant --------------------------
    // "The model produced validated prose" is NOT the same as "the artifact the
    // traveler asked for exists". A required itinerary_patch that terminated as
    // prose used to return PASS while the canonical plan stayed stale.
    const artifactFulfillment = validateArtifactFulfillment({
      requestedArtifact: executionContract?.requestedArtifact || null,
      structurePolicy: executionContract?.structurePolicy || 'optional',
      priorCanonicalPlan: priorCanonicalPlanRef,
      resultingCanonicalPlan: status === 'complete' ? canonicalPlan : null,
      patchResult: patchResultRef,
    });

    if (status === 'complete' && !artifactFulfillment.fulfilled) {
      // A state MUTATION that could not be applied must never look applied.
      // Ordinary safe prose may not masquerade as completion here: only the
      // explicit not-applied contract may return prose, and the prior canonical
      // plan keeps its identity because nothing new is written over it.
      if (executionContract?.requestedArtifact === 'itinerary_patch') {
        content = buildArtifactNotAppliedMessage(content, {
          reasonCodes: validation?.reasonCodes || [artifactFulfillment.reasonCode],
        });
        response = { kind: 'text', text: content };
        canonicalPlan = null;
        finalizedPlan = null;
      }
      // Preserve any degradation the generation path already declared (e.g.
      // "the structured artifact was unavailable") and add the fulfillment
      // reason on top. Nothing here may read as an ordinary pass.
      const priorDegraded = Array.isArray(validation?.degradedReasonCodes)
        ? validation.degradedReasonCodes
        : [];
      effectiveValidation = {
        status: 'degraded',
        reasonCodes: ['artifact_not_applied'],
        degraded: true,
        degradedReasonCodes: [...new Set([...priorDegraded, artifactFulfillment.reasonCode])],
      };
    } else if (
      status === 'failed'
      && artifactFulfillment.required
      && !artifactFulfillment.fulfilled
      && executionContract?.requestedArtifact === 'itinerary_patch'
    ) {
      // REQUIRED-MUTATION FAILURE CONTRACT.
      //
      // A required `itinerary_patch` that never became a canonical plan leaves
      // the traveler's SAVED itinerary untouched, and that is the one thing the
      // not-applied contract exists to say. Before 2026-08-21 this copy was
      // reachable only from `status === 'complete'`, so every OTHER way a
      // required mutation can fail — the ladder exhausting (`routing_exhausted`),
      // validation exhausting, the live budget guard refusing a dispatch, the
      // provider being unavailable — returned the generic outage string and told
      // the traveler nothing about the state of their plan. Nothing false was
      // said; the contract simply was not delivered.
      //
      // DOES NOT MASK THE INTERNAL REASON. `status`, `terminalReason`,
      // `validation.status` / `validation.reasonCodes`, the per-attempt
      // `validationStage` and `artifactFulfillment.reasonCode` are all left
      // exactly as the run produced them. Only the traveler-facing envelope
      // changes; telemetry stays specific.
      //
      // SAFETY. No banked prose is promoted here — the message is built from an
      // EMPTY advice string, so it asserts only that the saved plan is
      // unchanged and makes no travel recommendation. That remains safe to
      // return even when the turn died on truth, safety or hard-constraint
      // validation. Terminals that already carry their own specific safe
      // explanation (`evidence_incomplete`, `constraint_infeasible`) are not
      // routed through here and keep their copy.
      content = buildArtifactNotAppliedMessage('', { planShown: false, reasonCodes: validation?.reasonCodes || [] });
      response = { kind: 'text', text: content };
      canonicalPlan = null;
      finalizedPlan = null;
    }

    if (status === 'failed' && validation?.reasonCodes?.some(c => ['insufficient_day_coverage','excessive_trip_repetition'].includes(c))) {
      content = buildArtifactNotAppliedMessage('', { planShown: false, reasonCodes: validation.reasonCodes });
      response = { kind: 'text', text: content };
    }

    // WP-TU Phase 4 Task 10D — cross-plan target mutation. Reached ONLY when
    // hydration succeeded (`isCrossPlanTargetMutation`) AND the exact SAME
    // fulfillment check every active-trip refinement already passed through
    // above judged this patch fulfilled (`canonicalPlan` survived the masking
    // branches above — a failed/unfulfilled cross-plan patch already went
    // through the SAME "not applied" content rewrite as an active-trip one,
    // with `canonicalPlan` nulled, so this block is simply never reached for
    // that case — no separate failure path was invented).
    //
    // The active trip's own channel (`canonicalPlan`/`itineraryHash`/
    // `presentation`) must never carry hydrated-target content — it belongs
    // to `targetPlanMutation.tripId` (Redwood), never `activeTripId`
    // (Badlands). This is why `canonicalPlan` is read here BEFORE being
    // nulled below: `artifactFulfillment` above already needed the real
    // patched content to correctly judge fulfillment (same code, same
    // criteria as the active-trip path); only AFTER that judgment is the
    // public field cleared.
    let targetPlanMutation = null;
    if (isCrossPlanTargetMutation && status === 'complete' && canonicalPlan) {
      // WP-TU Phase 4 Task 10E — NOT a second identity. This turn has
      // exactly ONE logical `responseId` (`turnResponseId`, minted once by
      // ai.js's `createTurnResponseIdentity` and threaded straight through —
      // never re-minted here). `projectTargetPlanVersion` only projects that
      // SAME id onto the target's own next version number — the target's OWN
      // prior version (fetched fresh by `loadTargetPlan` this turn, Task 10B)
      // is what keeps THAT number correct and non-conflicting for Redwood
      // specifically, never Badlands'.
      const targetIdentity = projectTargetPlanVersion({
        turnResponseId,
        priorResponseVersion: hydratedTargetMeta?.priorResponseVersion || 0,
      });
      // DISCOVERED WHILE BUILDING THIS (not a pre-existing concern this task
      // introduced a regression in — see the Task 10D report): `applyPlanPatch`
      // clones the WHOLE prior plan (`cloneValue(priorPlan)`,
      // itineraryPlanPatch.js) before mutating only the touched day, so the
      // hydrated target's OWN stored `responseId`/`responseVersion`/
      // `contentHash`/`itineraryHash` survive onto `canonicalPlan` unchanged.
      // `buildPlanDocument` spreads `...itineraryData` AFTER its `identity`
      // fields, so those STALE values would silently win over the
      // freshly-minted `targetIdentity` above — the resulting document would
      // claim the target's OLD version instead of advancing it. Stripped
      // here, on the content handed to it, so the fresh identity is what
      // actually lands; `buildPlanDocument` itself stays unmodified.
      const {
        responseId: _staleResponseId,
        responseVersion: _staleResponseVersion,
        contentHash: _staleContentHash,
        itineraryHash: _staleItineraryHash,
        lifecycleStatus: _staleLifecycleStatus,
        ...pureItineraryData
      } = canonicalPlan;
      // Same plan-document builder every OTHER stored TripPlan in this system
      // uses — identity embedded ON the object, matching how
      // `extractPlanIdentity`/`resolveCanonicalResponsePersistence` read it
      // (plan-first, never a sibling parameter).
      const stampedTargetPlan = buildPlanDocument({
        itineraryData: pureItineraryData,
        parkCode: hydratedTargetMeta?.parkCode || null,
        parkName: hydratedTargetMeta?.parkName || null,
        identity: targetIdentity,
        feasibilityIssues: [],
      });
      targetPlanMutation = {
        tripId: hydratedTargetMeta?.tripId || targetTripId,
        canonicalPlan: stampedTargetPlan,
      };
      // Clear the active-trip channel — AFTER extracting what belongs to the
      // target. `content`/`response` are left exactly as generation produced
      // them (the traveler-facing description of the Redwood edit); only the
      // active-trip-scoped fields are cleared.
      canonicalPlan = null;
      finalizedPlan = null;
    }

    let presentationCanonicalPlan = canonicalPlan || targetPlanMutation?.canonicalPlan || null;
    const requestedRefinement = patchResultRef?.applied && presentationCanonicalPlan
      ? {
        ...(input.refinement || {}),
        changedDayNumbers: patchResultRef.touchedDayNumbers || [],
      }
      : null;
    const reconciledRefinement = requestedRefinement
      ? reconcileRefinementClaims({
        requestedChanges: requestedRefinement.changes,
        priorPlan: priorCanonicalPlanRef,
        nextPlan: presentationCanonicalPlan,
      })
      : null;
    const presentationRefinement = reconciledRefinement
      ? {
        changes: reconciledRefinement.acceptedChanges,
        changedDayNumbers: reconciledRefinement.changedDayNumbers.length
          ? reconciledRefinement.changedDayNumbers
          : (requestedRefinement.changedDayNumbers || []),
      }
      : requestedRefinement;
    if (reconciledRefinement) {
      content = alignRefinementProse({ text: content, reconciliation: reconciledRefinement });
      response = { ...(response || {}), kind: response?.kind || 'itinerary', text: content };
    }
    content = sanitizeTrailieCitations(content).content;
    if (response && typeof response.text === 'string') {
      response = { ...response, text: sanitizeTrailieCitations(response.text).content };
    }
    if (presentationCanonicalPlan && typeof presentationCanonicalPlan.intro === 'string') {
      let nextIntro = presentationCanonicalPlan.intro;
      if (reconciledRefinement) {
        nextIntro = alignRefinementProse({ text: nextIntro, reconciliation: reconciledRefinement });
      }
      nextIntro = sanitizeTrailieCitations(nextIntro).content;
      if (nextIntro !== presentationCanonicalPlan.intro) {
        presentationCanonicalPlan = { ...presentationCanonicalPlan, intro: nextIntro };
        if (canonicalPlan) canonicalPlan = presentationCanonicalPlan;
        if (targetPlanMutation?.canonicalPlan) {
          targetPlanMutation = { ...targetPlanMutation, canonicalPlan: presentationCanonicalPlan };
        }
      }
    }
    // Derived surfaces may only describe the saved plan revision. Stamp them
    // with the finalized hash; absent logistics stay pending rather than stale.
    const planHash = finalizedPlan?.itineraryHash
      || presentationCanonicalPlan?.itineraryHash
      || null;
    let derivedPublication = null;
    if (planHash && status === 'complete') {
      if (presentationCanonicalPlan && !presentationCanonicalPlan.itineraryHash) {
        presentationCanonicalPlan = { ...presentationCanonicalPlan, itineraryHash: planHash };
        if (canonicalPlan) canonicalPlan = presentationCanonicalPlan;
      }
      const warningItems = Array.isArray(finalizedPlan?.feasibilityIssues)
        ? finalizedPlan.feasibilityIssues
        : (Array.isArray(presentationCanonicalPlan?.feasibilityIssues)
          ? presentationCanonicalPlan.feasibilityIssues
          : null);
      const warnings = warningItems
        ? { planHash, items: warningItems }
        : { planHash, items: [] };
      const bound = bindDerivedSurfaces({
        planHash,
        travelLogistics,
        response,
        warnings,
      });
      travelLogistics = bound.travelLogistics;
      response = bound.response;
      if (response && typeof response.text === 'string') {
        content = response.text;
      }
      if (presentationCanonicalPlan) {
        presentationCanonicalPlan = {
          ...presentationCanonicalPlan,
          itineraryHash: planHash,
          feasibilityIssues: bound.warnings?.items || [],
        };
        if (canonicalPlan) canonicalPlan = presentationCanonicalPlan;
      }
      derivedPublication = {
        planHash,
        travelLogistics: travelLogistics ? 'ready' : 'pending',
        warnings: 'ready',
        answer: response?.planHash === planHash ? 'ready' : 'pending',
      };
    }
    const presentationEnvelope = {
      content,
      canonicalPlan: presentationCanonicalPlan,
      travelLogistics,
      responseArtifacts: null,
      intent: publicIntent,
      requestedSlices: logisticsNeeds,
      refinement: presentationRefinement,
    };
    const presentation = status === 'complete'
      ? buildPresentationManifest(presentationEnvelope)
      : null;
    if (presentation) {
      const validationResult = validatePresentationManifest(presentation, presentationEnvelope);
      if (!validationResult.valid) {
        throw Object.assign(new Error('presentation_manifest_invalid'), {
          code: validationResult.errors[0] || 'presentation_manifest_invalid',
        });
      }
    }
    const result = deepFreeze({
      version: EXECUTION_RESULT_VERSION,
      status,
      intent: publicIntent,
      // WP-TU Phase 3 Task 7B — additive only, alongside (never replacing)
      // the legacy activeTripContext/display.parkName fields built
      // upstream by activeTripContextService.js. Source is `planningState.
      // destination` — Task 7's already-synced, already-gated value (Task 4/
      // 7's preserve/set precedence). The client should not need to
      // reconstruct active state from `activeContextAction` itself; the
      // FINAL resulting destination for this turn is already right here.
      activeTripPresentation: {
        destination: (planningState?.destination?.parkCode || planningState?.destination?.parkName)
          ? {
            parkCode: planningState.destination.parkCode || null,
            parkName: planningState.destination.parkName || null,
          }
          : null,
        // Metadata only — genuinely useful for transition/debug visibility,
        // but NOT required for the frontend to render correctly (the
        // destination above is already the final, gated result).
        activeContextAction: intent?.tripContext?.activeContextAction || null,
      },
      // WP-TU Phase 4 Task 10 — the resolved plan-mutation target (Task 9's
      // resolver), when resolution reached `resolved`. Null on every turn
      // that never needed one, and null-but-terminal on `ambiguous`/
      // `not_found` (see the fail-closed gate above) — never a guess.
      targetTripId,
      // WP-TU Phase 4 Task 10D — additive only, alongside (never replacing)
      // `canonicalPlan`. Null on every turn except a fulfilled cross-plan
      // mutation, in which case `canonicalPlan` above is null and THIS is
      // where the hydrated target's patched, identity-stamped plan lives.
      targetPlanMutation,
      presentation,
      responseArtifacts: null,
      evidence,
      routeDecision: {
        selectedTier: routing.selectedTier || null,
        reasonCodes: boundedReasons(routing.reasonCodes),
        deterministic: routing.selectedTier === 'deterministic',
      },
      response,
      canonicalPlan,
      travelLogistics,
      derivedPublication,
      itineraryHash: finalizedPlan ? finalizedPlan.itineraryHash : null,
      attempts,
      latencyBreakdown,
      validation: effectiveValidation || { status: null, reasonCodes: [] },
      artifactFulfillment,
      terminalReason,
      telemetrySummary: {
        temporalResolutionStatus: frozenConstraints?.temporalResolution?.status || null,
        tripQuality: tripQualityDiagnostics,
        experienceDiagnostics,
        finalValidationSnapshot,
        finalReasonCodes:finalValidationSnapshot?.reasonCodes || [],
        validationHistory,
        coordinateResolution: { ...coordinateResolution },
        routeResolution: { ...routeResolution },
        // Configuration metadata only — lets a future regression be segmented by
        // strict on/off without inspecting prompts or plan content.
        createItineraryStrict: createItineraryStrictUsed,
        intent: intent ? intent.primaryIntent : null,
        coverage: evidence ? evidence.coverage : null,
        selectedTier: routing.selectedTier || null,
        attemptCount: attempts.length,
        retriedOrEscalated: attempts.some((a) => a.attemptKind !== 'primary'),
        // ZERO-DURATION MICRO-REPAIR. Deliberately NOT folded into attemptCount:
        // a micro-repair is a bounded sub-dispatch inside one attempt, and the
        // whole point of measuring it is to compare it against the full retry it
        // replaces. Counting it as an attempt would erase that comparison.
        // Ordered across every class. `attemptCount` still counts generation
        // attempts only — a sub-dispatch is work inside one, never a rung.
        subDispatches: subDispatchLog.slice(0, 12),
        zeroDurationRepairs: subDispatchLog
          .filter((r) => r.kind === 'zero_duration_micro_repair').slice(0, 8),
        anchorContainedRepairs: subDispatchLog
          .filter((r) => r.kind === 'missing_experience_anchor_repair').slice(0, 8),
        coverageContainedRepairs: subDispatchLog
          .filter((r) => r.kind === 'insufficient_day_coverage_repair').slice(0, 8),
        totalCost,
        // R2 — what attempt 1's construction catalogue was given and denied.
        operationalDirectives: operationalDirectivesTelemetry,
        // Bounded: outcome and which fields moved, never conversation content.
        semanticResolver: semanticTelemetry,
        liveBudget: liveBudget ? liveBudget.snapshot() : null,
        turnUnderstandingSource: intent?.understanding?.understandingSource
          || (intent ? 'deterministic' : null),
        // Bounded diagnostics: WHICH contract governed the turn and WHETHER the
        // promised artifact was delivered. No chain-of-thought, no prompts, no
        // supporting spans, no raw traveler language.
        executionContract: summarizeExecutionContract(executionContract),
        artifactFulfillment: {
          requested: artifactFulfillment.requested,
          required: artifactFulfillment.required,
          fulfilled: artifactFulfillment.fulfilled,
          degraded: artifactFulfillment.degraded,
          reasonCode: artifactFulfillment.reasonCode,
        },
        failureClasses: [...new Set(failureClasses)].slice(0, 6),
      },
    });
    if (status === 'complete') emit('response_finalized');
    else emit('error', { terminalReason });
    return result;
  }

  try {
    if (signal?.aborted) return cancelledResult();

    require('../utils/temporalState').assertTemporalConsistency(
      frozenConstraints?.planningState || inputPlanningState, frozenConstraints?.dates);

    // Phase 2 — intent.
    emit('response_started');
    // REAL LIFECYCLE STATE #1. Emitted at the transition, not on a timer: the
    // turn is now being understood. The product-stage name is used verbatim so
    // BOTH dialects carry it with no transport change — legacy passes the stage
    // string through, and v2 accepts it because it is already in PRODUCT_STAGES.
    emit('progress', { stage: 'understanding_request' });
    // Resolve semantic ambiguity before deriving job, scope, routing and the
    // artifact contract. All consumers see the same final understanding.
    let understanding = typeof semanticDispatch === 'function'
      ? require('./turnUnderstanding').buildTurnUnderstanding({ userPrompt: userMessage,
        priorTripState: frozenTripState, officialPlaces: officialPlaces || undefined }) : null;
    if (understanding && shouldResolveSemantically(understanding).eligible) {
      const resolved = await resolveTurnSemantically({ understanding, dispatch: semanticDispatch,
        activeDecision: frozenTripState?.activeDecision?.kind || frozenTripState?.lastTravelerJob || null,
        recentTurns: frozenHistory, resolvedEntities: resolvedContext?.resolvedEntities || [],
        travelerConstraints: frozenConstraints, now: () => nowAt.getTime(),
      });
      understanding = resolved.understanding;
      semanticTelemetry = resolved.telemetry;
    }
    intent = classifyIntent({ userPrompt: userMessage, priorTripState: frozenTripState,
      officialPlaces: officialPlaces || undefined, ...(understanding ? { understanding } : {}) });

    // WP-TU Phase 3 Task 6 — resolvedEntities is made a CONSUMER of the same
    // single authoritative classification tripScope already reads (Task 4),
    // computed once `intent` is final for this turn. Reassigning the local
    // `resolvedContext` binding here means every downstream read (evidence
    // planning, buildLogistics, resolveParkIdentityBinding, router signals)
    // sees the corrected entities automatically — see
    // applyResolvedEntitiesOverride for the two-rule contract. The inert
    // semantic-dispatch block above still reads the PRE-override baseline;
    // that path has never executed in production (see its own comment).
    resolvedContext = applyResolvedEntitiesOverride(resolvedContext, intent);

    // WP-TU Phase 4 Task 10 — targetTripId resolution (Task 9's pure,
    // read-only resolver). Consulted for every turn; the resolver itself
    // returns `not_required` immediately for a job that does not operate on
    // an existing plan (fresh build, ordinary Q&A), so this is a no-op for
    // those turns.
    const targetTripResolution = resolveTargetTripId({
      intent,
      candidatePlans: frozenCandidatePlans,
      activeTripId,
      priorTargetTripId: frozenTripState?.priorTargetTripId || null,
    });
    if (targetTripResolution.status === 'resolved') {
      targetTripId = targetTripResolution.targetTripId;
    }

    // WP-TU Phase 4 Task 10B — cross-plan HYDRATION ATTEMPT. A `resolved`
    // target that does not match the active trip attempts the single-document
    // fetch (real ownership/eligibility validation — see
    // targetPlanHydration.js) so the gate below can distinguish "that trip
    // genuinely can't be edited" from "that trip doesn't exist / isn't
    // yours / has no usable plan".
    //
    // WP-TU Phase 4 Task 10D — a SUCCESSFUL hydration now falls through
    // (does not return early) into the SAME generation/patch path an
    // active-trip refinement already uses — see `priorItineraryData` below,
    // which prefers `hydratedTargetPlan` over `frozenTripState`'s own
    // bindings ONLY for this turn. `frozenTripState`/`tripScope`/
    // `planningState` are never substituted — the active trip's own state
    // stays exactly what it was. `isCrossPlanTargetMutation` is the single
    // flag `finalize()` reads to route a fulfilled artifact to
    // `targetPlanMutation` instead of the active-trip `canonicalPlan`
    // channel. A FAILED hydration still fails closed exactly as Task 10B
    // built it — this is an extension of that gate's coverage, not a
    // weakening of it.
    let hydration = null;
    const needsCrossPlanHydration = targetTripResolution.status === 'resolved'
      && String(targetTripId) !== String(activeTripId);
    if (needsCrossPlanHydration) {
      if (typeof loadTargetPlan === 'function') {
        try {
          hydration = await loadTargetPlan({ tripId: targetTripId, userId });
        } catch (hydrationErr) {
          hydration = { ok: false, reason: 'error' };
        }
      } else {
        hydration = { ok: false, reason: 'hydration_unavailable' };
      }
    }
    const hydrationSucceeded = needsCrossPlanHydration
      && hydration?.ok === true
      && Boolean(hydration?.plan?.days?.length);
    if (hydrationSucceeded) {
      hydratedTargetPlan = hydration.plan;
      hydratedTargetMeta = {
        tripId: targetTripId,
        parkCode: hydration.parkCode || null,
        parkName: hydration.parkName || null,
        // WP-TU Phase 4 Task 12 — the target's REAL current canonical
        // identity (`targetPlanHydration.js`'s `priorCanonicalIdentity`,
        // resolved with the IDENTICAL plan-then-conversation precedence
        // `resolveCanonicalWriteTarget` uses for validating a write) — NOT
        // `hydration.plan?.responseVersion` directly. This module stays
        // completely ignorant of conversation shape: it only ever reads
        // this one plain number, never `hydration.plan.conversation`, never
        // calls `latestCanonicalAssistantTarget` itself. `null` (a truly
        // virgin target) correctly floors at 0, so the next write becomes
        // version 1 — the same fallback as before Task 12, now reached
        // deliberately rather than by conflating it with every other case.
        priorResponseVersion: Number(hydration.priorCanonicalIdentity?.responseVersion) || 0,
      };
      isCrossPlanTargetMutation = true;
    }

    // FAIL CLOSED — the one non-negotiable invariant. `ambiguous`/`not_found`
    // must never fall through to patching whatever plan happens to be loaded
    // as if it were the resolved target. A `resolved` cross-plan target
    // whose hydration did NOT succeed is ALSO gated here — a genuinely
    // successful hydration is the one case that now falls through instead
    // (see above). `targetTripId` is still recorded on the terminal result
    // whenever resolution reached `resolved`, so the NEXT turn's continuity
    // input (`priorTargetTripId`) still recovers the correct target.
    if (
      targetTripResolution.status === 'ambiguous'
      || targetTripResolution.status === 'not_found'
      || (needsCrossPlanHydration && !hydrationSucceeded)
    ) {
      const crossPlanResolved = needsCrossPlanHydration;
      return finalize({
        status: 'plan_target_unresolved',
        terminalReason: crossPlanResolved
          ? 'plan_target_hydration_failed'
          : `plan_target_${targetTripResolution.status}`,
        validation: {
          status: 'blocked',
          reasonCodes: [
            targetTripResolution.reasonCode,
            crossPlanResolved ? (hydration?.reason || null) : null,
          ].filter(Boolean),
        },
        response: {
          kind: 'text',
          text: targetTripResolution.status === 'ambiguous'
            ? "I found more than one saved trip that could match — tell me which one (or open it directly) so I don't change the wrong plan."
            : crossPlanResolved
              ? "I found that saved trip, but couldn't load it to make this change — nothing was changed."
              : "I couldn't find a saved trip for that — nothing was changed.",
        },
      });
    }

    // Phase 2c — the execution contract. From here on, downstream stages read
    // THIS for artifact/structure ownership. Legacy intent still drives topical
    // routing and evidence hints; it may not contradict canonical semantics.
    executionContract = intent?.executionContract || deriveExecutionContract({
      understanding: intent?.understanding || null,
      travelerJob: intent?.travelerJob || null,
      legacy: intent
        ? {
          primaryIntent: intent.primaryIntent,
          depth: intent.depth,
          verticals: intent.verticals,
          structurePolicy: intent.structurePolicy,
        }
        : null,
      hasPriorPlan: isAcceptedCanonicalPlan(hydratedTargetPlan)
        || isAcceptedCanonicalPlan(frozenTripState?.existingCanonicalPlan)
        || (frozenTripState?.hasItinerary === true
          && !frozenTripState?.existingCanonicalPlan
          && !hydratedTargetPlan),
    });

    // Sufficiency authority: clarify before expensive evidence / model work.
    if (executionContract.clarificationNeeded === true) {
      const gaps = (executionContract.materialMissingInformation || [])
        .map((g) => g?.concept)
        .filter(Boolean);
      const focus = gaps[0] === 'destination'
        ? 'which destination you want planned'
        : gaps[0] === 'trip_length'
          ? 'how many days you want'
          : gaps[0]
            ? gaps[0].replace(/_/g, ' ')
            : 'the one detail that would change this committed plan';
      return finalize({
        status: 'complete',
        terminalReason: 'sufficiency_clarify_before_plan',
        validation: {
          status: 'pass',
          reasonCodes: ['sufficiency_clarify_blocks_artifact', ...(executionContract.reasonCodes || [])],
        },
        response: {
          kind: 'text',
          text: `Before I lock a day-by-day plan, I need ${focus}. What should I use?`,
        },
      });
    }

    // Patch without an accepted canonical plan: draft skeletons are intent only.
    if (executionContract.patchRequested && !executionContract.patchExecutable) {
      return finalize({
        status: 'complete',
        terminalReason: 'patch_without_accepted_plan',
        validation: {
          status: 'pass',
          reasonCodes: ['patch_without_prior_plan'],
        },
        response: {
          kind: 'text',
          text: "There isn't a saved day-by-day itinerary to edit yet — only planning intent. Tell me the trip shape you want and I'll build a real plan first, then we can redo individual days.",
        },
      });
    }

    // Phase 3 — evidence planning (no provider choice here).
    const endPlanning = timeline.begin('evidence_planning');
    const requirements = frozenConstraints?.temporalResolution?.conversationalOnly ? [] : planRequirements({
      turnId,
      userPrompt: userMessage,
      intent,
      resolvedEntities: resolvedContext?.resolvedEntities || [],
      dates: resolvedContext?.dates || null,
      priorTripState: frozenTripState,
      constraints: frozenConstraints,
      now: nowAt,
      timezone: resolvedContext?.timezone || 'UTC',
    });
    endPlanning();

    if (signal?.aborted) return cancelledResult();

    // REAL LIFECYCLE STATE #2. Named from the requirements this turn actually
    // planned, so the copy describes work in flight rather than a generic
    // "looking things up". One stage, not four: the traveler is told the most
    // decision-critical thing being fetched, not given a tour of the broker.
    if (requirements.length > 0) {
      emit('progress', { stage: evidenceStageFor(requirements) });
    }

    // Phase 4 — evidence resolution (EXACTLY ONCE). Frozen for the whole lifecycle.
    let bundle;
    if (requirements.length === 0) {
      const { buildEvidenceBundle } = require('../utils/evidenceBundle');
      bundle = buildEvidenceBundle({ requestId: turnId, resolutions: [], candidates: [] });
    } else {
      if (typeof resolveEvidence !== 'function') {
        throw Object.assign(new Error('resolveEvidence dependency required'), { code: 'evidence_resolver_missing' });
      }
      const endEvidence = timeline.begin('evidence_resolution');
      try {
        bundle = await resolveEvidence({
          requirements, requestId: turnId, signal,
          beginSpan: (stage, meta) => timeline.begin(stage, meta),
        });
      } finally {
        endEvidence();
      }
    }
    const frozenBundle = deepFreeze(bundle); // buildEvidenceBundle already freezes; idempotent.

    if (signal?.aborted) return cancelledResult();

    const gate = evaluateEvidenceGate(requirements, frozenBundle);
    evidence = evidenceSummary(frozenBundle, gate.coverage);
    emit('evidence_ready', {
      coverage: evidence.coverage,
      freshness: evidence.freshness,
      publicSources: evidence.publicSources || [],
    });

    // A missing official record annotates the answer. It does not erase a
    // trip the traveler already stated. Live safety topics still stop the
    // turn before the model can invent an open road or a clear trail.
    const liveEvidenceGaps = nonTerminatingEvidenceGaps(gate);
    if (!gate.hardComplete && evidenceGapTerminatesTurn(gate)) {
      return finalize({
        status: 'evidence_incomplete',
        terminalReason: 'evidence_incomplete',
        validation: { status: 'blocked', reasonCodes: gate.unmetHardReasons },
      });
    }

    // After Maps (or other) driving_time is satisfied: a single mandatory adjacent
    // leg whose verified duration exceeds maxDailyDriveMinutes cannot be solved by
    // GPT inventing a shorter drive. Fail closed before model generation.
    const verifiedDriveLegs = extractDrivingLegsFromEvidenceBundle(frozenBundle);
    // WP-TU Phase 2 Task 4 — tripScope is a CONSUMER of the single
    // authoritative classification (`intent`, computed once above), never an
    // independent raw-message destination resolver. See
    // syncTripScopeDestinationFromIntent for the full contract.
    const tripScope = syncTripScopeDestinationFromIntent(
      frozenConstraints?.tripScope
        || frozenPlanningState?.tripScope
        || frozenTripState?.tripScope
        || null,
      intent,
    );
    // WP-TU Phase 3 Task 7 — planningState is a CONSUMER of the same
    // authoritative classification, exactly parallel to tripScope above. One
    // seam covers both downstream consumers (resolveNeeds/buildLogistics)
    // automatically. See syncPlanningStateDestinationFromIntent.
    planningState = syncPlanningStateDestinationFromIntent(frozenPlanningState, intent);
    logisticsNeeds = resolveNeeds({
      planningState,
      tripState: frozenTripState,
      intent,
      messageText: userMessage,
      tripScope,
    });
    travelLogistics = await buildLogistics({
      planningState,
      tripState: frozenTripState,
      constraints: frozenConstraints,
      intent,
      messageText: userMessage,
      tripScope,
      routeLegEvidence: verifiedDriveLegs,
      resolvedEntities: resolvedContext?.resolvedEntities || [],
      park: resolvedContext?.primaryPark || null,
      npsCampgrounds: resolvedContext?.npsCampgrounds,
      signal,
      logisticsNeeds,
    }, logisticsDeps);
    const routeCapIssues = evaluateRouteLegsAgainstDailyDriveCap({
      tripScope,
      drivingLegs: verifiedDriveLegs,
      maxDailyDriveMinutes:
        tripScope?.maxDailyDriveMinutes ?? frozenConstraints?.maxDailyDriveMinutes ?? null,
    });
    if (routeCapIssues.length > 0) {
      const reasonCodes = routeCapIssues.map((issue) => issue.reasonCode);
      return finalize({
        status: 'constraint_infeasible',
        terminalReason: 'route_leg_exceeds_daily_drive_cap',
        validation: { status: 'blocked', reasonCodes },
        response: {
          kind: 'text',
          text: buildRouteLegCapInfeasibleMessage(routeCapIssues, tripScope),
        },
      });
    }

    // Phase 5/6 — build the single frozen Prompt-v2 snapshot for the whole turn.
    // ARTIFACT ESCALATION CEILING. A legacy classification may influence topical
    // reasoning and model routing, but it may NOT put the turn into structured
    // itinerary generation when the canonical contract asked for a plain answer
    // or forbade the artifact outright. This is the structural reason the
    // architect token budget is never reached by a prose request — not a bigger
    // budget, and not a retry-count change.
    const requestedMode = isPriorityContingencyAdvice(userMessage)
      ? 'buddy'
      : intentToPromptMode(intent);
    const mode = (isItineraryMode(requestedMode) && !executionContract.allowsCanonicalPlanArtifact)
      ? 'buddy'
      : requestedMode;
    // R1/R2 (reliability pass 2026-09-01) — machine-composed operational
    // consequences from the FROZEN bundle, resolved for THIS traveler, handed
    // to generation BEFORE attempt 1. The same facts the traveler-fit and
    // exposure vetoes read after generation; composing them here is how the
    // first attempt stops learning them from its own rejection. Itinerary
    // modes only, and null on ordinary turns — no rule, no block.
    const operationalDirectives = isItineraryMode(mode)
      ? composeOperationalGenerationDirectives({
        evidenceBundle: frozenBundle,
        constraints: frozenConstraints,
        userPrompt: userMessage,
      })
      : null;
    operationalDirectivesTelemetry = operationalDirectives
      ? {
        hardProhibitionCount: operationalDirectives.hardProhibitions.length,
        obligationCount: operationalDirectives.obligations.length,
        exposure: operationalDirectives.exposure
          ? {
            armed: true,
            confirmedLowNames: operationalDirectives.exposure.confirmedLowNames.slice(0, 8),
            catalogueRemovedCandidateCount:
              operationalDirectives.exposure.ineligibleEvidenceIds.length,
          }
          : null,
      }
      : null;
    // Phase 7 — router signals (the router owns ALL model rules).
    const deterministicRender = resolveDeterministicRender({ resolvedContext, intent, bundle: frozenBundle });
    routeSignals = deriveRouterSignals({
      intent,
      coverage: gate.coverage,
      tripDays: resolvedContext?.tripDays ?? null,
      destinationCount: resolvedContext?.destinationCount
        ?? (intent.entities || []).filter((e) => e.type === 'destination').length,
      hardConstraintCount: countHardConstraints(frozenConstraints),
      deterministicRender,
    });

    const itinerary = isItineraryMode(mode);
    // SERVER-KNOWN PARK IDENTITY. Resolved once, before the turn dispatches, and
    // null unless this is an unambiguous single-destination turn. Null keeps the
    // existing model-authored behavior on every other shape.
    const parkIdentityBinding = itinerary
      ? resolveParkIdentityBinding(resolvedContext)
      : null;
    // WP-TU Phase 4 Task 10D — the EFFECTIVE prior-plan input for this turn.
    // `hydratedTargetPlan` wins ONLY on a fulfilled cross-plan turn
    // (`isCrossPlanTargetMutation`); every active-trip turn is completely
    // unaffected since `hydratedTargetPlan` stays null for it. This is the
    // ONLY seam a hydrated target enters generation through — nothing else
    // downstream (tripScope, planningState, evidence, logistics) reads it.
    const priorItineraryData = hydratedTargetPlan
      || frozenTripState?.existingCanonicalPlan
      || frozenTripState?.canonicalPlan
      || frozenTripState?.itineraryData
      || null;
    priorCanonicalPlanRef = priorItineraryData;
    const isRefinement = intent?.primaryIntent === 'trip_refinement'
      || executionContract.patchRequested;
    const priorIsAccepted = isAcceptedCanonicalPlan(priorItineraryData);
    const usePlanPatch = Boolean(
      itinerary
      && isRefinement
      && priorIsAccepted
      && !isExplicitPlanRestructure(userMessage)
    );

    // PHASE 9C.1D.5B — EXPLICIT NAMED EXPERIENCES. Extracted from the traveler's
    // own words and resolved against the FROZEN bundle — the turn's full
    // authoritative candidate universe (store queries are uncapped; only the
    // prompt render is capped, and resolved identities are pinned into it).
    // New-itinerary generation only: patch turns keep their own scope contract.
    const namedExperienceRequirements = (itinerary && !usePlanPatch)
      ? resolveNamedExperienceRequirements({
        requests: extractNamedExperienceRequests(userMessage, {
          officialIndex: buildOfficialPlaceIndex(frozenBundle?.evidence || []),
          parkCodes: [
            parkIdentityBinding?.parkCode,
            ...(intent?.understanding?.subjectDestinations || []).map((d) => d.parkCode),
          ].filter(Boolean),
        }),
        evidenceBundle: frozenBundle,
        excludedEvidenceIds: operationalDirectives?.exposure?.ineligibleEvidenceIds || [],
        // Phase 9C.1D.5C-D — `same_as` authority is re-validated from this frozen
        // bundle against the CURRENT server trust list and this turn's clock.
        trustedReviewerIds: getTrustedRelationshipReviewers(),
        now: nowAt,
      })
      : [];
    const blockedNamedExperiences = namedExperienceRequirements
      .filter((requirement) => requirement.status !== 'resolved');
    if (blockedNamedExperiences.length > 0) {
      // Fail closed BEFORE any paid dispatch: no attempt can satisfy a named
      // experience with no authoritative identity, and asking one to try is how
      // the 9C.1D.4 run substituted Bridalveil for Mist Trail.
      return finalize({
        status: 'constraint_infeasible',
        terminalReason: 'requested_experience_unavailable',
        validation: {
          status: 'blocked',
          reasonCodes: boundedReasons([...new Set(blockedNamedExperiences.map((requirement) => (
            requirement.status === 'ineligible' ? 'requested_experience_ineligible' : 'requested_experience_unavailable'
          )))]),
        },
        response: {
          kind: 'text',
          text: buildRequestedExperienceUnavailableMessage(blockedNamedExperiences),
        },
      });
    }

    promptSnapshot = buildPrompt({
      mode,
      evidenceBundle: frozenBundle,
      requirements,
      tripState: frozenTripState,
      constraints: frozenConstraints,
      history: frozenHistory,
      userRequest: userMessage,
      ...(liveEvidenceGaps.length > 0 ? { evidenceAnnotations: liveEvidenceGaps } : {}),
      operationalDirectives,
      ...(namedExperienceRequirements.length > 0 ? { namedExperienceRequirements } : {}),
      ...(intent?.understanding?.comparisonSelectionRequired
        ? {
          comparisonSelection: comparisonSelectionPromptBlock({
            required: true,
            candidates: candidatesFromUnderstanding(intent.understanding),
          }),
        }
        : {}),
      ...(intent?.understanding?.actionableContingencyRequired
        ? {
          actionableContingency: actionableContingencyPromptBlock({
            required: true,
            candidates: buildBackupCandidateContext({
              bundle: frozenBundle,
              userPrompt: userMessage,
              maxCandidates: 8,
            }).candidates,
          }),
        }
        : {}),
      ...(usePlanPatch ? { refinementRequest: { plan: priorItineraryData, constraints: frozenConstraints, userRequest: userMessage } } : {}),
    });

    // Refinement structural ops authorize against the packed replacement
    // registry (R*), never support-only evidence that was merely readable.
    const packedStructural = usePlanPatch && Array.isArray(promptSnapshot?.evidence?.structuralCandidates)
      ? promptSnapshot.evidence.structuralCandidates
      : null;
    const cataloguePlaces = buildEvidenceBoundRepairCandidates({
      bundle: frozenBundle, constraints: frozenConstraints, requireExperiential: false, limit: 80,
      requireExecutablePrimary: usePlanPatch,
    });
    const eligiblePlaces = packedStructural !== null
      ? {
        ok: packedStructural.length > 0,
        candidates: packedStructural,
        count: packedStructural.length,
        fingerprint: hashPayload(packedStructural.map((c) => [c.ref, c.placeKey])),
        reasonCodes: [],
        audit: cataloguePlaces.audit,
      }
      : cataloguePlaces;
    const eligibilityInstruction = itinerary && eligiblePlaces.audit.excludedHardConstraint > 0
      ? `Hard traveler constraints apply to every new stop, including repairs. Select only from these evidence-qualified places: ${eligiblePlaces.candidates.map(c => {
        const access = (frozenBundle?.evidence || []).find(row => row.claim?.normalizedValue?.name === c.canonicalName && row.claim?.normalizedValue?.wheelchairAccessible === true);
        return c.canonicalName + (access ? ` (${access.claim.normalizedValue.accessibility}; source: ${access.source?.url})` : '');
      }).join('; ')}. Do not certify unknown accessibility, exposure or walking distance. Preserve all canonical traveler facts on edits.`
      : '';

    // MACHINE-OWNED TARGET. The traveler's reference is resolved here, once,
    // against the real persisted plan — not asked of the model. Two live runs
    // failed because the execution layer knew the stop was `mauna-loa-road`
    // and still made the model re-author that identity.
    const refinementScope = usePlanPatch
      ? resolveRefinementScope({
        text: userMessage,
        priorPlan: priorItineraryData,
        planDayCalendarBindings: planningState?.planDayCalendarBindings || [],
        now: now(),
        tripState: { planningState, lodging: planningState?.lodging || null },
      })
      : null;
    // Resolved once, here, from the persisted plan — before any dispatch.
    const refinementTarget = describeRefinementTarget(refinementScope);
    // WP-TU §12 — structured output is required only when the traveler asked
    // for the artifact. A refinement of an existing plan is always structural.
    // When the ceiling has ruled out canonical-plan generation entirely, no
    // structure can be "required" of this attempt; the required-artifact
    // invariant is enforced once, at the exit funnel, by artifact fulfillment.
    const structurePolicy = itinerary
      ? ((usePlanPatch || executionContract.requiresCanonicalPlanArtifact)
        ? 'required'
        : (intent?.structurePolicy === 'required' ? 'required' : 'preferred'))
      : 'optional';
    let terminalValidation = { status: null, reasonCodes: [] };
    let terminalResponse = null;
    // WP-TU §13 — a prose candidate that already passed truth/safety validation,
    // kept only in case every structured attempt fails for structural reasons.
    let safeProseFallback = null;
    let structuralOnlyFailures = true;
    // Actionable retry text for the NEXT attempt (closure; routing only forwards
    // reasonCodes). Built deterministically — never invents place names.
    let lastRepairInstructions = '';
    // MONOTONIC REPAIR (P0-E). One ledger per turn, carrying the cumulative
    // acceptance contract rather than the latest error. Before this, both the
    // router's `repairReasonCodes` and `lastRepairInstructions` were REPLACED
    // each attempt, so attempt 3 could not know what attempt 1 had already got
    // right — which is exactly how the 2026-08-24 Canyonlands ladder put every
    // duration back to 0 after attempt 2 had fixed them.
    const repairLedger = createRepairLedger({
      constraints: frozenConstraints,
      userPrompt: userMessage,
      namedExperienceRequirements,
    });
    // ROLLOUT SEGMENTATION (config metadata, not turn state). Recorded at the
    // moment the tool is built, so telemetry reports what the dispatch actually
    // used rather than what the flag happens to say when telemetry is assembled.
    // Null on turns that never build the tool at all.
    const planStageCapture = makePlanStageCapturer({
      runId: String(process.env.TRAILIE_EVAL_PLAN_CAPTURE_RUN_ID || 'local-v2'),
    });

    // Phase 9/12 — drive the WP9 lifecycle (deterministic / retry / escalation).
    const routing = await runModelRouting({
      enabled: true,
      signal,
      context: { signals: routeSignals },

      // Deterministic branch — same canonical result shape, zero model dispatch.
      renderDeterministic: async () => {
        const text = String(deterministicRender.text || '');
        terminalResponse = { kind: 'deterministic', text };
        terminalValidation = { status: 'pass', reasonCodes: [] };
        emit('prose_ready');
        return { kind: 'deterministic', text };
      },

      // One adapter invocation == one visible attempt (maxRetries:0 authoritative).
      executeAttempt: async ({ route, attempt, retry, repairReasonCodes }) => {
        // Attempt identity comes from the routing ladder itself. This boundary
        // lets downstream presentation replace rejected provisional prose
        // without inferring retries from text, timing, or validation details.
        emit('attempt_started', { attempt });
        // The model half of the attempt window. Everything else inside that
        // window is deterministic work measured under `artifact_validation`.
        const endGeneration = timeline.begin('generation');
        providerDispatchSeq += 1;
        const dispatchRow = {
          attempt,
          action: 'generation',
          purpose: attempt === 1 ? 'primary_generation' : retry ? 'generation_retry' : 'escalation',
          dispatchIndex: providerDispatchSeq,
          tier: route?.tier || null, model: route?.model || null,
          dispatchStartedAtMs: Date.now(), firstEventAtMs: null, completedAtMs: null,
          outputTokens: null,
          // ARTIFACT CLOCK (see modelLatencyAnatomy). `firstEventAtMs` is
          // stream-open, not first token; these separate the two so the shape of
          // the ~18s production window is observable instead of assumed.
          responseCreatedAtMs: null,
          firstTextDeltaAtMs: null,
          firstToolArgumentDeltaAtMs: null,
          lastToolArgumentDeltaAtMs: null,
          toolArgumentDeltaCount: null,
          toolArgumentBytes: null,
          toolArgumentSamples: null,
          toolArgumentSamplesTruncated: false,
        };
        // Byte COUNTS only — the delta string is never passed in, so plan
        // content has no path into telemetry.
        const toolArgumentStream = createToolArgumentStreamRecorder({
          dispatchStartedAtMs: dispatchRow.dispatchStartedAtMs,
        });
        // SHADOW ONLY. Answers "when does Day 1 exist", nothing else. Its output
        // is never consumed as plan data, never persisted, never emitted, and
        // never handed to a validator — a structurally complete streamed day is
        // not a validated day. See utils/shadowStreamStructure.js.
        const shadowStructure = createShadowStructureTracker({
          dispatchStartedAtMs: dispatchRow.dispatchStartedAtMs,
        });
        modelDispatches.push(dispatchRow);
        try {
        if (typeof onAttemptContext === 'function') {
          onAttemptContext({
            attempt, retry,
            promptSnapshot, evidenceBundle: frozenBundle,
            tripState: frozenTripState, constraints: frozenConstraints,
          });
        }
        // Emit before the provider stream so clients see activity ahead of deltas.
        // REAL LIFECYCLE STATE #3, and the one that sits across the long wait.
        // On a refinement the deterministically-resolved target rides with it, so
        // the traveler reads "Adjusting the second morning…" instead of a generic
        // label — true before the model answers, and unfalsifiable by the patch
        // it eventually proposes.
        emit('progress', {
          stage: itinerary ? 'building_structured_itinerary' : 'writing_response',
          ...(refinementTarget ? { refinementTarget } : {}),
        });
        // EVERY attempt after the first carries the validator contract — not only
        // same-model retries. `retry` is false on escalation, so gating on it
        // sent the Sol attempt out completely blind: on 2026-08-24 attempt 3
        // received no feedback at all and regenerated the defect attempt 2 had
        // already fixed.
        const repairText = attempt > 1
          ? (lastRepairInstructions
            || (repairReasonCodes?.length
              ? `Repair only these validated violations: ${repairReasonCodes.join(', ')}.`
              : ''))
          : '';
        const requireAlternatives = userRequestsBackupPlan(userMessage);
        // TIER-1 GENERATION CONTRACT. The model is asked for a smaller artifact;
        // `bindGeneratedItineraryContract` restores the canonical shape below,
        // before any consumer runs. Park identity is only withheld from the model
        // when the server resolved exactly one destination — a multi-park plan
        // still authors its own stop-level identity.
        const itineraryTool = usePlanPatch
          ? buildBoundRepairTool(PATCH_ITINERARY_TOOL, eligiblePlaces.candidates)
          : getCreateItineraryTool({
            requireAlternatives,
            reduced: true,
            // BENCHMARK SWITCH, default off. Scoped to create_itinerary only:
            // the patch tool above is a different schema object and never sees
            // this. Strict constrains SHAPE; every value-level validator and the
            // repair ladder remain authoritative.
            strict: (createItineraryStrictUsed = createItineraryStrictEnabled()),
            bindParkIdentity: Boolean(parkIdentityBinding),
            // Measurement lever, default off. Dropping coordinates costs the
            // 7.3% of stops whose model-supplied position the known-stop
            // catalog cannot reproduce — and with it their map pin.
            bindCoordinates: process.env.TRAILIE_TIER1_BIND_COORDINATES === '1',
          });
        // One source for the patch contract: the generator is told the same
        // rules `applyPlanPatch` enforces, before attempt 1 rather than through
        // a repair instruction after it.
        const patchInstruction = usePlanPatch
          ? [PATCH_GENERATION_INSTRUCTION,
            'For every new or replacement place, including stops in update_day, supply placeRef from this eligible catalogue. Never invent a place. Existing places may keep their exact identity. Removal is allowed without replacement when the day remains useful. Catalogue: ' + JSON.stringify(eligiblePlaces.candidates.map(({ ref, canonicalName, canonicalType, evidenceIds }) => ({ ref, name: canonicalName, type: canonicalType, evidenceIds }))),
            renderRefinementTargetForPrompt(refinementScope),
            require('../utils/canonicalMutationContext').canonicalMutationContext({
              plan: priorItineraryData, facts: frozenPlanningState, mutation: userMessage,
            }),
            isLighterRefinementRequest(userMessage) ? 'The traveler explicitly wants a lighter day. Prefer shortening the existing outing or removing a stop; a short named experience is sufficient for this edited day. Do not add filler or borrow experiences from untouched days to meet a full-day duration target.' : '']
            .filter(Boolean).join('\n\n')
          : '';
        // ONE tier-aware source for the ceiling; the guard below reads the same
        // object rather than recomputing it.
        const outputBudget = resolveOutputBudget({ itinerary, tier: route.tier });
        const request = createRequest({
          provider: route.provider,
          model: route.model,
          requestMetadata: { purpose: dispatchRow.purpose },
          instructions: [itinerary && !usePlanPatch ? PUSHBACK_INSTRUCTION : '', eligibilityInstruction, patchInstruction, repairText].filter(Boolean).join('\n'),
          // WP7 cache design: the public prefix is sent once as the cached
          // developer breakpoint (by the adapter) and the private suffix as the
          // user input — NOT the full combined prompt, which would duplicate the
          // public core + evidence in every request.
          input: [{ role: 'user', content: promptSnapshot.privateSuffix }],
          maxOutputTokens: outputBudget.requestMaxOutputTokens,
          tools: itinerary ? (usePlanPatch ? [itineraryTool] : [itineraryTool, TRIP_PUSHBACK_TOOL])
            : (require('../utils/structuredTravelerGuidance').needsStructuredGuidance(frozenConstraints) ? [require('../utils/structuredTravelerGuidance').GUIDANCE_TOOL] : []),
          toolChoice: !itinerary && require('../utils/structuredTravelerGuidance').needsStructuredGuidance(frozenConstraints)
            ? { name: 'respond_with_guidance' } : null,
          reasoning: route.reasoningEffort ? { effort: route.reasoningEffort } : null,
          promptCaching: { mode: 'explicit', ttl: '30m', publicPrefix: promptSnapshot.publicPrefix },
        });
        // WP12 Phase 3.5 — live Responses stream. Only provider-neutral
        // `text_delta` becomes product `content_delta` (progressive UX).
        // Tool-argument deltas stay adapter-local. WP11A never sees OpenAI-native
        // event names. Rejected retry text is a known rare edge; validation still
        // owns the terminal content string.
        // PRE-DISPATCH BUDGET GUARD. A cap checked only between turns is not a
        // cap: on 2026-08-18 a $0.12 run spent $0.1996 because three attempts
        // escalated inside one turn. Refusing here is fail-closed on purpose —
        // it never relaxes validation, and fulfillment stays honest.
        let budgetTicket = null;
        if (liveBudget) {
          const promptChars = String(promptSnapshot?.publicPrefix || '').length
            + String(promptSnapshot?.privateSuffix || '').length;
          const verdict = liveBudget.assess({
            provider: route.provider,
            model: route.model,
            // Deliberately generous: ~3 chars/token overestimates the input.
            inputTokenEstimate: Math.ceil(promptChars / 3),
            // `createResponsesRequest` returns a frozen object that NESTS this
            // under `generation`. Reading it flat yielded undefined, priced the
            // output term at zero, and made the "upper bound" understate actual
            // cost on every dispatch. Fall back to the same constant the request
            // was built from so a future shape change cannot silently zero it.
            maxOutputTokens: request.generation?.maxOutputTokens
              ?? outputBudget.requestMaxOutputTokens,
            // `attempt` is the ladder's own counter, already destructured above.
            // Reading `routing` here is a temporal-dead-zone error: this callback
            // runs INSIDE the runModelRouting call whose result initialises it.
            attemptNumber: attempt,
          });
          if (!verdict.dispatchAllowed) {
            const blocked = new Error('live budget guard refused this dispatch');
            blocked.code = verdict.blockReason;
            throw blocked;
          }
          budgetTicket = verdict.ticket;
        }
        const providerAdapter = responseAdapters[request.provider];
        const canStream = streamGeneration && (
          typeof providerAdapter?.stream === 'function'
          || Object.prototype.hasOwnProperty.call(deps, 'streamResponses')
        );
        dispatchRow.dispatched = true;
        const result = canStream
          ? await streamResponses(request, {
            adapters: responseAdapters,
            signal,
            onEvent: (event) => {
              const at = Date.now();
              if (dispatchRow.firstEventAtMs == null) dispatchRow.firstEventAtMs = at;
              // MEASURE THE ARTIFACT STREAM, DO NOT FORWARD IT. Tool-argument
              // deltas are how the itinerary actually arrives, and they have
              // always reached this callback and been discarded. They are now
              // timed and sized here and go NO FURTHER: nothing plan-shaped may
              // reach the client before validation accepts it, so there is
              // deliberately no `emit` on this branch.
              if (event?.type === 'tool_argument_delta') {
                if (dispatchRow.responseCreatedAtMs == null && dispatchRow.firstEventAtMs === at) {
                  // Defensive: a stream that never sent `response.created`.
                  dispatchRow.responseCreatedAtMs = at;
                }
                const size = typeof event.delta === 'string' ? Buffer.byteLength(event.delta, 'utf8') : 0;
                toolArgumentStream.record(size, at);
                shadowStructure.consume(event.delta, at);
                return;
              }
              if (event?.type === 'start') {
                if (dispatchRow.responseCreatedAtMs == null) dispatchRow.responseCreatedAtMs = at;
                return;
              }
              if (event?.type !== 'text_delta') return;
              if (dispatchRow.firstTextDeltaAtMs == null) dispatchRow.firstTextDeltaAtMs = at;
              const content = typeof event.delta === 'string' ? event.delta : '';
              if (content) emit('content_delta', { content });
            },
          })
          : await executeResponses(request, { adapters: responseAdapters, signal });
        dispatchRow.completedAtMs = Date.now();
        Object.assign(dispatchRow, toolArgumentStream.seal());
        dispatchRow.shadowStructure = shadowStructure.snapshot();
        const usage = mapResponsesUsage(result.usage);
        dispatchRow.outputTokens = Number.isFinite(usage?.outputTokens) ? usage.outputTokens : null;
        const cost = priceCall({ provider: route.provider, model: route.model, usage: result.usage, at: nowAt });
        if (liveBudget) liveBudget.record({ ticket: budgetTicket, costUsd: cost.costUsd, costStatus: cost.costStatus });
        return {
          output: buildAttemptOutput({
            bundle: frozenBundle, constraints: frozenConstraints,
            result,
            itinerary,
            normalizeTool,
            usePlanPatch,
          }),
          usage,
          costStatus: cost.costStatus,
          costUsd: cost.costUsd,
          costComponents: cost.components || null,
          // OUTPUT-INCOMPLETE DIAGNOSTICS. Counts only — never chain-of-thought
          // content. Without these, "the artifact did not fit" and "the model
          // had nothing to say" are indistinguishable in a live report.
          outputPolicy: Object.freeze({
            maxOutputTokens: outputBudget.requestMaxOutputTokens,
            artifactOutputBudgetTokens: outputBudget.artifactOutputBudgetTokens,
            reasoningHeadroomTokens: outputBudget.reasoningHeadroomTokens,
          }),
          completion: Object.freeze({
            status: result.completionStatus || null,
            incompleteReason: result.stopReason === 'max_tokens'
              ? 'max_output_tokens'
              : (result.stopReason || null),
          }),
        };
        } finally {
          endGeneration();
        }
      },

      // Deterministic validation/finalization — the model output is a candidate
      // until this accepts it. The LLM cannot override official evidence, hard
      // constraints, feasibility, or TripPlan schema.
      validateAttempt: async ({ generation, route, attempt }) => {
        // The attempt window has always been reported as "generation". Most of
        // what happens here — finalizeItinerary, the Maps route bridge,
        // completeness, traveler fit — is deterministic work, and separating it
        // is the whole point of measuring before optimizing.
        // REAL LIFECYCLE STATE #4. The validation span is short (78 ms on the
        // 2026-08-27 THRO run), so on a clean turn this barely registers — but on
        // a repair ladder the building -> validating -> building cycle is the
        // only honest signal that work is still being redone. It names the
        // product stage, never the attempt, tier, or that a retry happened.
        emit('progress', { stage: 'validating_trip' });
        const endValidation = timeline.begin('artifact_validation');
        const validationArgs = {
          output: generation.output,
          itinerary,
          bundle: frozenBundle,
          constraints: frozenConstraints,
          userPrompt: userMessage,
          priorItineraryData,
          refinementScope,
          isRefinement,
          usePlanPatch,
          repairCandidates: usePlanPatch ? eligiblePlaces.candidates : null,
          structurePolicy,
          parkIdentityBinding,
          excludedEvidenceIds: operationalDirectives?.exposure?.ineligibleEvidenceIds || [],
          exposureDirective: operationalDirectives?.exposure || null,
          namedExperienceRequirements,
          comparisonSelection: {
            required: intent?.understanding?.comparisonSelectionRequired === true,
            candidates: candidatesFromUnderstanding(intent?.understanding),
            exception: intent?.understanding?.comparisonSelectionException || null,
          },
          actionableContingency: {
            required: intent?.understanding?.actionableContingencyRequired === true,
            userPrompt: userMessage,
            constraints: frozenConstraints,
          },
          // Phase 9C.1D.5C-E3.1 — duplicate classification re-validates direct
          // same_as against the SAME trust list and clock named resolution used.
          relationshipAuthority: { trustedReviewerIds: getTrustedRelationshipReviewers(), now: nowAt },
          finalizeItinerary,
          detectContradiction,
          planStageCapture: planStageCapture.active ? planStageCapture.capture : null,
          attemptMeta: {
            attempt,
            modelTier: route?.model || route?.id || null,
          },
          beginSpan: (stage, meta) => timeline.begin(stage, meta),
          resolveStopCoordinates, resolveStopRoute, routeDepartureTimeBucket: departureBucket(nowAt),
          recordRouteResolution, signal, requestId: turnId,
          dispatchIndex: providerDispatchSeq, recordCoordinateResolution,
        };
        let validation = await validateGeneration(validationArgs);
        const classifyRetry = value => {
          const remainingBudget = MAX_FOCUSED_REPAIRS - subDispatchLog.filter(row => row.dispatched).length;
          let repairUniverse = value.repairUniverse;
          if (value.status !== 'pass' && value.candidatePlan?.days?.length
            && value.reasonCodes?.some(code => require('../utils/repairOperators').STRUCTURAL_REASONS.has(code))) {
            const snapshot = require('../utils/planViabilityRepair').buildPlanViabilitySnapshot({
              plan: value.candidatePlan, existenceOnly: true, focusedRepairBudgetRemaining: remainingBudget,
              context: { bundle: frozenBundle, constraints: frozenConstraints, userPrompt: userMessage,
                isRefinement, priorItineraryData, touchedDayNumbers: usePlanPatch ? value.touchedDayNumbers || refinementScope?.dayNumbers || null : null,
                relationshipAuthority: validationArgs.relationshipAuthority, routeArtifact: value.finalizedPlan?.routeArtifact },
            });
            repairUniverse = { remainingBudget, scopeLegal: snapshot.scopes.length > 0,
              operatorAvailable: (snapshot.scopes.every(scope => scope.reasons.every(code => code === 'missing_experience_anchor'))
                ? enableAnchorContainedRepair : snapshot.scopes.every(scope => scope.reasons.every(code => ['conditional_primary_unsupported', 'excessive_trip_repetition', 'duplicate_base_experience'].includes(code)))
                  ? true : enableCoverageContainedRepair) && !subDispatchLog.some(row => row.dispatched
                && require('../utils/repairOperators').operatorForPurpose(row.kind) === 'PLAN_VIABILITY_EDIT'),
              viable: snapshot.ok, affectedDays: snapshot.affectedDays,
              eligibleCandidateCount: snapshot.candidates.length };
          }
          if (value.status !== 'pass' && value.candidatePlan?.days?.length && value.offendingStops?.length
            && ['stop_identity', 'operational_eligibility'].includes(value.stage)) {
            const identity = require('../utils/legalStopSubstitutionRepair');
            const scope = identity.resolveSubstitutionScope({ itineraryData: value.candidatePlan, offendingStops: value.offendingStops });
            const catalog = scope.ok ? identity.buildLegalSubstitutionCatalog({ bundle: frozenBundle, constraints: frozenConstraints,
              candidatePlan: value.candidatePlan, repairScope: scope, exposureDirective: validationArgs.exposureDirective,
              excludedEvidenceIds: validationArgs.excludedEvidenceIds || [] }) : { candidates: [] };
            const context = { bundle: frozenBundle, constraints: frozenConstraints, userPrompt: userMessage,
              isRefinement, priorItineraryData, touchedDayNumbers: usePlanPatch ? refinementScope?.dayNumbers : null };
            const pool = scope.ok ? require('../utils/downstreamRepairPlanner').candidatePool({
              plan: value.candidatePlan, targets: scope.targets.map(t => ({ dayNumber: t.dayRef, stopIndex: t.stopRef - 1 })),
              candidates: catalog.candidates, context, identity: true, focusedRepairBudgetRemaining: remainingBudget,
              viabilityAvailable: enableCoverageContainedRepair,
              followupPossible: (plan, projection) => require('../utils/planViabilityRepair').buildPlanViabilitySnapshot({
                plan, projection, context, existenceOnly: true, focusedRepairBudgetRemaining: remainingBudget - 1 }),
            }) : null;
            repairUniverse = { remainingBudget, scopeLegal: scope.ok,
              operatorAvailable: enableStopSubstitutionRepair && !subDispatchLog.some(row => row.dispatched
                && require('../utils/repairOperators').operatorForPurpose(row.kind) === 'IDENTITY_SUBSTITUTION'),
              viable: pool?.ok === true, eligibleCandidateCount: pool?.candidates.length || 0 };
          }
          if (value.reasonCodes?.includes('zero_duration_stops') && value.candidatePlan) {
            const scope = require('../utils/zeroDurationRepair').collectZeroDurationTargets({ itineraryData: value.candidatePlan, dayDiagnostics: value.dayDiagnostics });
            repairUniverse = { remainingBudget, scopeLegal: scope.ok, viable: scope.ok,
              operatorAvailable: enableZeroDurationMicroRepair && !subDispatchLog.some(row => row.dispatched
                && require('../utils/repairOperators').operatorForPurpose(row.kind) === 'DURATION_EDIT') };
          }
          const classified = { ...value, ...(repairUniverse ? { repairUniverse } : {}),
            eligibleCandidateCount: repairUniverse?.eligibleCandidateCount ?? value.eligibleCandidateCount ?? eligiblePlaces.count,
            candidateFingerprint: hashPayload({ candidates: eligiblePlaces.fingerprint, evidence: frozenBundle.evidence, constraints: frozenConstraints }) };
          return { ...classified, retryability: classifyRepairRetryability(classified, { candidateCount: classified.eligibleCandidateCount }) };
        };
        validation = classifyRetry(validation);
        const recordValidation = (afterRepairFamily = null) => {
          const downstream = validation.candidatePlan ? require('../utils/downstreamRepairPlanner').projectPlan(validation.candidatePlan,
            { bundle: frozenBundle, constraints: frozenConstraints, userPrompt: userMessage, isRefinement, priorItineraryData,
              relationshipAuthority: validationArgs.relationshipAuthority,
              touchedDayNumbers: usePlanPatch ? validation.touchedDayNumbers || refinementScope?.dayNumbers || null : null,
              routeArtifact: validation.finalizedPlan?.routeArtifact }) : null;
          const activeReasons = [...new Set([...(validation.reasonCodes || []), ...(downstream?.reasonCodes || [])])];
          const activeDays = downstream ? downstream.days.filter(d => d.codes.length).map(day => ({ ...day,
            codes: [...new Set([...day.codes, ...(validation.dayDiagnostics || []).filter(d => d.dayNumber === day.dayNumber).flatMap(d => d.codes || [])])] }))
            : validation.dayDiagnostics || [];
          finalValidationSnapshot = { stage: validation.stage, reasonCodes: activeReasons,
          stageReasonCodes: validation.reasonCodes || [], downstreamDiagnostics: downstream,
          dayDiagnostics: activeDays, targetDiagnostics: validation.offendingStops || validation.targetDiagnostics || [],
          retryability: validation.retryability, repairBudgetRemaining: MAX_FOCUSED_REPAIRS - subDispatchLog.filter(r => r.dispatched).length - (afterRepairFamily ? 1 : 0),
          blockerSignature: blockerSignature({ ...validation, reasonCodes: activeReasons, dayDiagnostics: activeDays }),
          failureCategory: validation.status === 'pass' ? null : require('./artifactFulfillment').failureCategoryFromCodes(validation.reasonCodes),
          planRevisionHash: hashPayload(validation.candidatePlan || validation.finalizedPlan?.itineraryData || generation.output),
          validationSequence: ++validationSequence, afterRepairFamily,
          repairOperator:require('../utils/repairOperators').operatorForPurpose(afterRepairFamily),finalReasonCodes:activeReasons };
          validationHistory.push(finalValidationSnapshot);
          validation = { ...validation, finalValidationSnapshot };
        };
        recordValidation();

        if (signal?.aborted) return cancelledResult();

        // SUB-REPAIR CHAIN — narrowest contract first.
        //
        // Runs BEFORE the ledger records this attempt, so a successful merge is
        // accounted as "this attempt's defect was resolved" rather than as a
        // second generation. Each step consumes the candidate the previous step
        // produced, so a mixed-defect turn walks candidate0 -> duration merge ->
        // candidate1 -> anchor merge -> candidate2, and the ledger sees the last.
        const derivedReferenceBases = [];
        const usedClasses = subRepairGuards.get(attempt) || new Set();
        subRepairGuards.set(attempt, usedClasses);
        const subRepairChain = [
          {
            kind: 'zero_duration_micro_repair',
            enabled: enableZeroDurationMicroRepair,
            stage: 'structured_artifact_structure',
            code: 'zero_duration_stops',
            dispatch: dispatchZeroDurationMicroRepair,
          },
          {
            kind: 'missing_experience_anchor_repair',
            enabled: enableAnchorContainedRepair,
            stage: 'itinerary_completeness',
            code: 'missing_experience_anchor',
            dispatch: dispatchAnchorContainedRepair,
          },
          // LEGAL-STOP SUBSTITUTION — two trigger stages, ONE kind, so the
          // shared `usedClasses` guard caps it at one dispatch per attempt
          // whichever stage fired first.
          {
            kind: 'legal_stop_substitution_repair',
            enabled: enableStopSubstitutionRepair,
            stage: 'stop_identity',
            code: 'stop_identity_unresolved',
            dispatch: dispatchStopSubstitutionRepair,
          },
          {
            kind: 'legal_stop_substitution_repair',
            enabled: enableStopSubstitutionRepair,
            stage: 'stop_identity',
            code: 'stop_identity_excluded',
            dispatch: dispatchStopSubstitutionRepair,
          },
          {
            kind: 'legal_stop_substitution_repair',
            enabled: enableStopSubstitutionRepair,
            stage: 'operational_eligibility',
            code: 'constraint_eligibility_unknown',
            dispatch: dispatchStopSubstitutionRepair,
          },
        ];
        for (let repairSlot = 0; repairSlot < MAX_FOCUSED_REPAIRS; repairSlot += 1) {
          if (subDispatchLog.filter(row => row.dispatched).length >= MAX_FOCUSED_REPAIRS) break;
          if (validation.status === 'pass' || validation.retryability !== 'model_fixable') break;
          // Re-select after validation: identity repair can expose coverage even
          // though its dispatch entry follows coverage in this preference list.
          const { OPERATORS, operatorForPurpose } = require('../utils/repairOperators');
          let step = subRepairChain.find(candidate => candidate.enabled
            && validation.stage === candidate.stage && (validation.reasonCodes || []).includes(candidate.code));
          // One scheduler selects an operator from the complete current projection.
          // Legacy dispatch functions below are homogeneous contract adapters only.
          if (validation.candidatePlan && ['itinerary_completeness','trip_quality'].includes(validation.stage)) {
            const viability = require('../utils/planViabilityRepair');
            const context = { bundle:frozenBundle, constraints:frozenConstraints, userPrompt:userMessage,
              priorItineraryData,isRefinement,relationshipAuthority:validationArgs.relationshipAuthority,
              touchedDayNumbers:usePlanPatch ? validation.touchedDayNumbers : null,
              excludedEvidenceIds:operationalDirectives?.exposure?.ineligibleEvidenceIds || [] };
            const scopes = viability.structuralScopes(validation.candidatePlan,context);
            const hasQuality = scopes.some(d=>d.reasons.some(c=>['conditional_primary_unsupported','excessive_trip_repetition','duplicate_base_experience'].includes(c)));
            const hasCoverage = scopes.some(d=>d.reasons.some(c=>!['conditional_primary_unsupported','excessive_trip_repetition','duplicate_base_experience'].includes(c)));
            if (scopes.length && (enableCoverageContainedRepair || !hasCoverage)) {
              const mixedAnchor = scopes.some(d=>d.reasons.includes('missing_experience_anchor')) && scopes.some(d=>d.reasons.includes('insufficient_day_coverage') && !d.reasons.includes('missing_experience_anchor'));
              const hasDuplicate = scopes.some(d => d.reasons.includes('duplicate_base_experience'));
              const useCombined = hasCoverage && hasQuality || mixedAnchor || hasDuplicate || scopes.length === validation.candidatePlan.days.length;
              if (useCombined) {
                step = {kind:'plan_viability_repair',code:validation.reasonCodes[0],dispatch:viability.dispatchPlanViabilityRepair};
              } else if (hasQuality) {
                step = {kind:'trip_quality_repair',code:validation.reasonCodes[0],dispatch:require('../utils/focusedTripQualityRepair').dispatchTripQualityRepair};
              } else if (!step || step.kind !== 'missing_experience_anchor_repair' || validation.actionability) {
                step = {kind:'insufficient_day_coverage_repair',code:'insufficient_day_coverage',dispatch:dispatchCoverageContainedRepair};
              }
            }
          }
          const operator = step && operatorForPurpose(step.kind);
          if (step && (usedClasses.has(operator) || subDispatchLog.some(row=>row.dispatched && (row.repairOperator || operatorForPurpose(row.kind))===operator))) step=null;
          if (!step) break;
          usedClasses.add(operator);
          providerDispatchSeq += 1;
          const retainedNames = new Set((validation.candidatePlan?.days || []).flatMap(day => day.stops || [])
            .flatMap(stop => [stop.name, stop.canonicalPlaceName]).filter(Boolean).map(name => name.toLowerCase().trim()));
          const removedByMutation = usePlanPatch ? (priorItineraryData?.days || []).flatMap(day => day.stops || [])
            .filter(stop => ![stop.name, stop.canonicalPlaceName].filter(Boolean).some(name => retainedNames.has(name.toLowerCase().trim())))
            .flatMap(stop => [stop.name, stop.canonicalPlaceName]).filter(Boolean) : [];
          const repair = await step.dispatch({
            validation, route, attempt, signal, dispatchIndex: providerDispatchSeq,
            repairPlanning: { focusedRepairBudgetRemaining: MAX_FOCUSED_REPAIRS - subDispatchLog.filter(r => r.dispatched).length,
              coverageAvailable: enableCoverageContainedRepair && !usedClasses.has(OPERATORS.VIABILITY),
              viabilityAvailable: enableCoverageContainedRepair && !usedClasses.has(OPERATORS.VIABILITY),
              context: { bundle: frozenBundle, constraints: removedByMutation.length ? { ...frozenConstraints, excludedStopNames: removedByMutation } : frozenConstraints, userPrompt: userMessage,
                priorItineraryData, isRefinement, relationshipAuthority: validationArgs.relationshipAuthority,
                touchedDayNumbers:usePlanPatch ? validation.touchedDayNumbers : null,
                excludedEvidenceIds:operationalDirectives?.exposure?.ineligibleEvidenceIds || [] } },
            // The parent attempt's FROZEN bundle. A sub-repair never resolves
            // evidence of its own — and carrying it is necessary, not
            // sufficient: a newly proposed place may not be in it at all.
            bundle: frozenBundle,
            constraints: removedByMutation.length ? { ...frozenConstraints, excludedStopNames: removedByMutation } : frozenConstraints,
            // The substitution repair derives its replacement pool from the
            // SAME directive identity sets that governed construction/steering.
            exposureDirective: operationalDirectives?.exposure || null,
            excludedEvidenceIds: operationalDirectives?.exposure?.ineligibleEvidenceIds || [],
            createRequest, executeResponses, responseAdapters, normalizeTool, priceCall, liveBudget, now,
          });
          if (repair) repair.repairOperator = operator;
          if (repair?.mergeStatus === 'qualification_harness_block') {
            validation = { ...validation, retryability: 'deterministic_blocker', locallyRepairable: false,
              focusedRepairUsed: true, reasonCodes: [...validation.reasonCodes, 'qualification_harness_block'] };
          }
          if (repair?.mergeStatus === 'dispatch_failed') {
            validation = { ...validation, retryability: 'provider_blocker', locallyRepairable: false };
          }
          if (repair?.mergeStatus === 'catalog_declined') {
            validation = { ...validation, retryability: 'evidence_blocker', locallyRepairable: false };
          }
          if (repair?.mergeStatus === 'applied') {
            if (validation.candidatePlan) derivedReferenceBases.push(validation.candidatePlan);
            // A merged repair proves ONE thing: its own defect is gone. The
            // merged plan goes through the identical downstream path a full
            // candidate receives — finalization, completeness, traveler fit,
            // prose. Nothing here declares an itinerary valid.
            const cleanRepair = require('../utils/invalidateRemovedStopReferences').invalidateRemovedStopReferences({
              priorPlan: validation.candidatePlan, itineraryData: repair.plan,
            }).itineraryData;
            const changedDays = (repair.plan.days || []).flatMap((day, index) =>
              JSON.stringify(day) === JSON.stringify(validation.candidatePlan?.days?.[index])
                ? [] : [Number(day.dayNumber || day.day || index + 1)]);
            const repairNarrative = require('../utils/canonicalPlanNarrative').reconcileCanonicalNarrative({
              itineraryData: repair.copyReconciled ? cleanRepair : require('../utils/repairCopyDependencies').reconcileRepairDayCopy({priorPlan:validation.candidatePlan,plan:cleanRepair,affectedDays:changedDays,bundle:frozenBundle}).plan, afterRepair: true, changedDays,
            });
            const revalidated = await validateGeneration({
              ...validationArgs,
              derivedReferenceBases,
              output: { ...generation.output, text: repairNarrative.text, itineraryData: repairNarrative.itineraryData },
              repairedPlan: usePlanPatch && (['legal_stop_substitution_repair', 'trip_quality_repair','plan_viability_repair'].includes(step.kind) || step.kind === 'insufficient_day_coverage_repair' && validation.actionability) ? repairNarrative.itineraryData : null,
            });
            const survived = (revalidated.reasonCodes || []).includes(step.code);
            repair.revalidatedStatus = revalidated.status;
            repair.remainingReasonCodes = revalidated.status === 'pass'
              ? []
              : boundedReasons(revalidated.reasonCodes);
            repair.resolvedReasonCodes = survived ? [] : [step.code];
            // Measure scope progress independently of the global reason code.
            // The family guard still forbids a second dispatch.
            const planner = require('../utils/downstreamRepairPlanner');
            const context = { bundle: frozenBundle, constraints: frozenConstraints, userPrompt: userMessage };
            repair.localProgress = planner.progress(planner.projectPlan(validation.candidatePlan, context),
              planner.projectPlan(revalidated.candidatePlan || repairNarrative.itineraryData, context),
              repair.affectedDays || (repair.targets || []).map(t => t.dayRef));
            repair.localProgress.globalFamilyStillPresent = survived;
            repair.localProgress.familyStillPresentElsewhere = survived && repair.localProgress.targetedScopeResolved;
            if (!survived) repair.localProgress.targetedScopeResolved = true;
            repair.progress = { ...repair.localProgress, ...repair.progress };
            // The newest candidate is authoritative even when another scope still fails.
            validation = classifyRetry(revalidated);
            recordValidation(step.kind);
            if (survived) repair.mergeStatus = 'incomplete';
          }
          if (repair) {
            if (repair.dispatched || operator === OPERATORS.VIABILITY) validation = { ...validation, focusedRepairUsed: true, locallyRepairable: false };
            const { plan: _merged, budgetTicket: _ticket, ...telemetry } = repair;
            subDispatchLog.push(telemetry);
            if (step.kind === 'trip_quality_repair' || repair.mergeStatus !== 'applied' || !repair.resolvedReasonCodes?.includes(step.code)) break;
          }
        }
        finalValidationSnapshot = { ...finalValidationSnapshot, retryability: validation.retryability,
          repairBudgetRemaining: MAX_FOCUSED_REPAIRS - subDispatchLog.filter(r => r.dispatched).length };
        experienceDiagnostics = validation.experienceDiagnostics ? { ...validation.experienceDiagnostics, ...finalValidationSnapshot } : null;
        tripQualityDiagnostics = validation.tripQuality ? { ...validation.tripQuality.diagnostics, ...finalValidationSnapshot } : null;
        endValidation();
        // MONOTONIC REPAIR — record what this candidate actually proved, then
        // build the NEXT attempt's instruction as the cumulative contract
        // (MUST PRESERVE / MUST FIX) followed by this stage's concrete detail.
        const stageObligations = Object.prototype.hasOwnProperty.call(
          STAGE_EVALUATED_OBLIGATIONS, validation.stage
        )
          ? STAGE_EVALUATED_OBLIGATIONS[validation.stage]
          : null;
        let attemptProgress = repairLedger.recordAttempt({
          attempt,
          requestedExperienceCoverage: validation.requestedExperienceCoverage,
          reasonCodes: validation.status === 'pass' ? [] : (validation.reasonCodes || []),
          evaluatedObligations: validation.evaluatedObligations
            ?? stageObligations
            ?? repairLedger.obligationIds(),
        });
        if (validation.status !== 'pass') {
          const signature = blockerSignature(validation);
          if (validationBlockersSeen.has(signature)) {
            attemptProgress = { ...attemptProgress, progress: 'NO_PROGRESS' };
          }
          validationBlockersSeen.add(signature);
        }
        const endRepairBuild = timeline.begin('repair_construction');
        const ledgerContract = repairLedger.buildRepairContract();
        lastRepairInstructions = [ledgerContract, validation.repairInstructions || '']
          .filter(Boolean)
          .join('\n\n')
          .slice(0, MAX_REPAIR_INSTRUCTION_CHARS);
        endRepairBuild();
        attemptProgressLog.push(attemptProgress);
        // Eval-only forensics: what this attempt proved, and the exact bounded
        // contract the NEXT attempt will receive. Merged into this attempt's
        // existing capture file. Disabled by default and never in production.
        if (planStageCapture.active && typeof planStageCapture.capture === 'function') {
          planStageCapture.capture({
            attempt,
            modelTier: route?.model || route?.id || null,
            reasonCodes: validation.status === 'pass' ? [] : boundedReasons(validation.reasonCodes),
            attemptProgress,
            repairInstructionSent: lastRepairInstructions || '',
          });
        }
        if (validation.status !== 'pass') {
          // Retry policy BY FAILURE CLASS, not by a single failure bit.
          validation = {
            ...validation,
            failureClass: classifyValidationFailure(validation.reasonCodes),
          };
          failureClasses.push(validation.failureClass);
        }
        if (signal?.aborted) return cancelledResult();
        if (validation.status === 'pass') {
          patchResultRef = usePlanPatch
            ? {
              applied: Boolean(validation.finalizedPlan),
              touchedDayNumbers: validation.touchedDayNumbers || [],
            }
            : patchResultRef;
          terminalValidation = { status: 'pass', reasonCodes: [] };
          terminalResponse = validation.response;
          if (validation.tripPushback && !usePlanPatch) {
            executionContract = recommendationContract(executionContract, validation.tripPushback);
          }
          if (validation.finalizedPlan) {
            finalizedPlan = {
              itineraryData: validation.finalizedPlan.itineraryData,
              itineraryHash: hashItinerary(validation.finalizedPlan.itineraryData),
              feasibilityIssues: Array.isArray(validation.finalizedPlan.feasibilityIssues)
                ? validation.finalizedPlan.feasibilityIssues
                : [],
            };
            // Anything measured against the prior plan is not current for this
            // revision. Logistics are re-bound to the new hash below; stop-level
            // drive minutes on touched days were cleared at patch apply.
            const boundEarly = bindDerivedSurfaces({
              planHash: finalizedPlan.itineraryHash,
              travelLogistics,
              warnings: {
                planHash: finalizedPlan.itineraryHash,
                items: finalizedPlan.feasibilityIssues || [],
              },
            });
            travelLogistics = boundEarly.travelLogistics;
            const earlyPlan = {
              ...finalizedPlan.itineraryData,
              itineraryHash: finalizedPlan.itineraryHash,
              feasibilityIssues: boundEarly.warnings?.items || [],
            };
            const earlyIntent = intent ? {
              primaryIntent: intent.primaryIntent,
              travelerJob: intent.travelerJob || null,
              verticals: intent.verticals,
              depth: intent.depth,
              freshness: intent.freshness,
              confidence: intent.confidence,
            } : null;
            const earlyEnvelope = {
              content: '',
              canonicalPlan: earlyPlan,
              travelLogistics,
              responseArtifacts: null,
              intent: earlyIntent,
              requestedSlices: logisticsNeeds,
              refinement: usePlanPatch ? (() => {
                const requested = {
                  ...(input.refinement || {}),
                  changedDayNumbers: validation.touchedDayNumbers || [],
                };
                const reconciled = reconcileRefinementClaims({
                  requestedChanges: requested.changes,
                  priorPlan: priorItineraryData,
                  nextPlan: earlyPlan,
                });
                return {
                  changes: reconciled.acceptedChanges,
                  changedDayNumbers: reconciled.changedDayNumbers.length
                    ? reconciled.changedDayNumbers
                    : (requested.changedDayNumbers || []),
                };
              })() : null,
            };
            const earlyPresentation = buildPresentationManifest(earlyEnvelope);
            const earlyPresentationValidation = validatePresentationManifest(earlyPresentation, earlyEnvelope);
            if (!earlyPresentationValidation.valid) {
              throw Object.assign(new Error('presentation_manifest_invalid'), {
                code: earlyPresentationValidation.errors[0] || 'presentation_manifest_invalid',
              });
            }
            // A historical-target patch belongs to another saved trip. Revealing
            // it through the active trip's revision-1 channel would let the
            // ordinary early persistence coordinator save Redwood over
            // Badlands before the terminal targetPlanMutation split runs.
            if (!isCrossPlanTargetMutation) {
              emit('itinerary_ready', {
                // The envelope builder hashes this exact validated source, not
                // the presentation plan augmented with hashes and warnings.
                itineraryData: finalizedPlan.itineraryData,
                itineraryHash: finalizedPlan.itineraryHash,
                canonicalPlan: earlyPlan,
                travelLogistics,
                derivedPublication: {
                  planHash: finalizedPlan.itineraryHash,
                  travelLogistics: travelLogistics ? 'ready' : 'pending',
                  warnings: 'ready',
                  answer: 'pending',
                },
                responseArtifacts: null,
                intent: earlyIntent,
                presentation: earlyPresentation,
              });
            }
          } else {
            emit('prose_ready');
          }
        } else {
          terminalValidation = { status: 'fail', stage: finalValidationSnapshot.stage, reasonCodes: finalValidationSnapshot.reasonCodes,
            retryability: finalValidationSnapshot.retryability, blockerSignature: finalValidationSnapshot.blockerSignature, finalValidationSnapshot };
          // Track WHY attempts failed. Truth, safety, and hard-constraint
          // failures must never be degraded into a delivered answer; only a
          // failure to produce the STRUCTURE is eligible.
          const structural = (validation.reasonCodes || []).every(
            (code) => code === 'tool_output_invalid' || code === 'output_incomplete'
          ) && (validation.reasonCodes || []).length > 0;
          if (!structural) structuralOnlyFailures = false;
          if (structural && !safeProseFallback) {
            const prose = validateProseOnly({
              output: generation.output,
              bundle: frozenBundle,
              constraints: frozenConstraints,
              detectContradiction,
              budgetClaimGate: () => null,
              comparisonSelection: validationArgs.comparisonSelection,
              actionableContingency: validationArgs.actionableContingency,
            });
            // A floor only high enough to exclude stubs and fragments. Real
            // answers are often short ("No, you don't need a permit for that"),
            // and prose validation has already checked their truth and safety.
            if (prose.status === 'pass' && String(prose.response?.text || '').trim().length >= 80) {
              safeProseFallback = prose.response;
            }
          }
          // Retry policy BY FAILURE CLASS. A structural failure on a turn that
          // never required structure, where a validated safe prose answer is
          // already banked, must not buy another expensive structured attempt.
          if (!structureRetryAllowed({
            failureClass: validation.failureClass,
            structurePolicy,
            hasSafeProse: Boolean(safeProseFallback),
          })) {
            validation = { ...validation, locallyRepairable: false, structureRetrySuppressed: true };
          }
        }
        return validation;
      },

      onAttempt: async (record) => {
        // Rejected prose and rejection diagnostics have separate ownership.
        // The former is cleared by the stream binder; the latter remains on the
        // attempt record and continues into the repair ladder unchanged.
        if (record?.status !== 'passed') emit('attempt_rejected', { attempt: record?.attempt });
      },
    });

    if (routing.status === 'cancelled') {
      return finalize({ status: 'cancelled', terminalReason: 'cancelled', routing });
    }
    if (routing.status === 'complete') {
      return finalize({
        status: 'complete',
        routing,
        response: terminalResponse,
        validation: terminalValidation,
      });
    }
    // Missing deterministic inputs are a contained evidence outcome, not a
    // provider outage and never permission to replace the saved plan.
    if (['evidence_blocker', 'repeated_input_blocker'].includes(routing.reasonCode)) {
      return finalize({
        status: 'evidence_incomplete', terminalReason: 'evidence_incomplete', routing,
        validation: terminalValidation,
        response: { kind: 'text', text: priorItineraryData
          ? 'I can’t verify a suitable replacement from the available place information. I haven’t changed your itinerary.'
          : 'I don’t have enough verified place information to complete this plan with your requirements.' },
      });
    }
    // routing.status === 'failed'
    // WP-TU §13 — bounded repair could not produce the structured artifact. If
    // the ONLY thing that failed was structure, and a prose candidate already
    // passed truth/safety/constraint validation, deliver that answer instead of
    // "I couldn't complete this request." No plan is attached and none is
    // claimed to be saved.
    if (structuralOnlyFailures && safeProseFallback) {
      return finalize({
        status: 'complete',
        routing,
        response: safeProseFallback,
        validation: {
          status: 'pass',
          reasonCodes: [],
          degraded: true,
          degradedReasonCodes: ['structured_artifact_unavailable'],
        },
      });
    }
    // A refused dispatch is not an outage. The routing ladder folds every
    // generation throw into `provider_attempt_failed` -> `provider_unavailable`,
    // which would make a budget stop read as a provider failure and send a gate
    // hunting the wrong subsystem. The guard's own ledger is authoritative here.
    const budgetBlocked = liveBudget && liveBudget.snapshot().blockedDispatches > 0;
    return finalize({
      status: 'failed',
      terminalReason: budgetBlocked
        ? LIVE_BUDGET_BLOCK_REASON
        : (terminalValidation?.reasonCodes?.[0] || ROUTER_REASON_TO_TERMINAL[routing.reasonCode] || 'unknown'),
      routing,
      validation: terminalValidation,
    });
  } catch (error) {
    primaryPackingFailure = error?.packingTelemetry || null;
    if (error?.code === 'refinement_evidence_starvation') {
      return finalize({
        status: 'evidence_incomplete',
        terminalReason: 'refinement_evidence_starvation',
        routing: {},
        validation: { status: 'blocked', reasonCodes: ['refinement_evidence_starvation'] },
        response: { kind: 'text', text: 'I can’t verify a suitable replacement from the available place information. I haven’t changed your itinerary.' },
      });
    }
    if (signal?.aborted) return cancelledResult();
    return finalize({
      status: 'failed',
      terminalReason: boundedTerminal(error),
      routing: {},
      validation: { status: 'error', reasonCodes: [] },
    });
  }
}

function boundedTerminal(error) {
  const code = error && typeof error.code === 'string' ? error.code : '';
  if (code && SAFE_REASON.test(code)) return code;
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Attempt output + validation
// ---------------------------------------------------------------------------

function buildAttemptOutput({ result, itinerary, normalizeTool, usePlanPatch = false, bundle = null, constraints = null }) {
  if (itinerary) {
    if (!usePlanPatch && (result.toolCalls || []).some(c => c.name === TRIP_PUSHBACK_TOOL.name)) {
      return { kind: 'trip_pushback', pushbackResult: result, refusal: result.refusal || null };
    }
    const structured = (usePlanPatch ? normalizePlanPatchToolCalls : normalizeTool)({
      toolCalls: result.toolCalls || [],
      stopReason: result.stopReason || null,
    });
    return {
      kind: usePlanPatch ? 'plan_patch' : 'itinerary',
      structuredStatus: structured.status,
      itineraryData: structured.itineraryData,
      planPatchData: structured.planPatchData || null,
      text: usePlanPatch
        ? String(structured.planPatchData?.response || '')
        : (result.outputText || ''),
      completionStatus: result.completionStatus || null,
      refusal: result.refusal || null,
      structuredDiagnostics: structuralDiagnosticsFromNormalized(structured),
    };
  }
  const guidance = (result.toolCalls || []).find(call => call.name === 'respond_with_guidance');
  if (guidance) {
    const assessment = require('../utils/structuredTravelerGuidance').renderStructuredGuidance(guidance.input, { bundle, constraints });
    return { kind: 'text', text: assessment.text, guidanceValidation: assessment,
      completionStatus: result.completionStatus, refusal: result.refusal || null };
  }
  if (require('../utils/structuredTravelerGuidance').needsStructuredGuidance(constraints)) {
    return { kind: 'text', text: '', guidanceValidation: { ok: false, reasonCodes: ['guidance_structure_required'] } };
  }
  return {
    kind: 'text',
    text: result.outputText || '',
    completionStatus: result.completionStatus || null,
    refusal: result.refusal || null,
  };
}

/**
 * One exit for every patch-stage refusal: capture the candidate, forward the
 * diagnostics, name the rule. A patch failure that keeps neither the artifact
 * nor the reason is unattributable, which cost two paid live attempts.
 */
function patchFailure({
  stage, reasonCodes, candidatePlanPatch, mergedPlan = null,
  planStageCapture, attemptMeta, targetDiagnostics = null,
}) {
  if (typeof planStageCapture === 'function') {
    planStageCapture({
      attempt: attemptMeta?.attempt,
      modelTier: attemptMeta?.modelTier,
      candidatePlanPatch,
      ...(mergedPlan ? { mergedPlan } : {}),
      reasonCodes: boundedReasons(reasonCodes),
    });
  }
  return {
    status: 'fail',
    locallyRepairable: true,
    stage,
    reasonCodes: boundedReasons(reasonCodes),
    targetDiagnostics,
    repairInstructions: patchRepairInstruction(reasonCodes),
  };
}

/**
 * A bounded set of catalogue place names a retry may legally build from:
 * resolvable, not directive-excluded, primary experiences first. Names come
 * from public evidence only — machine-selected, never traveler language.
 */
function legalPlaceSuggestions({
  bundle, excludedEvidenceIds = [], exposureDirective = null, limit = 8,
}) {
  const { travelerValueClass, VALUE_CLASS } = require('../utils/travelerValueClass');
  const excluded = new Set(excludedEvidenceIds);
  // Under an armed no-exposure constraint the suggestion pool derives from the
  // SAME directive result that governs attempt-1 construction — never from an
  // independently re-derived relevance test. Ineligible candidates (judged,
  // exposure unknown/moderate/high) are never offered even when they legally
  // render in the catalogue; confirmed-low candidates lead the pool;
  // exposure-neutral supporting places stay eligible. (Olympic 2026-09-03:
  // the pre-fix pool offered eight unknown-exposure suggestions and the model
  // obeying the machine's own hint could only re-fail.)
  const suggestionIneligible = new Set(exposureDirective?.suggestionIneligibleEvidenceIds || []);
  const confirmedLow = new Set(exposureDirective?.confirmedLowEvidenceIds || []);
  const seen = new Set();
  const ranked = [];
  for (const candidate of bundle?.evidence || []) {
    if (excluded.has(candidate?.evidenceId)) continue;
    if (suggestionIneligible.has(candidate?.evidenceId)) continue;
    const value = candidate?.claim?.normalizedValue;
    const name = typeof value?.name === 'string' ? value.name.trim() : '';
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const klass = travelerValueClass({ name, activityTypes: value?.activityTypes });
    if (klass === VALUE_CLASS.MICRO_POI || klass === VALUE_CLASS.LOGISTICS) continue;
    ranked.push({
      name,
      confirmedLow: confirmedLow.has(candidate?.evidenceId) ? 0 : 1,
      primary: klass === VALUE_CLASS.PRIMARY_EXPERIENCE ? 0 : 1,
    });
  }
  ranked.sort((a, b) => (a.confirmedLow - b.confirmedLow) || (a.primary - b.primary));
  return ranked.slice(0, limit).map((r) => r.name);
}

async function validateGeneration({
  output,
  itinerary,
  bundle,
  constraints,
  userPrompt = '',
  priorItineraryData = null,
  repairedPlan = null,
  derivedReferenceBases = [],
  refinementScope = null,
  isRefinement = false,
  usePlanPatch = false,
  repairCandidates = null,
  structurePolicy = 'required',
  parkIdentityBinding = null,
  // Evidence ids the machine-composed directives removed from this traveler's
  // construction catalogue (armed avoidExposure). A stop resolving to one of
  // these is an identity the model was told it may not use.
  excludedEvidenceIds = [],
  // The turn's composed exposure directive (null when not armed). Retry
  // suggestions derive from its identity-based suggestion sets so machine
  // steering cannot contradict the construction rules it composed.
  exposureDirective = null,
  // Phase 9C.1D.5B — resolved named-experience obligations (empty on ordinary turns).
  namedExperienceRequirements = [],
  comparisonSelection = null,
  actionableContingency = null,
  // Phase 9C.1D.5C-E3.1 — { trustedReviewerIds, now } for same_as re-validation.
  relationshipAuthority = null,
  finalizeItinerary,
  detectContradiction,
  planStageCapture = null,
  attemptMeta = null,
  // The turn's timeline, passed in because this is a module-level function and
  // cannot close over it. Defaults to a no-op so every existing caller is safe.
  beginSpan = () => () => {},
  // Phase 9B.2B — same reasoning as `beginSpan`: module-level function, must
  // be threaded explicitly. Absent (every existing caller, for now) means no
  // resolver dispatch and every requested entry stays unresolved.
  resolveStopCoordinates = null,
  resolveStopRoute = null, routeDepartureTimeBucket = null, recordRouteResolution = () => {},
  signal = null, requestId = null, dispatchIndex = null, recordCoordinateResolution = () => {},
}) {
  if (output.refusal) {
    return { status: 'fail', locallyRepairable: false, reasonCodes: ['refusal'], stage: 'refusal' };
  }

  /**
   * P1-2 — budget prose claim safety on the live candidate response path.
   * Model may explain budget; it may NOT establish unsupported total compliance.
   * Repair uses the same frozen EvidenceBundle (no refetch).
   */
  function budgetClaimGate(candidateText) {
    const assessment = constraints?.budgetAssessment || null;
    if (!assessment) return null;
    const claimIssues = validateBudgetClaim(candidateText, assessment);
    if (claimIssues.length === 0) return null;
    return {
      status: 'fail',
      locallyRepairable: true,
      stage: 'budget_claim',
      reasonCodes: boundedReasons(claimIssues.map((i) => i.reasonCode || 'budget_claim_unsupported')),
      repairInstructions: buildBudgetClaimRepairInstructions(claimIssues),
    };
  }

  if (itinerary && !usePlanPatch && output.kind === 'trip_pushback') {
    const decision = parseTripPushback(output.pushbackResult, userPrompt);
    if (!decision.ok) return { status: 'fail', locallyRepairable: true, stage: 'trip_pushback', reasonCodes: ['trip_pushback_invalid'], repairInstructions: decision.reason };
    const prose = validateProseOnly({ output: { text: decision.text }, bundle, constraints, detectContradiction, budgetClaimGate, comparisonSelection, actionableContingency });
    return prose.status === 'pass' ? { ...prose, tripPushback: decision.reasonCode } : prose;
  }

  if (itinerary) {
    const structuredDataPresent = usePlanPatch ? output.planPatchData : output.itineraryData;
    if (output.structuredStatus !== STRUCTURED_STATUS.COMPLETE || !structuredDataPresent) {
      const repairable = output.structuredStatus === STRUCTURED_STATUS.TRUNCATED
        || output.structuredStatus === STRUCTURED_STATUS.MISSING_TOOL
        || output.structuredStatus === STRUCTURED_STATUS.MALFORMED_TOOL;
      const reason = output.structuredStatus === STRUCTURED_STATUS.TRUNCATED
        ? 'output_incomplete' : 'tool_output_invalid';
      // Only an EXPLICIT artifact request may make missing structure fatal.
      // When the traveler asked a question and the structured plan was merely
      // inferred, a validated prose answer is the correct product outcome —
      // retrying for a plan nobody asked for is how good answers got thrown away.
      if (structurePolicy !== 'required') {
        const prose = validateProseOnly({
          output, bundle, constraints, detectContradiction, budgetClaimGate, comparisonSelection, actionableContingency,
        });
        if (prose.status === 'pass') {
          return {
            ...prose,
            structuredArtifactUnavailable: true,
            reasonCodes: [],
            degradedReasonCodes: [reason],
          };
        }
        return prose;
      }
      const validationDiagnostics = boundedValidationDiagnostics(output.structuredDiagnostics);
      return {
        status: 'fail',
        locallyRepairable: repairable,
        reasonCodes: [reason],
        stage: 'structured_output',
        validationDiagnostics,
        repairInstructions: structuredOutputRepairInstructions(validationDiagnostics, {
          toolName: usePlanPatch ? 'patch_itinerary' : 'create_itinerary',
        }),
      };
    }
    let candidatePlanPatch = null;
    let touchedDayNumbers = [];
    let rawPlan;
    if (usePlanPatch) {
      candidatePlanPatch = output.planPatchData;

      // SCOPE BREADTH. `update_day` is not banned — "redo day two" makes it
      // exactly right — but a daypart request may not authorize it. Live
      // attempt 2 escaped a targeting problem by rewriting all of Day 2,
      // including an afternoon nobody mentioned, and day-scoped ownership
      // could not see it.
      let scopedPatch = candidatePlanPatch;
      if (!refinementScope?.resolved && (refinementScope?.reasonCodes || []).includes('temporal_target_unresolved')) {
        return patchFailure({
          stage: 'plan_patch_scope',
          reasonCodes: ['refinement_target_unresolved'],
          candidatePlanPatch,
          planStageCapture,
          attemptMeta,
          targetDiagnostics: {
            requestedScopeLevel: refinementScope?.level || null,
            requestedDayNumber: null,
          },
        });
      }
      if (refinementScope?.resolved) {
        for (const [index, operation] of (candidatePlanPatch?.operations || []).entries()) {
          const allowed = scopeAllowsOperation({ scope: refinementScope, operation });
          if (!allowed.ok) {
            return patchFailure({
              stage: 'plan_patch_scope',
              reasonCodes: [allowed.reasonCode],
              candidatePlanPatch,
              planStageCapture,
              attemptMeta,
              targetDiagnostics: {
                operationIndex: index,
                op: operation?.op || null,
                dayNumber: Number.isFinite(Number(operation?.dayNumber)) ? Number(operation.dayNumber) : null,
                requestedScopeLevel: refinementScope.level,
                requestedDayNumber: refinementScope.dayNumber,
                requestedDaypart: refinementScope.daypart,
                availableStopIds: refinementScope.allowedStopIds,
              },
            });
          }
        }
        // TARGET INJECTION. Where the machine resolved a singular stop, it is
        // supplied rather than requested: the model cannot miss a target it was
        // never asked to name.
        const bound = bindOperationsToScope({
          operations: candidatePlanPatch?.operations || [],
          scope: refinementScope,
        });
        if (!bound.ok) {
          return patchFailure({
            stage: 'plan_patch_scope',
            reasonCodes: bound.reasonCodes,
            candidatePlanPatch,
            planStageCapture,
            attemptMeta,
            targetDiagnostics: {
              requestedScopeLevel: refinementScope.level,
              requestedDayNumber: refinementScope.dayNumber,
              requestedDaypart: refinementScope.daypart,
              availableStopIds: refinementScope.allowedStopIds,
            },
          });
        }
        scopedPatch = { ...candidatePlanPatch, operations: bound.operations };
      }

      if (Array.isArray(repairCandidates)) {
        const bound = bindRepairPatch({ planPatch: scopedPatch, priorPlan: priorItineraryData, candidates: repairCandidates });
        if (!bound.ok) return { status: 'fail', locallyRepairable: repairCandidates.length > 0,
          stage: 'plan_patch_identity', reasonCodes: bound.reasonCodes, eligibleCandidateCount: repairCandidates.length };
        scopedPatch = bound.patch;
      }
      const endApply = beginSpan('patch_application');
      const applied = applyPlanPatch({
        priorPlan: priorItineraryData,
        planPatch: scopedPatch,
        // Phase 9C.1F.2 — touched days re-authorize edge modeIntent against
        // the CURRENT durable transport policy (finalization repeats this).
        transportation: constraints?.planningState?.transportation || null,
      });
      endApply();
      if (!applied.ok) {
        // ATTRIBUTABILITY. `plan_patch_apply` was the one structured failure
        // stage that captured nothing, so a target failure destroyed the only
        // artifact that could explain it — the 2026-08-20 Zion defect this
        // file already documents, one level deeper.
        if (typeof planStageCapture === 'function') {
          planStageCapture({
            attempt: attemptMeta?.attempt,
            modelTier: attemptMeta?.modelTier,
            candidatePlanPatch,
            reasonCodes: boundedReasons(applied.reasonCodes),
          });
        }
        return {
          status: 'fail',
          locallyRepairable: true,
          stage: 'plan_patch_apply',
          reasonCodes: boundedReasons(applied.reasonCodes),
          targetDiagnostics: applied.targetDiagnostics || null,
          repairInstructions: patchRepairInstruction(applied.reasonCodes),
        };
      }
      // Internal bounded repairs must satisfy the original patch ownership
      // checks as well; a repair never grants broader mutation authority.
      if (repairedPlan) applied.plan = preserveUntouchedDays({ priorPlan: priorItineraryData,
        nextPlan: repairedPlan, touchedDayNumbers: applied.touchedDayNumbers });
      rawPlan = normalizeCanonicalBackup(applied.plan);
      touchedDayNumbers = applied.touchedDayNumbers;
      const ownership = evaluateRefinementOwnership({
        priorPlan: priorItineraryData,
        nextPlan: applied.plan,
        userPrompt,
        touchedDayNumbers,
      });
      // HIERARCHICAL OWNERSHIP. The day-level check above proves unrelated days
      // are intact; this one proves the mutation stayed inside the part of the
      // day the traveler actually referred to.
      const scoped = refinementScope?.resolved
        ? evaluateScopedOwnership({
          priorPlan: priorItineraryData,
          nextPlan: applied.plan,
          scope: refinementScope,
          operations: candidatePlanPatch?.operations || null,
        })
        : { ok: true, reasonCodes: [], outsideScope: null };
      if (!scoped.ok) {
        return patchFailure({
          stage: 'refinement_scope_ownership',
          reasonCodes: scoped.reasonCodes,
          candidatePlanPatch,
          mergedPlan: applied.plan,
          planStageCapture,
          attemptMeta,
          targetDiagnostics: {
            requestedScopeLevel: refinementScope.level,
            requestedDayNumber: refinementScope.dayNumber,
            requestedDaypart: refinementScope.daypart,
            outsideScopeRemoved: scoped.outsideScope?.removed || [],
            outsideScopeAdded: scoped.outsideScope?.added || [],
            outsideScopeChanged: scoped.outsideScope?.changed || [],
          },
        });
      }
      // The delta is known here, before any downstream validator can change the
      // subject. Recorded now so a gate can compare what was claimed against
      // what actually moved.
      if (typeof planStageCapture === 'function') {
        planStageCapture({
          attempt: attemptMeta?.attempt,
          modelTier: attemptMeta?.modelTier,
          candidatePlanPatch,
          mutationSummary: buildMutationSummary({
            priorPlan: priorItineraryData, nextPlan: applied.plan,
          }),
        });
      }
      if (!ownership.ok) {
        if (typeof planStageCapture === 'function') {
          planStageCapture({
            attempt: attemptMeta?.attempt,
            modelTier: attemptMeta?.modelTier,
            candidatePlanPatch,
            mergedPlan: applied.plan,
            reasonCodes: boundedReasons(ownership.reasonCodes),
          });
        }
        return {
          status: 'fail',
          locallyRepairable: true,
          stage: 'refinement_ownership',
          reasonCodes: boundedReasons(ownership.reasonCodes),
          repairInstructions: patchRepairInstruction(ownership.reasonCodes),
        };
      }
    } else {
      // TIER-1 RESTORATION. The reduced model artifact becomes canonical HERE —
      // before the structural gate, evidence enrichment, the Maps route bridge
      // (which reads `stop.parkCode`) and finalization. Every field the model no
      // longer authors exists by the time its first consumer runs.
      rawPlan = bindGeneratedItineraryContract({
        itineraryData: normalizeCanonicalBackup(output.itineraryData),
        parkIdentityBinding,
      });
    }

    // EARLY STRUCTURAL ARTIFACT VALIDATION (P0-B).
    //
    // A plan whose day carries no positive duration anywhere can never be
    // delivered, so it is refused HERE — immediately after the artifact is
    // parsed and minimally normalized — instead of after evidence enrichment,
    // the Maps route bridge, constraint finalization, two correction passes and
    // semantic completeness have all run over it.
    //
    // This cannot newly reject a plan that passes today: the predicates are
    // completeness's own, at completeness's own thresholds, and
    // `finalizeStructuredItinerary` calls `correctItinerary` with
    // `replaceStops: false`, so correction only removes or downgrades stops —
    // it can never turn a zero duration into a positive one.
    const structural = evaluateStructuralArtifact({ itineraryData: rawPlan, constraints, userPrompt, touchedDayNumbers: usePlanPatch ? touchedDayNumbers : null });
    if (!structural.ok) {
      const reasonCodes = boundedReasons(structural.reasonCodes);
      if (typeof planStageCapture === 'function') {
        planStageCapture({
          attempt: attemptMeta?.attempt,
          modelTier: attemptMeta?.modelTier,
          rawPlan,
          candidatePlanPatch,
          mergedPlan: rawPlan,
          reasonCodes,
          dayDiagnostics: structural.dayDiagnostics || [],
        });
      }
      return {
        status: 'fail',
        locallyRepairable: true,
        stage: 'structured_artifact_structure',
        reasonCodes,
        // Carried so a caller can attempt a bounded micro-repair instead of a
        // full regeneration. Read-only: the candidate is never mutated here.
        dayDiagnostics: structural.dayDiagnostics || [],
        candidatePlan: rawPlan,
        // The ledger must not credit this candidate with obligations no
        // validator reached: a structurally refused artifact proves nothing
        // about its golden-hour coverage.
        evaluatedObligations: [...STRUCTURAL_OBLIGATIONS],
        repairInstructions: buildStructuralRepairInstructions({
          reasonCodes,
          dayDiagnostics: structural.dayDiagnostics || [],
        }),
      };
    }

    // Copy authoritative exposure from frozen EvidenceBundle when the model omitted it.
    // Never invents low from prose — only structured evidence metadata. Runs before
    // operational filters so confirmed-compatible stops survive hard no-exposure rules.
    const exposureEnriched = enrichItineraryExposureFromEvidenceBundle(rawPlan, bundle);
    const enrichedRaw = enrichItineraryMobilityFromEvidenceBundle(exposureEnriched, bundle);
    // Attach verified Maps route durations onto itinerary transitions / tripScope legs
    // BEFORE deterministic validators. Model drive minutes cannot weaken Maps truth.
    const endMaps = beginSpan('maps_route_bridge');
    const routeBridge = enrichItineraryWithRouteEvidence({
      itineraryData: enrichedRaw,
      tripScope: constraints?.tripScope || null,
      evidenceBundle: bundle,
    });
    endMaps();
    const bridgedConstraints = routeBridge.tripScope
      ? { ...constraints, tripScope: routeBridge.tripScope }
      : constraints;
    const destinationRouteOwnership = captureDestinationRouteOwnership(routeBridge.itineraryData);
    let workingPlan = routeBridge.itineraryData;

    // STRUCTURED-STOP IDENTITY BOUNDARY (2026-09-02). Place identity is
    // machine-owned: every experiential named stop must resolve to a frozen-
    // catalogue candidate (binding + coordinate fill), and a name that
    // resolves to nothing — or to a directive-excluded candidate — fails the
    // attempt instead of silently becoming a canonical place. Non-place
    // blocks (rest, meals, logistics, vague supporting) stay allowed and, as
    // before, cannot anchor a day. Patch turns enforce only touched days.
    const endIdentity = beginSpan('stop_identity_resolution');
    const identity = resolveStopIdentities({
      itineraryData: workingPlan,
      evidenceBundle: bundle,
      excludedEvidenceIds,
      touchedDayNumbers: usePlanPatch ? touchedDayNumbers : null,
    });
    endIdentity();
    if (identity.violations.length > 0) {
      const degraded = usePlanPatch
        ? { status: 'fail_closed', itineraryData: identity.itineraryData, reasonCodes: [] }
        : degradeUnresolvedModelStops({
          itineraryData: identity.itineraryData,
          violations: identity.violations,
          namedExperienceRequirements,
          evidenceBundle: bundle,
          excludedEvidenceIds,
          userPrompt,
          constraints,
        });
      if (degraded.status === 'degraded') {
        const rebound = resolveStopIdentities({
          itineraryData: degraded.itineraryData,
          evidenceBundle: bundle,
          excludedEvidenceIds,
          touchedDayNumbers: usePlanPatch ? touchedDayNumbers : null,
        });
        if (rebound.violations.length === 0) {
          workingPlan = rebound.itineraryData;
        }
      }
    }
    if (identity.violations.length > 0 && workingPlan === routeBridge.itineraryData) {
      const offending = identity.violations.slice(0, 3)
        .map((v) => `"${v.stopName}"${v.dayNumber != null ? ` (day ${v.dayNumber})` : ''}`)
        .join(', ');
      // The retry must know what a LEGAL construction is, not merely what was
      // wrong: name a bounded set of resolvable, non-excluded catalogue places
      // (primary experiences first). Machine-selected public names only.
      const legalNames = legalPlaceSuggestions({ bundle, excludedEvidenceIds, exposureDirective });
      const excludedViolations = identity.violations.some((v) => v.reasonCode === 'stop_identity_excluded');
      // Phase 9C.1D.5B — judge the named obligations on the identity-bound plan,
      // so a named stop that failed identity is recorded as FAILED rather than
      // left unjudged, and the retry is told to keep the exact named place.
      const namedAtIdentity = evaluateNamedExperienceSatisfaction({
        itineraryData: identity.itineraryData,
        requirements: namedExperienceRequirements,
        evidenceBundle: bundle,
      });
      const namedRepairLine = namedRequirementsRepairLine(namedExperienceRequirements);
      const identityReasonCodes = [...new Set([
        ...namedAtIdentity.reasonCodes,
        ...identity.violations.map((v) => v.reasonCode),
      ])];
      if (typeof planStageCapture === 'function') {
        planStageCapture({
          attempt: attemptMeta?.attempt,
          modelTier: attemptMeta?.modelTier,
          rawPlan,
          candidatePlanPatch,
          mergedPlan: workingPlan,
          reasonCodes: boundedReasons(identityReasonCodes),
        });
      }
      const offendingStops = identity.violations.map(v => ({ dayNumber: v.dayNumber, stopName: v.stopName }));
      const repairScope = resolveSubstitutionScope({ itineraryData: identity.itineraryData, offendingStops });
      const repairCatalog = identity.violations.length <= 3 && repairScope.ok && !namedAtIdentity.reasonCodes.length
        ? buildLegalSubstitutionCatalog({ bundle, constraints, candidatePlan: identity.itineraryData,
          repairScope, exposureDirective, excludedEvidenceIds }) : { count: 0, ok: false };
      return {
        status: 'fail',
        eligibleCandidateCount: repairCatalog.ok ? repairCatalog.count : 0,
        locallyRepairable: false,
        stage: 'stop_identity',
        reasonCodes: boundedReasons(identityReasonCodes),
        evaluatedObligations: [...STRUCTURAL_OBLIGATIONS, ...namedAtIdentity.evaluatedObligationIds],
        // Repaired patches re-run their original ownership checks.
        ...{
          candidatePlan: identity.itineraryData,
          offendingStops: identity.violations.slice(0, 3)
            .map((v) => ({ dayNumber: v.dayNumber ?? null, stopName: v.stopName, subjectName: v.subjectName || null })),
        },
        targetDiagnostics: {
          requestedStopName: identity.violations[0].stopName,
          dayNumber: identity.violations[0].dayNumber,
          matchedCount: identity.violations.length,
          availableStopNames: legalNames,
        },
        repairInstructions: [
          excludedViolations
            ? `These stops name places this traveler's active constraints rule out: ${offending}. Do not reuse them or near-variants of them.`
            : `These stops do not correspond to any place in the supplied evidence: ${offending}.`,
          // A named requirement is never offered a substitute: the suggestion
          // list is for the OTHER stops only, and says so.
          ...(namedRepairLine ? [namedRepairLine] : []),
          legalNames.length > 0
            ? `${namedRepairLine ? 'For any other stop, build' : 'Build'} named stops only from places the PUBLIC EVIDENCE actually names, for example: ${legalNames.join('; ')}.`
            : `${namedRepairLine ? 'For any other stop, build' : 'Build'} named stops only from places the PUBLIC EVIDENCE actually names.`,
          'A rest, meal, or flexible block is fine, but label it as that — do not present it as a named place, and do not rely on it to carry the day.',
        ].join(' '),
      };
    }
    if (identity.violations.length === 0) {
      workingPlan = identity.itineraryData;
    }

    const compounds = require('../utils/visitExperienceSemantics').normalizeCompoundVisits({
      itineraryData: workingPlan, bundle, touchedDayNumbers: usePlanPatch ? touchedDayNumbers : null,
    });
    workingPlan = compounds.itineraryData;
    if (compounds.changedDays.length) {
      const reconciled = require('../utils/canonicalPlanNarrative').reconcileCanonicalNarrative({
        itineraryData: workingPlan, afterRepair: true, changedDays: compounds.changedDays,
      });
      workingPlan = reconciled.itineraryData;
      output = { ...output, text: reconciled.text };
    }

    workingPlan = enrichItineraryExposureFromEvidenceBundle(workingPlan, bundle, {
      authoritativeOnly: require('../utils/planningInputContract').isAvoidExposureActive(constraints, userPrompt),
      touchedDayNumbers: usePlanPatch ? touchedDayNumbers : null,
    });

    // Phase 9B.2B — evidence-bound coordinate resolution. Runs AFTER stop
    // identity is grounded (evidenceRef/canonicalPlaceName already bound
    // above) and BEFORE finalization. Never touches the frozen pre-generation
    // `bundle` — operates purely on this attempt's candidate itinerary, and
    // the returned artifact is fingerprinted over that candidate's stop set
    // so it can never validate a different attempt's stops. No-op (zero
    // calls) unless a caller explicitly wires `resolveStopCoordinates`.
    const endGeoResolution = beginSpan('geo_resolution');
    const geoArtifact = await resolveGeoArtifactForAttempt({
      itineraryData: workingPlan,
      resolveStopCoordinates, signal, requestId: requestId || bundle?.requestId,
      attempt: attemptMeta?.attempt, dispatchIndex, evidenceBundle: bundle,
    });
    endGeoResolution();
    recordCoordinateResolution(geoArtifact.counts);
    if (!signal?.aborted && geoArtifact.candidateFingerprint === fingerprintCandidateStops(workingPlan)) {
      workingPlan = geoArtifact.itineraryData;
    }

    const narration = require('../utils/canonicalPlanNarrative').reconcileCanonicalNarrative({
      itineraryData: workingPlan, text: output.text, evidenceBundle: bundle,
    });
    workingPlan = narration.itineraryData;
    output = { ...output, text: narration.text };
    const endFinalize = beginSpan('finalize_itinerary');
    const finalized = await finalizeItinerary({
      itineraryData: workingPlan,
      constraints: bridgedConstraints,
      verifyStopRoutes: typeof resolveStopRoute === 'function' ? async ({ itineraryData, proposedDriveIntents }) => {
        const endRoutes = beginSpan('stop_route_verification');
        try {
          const routed = await resolveStopRouteArtifact({ itineraryData, evidenceBundle: bundle,
            getTransportation: () => bridgedConstraints?.planningState?.transportation,
            destinationOwned: destinationRouteOwnership, proposedDriveIntents,
            departureTimeBucket: routeDepartureTimeBucket,
            ownership: { requestId: requestId || bundle?.requestId, attempt: attemptMeta?.attempt, dispatchIndex },
            resolveStopRoute, signal });
          recordRouteResolution(routed.artifact);
          return routed;
        } finally { endRoutes(); }
      } : null,
      constraintValidateOptions: {
        drivingEvidenceLegs: routeBridge.drivingEvidenceLegs,
      },
    });
    endFinalize();
    const drivingClaimText = [output.text, finalized.itineraryData?.intro,
      ...(finalized.itineraryData?.narrativeSections || []).map((section) => section.markdown)].filter(Boolean).join(' ');
    if (drivingCoverageClaimConflict(drivingClaimText, finalized.routeCoverage)) {
      return { status: 'fail', locallyRepairable: true, stage: 'driving_verification_coverage',
        reasonCodes: ['driving_verification_claim_unsupported'],
        repairInstructions: drivingVerificationInstruction(finalized.routeCoverage) };
    }
    const contradiction = detectContradiction({
      text: output.text, itineraryData: finalized.itineraryData, bundle,
    });
    if (contradiction.length > 0) {
      if (typeof planStageCapture === 'function') {
        planStageCapture({
          attempt: attemptMeta?.attempt,
          modelTier: attemptMeta?.modelTier,
          rawPlan,
          candidatePlanPatch,
          mergedPlan: workingPlan,
          postConstraintPlan: finalized.itineraryData,
          reasonCodes: boundedReasons(contradiction),
        });
      }
      return {
        status: 'fail', locallyRepairable: false,
        reasonCodes: boundedReasons(contradiction), stage: 'itinerary_contradiction',
      };
    }
    if ((finalized.feasibilityIssues || []).length > 0) {
      if (typeof planStageCapture === 'function') {
        planStageCapture({
          attempt: attemptMeta?.attempt,
          modelTier: attemptMeta?.modelTier,
          rawPlan,
          postConstraintPlan: finalized.itineraryData,
          reasonCodes: boundedReasons(finalized.feasibilityIssues.map(issue => issue.reasonCode || issue.type || issue.basis || 'feasibility_unknown')),
        });
      }
      return {
        status: 'fail', locallyRepairable: true,
        reasonCodes: boundedReasons(finalized.feasibilityIssues.map(issue => issue.reasonCode || issue.type || issue.basis || 'feasibility_unknown')), stage: 'itinerary_feasibility',
        feasibilityIssues: finalized.feasibilityIssues,
        candidatePlan: finalized.itineraryData,
        targetDiagnostics: { dayNumber: finalized.feasibilityIssues[0]?.dayNumber ?? null },
      };
    }
    const operationalUnknown = (finalized.operationalConflicts || [])
      .filter((conflict) => conflict?.reasonCode === 'constraint_eligibility_unknown');
    if (operationalUnknown.length > 0) {
      return {
        status: 'fail',
        locallyRepairable: true,
        stage: 'operational_eligibility',
        reasonCodes: boundedReasons(['constraint_eligibility_unknown']),
        // Diagnose exact days; a repeated stop name is not ambiguous.
        ...(!usePlanPatch || operationalUnknown.every(c => touchedDayNumbers.includes(c.dayNumber)) ? {
          candidatePlan: finalized.itineraryData,
          offendingStops: operationalUnknown.slice(0, 3)
            .map((conflict) => ({ dayNumber: conflict.dayNumber ?? null, stopName: conflict.stop })),
        } : {}),
        repairInstructions: 'Do not treat unknown-exposure trails as safe. Choose other experience types (visitor center, scenic drive, lodge area, museum, picnic) or trails with confirmed low exposure. If the legal pool is small, say so rather than duplicating the same walk.',
      };
    }
    // Geographic identity alone cannot make an executable day. This is a
    // completeness defect, resolved before the later trip-quality gate.
    const actionDays = (finalized.itineraryData.days || []).map((day, index) => ({
      dayNumber: Number(day.dayNumber || day.day || index + 1),
      entries: (day.stops || []).map((stop, stopIndex) => {
        const credit = require('../utils/semanticDayValue').experienceRole(stop, {bundle, classifyStop});
        return { stopIndex, ...credit, applicable: true, actionable: credit.actionabilityStatus !== 'unbound' };
      }),
    }));
    const affected = actionDays.filter(day => day.entries.some(e => e.reasonCode)
      || day.entries.length && !day.entries.some(e => e.role === 'primary_experience') && day.entries.some(e => e.reason === 'visitor_service_support'))
      .filter(day => !usePlanPatch || touchedDayNumbers.includes(day.dayNumber));
    const coverageProjection = require('../utils/downstreamRepairPlanner').projectPlan(finalized.itineraryData,
      { bundle, constraints, userPrompt, priorItineraryData, isRefinement, relationshipAuthority,
        routeArtifact: finalized.routeArtifact, touchedDayNumbers: usePlanPatch ? touchedDayNumbers : null });
    if (affected.length) {
      for (const diagnostic of coverageProjection.days) {
        if (!diagnostic.codes.includes('insufficient_day_coverage') || affected.some(d => d.dayNumber === diagnostic.dayNumber)
          || usePlanPatch && !touchedDayNumbers.includes(diagnostic.dayNumber)) continue;
        affected.push(actionDays.find(d => d.dayNumber === diagnostic.dayNumber));
      }
      const catalog = buildEvidenceBoundRepairCandidates({ bundle, constraints, candidatePlan: finalized.itineraryData, requireExecutablePrimary: true });
      const candidates = catalog.candidates.filter(c => !c.evidenceIds.some(id => excludedEvidenceIds.includes(id)));
      const reasonCodes = [...new Set(affected.flatMap(d => d.entries.map(e => e.reasonCode).filter(Boolean)))];
      if (affected.some(d => !d.entries.some(e => e.role === 'primary_experience'))) reasonCodes.push('experience_scope_unbound');
      reasonCodes.push('insufficient_day_coverage');
      const actionability = { reasonCodes, candidates, affectedDays: affected.map(d => d.dayNumber),
        frozenDayNumbers: actionDays.filter(d => !affected.includes(d)).map(d => d.dayNumber),
        diagnostics: { days: affected.map(d => ({ dayNumber: d.dayNumber,
          weakStopIndexes: d.entries.filter(e => e.reasonCode || e.reason === 'visitor_service_support'
            || coverageProjection.days.find(p => p.dayNumber === d.dayNumber)?.codes.includes('insufficient_day_coverage')).map(e => e.stopIndex),
          actionability: d.entries })) } };
      return { status: 'fail', stage: 'itinerary_completeness', reasonCodes,
        retryability: candidates.length && actionability.affectedDays.length ? 'model_fixable' : 'evidence_blocker',
        eligibleCandidateCount: candidates.length, locallyRepairable: false, focusedRepairUsed: true,
        candidatePlan: finalized.itineraryData, actionability, touchedDayNumbers: usePlanPatch ? touchedDayNumbers : null,
        experienceDiagnostics: { compounds: compounds.relationships, actionability: actionDays },
        dayDiagnostics: coverageProjection.days.filter(d => affected.some(a => a.dayNumber === d.dayNumber)).map(d => ({ ...d, codes: [...new Set([...d.codes, 'insufficient_day_coverage'])] })),
      };
    }
    const endCompleteness = beginSpan('completeness_validation');
    const completeness = evaluateItineraryCompleteness({
      itineraryData: finalized.itineraryData,
      routeArtifact: finalized.routeArtifact,
      constraints,
      userPrompt,
      priorItineraryData,
      isRefinement,
      evidenceBundle: bundle,
      touchedDayNumbers: usePlanPatch ? touchedDayNumbers : null,
      ...(namedExperienceRequirements.length > 0 ? { namedExperienceRequirements } : {}),
      relationshipAuthority,
    });
    endCompleteness();
    if (typeof planStageCapture === 'function') {
      planStageCapture({
        attempt: attemptMeta?.attempt,
        modelTier: attemptMeta?.modelTier,
        rawPlan,
        candidatePlanPatch,
        mergedPlan: workingPlan,
        postConstraintPlan: finalized.itineraryData,
        reasonCodes: completeness.ok ? [] : boundedReasons(completeness.reasonCodes),
        dayDiagnostics: completeness.dayDiagnostics || [],
        // Bounded coverage-policy attribution: standard | mobility_limited |
        // numeric_mobility. Says WHICH completeness question this traveler was
        // asked, never why the model chose anything.
        coveragePolicy: completeness.coveragePolicy || 'standard',
      });
    }
    if (!completeness.ok) {
      const reasonCodes = boundedReasons(completeness.reasonCodes);
      const backupCandidateContext = userRequestsBackupPlan(userPrompt)
        ? buildBackupCandidateContext({ bundle, userPrompt, maxCandidates: 8 })
        : null;
      return {
        requestedExperienceCoverage: completeness.requestedExperienceCoverage,
        status: 'fail',
        locallyRepairable: true,
        stage: 'itinerary_completeness',
        reasonCodes,
        validationDiagnostics: boundedValidationDiagnostics({
          kind: 'semantic_validation',
          dayDiagnostics: completeness.dayDiagnostics || [],
        }),
        // Carried so a caller can attempt a bounded contained repair instead of
        // a full regeneration. This is the FINALIZED plan deliberately: it is
        // what completeness evaluated, so it is the only plan whose day and stop
        // positions the diagnostics actually index.
        dayDiagnostics: completeness.dayDiagnostics || [],
        candidatePlan: finalized.itineraryData,
        repairInstructions: buildCompletenessRepairInstructions({
          reasonCodes,
          dayDiagnostics: completeness.dayDiagnostics || [],
          backupCandidateContext,
          coveragePolicy: completeness.coveragePolicy || 'standard',
          namedExperienceRequirements,
        }),
      };
    }

    // TRAVELER FIT / OPERATIONAL FEASIBILITY.
    //
    // Completeness asks whether the day is full. It does not ask whether the
    // traveller can GET to what is in it. Gate #4 shipped "The Maze district"
    // — dirt-road access, permits, no services — as the 240-minute anchor of a
    // day for someone who asked for a relaxed trip with easy hikes, in BOTH
    // independent runs, past every validator.
    //
    // This is an anchoring rule, not a ban: a place with an access dependency
    // may appear with that dependency stated. It may not silently become what
    // the day is built around when the traveller never established the
    // capability it needs.
    const endTravelerFit = beginSpan('traveler_fit');
    const travelerFit = evaluateTravelerFit({
      itineraryData: finalized.itineraryData,
      routeArtifact: finalized.routeArtifact,
      constraints,
      userPrompt,
      // Authoritative operational facts from the frozen bundle. Without these
      // the rule can only catch a plan that confesses its own dependency.
      evidenceBundle: bundle,
    });
    endTravelerFit();
    // Eval-only: record the producer → fit chain for THIS attempt whatever the
    // outcome, so a live gate can tell "no dependency existed" apart from "the
    // dependency was never produced".
    if (typeof planStageCapture === 'function') {
      planStageCapture({
        attempt: attemptMeta?.attempt,
        modelTier: attemptMeta?.modelTier,
        operationalFacts: operationalFactsFromBundle(bundle),
        travelerFit,
      });
    }
    if (!travelerFit.ok) {
      const reasonCodes = boundedReasons(travelerFit.reasonCodes);
      // PHASE 2. Traveler fit has always known which day each finding sits on;
      // the day was dropped before reaching the shared diagnostics shape, which
      // left this the one creation-path failure whose repair scope a machine
      // could not resolve. Projection only — no verdict and no code moves, and
      // it fails closed rather than emitting a partial day map.
      const fitDiagnostics = buildTravelerFitDayDiagnostics({ findings: travelerFit.findings });
      const dayDiagnostics = fitDiagnostics.ok ? fitDiagnostics.dayDiagnostics : [];
      if (typeof planStageCapture === 'function') {
        planStageCapture({
          attempt: attemptMeta?.attempt,
          modelTier: attemptMeta?.modelTier,
          rawPlan,
          postConstraintPlan: finalized.itineraryData,
          reasonCodes,
          dayDiagnostics,
        });
      }
      return {
        requestedExperienceCoverage: completeness.requestedExperienceCoverage,
        status: 'fail',
        locallyRepairable: true,
        stage: 'traveler_fit',
        reasonCodes,
        dayDiagnostics,
        repairInstructions: buildTravelerFitRepairInstructions({
          reasonCodes,
          findings: travelerFit.findings,
        }),
      };
    }

    const mobilityClaimText = [
      output.text,
      finalized.itineraryData?.intro,
      ...(finalized.itineraryData?.narrativeSections || []).map((section) => section?.markdown || ''),
    ].filter(Boolean).join('\n');
    const mobilityClaims = evaluateMobilityClaimConsistency({
      text: mobilityClaimText,
      itineraryData: finalized.itineraryData,
      constraints,
      evidenceBundle: bundle,
    });
    if (!mobilityClaims.ok) {
      const reasonCodes = boundedReasons(mobilityClaims.reasonCodes);
      return {
        requestedExperienceCoverage: completeness.requestedExperienceCoverage,
        status: 'fail',
        locallyRepairable: true,
        stage: 'mobility_claim_consistency',
        reasonCodes,
        repairInstructions: buildCompletenessRepairInstructions({ reasonCodes }),
      };
    }
    // Same prose-claim rule as the plain-answer path: the narrative attached to
    // a plan must not contradict a hard constraint either.
    const itineraryProseConstraints = evaluateProseConstraintSafety({
      text: mobilityClaimText,
      constraints,
    });
    if (!itineraryProseConstraints.ok) {
      return {
        requestedExperienceCoverage: completeness.requestedExperienceCoverage,
        status: 'fail',
        locallyRepairable: true,
        hardConstraintViolation: true,
        stage: 'prose_constraint_safety',
        reasonCodes: boundedReasons(itineraryProseConstraints.reasonCodes),
        repairInstructions: buildProseConstraintRepairInstructions(itineraryProseConstraints),
      };
    }

    const language = evaluateTravelerLanguage({
      text: output.text,
      intro: finalized.itineraryData?.intro,
      itineraryData: finalized.itineraryData,
    });
    if (!language.ok) {
      return {
        requestedExperienceCoverage: completeness.requestedExperienceCoverage,
        status: 'fail',
        locallyRepairable: true,
        stage: 'traveler_language',
        reasonCodes: boundedReasons(['traveler_language_violation', ...language.reasonCodes]),
        repairInstructions: buildTravelerLanguageRepairInstructions(language),
      };
    }

    // Structured plan may be valid; prose must still not overclaim budget truth.
    const budgetFail = budgetClaimGate(output.text);
    if (budgetFail) {
      if (typeof planStageCapture === 'function') {
        planStageCapture({
          attempt: attemptMeta?.attempt,
          modelTier: attemptMeta?.modelTier,
          rawPlan,
          postConstraintPlan: finalized.itineraryData,
          reasonCodes: budgetFail.reasonCodes,
        });
      }
      return { ...budgetFail, requestedExperienceCoverage: completeness.requestedExperienceCoverage };
    }

    // P1-6 — attach the machine-owned requirements travelerFit already computed
    // (permit/reservation, shuttle-or-boat access, seasonal access, remote
    // self-sufficiency — see travelerFit.requirements above) onto the exact
    // stop/day they belong to. Pure projection: nothing here re-evaluates fit,
    // and a plan with no ACTION_REQUIRED obligations comes back unchanged.
    let itineraryWithRequirements = attachTravelerRequirements({
      itineraryData: finalized.itineraryData,
      requirements: travelerFit.requirements,
    });
    if (usePlanPatch) {
      itineraryWithRequirements = preserveUntouchedDays({ priorPlan: priorItineraryData,
        nextPlan: itineraryWithRequirements, touchedDayNumbers });
    }
    for (const referenceBase of [priorItineraryData, ...derivedReferenceBases]) {
      const revisionContent = require('../utils/invalidateRemovedStopReferences').invalidateRemovedStopReferences({
        priorPlan: referenceBase, itineraryData: itineraryWithRequirements, text: output.text,
      });
      itineraryWithRequirements = revisionContent.itineraryData;
      output = { ...output, text: revisionContent.text };
    }

    const tripQuality = require('../utils/tripExperienceQuality').evaluateTripExperienceQuality({
      itineraryData: itineraryWithRequirements, bundle, constraints, userPrompt, excludedEvidenceIds,
      touchedDayNumbers: usePlanPatch ? touchedDayNumbers : null,
    });
    if (!tripQuality.ok) return {
      status: 'fail', stage: 'trip_quality', reasonCodes: tripQuality.reasonCodes,
      retryability: tripQuality.retryability, eligibleCandidateCount: tripQuality.candidates.length,
      // A quality failure must never become a whole-plan retry or Astra request.
      locallyRepairable: false, focusedRepairUsed: true,
      candidatePlan: itineraryWithRequirements, tripQuality,
      requestedExperienceCoverage: completeness.requestedExperienceCoverage,
    };
    return {
      requestedExperienceCoverage: completeness.requestedExperienceCoverage,
      status: 'pass',
      experienceDiagnostics: { compounds: compounds.relationships, actionability: actionDays },
      tripQuality,
      finalizedPlan: { ...finalized, itineraryData: itineraryWithRequirements },
      // Which days the mutation actually changed. The fulfillment invariant
      // needs this: an "applied" patch that touched nothing has not fulfilled a
      // required mutation.
      touchedDayNumbers: usePlanPatch ? touchedDayNumbers : [],
      planPatchApplied: usePlanPatch,
      response: { kind: 'itinerary', text: output.text },
    };
  }

  return validateProseOnly({
    output, bundle, constraints, detectContradiction, budgetClaimGate, comparisonSelection, actionableContingency,
  });
}

/**
 * Truth/safety/constraint validation for a prose answer with no structured
 * artifact. Split out so a turn whose STRUCTURE failed can still have its prose
 * judged by exactly the same rules before any safe degradation.
 */
function validateProseOnly({
  output, bundle, constraints, detectContradiction, budgetClaimGate, comparisonSelection = null,
  actionableContingency = null,
}) {
  if (output.guidanceValidation && !output.guidanceValidation.ok) return {
    status: 'fail', locallyRepairable: true, stage: 'structured_guidance',
    reasonCodes: output.guidanceValidation.reasonCodes,
    repairInstructions: 'Use bound subjects and explicit recommendation or avoidance segments. Do not recommend incompatible or unverified activities.',
  };
  if (output.completionStatus === 'incomplete') {
    return {
      status: 'fail', locallyRepairable: true,
      reasonCodes: ['output_incomplete'], stage: 'prose_output_incomplete',
      repairInstructions: 'Return a complete, concise answer within the output budget; do not continue the cut-off sentence.',
    };
  }
  const text = String(output.text || '').trim();
  if (!text) {
    return {
      status: 'fail', locallyRepairable: true,
      reasonCodes: ['output_incomplete'], stage: 'prose_output_empty',
    };
  }
  const contradiction = detectContradiction({ text: output.text, itineraryData: null, bundle });
  if (contradiction.length > 0) {
    return {
      status: 'fail', locallyRepairable: false,
      reasonCodes: boundedReasons(contradiction), stage: 'prose_contradiction',
    };
  }
  const mobilityClaims = evaluateMobilityClaimConsistency({
    text,
    itineraryData: null,
    constraints,
    evidenceBundle: bundle,
  });
  if (!mobilityClaims.ok) {
    const reasonCodes = boundedReasons(mobilityClaims.reasonCodes);
    return {
      status: 'fail',
      locallyRepairable: true,
      stage: 'mobility_claim_consistency',
      reasonCodes,
      repairInstructions: buildCompletenessRepairInstructions({ reasonCodes }),
    };
  }
  // P0A — hard constraints bind prose too. The check above is evidence-relative;
  // this one reads the answer's own claims, so a named place the bundle never
  // mentioned cannot slip an 8-mile exposed hike past a 1-mile limit.
  const proseConstraints = output.guidanceValidation?.ok ? { ok: true } : evaluateProseConstraintSafety({ text, constraints });
  if (!proseConstraints.ok) {
    return {
      status: 'fail',
      locallyRepairable: true,
      hardConstraintViolation: true,
      stage: 'prose_constraint_safety',
      reasonCodes: boundedReasons(proseConstraints.reasonCodes),
      repairInstructions: buildProseConstraintRepairInstructions(proseConstraints),
    };
  }
  const budgetFail = budgetClaimGate(output.text);
  if (budgetFail) return budgetFail;
  const language = evaluateTravelerLanguage({ text: output.text });
  if (!language.ok) {
    return {
      status: 'fail',
      locallyRepairable: true,
      stage: 'traveler_language',
      reasonCodes: boundedReasons(['traveler_language_violation', ...language.reasonCodes]),
      repairInstructions: buildTravelerLanguageRepairInstructions(language),
    };
  }
  if (comparisonSelection?.required) {
    const selection = evaluateComparisonSelectionAnswer({
      text,
      required: true,
      candidates: comparisonSelection.candidates || [],
      resolvedCandidates: comparisonSelection.candidates || [],
      criterionEvidence: comparisonSelection.criterionEvidence || null,
    });
    if (!selection.ok) {
      const reasonCodes = boundedReasons(selection.reasonCodes);
      return {
        status: 'fail',
        locallyRepairable: true,
        stage: 'comparison_selection',
        reasonCodes,
        repairInstructions: buildComparisonSelectionRepairInstructions({
          reasonCodes,
          candidates: comparisonSelection.candidates || [],
        }),
      };
    }
  }
  if (actionableContingency?.required) {
    const fallbackCandidates = (actionableContingency.candidates && actionableContingency.candidates.length)
      ? actionableContingency.candidates
      : extractNamedFromEvidence(bundle);
    const contingency = evaluateActionableContingencyAnswer({
      text,
      required: true,
      userPrompt: actionableContingency.userPrompt || '',
      bundle,
      candidates: fallbackCandidates,
      constraints: actionableContingency.constraints || constraints,
    });
    if (!contingency.ok) {
      const reasonCodes = boundedReasons(contingency.reasonCodes);
      return {
        status: 'fail',
        locallyRepairable: true,
        stage: 'actionable_contingency',
        reasonCodes,
        repairInstructions: buildActionableContingencyRepairInstructions({
          reasonCodes,
          candidates: fallbackCandidates,
        }),
      };
    }
  }
  return { status: 'pass', response: { kind: 'text', text } };
}

module.exports = {
  CANONICAL_EVENTS,
  EXECUTION_RESULT_VERSION,
  aggregateAttemptCost,
  defaultDetectContradiction,
  defaultResolveDeterministicRender,
  deriveRouterSignals,
  evaluateEvidenceGate,
  executeTrailieTurn,
  executeTrailieV2Turn: executeTrailieTurn,
  intentToPromptMode,
  // Pure, deterministic seams exposed for contract tests only.
  __testables: {
    validateGeneration,
    FAILURE_CLASSES,
    MAX_OUTPUT_TOKENS,
    OUTPUT_BUDGET_POLICY,
    resolveOutputBudget,
    classifyValidationFailure,
    isStructuralFailureClass,
    structureRetryAllowed,
    evidenceSummary,
    normalizationContractSummary,
    legalPlaceSuggestions,
    dispatchStopSubstitutionRepair,
    syncTripScopeDestinationFromIntent,
    applyResolvedEntitiesOverride,
    syncPlanningStateDestinationFromIntent,
    projectTargetPlanVersion,
  },
};
