#!/usr/bin/env node
'use strict';

/**
 * Stage 13.3 §1–§3 — live-provider SMOKE entry point.
 *
 * This is the operational run harness. It does NOT refactor the pipeline and it
 * fabricates nothing:
 *
 *   §1  Print a SANITIZED preflight report and ABORT before the first provider
 *       request if any required setting (caps / allowlist / clients / — for the
 *       full matrix — pricing) is missing. Never prints credentials or prompts.
 *   §2  Run each provider/model IN ISOLATION (only that provider's client is
 *       supplied) so cross-provider fallback cannot mask an adapter failure.
 *       One repetition per smoke scenario. Stop a provider on a hard invariant.
 *   §3  STOP after smoke and print a per-provider report. The full matrix is
 *       NOT started automatically.
 *
 * Required env (see docs/TRAILIE-STAGE13-ROLLOUT-GATES.md §1):
 *   TRAILIE_EVAL_LIVE_PROVIDERS=true
 *   TRAILIE_EVAL_MAX_TOTAL_COST_USD, TRAILIE_EVAL_MAX_REQUESTS,
 *   TRAILIE_EVAL_MAX_INPUT_TOKENS, TRAILIE_EVAL_MAX_OUTPUT_TOKENS
 *   TRAILIE_EVAL_MODEL_ALLOWLIST=claude:<model>,openai:<model>
 *   ANTHROPIC_API_KEY and/or OPENAI_API_KEY  (only for allowlisted providers)
 * Optional:
 *   TRAILIE_PRICE_CONFIG_VERSION, TRAILIE_PRICE__<SLUG>__INPUT_PER_MTOK / __OUTPUT_PER_MTOK
 *
 * Usage:  node eval/run-live-smoke.js
 */

const fs = require('fs');
const path = require('path');

// Load the SAME environment the server uses (server.js: dotenv from ./.env,
// skipped in production where secrets come from the hosting environment). This
// reuses the existing ANTHROPIC_API_KEY / OPENAI_API_KEY — it does NOT introduce
// new key variables, and no secret value is ever read, logged, or persisted here.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const { EXECUTABLE_SCENARIOS } = require('../src/eval/trailie/scenarios');
const {
  buildPreflightReport, runProviderIsolatedSmoke, readAllowlist, SMOKE_SCENARIO_IDS,
} = require('../src/eval/trailie/liveEvaluation');

const ARTIFACTS_DIR = path.resolve(__dirname, '../../artifacts');

/** Parse the allowlist into a {provider, model} matrix. Requires `provider:model`. */
function buildProviderMatrix() {
  const entries = readAllowlist() || [];
  const matrix = [];
  const unmappable = [];
  for (const entry of entries) {
    const idx = entry.indexOf(':');
    if (idx <= 0) { unmappable.push(entry); continue; }
    matrix.push({ provider: entry.slice(0, idx), model: entry.slice(idx + 1) });
  }
  return { matrix, unmappable };
}

