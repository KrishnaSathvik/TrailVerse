'use strict';

const {
  PRIMARY_INTENTS,
  classifyTrailieIntent,
  validateIntentClassification,
} = require('../services/trailieIntentClassifier');

function zeroConfusionMatrix() {
  return Object.fromEntries(PRIMARY_INTENTS.map((actual) => [
    actual,
    Object.fromEntries(PRIMARY_INTENTS.map((predicted) => [predicted, 0])),
  ]));
}

function evaluateIntentFixtures(fixtures = []) {
  const confusionMatrix = zeroConfusionMatrix();
  let correctPrimary = 0;
  let schemaValid = 0;
  let verticalTruePositive = 0;
  let verticalFalsePositive = 0;
  let verticalFalseNegative = 0;
  let safetyFreshnessDowngrades = 0;
  let lunaEligible = 0;

  for (const fixture of fixtures) {
    const result = classifyTrailieIntent({
      userPrompt: fixture.userPrompt,
      priorTripState: fixture.priorTripState,
    });
    if (validateIntentClassification(result).valid) schemaValid += 1;
    if (result.primaryIntent === fixture.expectedIntent) correctPrimary += 1;
    if (confusionMatrix[fixture.expectedIntent]?.[result.primaryIntent] != null) {
      confusionMatrix[fixture.expectedIntent][result.primaryIntent] += 1;
    }

    const expectedVerticals = new Set(fixture.expectedVerticals || []);
    const actualVerticals = new Set(result.verticals || []);
    for (const vertical of actualVerticals) {
      if (expectedVerticals.has(vertical)) verticalTruePositive += 1;
      else verticalFalsePositive += 1;
    }
    for (const vertical of expectedVerticals) {
      if (!actualVerticals.has(vertical)) verticalFalseNegative += 1;
    }
    if (fixture.expectedFreshness === 'safety_critical' && result.freshness !== 'safety_critical') {
      safetyFreshnessDowngrades += 1;
    }
    if (result.requiresLunaShadow) lunaEligible += 1;
  }

  const fixtureCount = fixtures.length;
  const precisionDenominator = verticalTruePositive + verticalFalsePositive;
  const recallDenominator = verticalTruePositive + verticalFalseNegative;
  const verticalPrecision = precisionDenominator ? verticalTruePositive / precisionDenominator : 1;
  const verticalRecall = recallDenominator ? verticalTruePositive / recallDenominator : 1;
  const verticalF1 = verticalPrecision + verticalRecall
    ? (2 * verticalPrecision * verticalRecall) / (verticalPrecision + verticalRecall)
    : 0;

  return {
    fixtureCount,
    schemaValidRate: fixtureCount ? schemaValid / fixtureCount : 1,
    primaryIntentAccuracy: fixtureCount ? correctPrimary / fixtureCount : 1,
    verticalPrecision,
    verticalRecall,
    verticalF1,
    safetyFreshnessDowngrades,
    lunaEligibleRate: fixtureCount ? lunaEligible / fixtureCount : 0,
    confusionMatrix,
  };
}

module.exports = {
  evaluateIntentFixtures,
};
