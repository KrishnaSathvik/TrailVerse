'use strict';

/**
 * Require-time reachability: load the model-first stack under a Module._load
 * interceptor and fail if any banned legacy judgment module is loaded.
 */
const path = require('path');
const Module = require('module');

const banned = [
  'trailieIntentClassifier',
  'trailieTravelerJobResolver',
  'turnSufficiencyDecision',
  'turnUnderstanding',
  'evidencePlannerService',
  'dominantIntentArbitration',
  'trailieExecutionService',
  'trailieRouteBridge',
  'trailieV2ExecutionService',
  'itineraryCompleteness',
  'constraintEngine',
  'itineraryCorrector',
  'repairLedger',
  'tripMutationCommit',
  'artifactFulfillment',
  'proseConstraintSafety',
  'semanticDayValue',
  'tripExperienceQuality',
  'planViabilityRepair',
];

const labels = {
  trailieIntentClassifier: 'intent classifier',
  trailieTravelerJobResolver: 'traveler-job resolver',
  turnSufficiencyDecision: 'sufficiency engine',
  turnUnderstanding: 'turn understanding',
  dominantIntentArbitration: 'intent arbitration',
  evidencePlannerService: 'evidence planner',
  trailieExecutionService: 'legacy execution',
  trailieRouteBridge: 'legacy route bridge',
  trailieV2ExecutionService: 'legacy v2 execution',
  itineraryCompleteness: '90-min / coverage completeness',
  constraintEngine: 'constraint / stop-quota engine',
  itineraryCorrector: 'legacy itinerary corrector',
  repairLedger: 'repair ledger',
  tripMutationCommit: 'legacy trip mutation commit',
  artifactFulfillment: 'artifact fulfillment',
  proseConstraintSafety: 'prose constraint safety',
  semanticDayValue: 'semantic day value',
  tripExperienceQuality: 'trip experience quality',
  planViabilityRepair: 'plan viability repair',
};

const hits = [];
const orig = Module._load;
Module._load = function intercept(request, parent, isMain) {
  const name = banned.find(b => String(request).includes(b));
  if (name) {
    hits.push({
      name,
      label: labels[name],
      request: String(request),
      from: parent?.filename ? path.relative(process.cwd(), parent.filename) : null,
    });
  }
  return orig.apply(this, arguments);
};

process.env.TRAILIE_RUNTIME = process.env.TRAILIE_RUNTIME || 'model_first';
require('../src/routes/modelFirstTrailie');
require('../src/services/trailieSimpleRuntime');
require('../src/services/trailieSimpleGuard');
require('../src/services/trailieSimpleTools');
require('../src/services/trailieSimpleStore');
require('../src/services/trailieSimpleGuestStore');
require('../src/services/trailieCanonicalCommit');
require('../src/services/trailiePlaceRecovery');
require('../src/services/trailieMemoryAuthority');
require('../src/services/evidenceBrokerRuntime');
require('../src/services/evidenceBrokerService');

Module._load = orig;
const report = { hitCount: hits.length, hits };
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (hits.length) process.exit(1);
