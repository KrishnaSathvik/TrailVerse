#!/usr/bin/env node
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const result = spawnSync(process.execPath, [path.join(__dirname, 'run-provider-disabled-tests.js'),
  '--runInBand', '--setupFilesAfterEnv', '<rootDir>/tests/offlineRepairSetup.js', '--runTestsByPath',
  'src/utils/__tests__/compoundActionability.test.js', 'src/utils/__tests__/qualificationDispatchPolicy.test.js', 'src/services/__tests__/compoundActionabilityWiring.test.js',
], { stdio: 'inherit', env: { ...process.env, TRAILIE_TEST_PROVIDER_MODE: 'deny_live', TRAILIE_TELEMETRY_HASH_SALT: 'quality-offline-only' } });
process.exitCode = Number.isInteger(result.status) ? result.status : 1;
if (process.exitCode === 0) process.stdout.write('COMPOUND_ACTIONABILITY_PROVIDER_TRIPWIRE '+JSON.stringify({OpenAI:0,Anthropic:0,Google:0,search:0,weather:0,mapsRoutes:0})+'\n');
