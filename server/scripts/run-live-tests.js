#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { assertLiveTestsAuthorized } = require('../src/config/providerTestPolicy');

function main(argv = process.argv.slice(2), env = process.env) {
  try {
    assertLiveTestsAuthorized(env);
  } catch (error) {
    process.stderr.write(`${error.code || 'live_tests_not_authorized'}\n`);
    return 1;
  }
  const serverRoot = path.resolve(__dirname, '..');
  const child = spawnSync(process.execPath, [
    require.resolve('jest/bin/jest'),
    '--config', path.join(serverRoot, 'jest.live.config.js'),
    ...argv,
  ], { cwd: serverRoot, env: { ...env, TRAILIE_TEST_PROVIDER_MODE: 'allow_live' }, stdio: 'inherit' });
  return Number.isInteger(child.status) ? child.status : 1;
}

if (require.main === module) process.exitCode = main();

module.exports = { main };

