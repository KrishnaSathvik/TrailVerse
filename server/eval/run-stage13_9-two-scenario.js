#!/usr/bin/env node
'use strict';

/**
 * Stage 13.9 §10 — targeted TWO-scenario validation of the corrected Phase A
 * token sizing and the corrected multi-attempt accounting.
 *
 * PROPOSED, NOT RUN. This file makes ZERO provider calls unless it is invoked AND
 * every hard gate passes. Run the preflight form first (§10 command block below).
 *
 * Scope — exactly two scenarios, in this order (cheapest first):
 *   basic-02-three-day   must still start Phase A at  6,000 output tokens
 *   basic-03-seven-day   must now  start Phase A at 12,000 output tokens
 *
 * What it must prove:
 *   1. "Plan a week in Yellowstone." resolves to 7 days BEFORE the first call.
 *   2. The seven-day plan completes in ONE structured attempt.
 *   3. Cost and token totals include every attempt (usageAccountingVersion set).
 *   4. The ledger reconciles exactly against the configured cap.
 *   5. Phase B stays clean (no prose retry, no fallback, no artifact leak).
 *
 * Required env (identical gates to run-stage13_7-normal-five.js):
 *   TRAILIE_EVAL_LIVE_PROVIDERS=true
 *   TRAILIE_EVAL_MODEL_ALLOWLIST=claude:<sonnet-5-model-id>
 *   CLAUDE_PRIMARY_MODEL=<sonnet-5-model-id>   (must match the allowlist)
 *   TRAILIE_EVAL_MAX_TOTAL_COST_USD, TRAILIE_EVAL_MAX_REQUESTS,
 *   TRAILIE_EVAL_MAX_INPUT_TOKENS, TRAILIE_EVAL_MAX_OUTPUT_TOKENS
 *   ANTHROPIC_API_KEY
 * Optional:
 *   TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS=true   (artifacts/private/, gitignored)
 *   TRAILIE_EVAL_PREFLIGHT_ONLY=true           (prove readiness, spend nothing)
 *
 * Usage:  node eval/run-stage13_9-two-scenario.js
 */

const fs = require('fs');
const path = require('path');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const { EXECUTABLE_SCENARIOS } = require('../src/eval/trailie/scenarios');
const {
  buildPreflightReport, runLiveSmoke, readAllowlist, summarizeProviderSmoke, SMOKE_SCENARIO_IDS,
} = require('../src/eval/trailie/liveEvaluation');
const { SCENARIO_IDS_ENV, resolveScenarioSelection } = require('../src/eval/trailie/scenarioSelection');
// Runner-level status only. A structural test keeps this module importable from
// eval/trailie/index.js alone, so the preflight reports it from here.
const { isPrivateCaptureEnabled, isDestinationGitignored, PRIVATE_DIR } = require('../src/eval/trailie/privateDraftCapture');

const ARTIFACTS_DIR = path.resolve(__dirname, '../../artifacts');

// Fail-closed contract: EXACTLY these two ids, in this order.
const REQUIRED_COUNT = 2;
const STAGE_13_9_TWO = ['basic-02-three-day', 'basic-03-seven-day'];

// §10 expectations, asserted against the produced artifact (no provider call needed
// to state them — they are the reason the run exists).
const EXPECTED_BUDGETS = {
  'basic-02-three-day': { selectedMaxTokens: 6000, maxStructuredAttempts: 1 },
  'basic-03-seven-day': { selectedMaxTokens: 12000, maxStructuredAttempts: 1, expectedDays: 7 },
};

function resolveScenarios() {
  const raw = process.env[SCENARIO_IDS_ENV];
  // Absent override → the fixed Stage 13.9 pair. Present → must equal that pair.
  const ids = typeof raw === 'string' ? raw : STAGE_13_9_TWO.join(',');
  const sel = resolveScenarioSelection({
    raw: ids, inventory: EXECUTABLE_SCENARIOS, requiredCount: REQUIRED_COUNT, supportedIds: SMOKE_SCENARIO_IDS,
  });
  if (sel.ok && sel.ids.join(',') !== STAGE_13_9_TWO.join(',')) {
    return { ...sel, ok: false, errors: [`this runner accepts exactly: ${STAGE_13_9_TWO.join(', ')}`] };
  }
  return { ...sel, source: typeof raw === 'string' ? SCENARIO_IDS_ENV : 'stage13_9_fixed_pair' };
}

function buildProviderMatrix() {
  return (readAllowlist() || [])
    .map((e) => { const i = e.indexOf(':'); return i > 0 ? { provider: e.slice(0, i), model: e.slice(i + 1) } : null; })
    .filter(Boolean)
    .filter((m) => m.provider === 'claude'); // Trailie plan/prose is Claude-only.
}

function buildClients() {
  const clients = { anthropic: null, openai: null };
  if (process.env.ANTHROPIC_API_KEY) {
    try { const Anthropic = require('@anthropic-ai/sdk'); clients.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); }
    catch (e) { console.warn('Anthropic SDK unavailable:', e.message); }
  }
  return clients;
}

