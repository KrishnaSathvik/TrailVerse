'use strict';

require('dotenv').config();
const path = require('path');
const {
  ALLOWED_MODELS, BENCHMARK_FIXTURES, COMPLEX_BENCHMARK_FIXTURES,
  aggregateResults, benchmarkPreflight, runBenchmark,
} = require('../src/eval/gpt56Benchmark');

async function main() {
  const enabled = process.env.TRAILIE_GPT56_BENCHMARK_ENABLED === 'true';
  const maxCalls = Number(process.env.TRAILIE_GPT56_BENCHMARK_MAX_CALLS || 24);
  const maxCostUsd = Number(process.env.TRAILIE_GPT56_BENCHMARK_MAX_COST_USD || 2);
  const benchmarkMode = process.env.TRAILIE_GPT56_BENCHMARK_MODE === 'complex' ? 'complex' : 'initial';
  const fixtures = benchmarkMode === 'complex' ? COMPLEX_BENCHMARK_FIXTURES : BENCHMARK_FIXTURES;
  const preflight = benchmarkPreflight({ enabled, apiKey: process.env.OPENAI_API_KEY, maxCalls, maxCostUsd, fixtures });
  const publicPlan = {
    benchmarkMode, models: ALLOWED_MODELS, fixtureCount: fixtures.length,
    intendedCalls: preflight.attempts.length, maxCalls, maxCostUsd,
    estimatedMaximumCostUsd: preflight.estimatedMaxCostUsd ?? null,
  };
  process.stdout.write(`${JSON.stringify({ type: 'gpt56_benchmark_preflight', ...publicPlan })}\n`);
  if (!preflight.allowed) {
    process.stdout.write(`${JSON.stringify({ status: 'skipped', reason: preflight.reason })}\n`);
    process.exitCode = 2;
    return;
  }
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  const artifactName = benchmarkMode === 'complex'
    ? 'gpt56-complex-benchmark-latest.json' : 'gpt56-benchmark-latest.json';
  const artifact = path.resolve(__dirname, `../../artifacts/private/${artifactName}`);
  const report = await runBenchmark({ client, fixtures, maxCalls, maxCostUsd, rawArtifactPath: artifact });
  process.stdout.write(`${JSON.stringify({
    status: 'complete', callCount: report.callCount, totalCostUsd: report.totalCostUsd,
    benchmarkMode, summary: aggregateResults(report), rawArtifact: `artifacts/private/${artifactName}`,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code || 'benchmark_failed' })}\n`);
  process.exitCode = 1;
});
