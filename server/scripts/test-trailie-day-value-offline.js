#!/usr/bin/env node
'use strict';
// No database, credentials, downloads, or provider transport. Every suite installs
// the outbound guard before imports; even a swallowed network attempt fails it.
const { spawnSync } = require('child_process');
const path = require('path');
const suites = {
  utils: ['anchoredExperienceRetry', 'stopIdentityResolution', 'offlineRootCauseFixes',
    'legalStopSubstitutionRepair', 'identityDegradationMetamorphic', 'exposureAcceptancePolarity',
    'generationContractTier1', 'strictModeFeasibility', 'mobilityEligibility', 'planPatchTargetAndFieldSemantics',
    'identityAwareDuplicateExperience', 'fundedRuntimeRegressions', 'canonicalResponse',
    'unifiedTrailieConversation', 'dayContainedCoverageRepair', 'repairTravelerEligibility',
    'itineraryCompleteness', 'semanticDayValue', 'canonicalPlanNarrative', 'evidenceBoundRepairCandidates'],
  services: ['trailieModelRoutingService', 'offlineRepairQualification', 'npsEvidenceProvider',
    'coverageContainedRepairWiring', 'anchorContainedRepairWiring'],
};
const result = spawnSync(process.execPath, [path.join(__dirname, 'run-provider-disabled-tests.js'),
  '--runInBand', '--setupFilesAfterEnv', '<rootDir>/tests/offlineRepairSetup.js', '--runTestsByPath',
  ...Object.entries(suites).flatMap(([dir, names]) => names.map(name => `src/${dir}/__tests__/${name}.test.js`)),
], { stdio: 'inherit', env: { ...process.env, TRAILIE_TEST_PROVIDER_MODE: 'deny_live', TRAILIE_TELEMETRY_HASH_SALT: 'offline-fixture-only' } });
process.exitCode = Number.isInteger(result.status) ? result.status : 1;
if (process.exitCode === 0) {
  process.stdout.write(`DAY_VALUE_PROVIDER_TRIPWIRE ${JSON.stringify({ OpenAI: 0, Anthropic: 0, Google: 0, searchProviders: 0, weather: 0, mapsRoutes: 0 })}\n`);
}