/** Build real SDK clients ONLY for providers whose keys are present. */
function buildClients(matrix) {
  const clients = { anthropic: null, openai: null };
  const wantsAnthropic = matrix.some((m) => m.provider === 'claude' || m.provider === 'anthropic');
  const wantsOpenai = matrix.some((m) => m.provider === 'openai');
  if (wantsAnthropic && process.env.ANTHROPIC_API_KEY) {
    try { const Anthropic = require('@anthropic-ai/sdk'); clients.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); }
    catch (e) { console.warn('Anthropic SDK unavailable:', e.message); }
  }
  if (wantsOpenai && process.env.OPENAI_API_KEY) {
    try { const OpenAI = require('openai'); clients.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); }
    catch (e) { console.warn('OpenAI SDK unavailable:', e.message); }
  }
  return clients;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const { matrix, unmappable } = buildProviderMatrix();

  // Trailie production planning/chat is Claude-only (no active OpenAI fallback in
  // the plan/prose path). OpenAI is out of the Trailie live rollout scope; warn if
  // it appears so a paid OpenAI smoke is never run for Trailie by accident.
  if (matrix.some((m) => m.provider === 'openai')) {
    console.warn('⚠️  OpenAI is in the allowlist but Trailie planning/chat is Claude-only.');
    console.warn('    OpenAI is excluded from Trailie rollout gates; use TRAILIE_EVAL_MODEL_ALLOWLIST="claude:<model>" unless OpenAI is an intentional production target.');
  }

  const clients = buildClients(matrix);

  // ── §1 Preflight (sanitized) ───────────────────────────────────────────────
  const preflight = buildPreflightReport({ providerMatrix: matrix, clients, phase: 'smoke', smokeScenarioCount: SMOKE_SCENARIO_IDS.length, repetitions: 1 });
  if (unmappable.length) preflight.missing = [...(preflight.missing || []), `allowlist entries missing provider prefix (need provider:model): ${unmappable.join(', ')}`];
  preflight.ok = preflight.ok && unmappable.length === 0 && matrix.length > 0;

  console.log('\nTrailie Stage 13.3 — live-provider SMOKE preflight');
  console.log('══════════════════════════════════════════════════');
  console.log(JSON.stringify(preflight, null, 2));

  if (!preflight.ok) {
    console.error('\n⛔ Preflight FAILED — aborting before any provider request.');
    for (const m of preflight.missing || []) console.error(`   - ${m}`);
    process.exit(2);
  }

  // §6 — preflight-only inspection mode: prove readiness WITHOUT spending.
  if (String(process.env.TRAILIE_EVAL_PREFLIGHT_ONLY).toLowerCase() === 'true') {
    console.log('\n✅ Preflight PASSED. TRAILIE_EVAL_PREFLIGHT_ONLY=true → stopping before any provider request.');
    console.log(`   pricingMode=${preflight.pricingMode}; activePricePeriod=${preflight.priceTable.activePricePeriod}; costCapEnforceable=${preflight.costCapEnforceable}`);
    console.log('   Zero live requests made. Unset TRAILIE_EVAL_PREFLIGHT_ONLY to run the paid smoke.');
    process.exit(0);
  }

  // ── §2 Provider-isolated smoke ──────────────────────────────────────────────
  console.log('\n▶ Running provider-isolated smoke (no cross-provider fallback)…');
  const report = await runProviderIsolatedSmoke({ scenarios: EXECUTABLE_SCENARIOS, providerMatrix: matrix, clients, repetitions: 1 });

  // ── §3 Report + STOP (do not autostart the full matrix) ─────────────────────
  console.log('\nPer-provider smoke report');
  console.log('─────────────────────────');
  for (const p of report.perProvider) {
    if (p.status === 'not_executed') {
      console.log(`\n${p.provider}:${p.model} → not_executed (${(p.reasons || []).join('; ')})`);
      continue;
    }
    console.log(`\n${p.provider}:${p.model} → ${p.status}${p.bindingCap ? ` (cap: ${p.bindingCap})` : ''}`);
    console.log(`  runs=${p.runCount} | live_end_to_end=${p.liveEndToEnd.runCount} live_with_fault_injection=${p.liveWithFaultInjection.runCount}`);
    console.log(`  [pure-live] pipelineSuccess=${p.liveEndToEnd.pipelineSuccessRate} adapterFirst=${p.liveEndToEnd.structuredAdapterFirstAttemptSuccess} retry=${p.liveEndToEnd.retryRate} fallback=${p.liveEndToEnd.deterministicFallbackRate} invViol=${p.liveEndToEnd.hardInvariantViolations}`);
    console.log(`  [fault-inj] pipelineSuccess=${p.liveWithFaultInjection.pipelineSuccessRate} fallback=${p.liveWithFaultInjection.deterministicFallbackRate}`);
    console.log(`  [pure-live] TTFT ms p50/p90/p95=${p.liveEndToEnd.ttftMs.p50}/${p.liveEndToEnd.ttftMs.p90}/${p.liveEndToEnd.ttftMs.p95}; total ms=${p.liveEndToEnd.totalLatencyMs.p50}/${p.liveEndToEnd.totalLatencyMs.p90}/${p.liveEndToEnd.totalLatencyMs.p95}`);
    console.log(`  tokens in/out=${p.tokens.totalInput}/${p.tokens.totalOutput}; spent≈$${p.spentEstimatedUsd} remaining≈$${p.remainingEstimatedUsd}; costGate=${p.costRolloutGate}`);
    console.log(`  → ${p.eligibility.recommendation}${p.eligibility.reasons.length ? ` (${p.eligibility.reasons.join('; ')})` : ''}`);
    console.log('  per-scenario:');
    for (const s of p.perScenario) {
      console.log(`    - ${s.scenarioId} [${s.evidenceClass}] outcome=${s.orchestrationOutcome} structured=${s.structuredStatus} attempts=${s.attemptCount} ok=${s.pipelineSuccess} consistency=${s.consistencyStatus} fallback=${s.deterministicFallbackUsed}${s.structuredValidationErrors && s.structuredValidationErrors.length ? ` errs=${JSON.stringify(s.structuredValidationErrors).slice(0, 160)}` : ''}`);
    }
  }

  const out = {
    stage: 'TRAILIE-STAGE13.3-LIVE-SMOKE',
    generatedAt,
    preflight,
    smoke: report,
    nextStep: 'Review per-provider eligibility. Run the full matrix (5×critical / 3×general) ONLY for approved provider/models, then collect blinded human labels. Do not enable a production cohort.',
  };
  if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const outPath = path.join(ARTIFACTS_DIR, 'trailie-stage13-live-smoke-results.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log(`\n■ STOP — full matrix NOT started (§3). Smoke results: ${outPath}`);
  console.log('  Review eligibility, then run the full live matrix + blinded human labeling.');
}

main().catch((err) => { console.error('Live smoke failed:', err.message); process.exit(1); });
