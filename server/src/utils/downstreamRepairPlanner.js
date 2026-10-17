'use strict';

const { evaluateItineraryCompleteness, classifyStop, SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES } = require('./itineraryCompleteness');
const { experienceRole } = require('./semanticDayValue');
const { evaluateTripExperienceQuality } = require('./tripExperienceQuality');
const dayNumber = (day, index) => Number(day.dayNumber || day.day || index + 1);

// Pure projections over frozen evidence. No enrichment, routing, or provider IO.
function projectPlan(plan, { bundle, constraints, userPrompt = '', ...context } = {}) {
  const completeness = evaluateItineraryCompleteness({ ...context, itineraryData: plan, evidenceBundle: bundle, constraints, userPrompt });
  const fit = require('./travelerFitEvaluation').evaluateTravelerFit({ itineraryData: plan, evidenceBundle: bundle, constraints, userPrompt });
  const fitDays = require('./travelerFitEvaluation').buildTravelerFitDayDiagnostics(fit).dayDiagnostics;
  const quality = evaluateTripExperienceQuality({ ...context, itineraryData: plan, bundle, constraints, userPrompt });
  const days = (plan.days || []).map((day, index) => {
    const number = dayNumber(day, index);
    const diagnostics = completeness.dayDiagnostics.filter(d => d.dayNumber === number);
    const roles = (day.stops || []).map(stop => experienceRole(stop, { bundle, classifyStop }));
    const actionability = roles.filter(r => r.reasonCode).map(r => r.reasonCode);
    const q = quality.diagnostics.days.find(d => d.dayNumber === number);
    const value = (completeness.dayValueDiagnostics || []).find(d => d.dayNumber === number) || diagnostics.find(d => d.dayValue);
    const codes = [...new Set([...diagnostics.flatMap(d => d.codes), ...actionability, ...fitDays.filter(d => d.dayNumber === number).flatMap(d => d.codes),
      ...(quality.affectedDays.includes(number) ? quality.reasonCodes.filter(code => code === 'conditional_primary_unsupported'
        ? q?.conditionalStatus === 'PRIMARY_CONDITIONAL_UNSUPPORTED' : q?.repeatedAnchors.some(r => r.relationship === 'REDUNDANT_REPEAT')) : [])])];
    return { dayNumber: number, codes, roles, qualityWeakStopIndexes: q?.weakStopIndexes || [],
      repeatedStopIndexes: (q?.repeatedAnchors || []).filter(r => r.relationship === 'REDUNDANT_REPEAT').map(r => r.stopIndex), dayValue: value?.dayValue,
      coverageReasonCode: value?.coverageReasonCode || diagnostics.find(d => d.coverageReasonCode)?.coverageReasonCode,
      conditionalStatus: q?.conditionalStatus, repeated: q?.repeatedAnchors?.some(r => r.relationship === 'REDUNDANT_REPEAT') };
  });
  return { days, reasonCodes: [...new Set([...completeness.reasonCodes, ...quality.reasonCodes, ...fit.reasonCodes, ...days.flatMap(d => d.codes)])] };
}
const scopeFailures = projection => new Set(projection.days.flatMap(d => d.codes.map(c => `${d.dayNumber}:${c}`)));
function progress(before, after, targetedDays) {
  const old = scopeFailures(before); const next = scopeFailures(after);
  return { targetedScopeResolved: targetedDays.every(n => !after.days.find(d => d.dayNumber === n)?.codes.length),
    globalFamilyStillPresent: after.days.some(d => d.codes.includes('insufficient_day_coverage')),
    newScopesDiscovered: [...next].filter(k => !old.has(k)), regressions: [...next].filter(k => !old.has(k)) };
}
function replacementStop(candidate, original, duration = original.duration) {
  return { name: candidate.canonicalName, type: candidate.canonicalType, duration,
    timeWindow: original.timeWindow || '', evidenceRef: candidate.evidenceIds?.[0],
    ...(candidate.entityId ? { evidenceEntityId: candidate.entityId } : {}), alternatives: [] };
}
function candidatePool({ plan, targets, candidates, context, focusedRepairBudgetRemaining = 1, coverageAvailable = false, identity = false, simulateReplacement = null, followupPossible = null, viabilityAvailable = coverageAvailable }) {
  const before = projectPlan(plan, context); const baseline = scopeFailures(before);
  const byScope = targets.map(target => {
    const dayIndex = plan.days.findIndex((d,i) => dayNumber(d,i) === target.dayNumber);
    const original = plan.days[dayIndex].stops[target.stopIndex] || {};
    const options = candidates.map(candidate => {
      // Identity substitution preserves the slot; evidence caps meaningful credit downstream.
      const duration = identity ? original.duration : candidate.maxDurationMinutes || Math.max(Number(original.duration) || 0, SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES);
      const stop = replacementStop(candidate, original, duration);
      const access = candidate.accessEligibility ? require('./hardConstraintEligibility').evaluateHardAccessEligibility(stop, candidate.accessEligibility) : { reasonCodes: [] };
      const simulation = simulateReplacement ? simulateReplacement({ target, candidate, duration }) : null;
      const proposed = { ...plan, days: plan.days.map((d,i) => i !== dayIndex ? d : { ...d,
        stops: target.operation === 'add_stop' ? [...d.stops, stop] : d.stops.map((s,j) => j === target.stopIndex ? stop : s) }) };
      const projected = projectPlan(simulation?.ok ? simulation.plan : proposed, context);
      const affected = projected.days.find(d => d.dayNumber === target.dayNumber);
      const introduced = [...scopeFailures(projected)].filter(k => !baseline.has(k));
      const identityValid = Boolean(candidate.canonicalName && candidate.canonicalType && candidate.evidenceIds?.some(id => context?.bundle?.evidence?.some(row => row.evidenceId === id)));
      const executionScopeValid = !affected.roles[target.operation === 'add_stop' ? affected.roles.length - 1 : target.stopIndex]?.reasonCode;
      const followup = affected.codes.length > 0 || introduced.length > 0;
      const coverageOnly = [...affected.codes, ...introduced.map(k => k.split(':').slice(1).join(':'))].every(c => require('./repairOperators').STRUCTURAL_REASONS.has(c));
      const constraintEligible = !access.reasonCodes.length && !affected.codes.some(c => ['traveler_fit_incompatible','unverified_access_dependency'].includes(c));
      let repairViability = simulation?.ok === false || !constraintEligible || !identityValid || access.reasonCodes.length || !executionScopeValid ? 'INELIGIBLE'
        : !followup ? 'SELF_SUFFICIENT'
          : identity && coverageOnly && viabilityAvailable && focusedRepairBudgetRemaining > 1 ? 'REQUIRES_FOLLOWUP_FAMILY' : 'INELIGIBLE';
      const remainingStructural = projected.reasonCodes.some(c => require('./repairOperators').STRUCTURAL_REASONS.has(c));
      const needsFollowup = identity && remainingStructural;
      let followupUniverse = null;
      if (identity && repairViability !== 'INELIGIBLE' && needsFollowup && followupPossible) {
        followupUniverse = viabilityAvailable && focusedRepairBudgetRemaining > 1
          ? followupPossible(simulation?.ok ? simulation.plan : proposed, projected) : { ok: false };
        if (!followupUniverse.ok) repairViability = 'INELIGIBLE';
      }
      return { candidateRef: candidate.ref, projectedDurationMinutes: duration, identityValid, constraintEligible, executionScopeValid,
        projectedDayValue: affected.dayValue?.meaningfulMinutes ?? null, projectedCoverageStatus: affected.coverageReasonCode || (affected.codes.length ? 'failed' : 'valid'),
        projectedRepetitionStatus: affected.repeated ? 'repeated' : 'distinct', conditionalStatus: affected.conditionalStatus,
        repairViability, ...(needsFollowup && repairViability !== 'INELIGIBLE' ? { expectedFollowupOperator: 'PLAN_VIABILITY_EDIT', expectedFollowupFamily: 'coverage' } : {}),
        ...(followupUniverse ? { followupUniverseAvailable: followupUniverse.ok } : {}) };
    });
    const self = options.some(o => o.repairViability === 'SELF_SUFFICIENT');
    return { ...target, options, eligibleCandidateRefs: options.filter(o => o.repairViability === (self ? 'SELF_SUFFICIENT' : 'REQUIRES_FOLLOWUP_FAMILY')).map(o => o.candidateRef) };
  });
  return { byScope, focusedRepairBudgetRemaining, ok: byScope.every(s => s.eligibleCandidateRefs.length),
    candidates: candidates.filter(c => byScope.some(s => s.eligibleCandidateRefs.includes(c.ref))) };
}
function selectionAllowed(pool, day, index, ref) {
  return pool.byScope.find(s => s.dayNumber === day && s.stopIndex === index)?.eligibleCandidateRefs.includes(ref) === true;
}
const VIABILITY_FIELDS = ['candidateRef','projectedDurationMinutes','projectedDayValue','projectedCoverageStatus','projectedRepetitionStatus','conditionalStatus','repairViability'];
function compactScopes(pool) {
  return pool.byScope.map(({options, ...scope}) => ({ ...scope,
    projections: options.filter(o => scope.eligibleCandidateRefs.includes(o.candidateRef)).map(o => VIABILITY_FIELDS.map(k => o[k] ?? null)) }));
}
module.exports = { compactScopes, VIABILITY_FIELDS, projectPlan, candidatePool, progress, replacementStop, selectionAllowed, dayNumber };
