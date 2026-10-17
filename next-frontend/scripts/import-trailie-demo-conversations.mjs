#!/usr/bin/env node
// Import reviewed local captures without rewriting the assistant's words.
// node --import ./scripts/register-extensionless.mjs scripts/import-trailie-demo-conversations.mjs --dry-run
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { buildPlaybackFixture, buildPlaybackScenario, assertNoInternalFields } from '../src/lib/trailieDemoCapture.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const captures = resolve(root, 'artifacts/private/demo-capture-2026-10-15');
const specs = JSON.parse(readFileSync(resolve(root, 'server/scripts/trailie-demo-capture-prompts.json')));
const scenarios = specs.map(spec => {
  const capture = JSON.parse(readFileSync(resolve(captures, spec.id, 'accepted.json')));
  assert.equal(capture.status, 'accepted');
  assert.equal(capture.turns.length, spec.questions.length);
  const { scenario, problems } = buildPlaybackScenario({ ...spec, approvedTurns: capture.turns.map((turn, i) => {
    assert.equal(turn.question, spec.questions[i]);
    assert.equal(turn.httpStatus, 200);
    assert(Object.values(turn.checks).every(Boolean));
    return { question: turn.question, content: turn.body.content,
      // Advice-only turns may retain a stored trip, but must not replay its card.
      canonicalPlan: turn.body.hasItinerary ? turn.body.canonicalPlan : null,
      hasLiveData: turn.body.hasLiveData === true,
      hasWebSearch: turn.body.hasWebSearch === true };
  }) });
  assert.deepEqual(problems, []);
  // Preserve captured prose verbatim through the shared response renderer.
  scenario.turns.forEach(turn => { turn.source = 'live-envelope'; });
  return scenario;
});
const fixture = buildPlaybackFixture(scenarios);
assert.deepEqual(assertNoInternalFields(fixture), []);
for (const s of scenarios) console.log(`${s.id}: ${s.turns.length} turns, ${s.turns.filter(t => t.plan).length} trip cards`);
if (!process.argv.includes('--dry-run')) writeFileSync(resolve(root, 'next-frontend/src/data/trailieDemoPlayback.json'), JSON.stringify(fixture, null, 2)+'\n');
