#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SERVER_ROOT = path.resolve(__dirname, '..');
const tripwireFile = path.join(os.tmpdir(), `trailie-provider-tripwire-${process.pid}.jsonl`);
try { fs.writeFileSync(tripwireFile, '', { encoding: 'utf8', mode: 0o600 }); } catch { /* child still denies */ }

const args = process.argv.slice(2);
const jestArgs = [
  require.resolve('jest/bin/jest'),
  '--config', path.join(SERVER_ROOT, 'jest.config.js'),
  ...(args.length ? args : ['src', '--runInBand']),
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

let events = [];
try {
  events = fs.readFileSync(tripwireFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
} catch { /* missing/partial diagnostics fail closed below */ }
try { fs.unlinkSync(tripwireFile); } catch { /* private temp only */ }

const count = (provider, phase) => events.filter((event) => event.provider === provider && event.phase === phase).length;
const summary = {
  liveAnthropicConstructors: count('claude', 'constructor'),
  liveOpenAiConstructors: count('openai', 'constructor'),
  liveProviderDispatches: events.filter((event) => event.phase === 'dispatch').length,
  externalProviderHttpRequests: events.filter((event) => event.phase === 'http').length,
};
process.stdout.write(`\nTRAILIE_PROVIDER_ISOLATION_SUMMARY ${JSON.stringify(summary)}\n`);

const isolationFailed = Object.values(summary).some((value) => value !== 0);
process.exitCode = isolationFailed ? 2 : (Number.isInteger(child.status) ? child.status : 1);

