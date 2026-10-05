#!/usr/bin/env node
'use strict';
process.env.TRAILIE_TEST_PROVIDER_MODE = 'deny_live';
const network = require('../src/eval/bootstrap/outboundNetworkGuard').installOutboundNetworkGuard();
network.setPhase('runtime');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { createSimpleRuntime } = require('../src/services/trailieSimpleRuntime');
const root = path.resolve(__dirname, '../..');
const rows = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/trailie-simple-runtime-2026-09-29/replay-results.json')));
const output = process.env.TRAILIE_REPLAY_OUTPUT_DIR || path.join(root, 'artifacts/trailie-model-first-cutover-2026-09-30');
async function main() {
  let passed = 0;
  for (const row of rows) {
    const raw = fs.readFileSync(path.join(root, row.file), 'utf8');
    const docs = row.file.endsWith('.jsonl') ? raw.split('\n').filter(Boolean).map(s => JSON.parse(s)) : [JSON.parse(raw)];
    const tokens = [...row.pointer.matchAll(/\.([^.[\]]+)|\[(\d+)\]/g)].map(m => m[1] ?? Number(m[2]));
    let value = docs, parent = null, key;
    for (key of tokens) { parent = value; value = value[key]; }
    const message = value.role === 'user' ? value.content : value.question || value.prompt || value.userMessage;
    const answer = value.role === 'user' ? parent[key + 1].content : value.fullResponse || value.visibleResponse
      || value.rawTravelerFacingProse || value.response?.content || value.response?.text || value.response;
    const history = value.role === 'user' ? parent.slice(0, key).filter(m => ['user', 'assistant'].includes(m?.role)
      && typeof m.content === 'string' && m.content.trim()).map(m => ({ role: m.role, content: m.content })) : [];
    const snapshot = { planningState: null, plan: null };
    let modelCalls = 0;
    const run = createSimpleRuntime({ model: async input => {
      modelCalls++; assert.equal(input.input.at(-1).content, message);
      return { completionStatus: 'completed', outputText: answer, toolCalls: [], costStatus: 'priced', costUsd: 0 };
    }, travelTools: { definitions: [], execute: () => { throw new Error('No travel calls in transport replays'); } } });
    const result = await run({ message, history, snapshot });
    assert.equal(result.status, 'complete'); assert.equal(modelCalls, 1); assert.equal(result.mutation, null);
    assert.deepEqual(snapshot, { planningState: null, plan: null }); passed++;
  }
  const summary = { kind: 'historical_transport_only', passed, total: rows.length, liveCalls: 0,
    network: network.summary(), qualityEvaluation: false };
  fs.writeFileSync(path.join(output, 'historical-replay-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
