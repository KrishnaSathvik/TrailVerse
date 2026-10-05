'use strict';

/**
 * Stage 13.1/13.2 §2/§6/§7/§10 — internal live-provider smoke + full live
 * evaluation, with LAYERED hard safety caps. This module never fabricates
 * results: with no configured live clients it returns `not_executed` and the
 * exact reasons.
 *
 * Gating (ALL required before any live call):
 *   - TRAILIE_EVAL_LIVE_PROVIDERS=true
 *   - caller-supplied real clients { anthropic?, openai? }
 *   - TRAILIE_EVAL_MAX_TOTAL_COST_USD     (USD ceiling)
 *   - TRAILIE_EVAL_MAX_REQUESTS           (hard request ceiling)
 *   - TRAILIE_EVAL_MAX_INPUT_TOKENS       (hard input-token ceiling)
 *   - TRAILIE_EVAL_MAX_OUTPUT_TOKENS      (hard output-token ceiling)
 *   - TRAILIE_EVAL_MODEL_ALLOWLIST        (explicit provider:model / model allowlist)
 *
 * Pricing policy (Stage 13.2 §2):
 *   - Known pricing  → enforce BOTH the USD cap AND the request/token ceilings.
 *   - Unknown pricing → a SMALL SMOKE only, bounded by the request/token ceilings;
 *                       the cost rollout gate stays `not_passed`; the FULL
 *                       repetition matrix is REFUSED.
 *   - Execution stops BEFORE the next provider request when any cap would be
 *     exceeded, and the report names the binding cap.
 *
 * Credentials are NEVER read here, logged, or persisted — only opaque client
 * objects supplied by the caller are used.
 */

const fs = require('fs');
const path = require('path');
const { runOneVariant } = require('./index');
const { getModelPricing, estimateCostUsd, COST_UNKNOWN } = require('./pricing');
const { createRunLedger, USAGE_ACCOUNTING_VERSION } = require('./usageAccounting');
const { CLAUDE_PRIMARY_MODEL } = require('../../config/aiModels');

// ── Stage 13.3 — provider scope (Trailie plan/prose is Claude-only) ──────────
// Trailie itinerary planning and prose generation route to Claude only under the
// current production configuration (autoRouteProvider → TRAILIE_DEFAULT_PROVIDER
// || 'claude'; Phase A/B are provider-gated with no cross-provider fallback).
// OpenAI is retained as a compatibility-only adapter and an auxiliary possible
// provider (trailieLiteLlm digest/refine), NOT a live-rollout-eligible provider.
const PROVIDER_SCOPE = {
  statement: 'Trailie itinerary planning and itinerary prose generation are Claude-only in the current production configuration.',
  productionLiveEligible: ['claude'],
  compatibilityTested: ['openai'],
  auxiliaryPossibleProvider: ['openai (via trailieLiteLlm digest/refine only — not plan/prose)'],
  openaiPricingStatus: 'not_applicable_to_trailie_live_rollout',
};

/**
 * The live-eligible matrix, resolved through the SAME production configuration as
 * autoRouteProvider() and the Claude client path — the model comes from
 * CLAUDE_PRIMARY_MODEL (env-overridable) so it can never drift from production.
 * Read dynamically so changing CLAUDE_PRIMARY_MODEL needs no harness edit.
 */
function resolveLiveEligibleMatrix() {
  const model = process.env.CLAUDE_PRIMARY_MODEL || CLAUDE_PRIMARY_MODEL;
  return [{ provider: 'claude', model }];
}

/**
 * Isolate provider clients so a provider-under-test cannot silently use the other
 * provider. For Claude, the OpenAI client is forced to null (and vice versa) —
 * this is what guarantees a Claude-only smoke issues ZERO OpenAI requests.
 */
function isolateClientsFor(provider, clients) {
  if (provider === 'openai') return { anthropic: null, openai: (clients && clients.openai) || null };
  return { anthropic: (clients && clients.anthropic) || null, openai: null };
}

// Conservative upper bound on provider calls per evaluation run: up to 2
// structured attempts (initial + one recovery) + up to 2 prose calls (initial +
// one retry). Used only to project a worst-case request budget in preflight.
const MAX_PROVIDER_CALLS_PER_RUN = 4;

const SMOKE_SCENARIO_IDS = [
  'basic-02-three-day',
  'basic-03-seven-day',
  'basic-04-multi-park',
  'correction-08-exceeds-difficulty',
  'structured-21-truncated-then-recover', // exercises retry path shape
  'prose-33-removed-active',
  'prose-28-wrong-day',
  'structured-19-missing-tool', // prose fallback behavior
];

