#!/usr/bin/env node
'use strict';

// Opt-in, verifier-only semantic qualification. No application/database boot,
// planner calls, tools or writes; at most one request per fixed fixture.
const cases = require('../tests/fixtures/memoryAuthorityCases.json');
const { createMemoryAuthorityVerifier } = require('../src/services/trailieMemoryAuthority');
const { createMemoryVerificationModel } = require('../src/services/trailieMemoryVerificationModel');
const { validateSimpleMutation } = require('../src/services/trailieSimpleGuard');
const { assertLiveTestsAuthorized, assertLiveProviderAllowed } = require('../src/config/providerTestPolicy');

async function evaluateCases(verifyMemory) {
  const results = [];
  for (const fixture of cases) {
    const { authority, ...update } = fixture.update;
    const verification = await verifyMemory({ message: fixture.message, updates: [update] });
    const result = validateSimpleMutation({ message: fixture.message, memoryAuthority: verification.receipt,
      proposal: { response: 'Proposed update.', memory_updates: [update] } });
    results.push({ name: fixture.name, expectedAccept: fixture.expectedAccept, accepted: result.ok,
      passed: verification.status === 'verified' && result.ok === fixture.expectedAccept,
      verificationStatus: verification.status, issues: result.issues,
      usage: verification.generation?.usage || null, costUsd: verification.generation?.costUsd ?? null,
      relationships: verification.generation?.structuredOutput?.verdicts || null });
  }
  return { passed: results.every(result => result.passed), cases: results.length, results };
}

async function main() {
  if (!process.argv.includes('--execute-live')) {
    console.log(JSON.stringify({ live: false, maxCalls: cases.length, timeoutPerCallMs: 15000,
      maxOutputTokensPerCall: 4096, model: 'gpt-6.1-sol', cases: cases.map(({ name }) => name) }, null, 2));
    return;
  }
  assertLiveTestsAuthorized();
  assertLiveProviderAllowed({ provider: 'openai', phase: 'constructor' });
  require('dotenv').config({ quiet: true });
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 15000 });
  const report = await evaluateCases(createMemoryAuthorityVerifier({ model: createMemoryVerificationModel({ client }) }));
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

if (require.main === module) main().catch(error => {
  console.error(`Memory authority evaluation failed: ${error.code || 'verification_failed'}`);
  process.exitCode = 1;
});

module.exports = { evaluateCases };
