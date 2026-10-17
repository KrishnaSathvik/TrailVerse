#!/usr/bin/env node
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const result = spawnSync(process.execPath, [path.join(__dirname, 'run-provider-disabled-tests.js'),
  '--runInBand', '--setupFilesAfterEnv', '<rootDir>/tests/offlineRepairSetup.js', '--runTestsByPath',
  'src/utils/__tests__/downstreamRepairPlanner.test.js', 'src/utils/__tests__/downstreamRepairReplay.test.js',
  'src/services/__tests__/downstreamRepairWiring.test.js',
], { stdio: 'inherit', env: { ...process.env, TRAILIE_TEST_PROVIDER_MODE: 'deny_live' } });
process.exitCode = Number.isInteger(result.status) ? result.status : 1;
