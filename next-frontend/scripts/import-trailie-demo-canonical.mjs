#!/usr/bin/env node
// Import only hash-verified real captures satisfying today's day contract.
// This script never calls a provider and never repairs or infers canonical data.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { sanitizePlan } from '../src/lib/trailieDemoCapture.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { validateDayCompleteness } = require('../../server/src/utils/dayCompleteness');
const { hashPayload } = require('../../server/src/utils/canonicalResponse');
const { exportPublicPlan } = require('../../shared/publicPlanExport.cjs');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const arg = key => { const i = process.argv.indexOf(key); return i < 0 ? null : process.argv[i + 1]; };
const manifestPath = resolve(root, arg('--manifest') || 'artifacts/trailie-demo-current-2026-10-10/FREEZE-MANIFEST.json');
const fixturePath = resolve(root, 'next-frontend/src/data/trailieDemoPlayback.json');
const manifest = read(manifestPath);
const current = read(fixturePath);
const issues = [];
if (manifest.status !== 'reviewed-current-contract') issues.push('Manifest must represent a fully reviewed current-contract batch');
const provenance = [];
const scenarios = current.scenarios.map(scenario => {
  const selected = manifest.conversations.find(item => item.demo === scenario.id);
  if (!selected) { issues.push(`${scenario.id}: missing approved source`); return scenario; }
  if (selected.turns.length !== 3 || selected.turns.some((turn, index) => turn.turn !== index + 1)) issues.push(`${scenario.id}: expected three ordered turns`);
  const turns = selected.turns.map(turn => {
    const sourcePath = resolve(root, 'artifacts', selected.sourceRun, selected.demo, `turn-${turn.turn}-done.json`);
    const source = read(sourcePath);
    const sourceSummary = read(resolve(dirname(sourcePath), 'summary.json'));
    if (sourceSummary.turns.find(item => item.n === turn.turn)?.question !== turn.question) issues.push(`${scenario.id}/${turn.turn}: question differs from source`);
    const digest = createHash('sha256').update(source.content || '').digest('hex');
    if (digest !== turn.responseSha256 || (source.contentHash && digest !== source.contentHash)) issues.push(`${scenario.id}/${turn.turn}: response hash mismatch`);
    if (source.artifactStatus?.status === 'save_failed') issues.push(`${scenario.id}/${turn.turn}: rejected save`);
    if (source.persisted !== true) issues.push(`${scenario.id}/${turn.turn}: response was not persisted`);
    if (source.itineraryData && hashPayload(source.itineraryData) !== source.itineraryHash) issues.push(`${scenario.id}/${turn.turn}: received itinerary does not match its hash`);
    const rawPlan = source.canonicalPlan;
    if (rawPlan?.days?.length) {
      if (source.persisted !== true) issues.push(`${scenario.id}/${turn.turn}: plan was not persisted`);
      if (turn.itineraryHash !== source.itineraryHash) issues.push(`${scenario.id}/${turn.turn}: itinerary hash mismatch`);
      if (rawPlan.itineraryHash !== source.itineraryHash) issues.push(`${scenario.id}/${turn.turn}: canonical identity mismatch`);
      for (const key of Object.keys(source.itineraryData || {})) {
        if (hashPayload(rawPlan[key]) !== hashPayload(source.itineraryData[key])) issues.push(`${scenario.id}/${turn.turn}: canonical field differs: ${key}`);
      }
      for (const day of rawPlan.days) {
        for (const issue of validateDayCompleteness(day)) issues.push(`${scenario.id}/${turn.turn}/day-${day.dayNumber}: ${issue}`);
      }
      // Shared public export must round-trip; Demo fixture then applies sanitizePlan
      // (strips owner-facing feasibilityIssues) without inventing travel content.
      const publicPlan = exportPublicPlan(rawPlan);
      if (!publicPlan?.days?.length) issues.push(`${scenario.id}/${turn.turn}: public export emptied the plan`);
    }
    provenance.push({ scenario: scenario.id, turn: turn.turn, source: sourcePath.slice(root.length + 1), responseSha256: digest, days: rawPlan?.days?.length || 0, structuredDays: (rawPlan?.days || []).filter(day => day.dayStructure?.blocks?.length).length });
    return { question: turn.question, prose: source.content, content: source.content, source: 'live-envelope', plan: rawPlan?.days?.length ? sanitizePlan(rawPlan) : null };
  });
  return { ...scenario, turns };
});
const report = { manifest: manifestPath.slice(root.length + 1), valid: issues.length === 0, applied: false, issues, provenance };
if (!issues.length && process.argv.includes('--apply')) {
  const temporaryPath = `${fixturePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify({ ...current, scenarios }, null, 2) + '\n');
  renameSync(temporaryPath, fixturePath);
  report.applied = true;
}
if (arg('--report')) writeFileSync(resolve(root, arg('--report')), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exitCode = 1;