// Hard upper bound on a smoke run regardless of env caps — a smoke is small.
const SMOKE_MAX_REQUESTS_HARD = 64;

function readPositiveNumber(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readCostCap() {
  return readPositiveNumber('TRAILIE_EVAL_MAX_TOTAL_COST_USD');
}

/** Parse TRAILIE_EVAL_MODEL_ALLOWLIST: comma-separated `provider:model` or `model`. */
function readAllowlist() {
  const raw = process.env.TRAILIE_EVAL_MODEL_ALLOWLIST;
  if (!raw) return null;
  const entries = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return entries.length ? entries : null;
}

function isAllowed(allowlist, provider, model) {
  if (!allowlist) return false;
  return allowlist.includes(model) || allowlist.includes(`${provider}:${model}`);
}

/** Read every configured cap once. */
function readCaps() {
  return {
    maxCostUsd: readCostCap(),
    maxRequests: readPositiveNumber('TRAILIE_EVAL_MAX_REQUESTS'),
    maxInputTokens: readPositiveNumber('TRAILIE_EVAL_MAX_INPUT_TOKENS'),
    maxOutputTokens: readPositiveNumber('TRAILIE_EVAL_MAX_OUTPUT_TOKENS'),
    allowlist: readAllowlist(),
  };
}

/**
 * Preconditions for a live run.
 * @param {Object} params
 * @param {Array}  params.providerMatrix
 * @param {Object} params.clients
 * @param {'smoke'|'full'} [params.phase='smoke']
 */
function liveGateStatus({ providerMatrix = [], clients = null, phase = 'smoke' } = {}) {
  const reasons = [];
  const caps = readCaps();

  if (String(process.env.TRAILIE_EVAL_LIVE_PROVIDERS).toLowerCase() !== 'true') reasons.push('TRAILIE_EVAL_LIVE_PROVIDERS!=true');
  if (!clients || (!clients.anthropic && !clients.openai)) reasons.push('no configured live clients');

  if (caps.maxCostUsd == null) reasons.push('TRAILIE_EVAL_MAX_TOTAL_COST_USD unset');
  if (caps.maxRequests == null) reasons.push('TRAILIE_EVAL_MAX_REQUESTS unset (hard request ceiling required)');
  if (caps.maxInputTokens == null) reasons.push('TRAILIE_EVAL_MAX_INPUT_TOKENS unset (hard input-token ceiling required)');
  if (caps.maxOutputTokens == null) reasons.push('TRAILIE_EVAL_MAX_OUTPUT_TOKENS unset (hard output-token ceiling required)');

  // Explicit allowlist: every model in the matrix must be listed.
  if (!caps.allowlist) {
    reasons.push('TRAILIE_EVAL_MODEL_ALLOWLIST unset (explicit provider/model allowlist required)');
  } else {
    const notAllowed = providerMatrix.filter((m) => !isAllowed(caps.allowlist, m.provider, m.model))
      .map((m) => `${m.provider}:${m.model}`);
    if (notAllowed.length) reasons.push(`not on allowlist: ${notAllowed.join(', ')}`);
  }

  // Pricing classification (Stage 13.2 §2 / 13.3B) — date-aware.
  const priced = providerMatrix.filter((m) => getModelPricing(m.model)).map((m) => m.model);
  const unpriced = providerMatrix.filter((m) => !getModelPricing(m.model)).map((m) => m.model);
  const costRolloutGate = unpriced.length === 0 ? 'passed_eligible' : 'not_passed';
  const priceInfo = priceMetadata(providerMatrix);

  // Full matrix is REFUSED with unknown pricing; smoke is permitted under the
  // request/token ceilings (cost gate stays not_passed).
  if (phase === 'full' && unpriced.length) {
    reasons.push(`full repetition matrix refused: unknown pricing for ${unpriced.join(', ')} — smoke only until priced`);
  }

  return {
    ok: reasons.length === 0,
    phase,
    reasons,
    caps,
    pricing: { priced, unpriced, ...priceInfo },
    costRolloutGate,
    // §6 — with a resolvable price table the USD cap becomes enforceable.
    costCapEnforceable: caps.maxCostUsd != null && unpriced.length === 0,
    pricingMode: unpriced.length ? 'unknown_pricing_smoke_only' : 'known_pricing',
  };
}

// Conservative per-call input reservation (we can't know input size pre-call).
const RESERVE_INPUT_TOKENS_PER_CALL = Number(process.env.TRAILIE_EVAL_RESERVE_INPUT_TOKENS_PER_CALL || 20000);
const RESERVE_OUTPUT_TOKENS_PER_CALL = 4000;

/** Price metadata for the eligible (priced) models on `atDate`. */
function priceMetadata(providerMatrix = [], atDate) {
  const priced = providerMatrix
    .map((m) => ({ model: m.model, pricing: getModelPricing(m.model, { atDate }) }))
    .filter((x) => x.pricing);
  const models = {};
  for (const { model, pricing } of priced) {
    models[model] = {
      inputUsdPerMillion: pricing.inputPerMTok,
      outputUsdPerMillion: pricing.outputPerMTok,
      priceConfigVersion: pricing.priceConfigVersion,
      activePricePeriod: pricing.activePricePeriod,
      source: pricing.source,
    };
  }
  const first = priced[0]?.pricing || null;
  return {
    priceConfigVersion: first ? first.priceConfigVersion : null,
    activePricePeriod: first ? first.activePricePeriod : null,
    models,
  };
}

/**
 * §2 — conservative maximum USD cost of the NEXT call, using per-call token
 * reservations. Returns COST_UNKNOWN when the model is unpriced (cap not enforceable).
 */
function estimateNextCallMaxCostUsd({ model, atDate } = {}) {
  const pricing = getModelPricing(model, { atDate });
  if (!pricing) return COST_UNKNOWN;
  return (RESERVE_INPUT_TOKENS_PER_CALL / 1e6) * pricing.inputPerMTok
    + (RESERVE_OUTPUT_TOKENS_PER_CALL / 1e6) * pricing.outputPerMTok;
}

/**
 * Evaluate the four hard caps against current cumulative totals. Returns the
 * name of the FIRST cap that is already met/exceeded, or null if all clear.
 * "Stop BEFORE the next provider request when any cap would be exceeded."
 */
function firstBindingCap(totals, caps, hardRequestCeiling) {
  if (hardRequestCeiling != null && totals.requests >= hardRequestCeiling) return 'smoke_hard_request_ceiling';
  if (caps.maxRequests != null && totals.requests >= caps.maxRequests) return 'max_requests';
  if (caps.maxInputTokens != null && totals.inputTokens >= caps.maxInputTokens) return 'max_input_tokens';
  if (caps.maxOutputTokens != null && totals.outputTokens >= caps.maxOutputTokens) return 'max_output_tokens';
  // Cost cap only binds when cost is known.
  if (caps.maxCostUsd != null && totals.costKnown && totals.costUsd >= caps.maxCostUsd) return 'max_total_cost_usd';
  return null;
}

/**
 * Run a bounded live smoke. Records adapter-level success separately from final
 * pipeline success, and STOPS before the next request when any cap binds.
 *
 * @returns {Promise<Object>} report (status 'not_executed' if the gate fails)
 */
async function runLiveSmoke({ scenarios, providerMatrix = [], clients = null, routeVariant = 'authenticated_non_streaming', repetitions = 1 } = {}) {
  const gate = liveGateStatus({ providerMatrix, clients, phase: 'smoke' });
  if (!gate.ok) {
    return {
      status: 'not_executed',
      phase: 'smoke',
      reasons: gate.reasons,
      caps: gate.caps,
      pricing: gate.pricing,
      costRolloutGate: gate.costRolloutGate,
      wouldCover: SMOKE_SCENARIO_IDS,
      note: 'Live smoke infrastructure is ready. Provide TRAILIE_EVAL_LIVE_PROVIDERS=true, real clients, the four caps (cost/requests/input-tokens/output-tokens), and an explicit model allowlist to execute. Credentials are never read, logged, or persisted here.',
    };
  }

  const smokeSet = scenarios.filter((s) => SMOKE_SCENARIO_IDS.includes(s.scenarioId));
  const caps = gate.caps;
  const results = [];
  // Stage 13.9 §2 — cumulative session totals, carried into each run's ledger so
  // caps bind across the whole smoke, not just within one run.
  let totals = { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, costKnown: gate.pricing.unpriced.length === 0 };
  const ledgerReports = [];
  let bindingCap = null;

  outer:
  for (const scenario of smokeSet) {
    for (const { provider, model } of providerMatrix) {
      for (let rep = 1; rep <= repetitions; rep += 1) {
        bindingCap = firstBindingCap(totals, caps, SMOKE_MAX_REQUESTS_HARD);
        if (bindingCap) break outer;

        // §2 — forward-looking cost reservation: refuse the next call if its
        // conservative maximum could push estimated spend past the USD cap. Only
        // enforceable when the model is priced; unpriced models rely on the
        // request/token ceilings above (cost gate stays not_passed).
        const reservation = estimateNextCallMaxCostUsd({ model });
        if (reservation !== COST_UNKNOWN && caps.maxCostUsd != null
            && totals.costUsd + reservation > caps.maxCostUsd) {
          bindingCap = 'max_total_cost_usd_reservation';
          break outer;
        }

        // §1/§2 — per-provider-call ledger. EVERY structured attempt (including a
        // discarded truncated one) and every Phase B call reserves before it runs
        // and settles to its own actual usage after, so no attempt's spend can be
        // overwritten by a later one and a retry is refused before it executes if
        // its reservation would breach a cap.
        const ledger = createRunLedger({
          model, caps, priorTotals: totals, hardRequestCeiling: SMOKE_MAX_REQUESTS_HARD,
        });

        // eslint-disable-next-line no-await-in-loop
        const rec = await runOneVariant({
          scenario, provider, model, generationMode: 'tool_first', consistencyMode: 'enforce',
          providerMode: 'live', routeVariant, clients, budgetGuard: ledger,
        });

        const ledgerReport = ledger.report();
        ledgerReports.push({ scenarioId: scenario.scenarioId, repetition: rep, ...ledgerReport });
        // The ledger — not the record's final-attempt view — is now the source of
        // truth for cumulative spend and cap enforcement.
        totals = ledger.totals();
        const providerRequests = ledgerReport.providerRequests
          || Math.max(1, (rec.structured.structuredAttemptCount || 0) + (rec.prose.proseAttemptCount || 0));
        const cost = ledgerReport.reconciliation.runEstimatedCostUsd;
        if (ledgerReport.blocked.length && !bindingCap) bindingCap = ledgerReport.blocked[0].blockedBy;

        results.push({
          runId: rec.runId, scenarioId: scenario.scenarioId, provider, model, repetition: rep,
          // Adapter-level success = the structured provider produced a usable tool
          // call at least once (may be via recovery). Pipeline success = a frozen
          // itinerary reached the user. A recovery makes primary-adapter=fail,
          // pipeline=success — provider fallback is NOT counted as adapter success.
          adapterFirstAttemptSuccess: rec.structured.structuredAttemptCount === 1 && rec.structured.itineraryReady,
          adapterRecoveryUsed: rec.structured.structuredRecoveryUsed,
          pipelineSuccess: rec.structured.itineraryReady,
          evidenceClass: rec.evidenceClass,
          orchestrationOutcome: rec.structured.orchestrationOutcome,
          structuredStatus: rec.structured.structuredStatus,
          structuredValidationErrors: rec.structured.validationErrors || [],
          feasibilityIssueTypes: rec.structured.feasibilityIssueTypes || [],
          attemptCount: rec.structured.structuredAttemptCount,
          // Stage 13.8B §5 — publish the per-attempt Phase A telemetry, not just the
          // aggregate. Without it a multi-minute structured recovery is only
          // classifiable as "probable truncation" in the artifact. Already sanitized
          // by the orchestrator (status/stopReason/budgets/usage/duration only).
          structuredAttempts: (rec.structured.structuredAttempts || []).map((a) => ({ ...a })),
          // Stage 13.9 §5 — sanitized budget provenance for this run.
          tripLengthResolution: rec.structured.tripLengthResolution || null,
          structuredTokenBudgetSelection: rec.structured.structuredTokenBudgetSelection || null,
          // Stage 13.5 — Phase A shape + budget detail.
          toolInputNormalization: rec.structured.toolInputNormalization,
          selectedStructuredMaxTokens: rec.structured.selectedStructuredMaxTokens,
          truncated: rec.structured.structuredStatus === 'truncated',
          itineraryDays: rec.structured.itineraryDays,
          finalItineraryValid: rec.structured.finalItineraryValid,
          // Phase B detail.
          proseAttemptCount: rec.prose.proseAttemptCount,
          deterministicFallbackUsed: rec.prose.deterministicFallbackUsed === true,
          consistencyStatus: rec.prose.consistencyStatus,
          issueTypeCounts: rec.prose.issueTypeCounts || {},
          removedStopMentionCount: rec.prose.removedStopMentionCount || 0,
          missingDayCount: rec.prose.missingDayCount || 0,
          orderViolationCount: rec.prose.orderViolationCount || 0,
          providerRequests: Math.max(1, providerRequests),
          tokens: rec.tokens,
          estimatedCostUsd: cost,
          // Stage 13.9 §1/§2 — the reservation ledger for this run: one row per real
          // provider call, each priced from its own usage (or, when the provider
          // reported none, from its conservative reservation).
          usageLedger: ledgerReport,
          usageAccountingVersion: USAGE_ACCOUNTING_VERSION,
          // Segmented latency (Phase A only cases still carry these).
          phaseADurationMs: rec.timings.phaseAStartToCompleteMs,
          phaseBGenerationDurationMs: rec.timings.phaseBGenerationDurationMs,
          proseVerificationDurationMs: rec.timings.proseVerificationDurationMs,
          proseRetryDurationMs: rec.timings.proseRetryDurationMs,
          phaseBProviderTimeToFirstTokenMs: rec.timings.phaseBProviderTimeToFirstTokenMs, // 'not_applicable'
          ttftMs: rec.timings.timeToFirstVisibleProseMs,
          latencyMs: rec.timings.totalResponseDurationMs,
          invariantViolations: (rec.invariantViolations || []).length,
          invariantViolationCodes: (rec.invariantViolations || []).map((v) => v.code),
        });
        // A call refused mid-run by its own reservation stops the smoke here — the
        // report names the cap that bound rather than silently continuing.
        if (bindingCap) break outer;
      }
    }
  }

  const spentEstimatedUsd = totals.costKnown ? Number(totals.costUsd.toFixed(6)) : COST_UNKNOWN;
  return {
    status: bindingCap ? `aborted_${bindingCap}` : 'executed',
    phase: 'smoke',
    bindingCap,
    constrainedBy: bindingCap || 'completed_within_caps',
    caps,
    pricing: gate.pricing,
    pricingMode: gate.pricingMode,
    costRolloutGate: gate.costRolloutGate,
    costCapEnforceable: gate.costCapEnforceable,
    priceConfigVersion: gate.pricing.priceConfigVersion || null,
    activePricePeriod: gate.pricing.activePricePeriod || null,
    // §2 cost accounting (estimated, never a billed figure).
    spentEstimatedUsd,
    remainingEstimatedUsd: (totals.costKnown && caps.maxCostUsd != null)
      ? Number((caps.maxCostUsd - totals.costUsd).toFixed(6)) : COST_UNKNOWN,
    totals: {
      requests: totals.requests,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      costUsd: spentEstimatedUsd,
    },
    // Stage 13.9 §1/§3 — every real provider call in the smoke, in order, with the
    // basis each was priced on. `multi_attempt_v1` marks all-attempt semantics.
    usageAccountingVersion: USAGE_ACCOUNTING_VERSION,
    usageLedgers: ledgerReports,
    runCount: results.length,
    results,
  };
}

/**
 * Full live matrix — REFUSED unless every model is priced. Same cap-enforcement
 * loop as the smoke; the caller supplies the (larger) repetition counts.
 */
async function runLiveMatrix({ scenarios = [], providerMatrix = [], clients = null, routeVariant = 'authenticated_non_streaming', repetitions = 3 } = {}) {
  const gate = liveGateStatus({ providerMatrix, clients, phase: 'full' });
  if (!gate.ok) {
    return {
      status: 'not_executed', phase: 'full', reasons: gate.reasons,
      caps: gate.caps, pricing: gate.pricing, costRolloutGate: gate.costRolloutGate,
      note: 'Full live matrix requires priced models plus all four caps and an explicit allowlist. With unknown pricing, run a smoke only.',
    };
  }

  const caps = gate.caps;
  const results = [];
  const totals = { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, costKnown: true };
  let bindingCap = null;

  outer:
  for (const scenario of scenarios) {
    for (const { provider, model } of providerMatrix) {
      for (let rep = 1; rep <= repetitions; rep += 1) {
        bindingCap = firstBindingCap(totals, caps, null);
        if (bindingCap) break outer;
        // eslint-disable-next-line no-await-in-loop
        const rec = await runOneVariant({
          scenario, provider, model, generationMode: 'tool_first', consistencyMode: 'enforce',
          providerMode: 'live', routeVariant, clients,
        });
        const providerRequests = (rec.structured.structuredAttemptCount || 0) + (rec.prose.proseAttemptCount || 0);
        totals.requests += Math.max(1, providerRequests);
        totals.inputTokens += rec.tokens.totalInputTokens || 0;
        totals.outputTokens += rec.tokens.totalOutputTokens || 0;
        const cost = estimateCostUsd({ model, inputTokens: rec.tokens.totalInputTokens, outputTokens: rec.tokens.totalOutputTokens });
        if (cost !== COST_UNKNOWN) totals.costUsd += cost;
        results.push({ runId: rec.runId, scenarioId: scenario.scenarioId, provider, model, repetition: rep, pipelineSuccess: rec.structured.itineraryReady, tokens: rec.tokens, estimatedCostUsd: cost, latencyMs: rec.timings.totalResponseDurationMs, invariantViolations: (rec.invariantViolations || []).length });
      }
    }
  }

  return {
    status: bindingCap ? `aborted_${bindingCap}` : 'executed', phase: 'full', bindingCap,
    constrainedBy: bindingCap || 'completed_within_caps', caps, pricing: gate.pricing,
    costRolloutGate: gate.costRolloutGate,
    totals: { requests: totals.requests, inputTokens: totals.inputTokens, outputTokens: totals.outputTokens, costUsd: Number(totals.costUsd.toFixed(6)) },
    runCount: results.length, results,
  };
}

// ── Stage 13.3 §1 — sanitized preflight report ──────────────────────────────

/** Read installed provider SDK versions from node_modules (never touches keys). */
function detectSdkVersions() {
  const out = {};
  for (const [key, pkg] of [['anthropic', '@anthropic-ai/sdk'], ['openai', 'openai']]) {
    try {
      const pj = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'package.json');
      out[key] = JSON.parse(fs.readFileSync(pj, 'utf8')).version;
    } catch {
      try {
        const pj = path.resolve(__dirname, '../../../node_modules', pkg, 'package.json');
        out[key] = JSON.parse(fs.readFileSync(pj, 'utf8')).version;
      } catch { out[key] = 'unknown'; }
    }
  }
  return out;
}

