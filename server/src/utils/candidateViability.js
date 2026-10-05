'use strict';

// Shared hard eligibility for every source-candidate projection. Callers may
// differ in whether support/context is packed, never in traveler constraints.
const { evaluateHardAccessEligibility, evaluateHardExposureEligibility, evaluateHardMobilityEligibility } = require('./hardConstraintEligibility');
const { runtimeMobilityField, resolveRuntimeFitness } = require('./canonicalRuntimeProjection');
const { isAvoidExposureActive } = require('./planningInputContract');
function evaluateCandidateConstraints({ records = [], name, type, constraints = null, bundle = null }) {
  const values = records.map(row => row.claim?.normalizedValue || {});
    const stop = { name: name, type: type };
    const reasons = [...evaluateHardAccessEligibility(stop, { constraints, bundle }).reasonCodes];
    if (values.some(value => value.closureStatus === 'closed' || ['unavailable', 'closed'].includes(value.availabilityStatus))) reasons.push('candidate_unavailable');
    // Missing fields in a duplicate source do not erase a confirmed fact;
    // conflicting positive facts take the more restrictive value.
    const levels = ['easy', 'moderate', 'hard', 'strenuous'];
    const exposures = ['low', 'moderate', 'high'];
    const hardest = (field, order) => values.map(v => v[field]).filter(v => order.includes(v))
      .sort((a, b) => order.indexOf(b) - order.indexOf(a))[0] || null;
    const distances = values.map(v => Number(v.walkingDistanceMiles)).filter(v => v > 0);
    const suitability = { ...stop, exposureLevel: hardest('exposureLevel', exposures),
      walkingDistanceMiles: distances.length ? Math.max(...distances) : null };
    reasons.push(...evaluateHardExposureEligibility(suitability, {
      hardConstraintActive: isAvoidExposureActive(constraints, ''),
    }).reasonCodes);
    reasons.push(...evaluateHardMobilityEligibility(suitability, {
      maxWalkMilesPerSegment: runtimeMobilityField(constraints, 'maxWalkMilesPerSegment'),
    }).reasonCodes);
    const fitness = resolveRuntimeFitness(constraints);
    const max = { beginner: 'easy', intermediate: 'moderate', advanced: 'hard', experienced: 'strenuous', expert: 'strenuous' }[fitness] || fitness;
    if (levels.includes(max) && /hike|trail|walk/.test(type)) {
      const difficulty = hardest('difficulty', levels);
      if (!difficulty) reasons.push('difficulty_eligibility_unknown');
      else if (levels.indexOf(difficulty) > levels.indexOf(max)) reasons.push('difficulty_constraint_violation');
    }

  return { ok: reasons.length === 0, reasonCodes: [...new Set(reasons)],
    status: reasons.some(code => code.includes('unknown')) ? 'unknown' : reasons.length ? 'incompatible' : 'compatible' };
}

// Downstream viability is a separate, explicit projection over the same frozen
// source facts. A local candidate is never advertised as a completed day.
function evaluateCandidateViability(args) {
  const constraints = evaluateCandidateConstraints(args);
  const grounding = require('./experienceActionability').assessExecutionGrounding(args);
  const conditional = require('./conditionalPrimary').conditionalDependency({
    name: args.name, type: args.type, evidenceRef: args.records?.[0]?.evidenceId,
  }, args.bundle, { constraints: args.constraints, userPrompt: args.userPrompt });
  const executable = grounding.standalonePrimaryEligible;
  return { ...constraints, grounding, conditional,
    structuralEligible: constraints.ok && executable && !conditional,
    downstreamStatus: 'requires_plan_projection' };
}
module.exports = { evaluateCandidateConstraints, evaluateCandidateViability };