/** §10 — check the produced rows against the stated expectations. */
function checkExpectations(summary) {
  const checks = [];
  for (const row of summary.perScenario || []) {
    const want = EXPECTED_BUDGETS[row.scenarioId];
    if (!want) continue;
    checks.push({
      scenarioId: row.scenarioId,
      firstAttemptMaxTokens: (row.structuredAttempts || [])[0]?.maxTokens ?? null,
      expectedFirstAttemptMaxTokens: want.selectedMaxTokens,
      budgetCorrect: ((row.structuredAttempts || [])[0]?.maxTokens ?? null) === want.selectedMaxTokens,
      structuredAttempts: (row.structuredAttempts || []).length,
      singleAttempt: (row.structuredAttempts || []).length <= want.maxStructuredAttempts,
      resolvedDays: row.tripLengthResolution?.days ?? null,
      resolutionSource: row.tripLengthResolution?.source ?? null,
      daysCorrect: want.expectedDays == null || row.tripLengthResolution?.days === want.expectedDays,
      proseClean: row.proseAttemptCount === 1 && row.deterministicFallbackUsed === false,
      ledgerReconciles: !!row.usageLedger && row.usageLedger.reconciliation.entriesCounted
        === row.usageLedger.providerRequests,
    });
  }
  return { checks, allPassed: checks.every((c) => c.budgetCorrect && c.singleAttempt && c.daysCorrect && c.proseClean && c.ledgerReconciles) };
}

async function main() {
  const matrix = buildProviderMatrix();
  const clients = buildClients();
  const selection = resolveScenarios();
  const scenarios = selection.scenarios;

  const preflight = buildPreflightReport({
    providerMatrix: matrix, clients, phase: 'smoke', smokeScenarioCount: scenarios.length, repetitions: 1,
  });
  console.log('\nStage 13.9 §10 — two-scenario budget-sizing validation (preflight)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(JSON.stringify(preflight, null, 2));
  console.log(`\nScenario source: ${selection.source}`);
  console.log(`Resolved scenarios (${selection.ids.length}, execution order): ${selection.ids.join(', ') || '(none)'}`);
  console.log('Expected budgets: basic-02-three-day → 6,000; basic-03-seven-day → 12,000 (single attempt)');
  console.log(`Usage accounting: ${preflight.usageAccountingVersion}`);
  const capture = {
    enabled: isPrivateCaptureEnabled(),
    destinationGitignored: isDestinationGitignored(),
    dir: isPrivateCaptureEnabled() && isDestinationGitignored() ? PRIVATE_DIR : null,
  };
  console.log(`Private draft capture: ${capture.enabled
    ? `ENABLED → ${capture.dir || 'REFUSED (destination not gitignored)'}`
    : 'disabled'} (gitignored=${capture.destinationGitignored})`);
  console.log(`Providers: live-eligible=${preflight.matrix.join(',') || '(none)'}; openai client present=${preflight.clientsPresent.openai}`);

  if (!preflight.ok || matrix.length === 0 || !selection.ok || scenarios.length === 0) {
    console.error('\n⛔ Preflight FAILED — aborting before any provider request.');
    for (const m of preflight.missing || []) console.error(`   - ${m}`);
    for (const e of selection.errors || []) console.error(`   - ${e}`);
    if (matrix.length === 0) console.error('   - empty provider matrix');
    process.exit(2);
  }
  if (String(process.env.TRAILIE_EVAL_PREFLIGHT_ONLY).toLowerCase() === 'true') {
    console.log('\n✅ Preflight PASSED. TRAILIE_EVAL_PREFLIGHT_ONLY=true → zero live requests made.');
    process.exit(0);
  }

  console.log('\n▶ Running 2-scenario validation (tool_first + enforce, ≤1 structured retry, ≤1 prose retry)…');
  const smoke = await runLiveSmoke({ scenarios, providerMatrix: matrix, clients, repetitions: 1 });
  const summary = smoke.status === 'not_executed'
    ? { status: 'not_executed', reasons: smoke.reasons }
    : summarizeProviderSmoke(matrix[0].provider, matrix[0].model, smoke);
  const expectations = summary.perScenario ? checkExpectations(summary) : { checks: [], allPassed: false };

  const out = {
    stage: 'TRAILIE-STAGE13.9-TWO-SCENARIO',
    generatedAt: new Date().toISOString(),
    scenarioSource: selection.source,
    scenarios: selection.ids,
    preflight,
    privateDraftCapture: capture,
    expectations,
    summary,
  };
  if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const outPath = path.join(ARTIFACTS_DIR, 'trailie-stage13_9-two-scenario.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log('\n§10 expectations:');
  for (const c of expectations.checks) {
    console.log(`  ${c.scenarioId}: budget ${c.firstAttemptMaxTokens} (want ${c.expectedFirstAttemptMaxTokens}) ${c.budgetCorrect ? '✅' : '❌'}` +
      ` | attempts ${c.structuredAttempts} ${c.singleAttempt ? '✅' : '❌'}` +
      ` | days ${c.resolvedDays ?? '—'} via ${c.resolutionSource ?? '—'} ${c.daysCorrect ? '✅' : '❌'}` +
      ` | prose ${c.proseClean ? '✅' : '❌'} | ledger ${c.ledgerReconciles ? '✅' : '❌'}`);
  }
  console.log(`\nAll expectations met: ${expectations.allPassed ? 'YES' : 'NO'}`);
  console.log(`Spent (estimated, all attempts): $${summary.spentEstimatedUsd} of $${preflight.caps.maxTotalCostUsd}`);
  console.log(`\n■ Done. Report: ${outPath}\n`);
}

main().catch((err) => { console.error('Stage 13.9 two-scenario run failed:', err.message); process.exit(1); });
