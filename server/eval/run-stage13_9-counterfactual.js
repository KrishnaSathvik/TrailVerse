#!/usr/bin/env node
'use strict';

/**
 * Stage 13.9 §3/§9 — offline cost reconstruction + latency counterfactual.
 *
 * Reads a recorded live artifact and reports:
 *   - the TRUE run cost once every provider attempt is counted
 *   - how much the pre-13.9 accounting under-reported
 *   - what correct first-attempt sizing would have saved (latency, tokens, cost)
 *
 * MAKES ZERO PROVIDER CALLS. Every number is derived from the recorded artifact.
 *
 * Usage:  node eval/run-stage13_9-counterfactual.js [artifact.json]
 */

const fs = require('fs');
const path = require('path');

const { projectArtifact } = require('../src/eval/trailie/counterfactual');

const ARTIFACTS_DIR = path.resolve(__dirname, '../../artifacts');
const DEFAULT_INPUT = path.join(ARTIFACTS_DIR, 'trailie-stage13_8b-targeted-four.json');
const OUTPUT = path.join(ARTIFACTS_DIR, 'trailie-stage13_9-counterfactual.json');

function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT;
  if (!fs.existsSync(inputPath)) {
    console.error(`Artifact not found: ${inputPath}`);
    process.exit(2);
  }
  const artifact = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const projection = projectArtifact({ artifact, atDate: artifact.generatedAt });

  const out = {
    stage: 'TRAILIE-STAGE13.9-COUNTERFACTUAL',
    generatedAt: new Date().toISOString(),
    sourceArtifact: path.basename(inputPath),
    sourceGeneratedAt: artifact.generatedAt || null,
    providerCallsMade: 0,
    evidenceClass: 'counterfactual_from_recorded_attempt',
    ...projection,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));

  const cr = projection.costReconstruction;
  console.log('\nStage 13.9 — offline cost reconstruction + latency counterfactual');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`Source: ${path.basename(inputPath)} (${projection.scenarioCount} scenarios, model ${projection.model})`);
  console.log('\nCost reconstruction (all attempts counted):');
  console.log(`  reported run cost : $${cr.reportedRunCostUsd}`);
  console.log(`  TRUE run cost     : $${cr.trueRunCostUsd}`);
  console.log(`  under-counted     : $${cr.undercountedUsd}`);
  console.log(`  configured cap    : $${cr.configuredCapUsd}`);
  console.log(`  corrected remaining: $${cr.correctedRemainingUsd}`);

  console.log('\nPer scenario:');
  for (const p of projection.perScenario) {
    console.log(`  ${p.scenarioId}: attempts=${p.structuredAttempts} reported=$${p.reportedEstimatedCostUsd} true=$${p.trueEstimatedCostUsd} missing=$${p.undercountedUsd}`);
  }

  console.log('\nCounterfactual — correct first-attempt sizing (NOT a new measurement):');
  for (const p of projection.perScenario.filter((x) => x.projection)) {
    const j = p.projection;
    console.log(`  ${j.scenarioId}:`);
    console.log(`    recorded : ${j.recorded.structuredAttempts} attempts (${j.recorded.firstAttemptMaxTokens} → ${j.recorded.succeedingAttemptMaxTokens} tokens), Phase A ${j.recorded.phaseADurationMs} ms, total ${j.recorded.totalResponseDurationMs} ms`);
    console.log(`    avoided  : ${j.avoided.discardedLatencyMs} ms, ${j.avoided.discardedOutputTokens} output tokens, $${j.avoided.discardedEstimatedCostUsd}`);
    console.log(`    projected: 1 attempt at ${j.projected.firstAttemptMaxTokens} tokens, Phase A ${j.projected.phaseADurationMs} ms, total ${j.projected.totalResponseDurationMs} ms`);
  }
  console.log(`\n${projection.caveat}`);
  console.log(`\n■ Written: ${OUTPUT}\n`);
}

main();