/**
 * Build a SANITIZED preflight report (Stage 13.3 §1). Contains no credentials
 * and no prompts — only configuration, presence booleans, and projected bounds.
 * `ok:false` means: abort BEFORE the first provider request.
 */
function buildPreflightReport({ providerMatrix = [], clients = null, phase = 'smoke', smokeScenarioCount = SMOKE_SCENARIO_IDS.length, repetitions = 1, priceConfigVersion = process.env.TRAILIE_PRICE_CONFIG_VERSION || null } = {}) {
  const gate = liveGateStatus({ providerMatrix, clients, phase });
  const caps = gate.caps;
  const expectedMaxProviderRequests = smokeScenarioCount * providerMatrix.length * repetitions * MAX_PROVIDER_CALLS_PER_RUN;
  return {
    phase,
    providerModelAllowlist: caps.allowlist || [],
    matrix: providerMatrix.map((m) => `${m.provider}:${m.model}`),
    sdkVersions: detectSdkVersions(),
    caps: {
      maxRequests: caps.maxRequests,
      maxInputTokens: caps.maxInputTokens,
      maxOutputTokens: caps.maxOutputTokens,
      maxTotalCostUsd: caps.maxCostUsd,
    },
    priceTable: {
      // The config's own version wins; the env hint is a fallback label only.
      version: gate.pricing.priceConfigVersion || priceConfigVersion,
      activePricePeriod: gate.pricing.activePricePeriod || null,
      priced: gate.pricing.priced,
      unpriced: gate.pricing.unpriced,
      models: gate.pricing.models || {},
    },
    pricingMode: gate.pricingMode,
    costRolloutGate: gate.costRolloutGate,
    costCapEnforceable: gate.costCapEnforceable,
    // Stage 13.9A §1 — the accounting contract this run will produce, confirmed
    // BEFORE any spend. (Private-draft-capture status is reported by the runner:
    // a structural test keeps privateDraftCapture importable only from index.js.)
    usageAccountingVersion: USAGE_ACCOUNTING_VERSION,
    smokeScenarioCount,
    repetitions,
    expectedMaxProviderRequests,
    // Booleans only — the actual client objects/keys are never surfaced.
    clientsPresent: { anthropic: !!(clients && clients.anthropic), openai: !!(clients && clients.openai) },
    ok: gate.ok,
    missing: gate.reasons,
  };
}

