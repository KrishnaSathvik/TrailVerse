#!/usr/bin/env node
/**
 * Build and import the final, explicitly approved Q1-Q5 capture pack.
 *
 * Sources are frozen paid-validation artifacts. Every public field crosses the
 * allowlist in trailieDemoCapture.js; provider/model/cost/hash/debug state never
 * enters the pack or browser fixture. No network, provider, or database access.
 *
 *   node --import ./scripts/register-extensionless.mjs scripts/import-trailie-demo-captures.mjs --dry-run
 *   node --import ./scripts/register-extensionless.mjs scripts/import-trailie-demo-captures.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertNoInternalFields,
  buildPlaybackFixture,
  buildPlaybackScenario,
  FORBIDDEN_FIXTURE_FIELDS,
} from '../src/lib/trailieDemoCapture.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const FIXTURE = join(HERE, '../src/data/trailieDemoPlayback.json');
const ARTIFACT_ROOT = join(ROOT, 'artifacts/trailie-v2-demo-final-validation');
const PACK = join(ARTIFACT_ROOT, 'final-approved-capture-pack.json');
const APPROVAL = join(ARTIFACT_ROOT, 'FINAL-Q1-Q5-APPROVAL.json');
const DRY = process.argv.includes('--dry-run');

const EXACT = Object.freeze({
  q1: 'I have 3 days in late September. Should I choose Yosemite or Sequoia for easy hikes, photography, and fewer crowds? Pick one and explain why.',
  q2: "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
  q3: 'Plan a relaxed weekend at Valley of Fire from Las Vegas with easy hikes, sunset spots, and minimal rushing.',
  q4: 'Plan a realistic 2-day Zion trip for a couple who wants scenic views, easy-to-moderate hikes, and no exposed scary trails.',
  q5: 'Actually make it more relaxed, avoid shuttle-heavy parts if possible, and add one good sunset spot.',
});

const SOURCES = Object.freeze({
  q1: { run: 'q1-seasonal-paid-reval', response: 'q1-response.json', promptField: 'run-meta.json' },
  q2: { run: 'q2-independence-paid-reval', response: 'q2-response.json', evaluation: 'q2-evaluation.json' },
  q3: { run: 'q3-subject-paid-reval', response: 'q3-response.json', evaluation: 'q3-evaluation.json' },
  q4: { run: 'q4-semantic-paid-reval', response: 'q4-response.json', evaluation: 'q4-evaluation.json', handoff: 'q4-handoff.json' },
  q5: { run: 'q5-zion-paid-reval', response: 'q5-response.json', evaluation: 'q5-evaluation.json', handoff: 'q5-handoff.json' },
});

function sourcePath(key, file) {
  return join(ARTIFACT_ROOT, SOURCES[key].run, file);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const current = readJson(FIXTURE);
const responses = Object.fromEntries(
  Object.entries(SOURCES).map(([key, source]) => [key, readJson(sourcePath(key, source.response))])
);
const evaluations = Object.fromEntries(
  Object.entries(SOURCES)
    .filter(([, source]) => source.evaluation)
    .map(([key, source]) => [key, readJson(sourcePath(key, source.evaluation))])
);

const q1Meta = readJson(sourcePath('q1', SOURCES.q1.promptField));
assert(q1Meta.exactPrompt === EXACT.q1, 'Q1 exact prompt drift');
for (const key of ['q2', 'q3', 'q4', 'q5']) {
  assert(evaluations[key]?.prompt === EXACT[key], `${key.toUpperCase()} exact prompt drift`);
}

for (const key of Object.keys(SOURCES)) {
  const response = responses[key];
  assert(response.httpStatus === 200, `${key.toUpperCase()} is not HTTP 200`);
  assert(response.trailieV2?.status === 'complete', `${key.toUpperCase()} is not complete`);
  assert(response.trailieV2?.validation?.status === 'pass', `${key.toUpperCase()} validation did not pass`);
  assert((response.trailieV2?.validation?.reasonCodes || []).length === 0, `${key.toUpperCase()} has reason codes`);
  assert(response.travelLogistics == null, `${key.toUpperCase()} has Travel & Stay data`);
}

const q4Handoff = readJson(sourcePath('q4', SOURCES.q4.handoff));
const q5Handoff = readJson(sourcePath('q5', SOURCES.q5.handoff));
assert(q4Handoff.green === true, 'Q4 handoff is not green');
assert(q5Handoff.green === true, 'Q5 handoff is not green');
assert(q5Handoff.parentRunId === SOURCES.q4.run, 'Q5 did not use the approved Q4 run');
assert(q5Handoff.priorItineraryHash === q4Handoff.itineraryHash, 'Q4→Q5 itinerary handoff hash mismatch');
assert(q5Handoff.avoidExposurePreserved === true, 'Q5 lost the Q4 exposure constraint');

const byScenario = new Map(current.scenarios.map((scenario) => [scenario.id, scenario]));
function build(id, turnKeys) {
  const prior = byScenario.get(id);
  assert(prior, `fixture is missing scenario identity ${id}`);
  assert(prior.turns.length === turnKeys.length, `${id}: turn-count drift`);
  const approvedTurns = turnKeys.map((key, index) => ({
    question: EXACT[key],
    content: responses[key].content,
    canonicalPlan: responses[key].itinerary,
    hasLiveData: true,
    hasWebSearch: false,
    expectedQuestion: prior.turns[index].question,
  }));
  approvedTurns.forEach((turn, index) => {
    assert(turn.question === turn.expectedQuestion, `${id} turn ${index}: fixture question drift`);
    delete turn.expectedQuestion;
  });
  const { scenario, problems } = buildPlaybackScenario({
    id: prior.id,
    label: prior.label,
    chatTitle: prior.chatTitle,
    approvedTurns,
  });
  assert(problems.length === 0, `${id}: ${problems.join('; ')}`);
  return scenario;
}

const scenarioKeys = new Map([
  ['compare-yosemite-sequoia', ['q1']],
  ['zion-couple-itinerary', ['q4', 'q5']],
  ['glacier-one-day-july', ['q2']],
  ['valley-of-fire-weekend', ['q3']],
]);
const scenarios = current.scenarios.map((scenario) => build(scenario.id, scenarioKeys.get(scenario.id)));
const pack = buildPlaybackFixture(scenarios);

const leaks = assertNoInternalFields(pack);
assert(leaks.length === 0, `forbidden fixture fields: ${leaks.join(', ')}`);
const serialized = JSON.stringify(pack);
for (const field of FORBIDDEN_FIXTURE_FIELDS) {
  assert(!serialized.includes(`"${field}"`), `forbidden field serialized: ${field}`);
}
for (const pattern of [/gpt-5/i, /openai/i, /terra_/i, /reasonCodes/i, /itineraryHash/i, /costUsd/i]) {
  assert(!pattern.test(serialized), `internal/debug pattern leaked: ${pattern}`);
}

const approval = {
  schemaVersion: 1,
  exactPrompts: EXACT,
  approvedRuns: Object.fromEntries(Object.entries(SOURCES).map(([key, source]) => {
    const responsePath = sourcePath(key, source.response);
    return [key, {
      run: source.run,
      response: relative(ROOT, responsePath),
      responseSha256: sha256(responsePath),
    }];
  })),
  q4ToQ5: {
    sameConversationState: true,
    q4Run: SOURCES.q4.run,
    q5ParentRun: q5Handoff.parentRunId,
    inheritedExposureConstraint: q5Handoff.avoidExposurePreserved === true,
  },
  publicPackSha256: createHash('sha256').update(`${JSON.stringify(pack, null, 2)}\n`).digest('hex'),
};

console.log('[approval] sources:');
for (const [key, source] of Object.entries(approval.approvedRuns)) {
  console.log(`  ${key.toUpperCase()} -> ${source.run} (${source.responseSha256.slice(0, 12)}…)`);
}
console.log('[capture] scenarios:');
for (const scenario of pack.scenarios) {
  const days = scenario.turns.map((turn) => turn.plan?.days?.length || 0).join('/');
  console.log(`  ${scenario.id.padEnd(26)} ${scenario.kind.padEnd(12)} turns=${scenario.turns.length} days=${days}`);
}

if (DRY) {
  console.log('[capture] --dry-run: pack, approval manifest, and fixture untouched');
} else {
  writeFileSync(PACK, `${JSON.stringify(pack, null, 2)}\n`);
  writeFileSync(APPROVAL, `${JSON.stringify(approval, null, 2)}\n`);
  writeFileSync(FIXTURE, `${JSON.stringify(pack, null, 2)}\n`);
  console.log(`[capture] wrote ${relative(ROOT, PACK)}`);
  console.log(`[capture] wrote ${relative(ROOT, APPROVAL)}`);
  console.log(`[capture] imported ${relative(ROOT, FIXTURE)}`);
}
