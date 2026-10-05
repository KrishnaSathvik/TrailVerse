#!/usr/bin/env node
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const suites = {
  services: ['offlineRepairQualification', 'trailieV2ExecutionService', 'coverageContainedRepairWiring', 'trailieModelRoutingService'],
  utils: ['dayContainedCoverageRepair', 'legalStopSubstitutionRepair', 'evidenceBoundRepairCandidates', 'canonicalResponse',
    'fixPass3fCoverageExposure', 'fixPass3gHardConstraintEligibility', 'planPatchTool', 'planPatchStopIdentity',
    'planPatchTargetAndFieldSemantics', 'repairTravelerEligibility', 'fundedRuntimeRegressions', 'proseExposurePolarity', 'itineraryCompleteness', 'unifiedTrailieConversation', 'tripPushback', 'itineraryReadiness', 'visibleItineraryCompleteness'],
};
const result = spawnSync(process.execPath, [path.join(__dirname, 'run-provider-disabled-tests.js'),
  '--runInBand', '--setupFilesAfterEnv', '<rootDir>/tests/offlineRepairSetup.js', '--runTestsByPath',
  ...Object.entries(suites).flatMap(([dir, names]) => names.map(name => `src/${dir}/__tests__/${name}.test.js`)),
], { stdio: 'inherit', env: { ...process.env, TRAILIE_TEST_PROVIDER_MODE: 'deny_live' } });
process.exitCode = Number.isInteger(result.status) ? result.status : 1;