// ── Stage 13.3 §2/§3 — provider-isolated smoke + per-provider report ─────────

function percentiles(values) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return { p50: null, p90: null, p95: null, max: null, n: 0 };
  const at = (p) => xs[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)];
  return { p50: at(50), p90: at(90), p95: at(95), max: xs[xs.length - 1], n: xs.length };
}

/** Smoke-approval recommendation for entering the full live matrix (§6). */
function recommendFullMatrixEligibility(summary) {
  const reasons = [];
  if (summary.hardInvariantViolations > 0) reasons.push('hard-invariant violation observed');
  if (summary.pipelineFailures > 0) reasons.push('unrecovered pipeline failure(s)');
  if (summary.deterministicFallbackUnusable > 0) reasons.push('deterministic fallback produced unusable content');
  if (summary.bindingCap) reasons.push(`smoke truncated by cap: ${summary.bindingCap}`);
  if (summary.runCount === 0) reasons.push('no runs executed');
  const eligible = reasons.length === 0;
  // Cost/canary eligibility is separate: unknown pricing can pass technical smoke
  // but cannot pass the cost gate or a percentage-based canary recommendation.
  return {
    eligibleForFullMatrix: eligible,
    costGateEligible: eligible && summary.costRolloutGate !== 'not_passed',
    recommendation: eligible
      ? (summary.costRolloutGate === 'not_passed'
        ? 'eligible_for_full_matrix_internal_only (unknown pricing — cost gate not passed)'
        : 'eligible_for_full_matrix')
      : 'blocked',
    reasons,
  };
}

