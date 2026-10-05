#!/usr/bin/env node
'use strict';

/**
 * Stage 13.7 §8 — targeted FIVE-scenario normal live confirmation.
 *
 * Runs ONLY the five normal scenarios (no fault-injected / adversarial faults)
 * through the SAME cap-enforced live path as run-live-smoke.js (tool_first +
 * enforce, one structured retry, one prose retry), with private synthetic draft
 * capture enabled so every failed attempt can be classified from direct evidence.
 *
 * This file makes ZERO provider calls unless it is run AND every hard gate passes.
 * It is intentionally not wired into any production route. Review before running.
 *
 * Required env (identical gates to run-live-smoke.js):
 *   TRAILIE_EVAL_LIVE_PROVIDERS=true
 *   TRAILIE_EVAL_MODEL_ALLOWLIST=claude:<sonnet-5-model-id>
 *   TRAILIE_EVAL_MAX_TOTAL_COST_USD, TRAILIE_EVAL_MAX_REQUESTS,
 *   TRAILIE_EVAL_MAX_INPUT_TOKENS, TRAILIE_EVAL_MAX_OUTPUT_TOKENS
 *   CLAUDE_PRIMARY_MODEL=<sonnet-5-model-id>   (matches the allowlist)
 *   ANTHROPIC_API_KEY
 *   TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS=true    (writes to artifacts/private/, gitignored)
 * Optional:
 *   TRAILIE_EVAL_PREFLIGHT_ONLY=true            (prove readiness, spend nothing)
 *
 * Usage:  node eval/run-stage13_7-normal-five.js
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
const {
  SCENARIO_IDS_ENV, resolveScenarioSelection,
} = require('../src/eval/trailie/scenarioSelection');

const ARTIFACTS_DIR = path.resolve(__dirname, '../../artifacts');

// The five NORMAL scenarios (all members of the smoke set, none fault-injected).
// NOTE: "8" in the Stage 13.7 spec is read as correction-08-exceeds-difficulty;
// confirm this list before spending.
const NORMAL_FIVE = [
  'basic-02-three-day',
  'basic-03-seven-day',
  'basic-04-multi-park',
  'correction-08-exceeds-difficulty',
  'prose-33-removed-active',
];

// Stage 13.8B §1 — optional fail-closed override. When TRAILIE_EVAL_SCENARIO_IDS is
// set this runner executes EXACTLY those four inventory scenarios, in the supplied
// order (cost ordering matters). Any unknown/duplicate/miscounted id aborts before
// a single provider request. Absent → the Stage 13.7 five-scenario default.
const OVERRIDE_REQUIRED_COUNT = 4;

function resolveScenarios() {
  const raw = process.env[SCENARIO_IDS_ENV];
  if (typeof raw !== 'string') {
    return {
      ok: true,
      source: 'stage13_7_default_five',
      ids: NORMAL_FIVE,
      scenarios: EXECUTABLE_SCENARIOS.filter((s) => NORMAL_FIVE.includes(s.scenarioId)),
      errors: EXECUTABLE_SCENARIOS.filter((s) => NORMAL_FIVE.includes(s.scenarioId)).length === NORMAL_FIVE.length
        ? [] : ['default scenario resolution mismatch'],
    };
  }
  const sel = resolveScenarioSelection({
    raw, inventory: EXECUTABLE_SCENARIOS, requiredCount: OVERRIDE_REQUIRED_COUNT,
    supportedIds: SMOKE_SCENARIO_IDS, // runLiveSmoke re-filters; refuse silent drops
  });
  return {
    ok: sel.ok, source: SCENARIO_IDS_ENV, ids: sel.ids, scenarios: sel.scenarios, errors: sel.errors,
    printable: sel.printable,
  };
}

function buildProviderMatrix() {
  const entries = readAllowlist() || [];
  return entries
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

async function main() {
  const matrix = buildProviderMatrix();
  const clients = buildClients();
  const selection = resolveScenarios();
  const scenarios = selection.scenarios;

  const preflight = buildPreflightReport({ providerMatrix: matrix, clients, phase: 'smoke', smokeScenarioCount: scenarios.length, repetitions: 1 });
  console.log('\nStage 13.7 §8 / 13.8B — targeted normal live confirmation (preflight)');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(JSON.stringify(preflight, null, 2));
  // Sanitized resolved ids — printed BEFORE any provider call.
  console.log(`\nScenario source: ${selection.source}`);
  console.log(`Resolved scenarios (${selection.ids.length}, execution order): ${selection.ids.join(', ') || '(none)'}`);
  console.log(`Private draft capture: ${String(process.env.TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS).toLowerCase() === 'true' ? 'ENABLED (artifacts/private/)' : 'disabled'}`);

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

  console.log(`\n▶ Running ${scenarios.length}-scenario live confirmation (tool_first + enforce, ≤1 structured retry, ≤1 prose retry)…`);
  const smoke = await runLiveSmoke({ scenarios, providerMatrix: matrix, clients, repetitions: 1 });
  const summary = smoke.status === 'not_executed'
    ? { status: 'not_executed', reasons: smoke.reasons }
    : summarizeProviderSmoke(matrix[0].provider, matrix[0].model, smoke);

  const overridden = selection.source === SCENARIO_IDS_ENV;
  const out = {
    stage: overridden ? 'TRAILIE-STAGE13.8B-TARGETED-FOUR' : 'TRAILIE-STAGE13.7-NORMAL-FIVE',
    generatedAt: new Date().toISOString(),
    scenarioSource: selection.source,
    scenarios: selection.ids,
    preflight,
    summary, // aggregates + sanitized per-scenario rows only (no prose text)
  };
  if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const outPath = path.join(ARTIFACTS_DIR, overridden
    ? 'trailie-stage13_8b-targeted-four.json'
    : 'trailie-stage13_7-normal-five.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n■ Done. Aggregate report: ${outPath}`);
  console.log('  Per-attempt private drafts (if enabled): artifacts/private/stage13_7_drafts/');
}

main().catch((err) => { console.error('Stage 13.7 five-scenario run failed:', err.message); process.exit(1); });
