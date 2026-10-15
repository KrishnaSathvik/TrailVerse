'use strict';

/**
 * One-shot deny_live tripwire audit. Runs Jest over the given paths, then prints
 * unique tests that attempted live providers. Not part of the normal test path.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SERVER_ROOT = path.resolve(__dirname, '..');
const tripwireFile = path.join(os.tmpdir(), `trailie-tripwire-audit-${process.pid}.jsonl`);
fs.writeFileSync(tripwireFile, '', { encoding: 'utf8', mode: 0o600 });

const paths = process.argv.slice(2);
const configPath = path.join(os.tmpdir(), `trailie-jest-tripwire-${process.pid}.js`);
const enrichPath = path.join(SERVER_ROOT, 'tests/tripwireEnrichSetup.js').replace(/\\/g, '/');
const baseConfigPath = path.join(SERVER_ROOT, 'jest.config.js').replace(/\\/g, '/');
fs.writeFileSync(configPath, `'use strict';
const base = require(${JSON.stringify(baseConfigPath)});
module.exports = {
  ...base,
  rootDir: ${JSON.stringify(SERVER_ROOT)},
  setupFilesAfterEnv: [...(base.setupFilesAfterEnv || []), ${JSON.stringify(enrichPath)}],
};
`);
const jestArgs = [
  require.resolve('jest/bin/jest'),
  '--config', configPath,
  '--forceExit',
  '--runInBand',
  '--',
  ...(paths.length ? paths : ['src']),
];

const env = {
  ...process.env,
  TRAILIE_TEST_PROVIDER_MODE: 'deny_live',
  TRAILIE_TEST_TRIPWIRE_FILE: tripwireFile,
};
delete env.TRAILIE_ALLOW_LIVE_TESTS;
delete env.TRAILIE_LIVE_TEST_ACK;

const child = spawnSync(process.execPath, jestArgs, {
  cwd: SERVER_ROOT,
  env,
  stdio: 'inherit',
});
try { fs.unlinkSync(configPath); } catch { /* temp config */ }

const lines = fs.readFileSync(tripwireFile, 'utf8').split('\n').filter(Boolean);
const events = [];
for (const line of lines) {
  try { events.push(JSON.parse(line)); } catch { /* skip */ }
}
try { fs.unlinkSync(tripwireFile); } catch { /* private temp */ }

const byTest = new Map();
for (const event of events) {
  const key = `${event.testPath || 'unknown'} :: ${event.testName || '(suite/beforeAll)'}`;
  if (!byTest.has(key)) byTest.set(key, { key, counts: {}, events: 0 });
  const row = byTest.get(key);
  row.events += 1;
  const phase = `${event.provider}:${event.phase}`;
  row.counts[phase] = (row.counts[phase] || 0) + 1;
}

const summary = {
  liveAnthropicConstructors: events.filter((e) => e.provider === 'claude' && e.phase === 'constructor').length,
  liveOpenAiConstructors: events.filter((e) => e.provider === 'openai' && e.phase === 'constructor').length,
  liveProviderDispatches: events.filter((e) => e.phase === 'dispatch').length,
  externalProviderHttpRequests: events.filter((e) => e.phase === 'http').length,
  totalEvents: events.length,
  uniqueTests: byTest.size,
};

process.stdout.write(`\nTRIPWIRE_AUDIT_SUMMARY ${JSON.stringify(summary)}\n`);
process.stdout.write('TRIPWIRE_BY_TEST\n');
for (const row of [...byTest.values()].sort((a, b) => a.key.localeCompare(b.key))) {
  process.stdout.write(`${row.events}\t${JSON.stringify(row.counts)}\t${row.key}\n`);
}

process.exitCode = Number.isInteger(child.status) ? child.status : 1;
