#!/usr/bin/env node
'use strict';

// Historical-output replay, NOT a model-quality evaluation. Never constructs a
// provider client or loads .env; deny network before importing runtime modules.
process.env.TRAILIE_TEST_PROVIDER_MODE = 'deny_live';
const guard = require('../src/eval/bootstrap/outboundNetworkGuard').installOutboundNetworkGuard();
guard.setPhase('runtime');
const fs = require('fs');
const path = require('path');
const { createSimpleRuntime } = require('../src/services/trailieSimpleRuntime');
const { hashPayload } = require('../src/utils/canonicalResponse');
const ROOT = path.resolve(__dirname, '../..');
const OUTPUT = path.join(ROOT, 'artifacts/trailie-simple-runtime-2026-09-29');

function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (full === OUTPUT || entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? files(full) : /\.(json|jsonl)$/.test(entry.name) ? [full] : [];
  });
}
const text = value => typeof value === 'string' && value.trim() ? value : null;
function extract(value, at = '$', output = [], depth = 0) {
  if (!value || typeof value !== 'object' || depth > 30) return output;
  if (Array.isArray(value)) {
    if (value.some(m => m?.role === 'user')) {
      for (let i = 0; i < value.length - 1; i += 1) {
        const current = value[i], next = value[i + 1];
        if (current?.role === 'user' && next?.role === 'assistant' && text(current.content) && text(next.content)) {
          output.push({ message: current.content, answer: next.content, history: value.slice(0, i)
            .filter(m => ['user', 'assistant'].includes(m?.role) && text(m.content))
            .map(m => ({ role: m.role, content: m.content })), pointer: `${at}[${i}]`,
          oldModel: next.model || null, oldCalls: null, oldLatencyMs: next.responseTime || null,
          oldPlanPresent: Boolean(next.canonicalPlan || next.itineraryPlan) });
        }
      }
    }
    value.forEach((v, i) => extract(v, `${at}[${i}]`, output, depth + 1));
  } else {
    const message = text(value.question) || text(value.prompt) || text(value.userMessage);
    const answer = text(value.fullResponse) || text(value.visibleResponse) || text(value.rawTravelerFacingProse)
      || text(value.response?.content) || text(value.response?.text) || text(value.response);
    if (message && answer) output.push({ message, answer, history: [], pointer: at,
      oldModel: value.model || null, oldCalls: value.attemptCount ?? null,
      oldLatencyMs: value.runtimeLatencyMs ?? value.generationMs ?? null,
      oldCost: value.cost?.costUsd ?? null, oldPlanPresent: Boolean(value.canonicalPlan || value.canonicalPlanCreated) });
    for (const [key, child] of Object.entries(value)) extract(child, `${at}.${key}`, output, depth + 1);
  }
  return output;
}

async function main() {
  const inventory = [], rows = [], seen = new Set();
  const candidates = [...files(path.join(ROOT, 'artifacts')), ...files(path.join(ROOT, 'server/src/eval'))];
  let occurrences = 0;
  for (const file of candidates) {
    const relative = path.relative(ROOT, file);
    if (fs.statSync(file).size > 32 * 1024 * 1024) { inventory.push({ file: relative, status: 'oversize_not_read' }); continue; }
    let documents;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      documents = file.endsWith('.jsonl') ? raw.split('\n').filter(Boolean).map(line => JSON.parse(line)) : [JSON.parse(raw)];
    } catch { inventory.push({ file: relative, status: 'parse_error' }); continue; }
    const captures = documents.flatMap((d, index) => extract(d, `$document[${index}]`));
    occurrences += captures.length;
    inventory.push({ file: relative, status: captures.length ? 'paired_turns_found' : 'no_supported_input_output_pair', pairedTurns: captures.length });
    for (const capture of captures) {
      const fingerprint = hashPayload({ message: capture.message, history: capture.history, answer: capture.answer });
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      const requestHash = hashPayload({ message: capture.message, history: capture.history });
      let observedInput = null;
      const snapshot = { planningState: null, plan: null };
      const before = hashPayload(snapshot);
      const run = createSimpleRuntime({ model: async input => {
        observedInput = input;
        return { completionStatus: 'completed', outputText: capture.answer, toolCalls: [],
          provider: 'openai', model: capture.oldModel || 'recorded-output', costStatus: 'priced', costUsd: 0 };
      }, travelTools: { definitions: [], execute: async () => { throw new Error('No recorded tool response; dispatch forbidden'); } } });
      const result = await run({ message: capture.message, history: capture.history, snapshot });
      rows.push({ file: relative, pointer: capture.pointer, fingerprint, requestHash,
        baseline: { responseHash: hashPayload(capture.answer), model: capture.oldModel, modelCalls: capture.oldCalls,
          latencyMs: capture.oldLatencyMs, costUsd: capture.oldCost ?? null, planPresent: capture.oldPlanPresent },
        simple: { status: result.status, messageUnchanged: observedInput?.input.at(-1)?.content === capture.message,
          modelReached: result.telemetry.modelCalls === 1, snapshotUnchanged: before === hashPayload(snapshot),
          replayLatencyMs: result.telemetry.latencyMs, paidModelCalls: 0, providerCalls: 0, mutation: false },
        comparison: { conversationQuality: 'not_measured_recorded_answer', stateQuality: 'no_unrequested_mutation',
          tripQuality: 'not_measured_no_native_mutation_capture', currentness: 'not_measured_no_native_tool_trace',
          continuity: 'history_forwarded_only', usefulAnswerRate: null, liveLatencyDelta: null, liveCostDelta: null } });
    }
  }
  const failureCount = rows.filter(r => r.simple.status !== 'complete' || !r.simple.messageUnchanged
    || !r.simple.modelReached || !r.simple.snapshotUnchanged).length;
  const summary = { kind: 'historical_output_transport_replay', filesScanned: inventory.length,
    filesWithPairs: inventory.filter(f => f.pairedTurns > 0).length, occurrences, uniqueReplays: rows.length,
    failures: failureCount, liveModelCalls: 0, providerCalls: 0, network: guard.summary(),
    qualitySuperiorityProven: false, replacementGate: 'NOT_EVALUATED',
    limitation: 'Recorded answers are replayed, not regenerated. No post-turn state is injected as pre-turn truth. Missing native tool/mutation traces are not fabricated.' };
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, 'corpus-inventory.json'), JSON.stringify(inventory, null, 2));
  fs.writeFileSync(path.join(OUTPUT, 'replay-results.json'), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(OUTPUT, 'replay-summary.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (failureCount || !rows.length) process.exitCode = 1;
}
main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }).finally(() => guard.uninstall());
