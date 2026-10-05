#!/usr/bin/env node
/**
 * Import the accepted signed-in public demo set into /trailie-demo.
 *
 * Sources are the TripPlan dumps from the latest signed-in recapture run.
 * Every public field crosses the allowlist in trailieDemoCapture.js. trip/user
 * ids, provider, model, and cost never enter the browser fixture.
 *
 *   node --import ./scripts/register-extensionless.mjs scripts/import-trailie-demo-public-set.mjs --dry-run
 *   node --import ./scripts/register-extensionless.mjs scripts/import-trailie-demo-public-set.mjs
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
const DRY = process.argv.includes('--dry-run');

const INTENT_ALLOWLIST = [
  'primaryIntent',
  'travelerJob',
  'verticals',
  'depth',
  'freshness',
  'confidence',
];

const PRESENTATION_ALLOWLIST = [
  'schemaVersion',
  'presentationKind',
  'refinement',
  'primaryArtifact',
  'supportingModules',
  'prosePolicy',
  'ending',
];

const SCENARIOS = Object.freeze([
  {
    id: 'valley-of-fire-weekend',
    label: 'Valley of Fire',
    chatTitle: 'Valley of Fire weekend',
    question: 'Plan a relaxed weekend at Valley of Fire from Las Vegas with easy hikes, sunset spots, and minimal rushing.',
    capture: join(ROOT, 'artifacts/trailie-v2-phase12h-public-demo-recapture-2026-09-19/captures/valley-of-fire-weekend.json'),
    parkName: 'Valley of Fire State Park',
    liveData: { nps: true, web: false },
  },
  {
    id: 'compare-acadia-shenandoah',
    label: 'Compare',
    chatTitle: 'Acadia vs Shenandoah',
    question: 'I have 3 days in October. Should I choose Acadia or Shenandoah for fall colors, easy hikes, and photography? Pick one and explain why.',
    capture: join(ROOT, 'artifacts/trailie-v2-phase12h-public-demo-recapture-2026-09-19/captures/compare-acadia-shenandoah.json'),
    parkName: 'Acadia',
    liveData: { nps: true, web: true },
  },
  {
    id: 'yellowstone-relaxed',
    label: 'Yellowstone',
    chatTitle: 'Two days in Yellowstone',
    question: 'Plan a relaxed 2-day Yellowstone trip for first-time visitors who want geysers, wildlife, and scenic drives without rushing.',
    capture: join(ROOT, 'artifacts/trailie-v2-phase12h-public-demo-recapture-2026-09-19/captures/yellowstone-relaxed.json'),
    parkName: 'Yellowstone National Park',
    liveData: { nps: true, web: false },
  },
  {
    id: 'rocky-mountain-one-day',
    label: 'Rocky Mountain',
    chatTitle: 'One day in Rocky Mountain',
    question: "I only have one full day in Rocky Mountain National Park. What should I prioritize, and what's a good backup if Bear Lake parking or access doesn't work out?",
    capture: join(ROOT, 'artifacts/trailie-v2-phase12h-public-demo-recapture-2026-09-19/captures/rocky-mountain-one-day.json'),
    parkName: 'Rocky Mountain National Park',
    liveData: { nps: true, web: true },
  },
  {
    id: 'zion-couple-itinerary',
    label: 'Zion',
    chatTitle: 'Easy Zion for two',
    question: 'Plan a realistic 2-day Zion trip for a couple who wants scenic views, easy-to-moderate hikes, and no exposed scary trails.',
    capture: join(ROOT, 'artifacts/trailie-v2-phase12h-public-demo-recapture-2026-09-19/captures/zion-couple-itinerary.json'),
    parkName: 'Zion National Park',
    liveData: { nps: true, web: false },
  },
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function pick(source, allowlist) {
  const out = {};
  for (const key of allowlist) {
    if (source?.[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assistantTurn(dump) {
  const user = (dump.messages || []).find((message) => message.role === 'user');
  const assistant = [...(dump.messages || [])].reverse().find((message) => message.role === 'assistant');
  return { user, assistant };
}

const scenarios = SCENARIOS.map((spec) => {
  const dump = readJson(spec.capture);
  const { user, assistant } = assistantTurn(dump);
  assert(user?.content === spec.question, `${spec.id}: capture question drift`);
  assert(typeof assistant?.content === 'string' && assistant.content.trim().length > 200, `${spec.id}: missing prose`);

  const { scenario, problems } = buildPlaybackScenario({
    id: spec.id,
    label: spec.label,
    chatTitle: spec.chatTitle,
    approvedTurns: [{
      question: spec.question,
      content: assistant.content,
      canonicalPlan: assistant.canonicalPlanRaw || assistant.canonicalPlan || null,
      hasLiveData: spec.liveData.nps,
      hasWebSearch: spec.liveData.web,
    }],
  });
  assert(problems.length === 0, `${spec.id}: ${problems.join('; ')}`);

  const turn = scenario.turns[0];
  turn.liveData = { ...spec.liveData };
  turn.source = 'live-envelope';
  turn.parkName = spec.parkName;
  if (assistant.intent) turn.intent = pick(assistant.intent, INTENT_ALLOWLIST);
  if (assistant.presentation) {
    turn.presentation = pick(assistant.presentation, PRESENTATION_ALLOWLIST);
  }
  return scenario;
});

const pack = buildPlaybackFixture(scenarios);
const leaks = assertNoInternalFields(pack);
assert(leaks.length === 0, `forbidden fixture fields: ${leaks.join(', ')}`);
const serialized = `${JSON.stringify(pack, null, 2)}\n`;
for (const field of FORBIDDEN_FIXTURE_FIELDS) {
  assert(!serialized.includes(`"${field}"`), `forbidden field serialized: ${field}`);
}
for (const pattern of [/gpt-5/i, /openai/i, /terra_/i, /reasonCodes/i, /itineraryHash/i, /costUsd/i, /6aade937/]) {
  assert(!pattern.test(serialized), `internal/debug pattern leaked: ${pattern}`);
}

console.log('[capture] public demo scenarios:');
for (const scenario of pack.scenarios) {
  const days = scenario.turns[0].plan?.days?.length || 0;
  console.log(`  ${scenario.id.padEnd(28)} ${scenario.kind.padEnd(12)} days=${days} chars=${scenario.turns[0].prose.length}`);
}
console.log(`[capture] sha256 ${createHash('sha256').update(serialized).digest('hex')}`);

if (DRY) {
  console.log('[capture] --dry-run: fixture untouched');
} else {
  writeFileSync(FIXTURE, serialized);
  console.log(`[capture] imported ${relative(ROOT, FIXTURE)}`);
}