/** Aggregate a set of smoke rows (used per evidence class and overall). */
function aggregateRows(rs) {
  const adapterFirst = rs.filter((r) => r.adapterFirstAttemptSuccess).length;
  const pipelineOk = rs.filter((r) => r.pipelineSuccess).length;
  const retries = rs.filter((r) => r.attemptCount > 1).length;
  const fallbacks = rs.filter((r) => r.deterministicFallbackUsed).length;
  return {
    runCount: rs.length,
    structuredAdapterFirstAttemptSuccess: rs.length ? Number((adapterFirst / rs.length).toFixed(4)) : null,
    pipelineSuccessRate: rs.length ? Number((pipelineOk / rs.length).toFixed(4)) : null,
    pipelineFailures: rs.length - pipelineOk,
    retryRate: rs.length ? Number((retries / rs.length).toFixed(4)) : null,
    deterministicFallbackRate: rs.length ? Number((fallbacks / rs.length).toFixed(4)) : null,
    hardInvariantViolations: rs.reduce((n, r) => n + (r.invariantViolations || 0), 0),
    ttftMs: percentiles(rs.map((r) => r.ttftMs)),
    totalLatencyMs: percentiles(rs.map((r) => r.latencyMs)),
  };
}

/** Aggregate one provider/model's smoke run into a §3 report. */
function summarizeProviderSmoke(provider, model, smoke) {
  const rs = smoke.results || [];
  // §6 — pure-live vs fault-injected are reported SEPARATELY; headline live
  // reliability is computed over pure `live_end_to_end` runs ONLY.
  const pureLive = rs.filter((r) => r.evidenceClass === 'live_end_to_end');
  const faultInjected = rs.filter((r) => r.evidenceClass === 'live_with_fault_injection');
  const pure = aggregateRows(pureLive);

  const summary = {
    provider, model,
    status: smoke.status,
    bindingCap: smoke.bindingCap || null,
    runCount: rs.length,
    // Headline (pure-live) reliability.
    ...pure,
    deterministicFallbackUnusable: 0, // set by human inspection; smoke cannot self-judge readability
    liveEndToEnd: { ...aggregateRows(pureLive) },
    liveWithFaultInjection: { ...aggregateRows(faultInjected) },
    tokens: {
      totalInput: rs.reduce((n, r) => n + (r.tokens?.totalInputTokens || 0), 0),
      totalOutput: rs.reduce((n, r) => n + (r.tokens?.totalOutputTokens || 0), 0),
    },
    estimatedCostUsd: smoke.totals ? smoke.totals.costUsd : COST_UNKNOWN,
    spentEstimatedUsd: smoke.spentEstimatedUsd,
    remainingEstimatedUsd: smoke.remainingEstimatedUsd,
    // Stage 13.9 §1/§3 — all-attempt accounting marker + the full per-call ledger.
    usageAccountingVersion: smoke.usageAccountingVersion || USAGE_ACCOUNTING_VERSION,
    usageLedgers: smoke.usageLedgers || [],
    priceConfigVersion: smoke.priceConfigVersion,
    activePricePeriod: smoke.activePricePeriod,
    costRolloutGate: smoke.costRolloutGate,
    // Sanitized per-scenario rows (counts/status/tokens/latency only — no prompts,
    // no prose text, no keys) so a failing smoke is diagnosable.
    perScenario: rs.map((r) => ({
      scenarioId: r.scenarioId, evidenceClass: r.evidenceClass,
      orchestrationOutcome: r.orchestrationOutcome, structuredStatus: r.structuredStatus,
      structuredValidationErrors: r.structuredValidationErrors, feasibilityIssueTypes: r.feasibilityIssueTypes,
      attemptCount: r.attemptCount, structuredAttempts: r.structuredAttempts || [], pipelineSuccess: r.pipelineSuccess,
      usageLedger: r.usageLedger || null,
      tripLengthResolution: r.tripLengthResolution || null,
      structuredTokenBudgetSelection: r.structuredTokenBudgetSelection || null,
      toolInputNormalization: r.toolInputNormalization, selectedStructuredMaxTokens: r.selectedStructuredMaxTokens,
      truncated: r.truncated, itineraryDays: r.itineraryDays, finalItineraryValid: r.finalItineraryValid,
      proseAttemptCount: r.proseAttemptCount, consistencyStatus: r.consistencyStatus,
      deterministicFallbackUsed: r.deterministicFallbackUsed, issueTypeCounts: r.issueTypeCounts,
      removedStopMentionCount: r.removedStopMentionCount, missingDayCount: r.missingDayCount, orderViolationCount: r.orderViolationCount,
      phaseADurationMs: r.phaseADurationMs, phaseBGenerationDurationMs: r.phaseBGenerationDurationMs,
      proseVerificationDurationMs: r.proseVerificationDurationMs, proseRetryDurationMs: r.proseRetryDurationMs,
      phaseBProviderTimeToFirstTokenMs: r.phaseBProviderTimeToFirstTokenMs,
      ttftMs: r.ttftMs, latencyMs: r.latencyMs,
      tokens: r.tokens, estimatedCostUsd: r.estimatedCostUsd,
      invariantViolations: r.invariantViolations, invariantViolationCodes: r.invariantViolationCodes || [],
      finalOutcome: r.pipelineSuccess ? (r.deterministicFallbackUsed ? 'itinerary+fallback_prose' : (r.consistencyStatus === 'retry_passed' ? 'itinerary+retry_prose' : 'itinerary+prose')) : `failed:${r.orchestrationOutcome}`,
    })),
  };
  // Eligibility is judged on pure-live evidence only.
  summary.eligibility = recommendFullMatrixEligibility({
    hardInvariantViolations: pure.hardInvariantViolations,
    pipelineFailures: pure.pipelineFailures,
    deterministicFallbackUnusable: 0,
    bindingCap: smoke.bindingCap,
    runCount: pure.runCount,
    costRolloutGate: smoke.costRolloutGate,
  });
  return summary;
}

