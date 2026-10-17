#!/usr/bin/env node
// Offline integrity check: verifies recordings, not future model behavior.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(root, p));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const baseline = JSON.parse(read('docs/releases/trailie-baseline-2026-10-15.json'));
const fixtureBytes = read(baseline.fixture.path);
assert.equal(hash(fixtureBytes), baseline.fixture.sha256, 'Public demo changed; explicit reviewed baseline replacement required');
const fixture = JSON.parse(fixtureBytes);
assert.equal(fixture.scenarios.length, 5);
let turns = 0, privateSources = 0;
for (const recorded of baseline.demo.conversations) {
  const scenario = fixture.scenarios.find(s => s.id === recorded.id);
  assert(scenario);
  assert.equal(scenario.turns.length, 3);
  for (const [i, turn] of recorded.turns.entries()) {
    assert.equal(scenario.turns[i].question, turn.question);
    assert.equal(hash(scenario.turns[i].prose), turn.responseSha256);
    assert.equal(turn.httpStatus, 200);
    assert(Object.values(turn.checks).every(Boolean));
    turns++;
  }
}
assert.equal(turns, 15);
assert.equal(baseline.refusals.length, 4);
for (const refusal of baseline.refusals) {
  assert.equal(refusal.httpStatus, 200);
  assert.equal(refusal.hasItinerary, false);
  assert.equal(refusal.mutationAccepted, false);
  assert(refusal.answer.trim());
}
for (const record of [...baseline.demo.conversations, ...baseline.refusals]) {
  if (existsSync(resolve(root, record.source))) {
    assert.equal(hash(read(record.source)), record.sourceSha256, `Raw evidence changed: ${record.source}`);
    privateSources++;
  }
}
console.log(`PASS: ${turns} demo turns, 4 separately recorded refusals, ${privateSources}/9 private source checksums available and verified; zero provider calls.`);
