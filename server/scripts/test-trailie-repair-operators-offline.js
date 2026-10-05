#!/usr/bin/env node
'use strict';
const {spawnSync}=require('child_process');const path=require('path');
const suites={utils:['repairOperators','repairOperatorReplay','evidenceActivityDuration','qualificationDispatchPolicy'],
 services:['compoundActionabilityWiring','groundedScopeRepairWiring','downstreamRepairWiring'],
 prompts:['itineraryEvidenceBalance','evidenceBundlePromptRenderer','travelerValueRanking','trailiePromptV2']};
const result=spawnSync(process.execPath,[path.join(__dirname,'run-provider-disabled-tests.js'),'--runInBand',
 '--setupFilesAfterEnv','<rootDir>/tests/offlineRepairSetup.js','--runTestsByPath',
 ...Object.entries(suites).flatMap(([dir,names])=>names.map(name=>`src/${dir}/__tests__/${name}.test.js`))],
 {stdio:'inherit',env:{...process.env,TRAILIE_TEST_PROVIDER_MODE:'deny_live'}});
process.exitCode=Number.isInteger(result.status)?result.status:1;