/**
 * Run the smoke set for each provider/model IN ISOLATION (Stage 13.3 §2): only
 * the provider-under-test's client is supplied, so the pipeline cannot silently
 * fall back to the other provider and mask an adapter failure. Stops the affected
 * provider immediately on a hard-invariant violation.
 */
async function runProviderIsolatedSmoke({ scenarios, providerMatrix = [], clients = null, routeVariant = 'authenticated_non_streaming', repetitions = 1 } = {}) {
  const perProvider = [];
  for (const { provider, model } of providerMatrix) {
    // Isolate: hand the pipeline ONLY this provider's client (the other is null).
    const isolatedClients = isolateClientsFor(provider, clients);
    // eslint-disable-next-line no-await-in-loop
    const smoke = await runLiveSmoke({
      scenarios, providerMatrix: [{ provider, model }], clients: isolatedClients, routeVariant, repetitions,
    });
    perProvider.push(smoke.status === 'not_executed'
      ? { provider, model, status: 'not_executed', reasons: smoke.reasons, costRolloutGate: smoke.costRolloutGate }
      : summarizeProviderSmoke(provider, model, smoke));
  }
  return {
    phase: 'smoke',
    providerIsolated: true,
    crossProviderFallbackAllowed: false,
    perProvider,
    // §3: STOP after smoke — the full matrix does NOT start automatically.
    fullMatrixAutostart: false,
    note: 'Smoke complete. Review per-provider eligibility before running the full matrix (runLiveMatrix).',
  };
}

module.exports = {
  SMOKE_SCENARIO_IDS,
  SMOKE_MAX_REQUESTS_HARD,
  MAX_PROVIDER_CALLS_PER_RUN,
  PROVIDER_SCOPE,
  resolveLiveEligibleMatrix,
  isolateClientsFor,
  readCostCap,
  readCaps,
  readAllowlist,
  isAllowed,
  priceMetadata,
  estimateNextCallMaxCostUsd,
  liveGateStatus,
  firstBindingCap,
  runLiveSmoke,
  runLiveMatrix,
  detectSdkVersions,
  buildPreflightReport,
  percentiles,
  recommendFullMatrixEligibility,
  summarizeProviderSmoke,
  runProviderIsolatedSmoke,
};
