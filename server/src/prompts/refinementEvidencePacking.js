'use strict';

// Scoped replacement packing for an accepted itinerary edit.
// Reuses source-duration, actionability, and constraint primitives.
// It does not replace full-plan primary packing.

const { countPromptTokens, truncatePromptTokens } = require('../utils/promptTokenAccounting');
const { buildEvidenceBoundRepairCandidates } = require('../utils/evidenceBoundRepairCandidates');
const { assessCandidateActionability } = require('../utils/experienceActionability');
const { entityEvidenceProvenance } = require('../utils/entityEvidenceProvenance');
const { resolveRefinementScope } = require('../utils/refinementScope');
const { VALUE_CLASS, travelerValueClass } = require('../utils/travelerValueClass');
const { conditionalDependency } = require('../utils/conditionalPrimary');
const {
  projectCandidateCrossDayViability,
  candidateAsStop,
} = require('../utils/refinementCrossDayCandidateViability');

const clean = (value) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (value, tokens) => truncatePromptTokens(clean(value), tokens).text;

function recordsFor(bundle, evidenceIds) {
  const wanted = new Set(evidenceIds || []);
  return (bundle?.evidence || []).filter((row) => wanted.has(row.evidenceId));
}

function isSupportRecord(row) {
  const value = row?.claim?.normalizedValue || {};
  return row?.topic === 'visitor_services'
    || [VALUE_CLASS.SUPPORTING_EXPERIENCE, VALUE_CLASS.LOGISTICS, VALUE_CLASS.REST].includes(travelerValueClass(value))
    || /visitor center|orientation|picnic|campground|lodging/i.test(`${value.category || ''} ${value.type || ''} ${value.name || ''}`);
}

function withConditionalProjection(item, bundle, constraints, userRequest) {
  const action = { ...item.action };
  const projectedConditional = conditionalDependency({
    name: action.canonicalEntity || item.candidate.canonicalName,
    evidenceRef: item.candidate.evidenceIds?.[0],
    type: item.candidate.canonicalType,
  }, bundle, { constraints, userPrompt: userRequest });
  action.conditionalStatus = projectedConditional ? 'conditional_unsupported' : 'confirmed';
  action.projectedConditionalPrimary = projectedConditional;
  // SELF_SUFFICIENT cannot already project a deterministic conditional primary blocker.
  if (projectedConditional) action.satisfyingReplacement = false;
  return { ...item, action };
}

function withCrossDayProjection(item, plan, targetDayNumbers) {
  const crossDay = projectCandidateCrossDayViability({
    plan,
    targetDayNumbers,
    candidateStop: candidateAsStop(item),
  });
  const action = { ...item.action };
  action.crossDay = crossDay;
  action.crossDayRepetitionStatus = crossDay.crossDayRepetitionStatus;
  action.revisitClassification = crossDay.revisitClassification;
  action.conflictingDayNumbers = crossDay.conflictingDayNumbers;
  action.conflictingExperienceIdentity = crossDay.conflictingExperienceIdentity;
  action.structuralSelectable = action.structuralSelectable !== false && crossDay.structuralSelectable
    && action.conditionalStatus !== 'conditional_unsupported';
  // LOCAL + CROSS-DAY validity = refinement self-sufficiency.
  if (!crossDay.selfSufficient) action.satisfyingReplacement = false;
  return { ...item, action, crossDay };
}

function candidateUniverse({ bundle, plan, constraints, userRequest = '', targetDayNumbers = [] }) {
  const catalog = buildEvidenceBoundRepairCandidates({
    bundle, candidatePlan: plan, constraints, includeExisting: true, requireExperiential: false, limit: 80,
  });
  const seen = new Set();
  const items = [];
  const supportExtra = [];
  for (const candidate of catalog.candidates || []) {
    if (seen.has(candidate.placeKey)) continue;
    seen.add(candidate.placeKey);
    const records = recordsFor(bundle, candidate.evidenceIds);
    const action = assessCandidateActionability({
      records, name: candidate.canonicalName, constraints,
    });
    const viability = require('../utils/candidateViability').evaluateCandidateViability({
      records, name: candidate.canonicalName, type: candidate.canonicalType, constraints, bundle, userPrompt: userRequest,
    });
    action.structuralSelectable = viability.structuralEligible;
    action.downstreamStatus = viability.downstreamStatus;
    let item = withConditionalProjection({ candidate, records, action }, bundle, constraints, userRequest);
    item = withCrossDayProjection(item, plan, targetDayNumbers);
    // Conditional primaries stay readable as support context, not as structural R*.
    if (item.action.projectedConditionalPrimary) {
      const row = records[0];
      if (row) supportExtra.push(row);
      continue;
    }
    // Frozen-day redundant duplicates are not structural replacements.
    if (item.crossDay?.crossDayConflict) {
      const row = records[0];
      if (row) supportExtra.push(row);
      continue;
    }
    // Use the repair planner's exact day/fit/trip projection, not a second
    // local definition of self-sufficiency. Whole-day composition is explicit.
    const targets = (plan?.days || []).flatMap((day, index) => {
      const n = Number(day.dayNumber || index + 1);
      return targetDayNumbers.includes(n) ? (day.stops || []).map((_, stopIndex) => ({ dayNumber: n, stopIndex })) : [];
    });
    if (targets.length) {
      const pool = require('../utils/downstreamRepairPlanner').candidatePool({
        plan, targets, candidates: [candidate],
        context: { bundle, constraints, userPrompt: userRequest, isRefinement: true, priorItineraryData: plan, touchedDayNumbers: targetDayNumbers },
      });
      const complete = pool.byScope.some(scope => scope.options.some(option => option.repairViability === 'SELF_SUFFICIENT'));
      item.action.satisfyingReplacement = complete && item.action.satisfyingReplacement;
      item.action.downstreamStatus = complete ? 'self_sufficient' : 'requires_plan_composition';
    } else item.action.satisfyingReplacement = false;
    items.push(item);
  }
  // Places the experiential catalogue omitted can still be support context.
  const support = [
    ...(bundle?.evidence || []).filter((row) => isSupportRecord(row) && !entityEvidenceProvenance(row).evidenceDocumentTitle),
    ...supportExtra,
  ];
  return { items, support };
}

function replacementRank(item) {
  const value = item.records?.[0]?.claim?.normalizedValue || {};
  const primary = travelerValueClass(value) === VALUE_CLASS.PRIMARY_EXPERIENCE ? 1 : 0;
  return (item.action.substantial ? 4 : 0) + (item.action.sourceDurationBacked ? 2 : 0) + primary;
}

function offeredForScope(items, constraintsActive) {
  const selectable = items.filter((item) => item.action.structuralSelectable !== false);
  const standalone = selectable.filter((item) => item.action.standalonePrimaryEligible && item.action.constraintStatus !== 'incompatible');
  const compatible = standalone.filter((item) => item.action.constraintStatus === 'compatible' || item.action.constraintStatus === 'not_applicable');
  const unknown = standalone.filter((item) => item.action.constraintStatus === 'unknown');
  if (!constraintsActive) return standalone;
  return compatible.length ? compatible : unknown;
}

function card(item, id, compact) {
  const action = item.action;
  const duration = action.sourceDurationBacked ? `Source duration: ${action.sourceDuration} minutes` : 'Source duration: unknown';
  const binding = action.routeActivityBinding
    ? `Execution: ${action.routeActivityBinding.action} — ${clip(action.routeActivityBinding.scope, compact ? 12 : 24)}`
    : `Execution: ${action.executionScope ? clip(action.executionScope, compact ? 12 : 24) : 'none'}`;
  const exposure = action.constraintStatus === 'unknown'
    ? 'Exposure suitability: unresolved. Not confirmed compatible.'
    : `Constraint eligibility: ${action.constraintStatus}`;
  return [`[REPLACEMENT ${id}] ${action.canonicalEntity}`,
    `Source category: ${action.sourceSemanticCategory}`,
    duration,
    binding,
    exposure,
    `Conditional status: ${action.conditionalStatus || 'confirmed'}`,
    `Standalone primary: ${action.standalonePrimaryEligible ? 'yes' : 'no'}`,
    `Self-sufficient: ${action.satisfyingReplacement ? 'yes' : 'no'}`,
    `Downstream viability: ${action.downstreamStatus || 'requires_plan_projection'}`].join('\n');
}

function scopeRows(scope, items, constraintsActive) {
  const days = scope?.dayNumbers || (scope?.dayNumber ? [scope.dayNumber] : []);
  return days.map((dayNumber) => {
    const indexes = scope?.affectedStopIndexes?.[dayNumber] || [];
    const offered = offeredForScope(items, constraintsActive).slice().sort((a, b) => replacementRank(b) - replacementRank(a));
    const eligibleSubstantial = offered.filter((item) => item.action.substantial);
    const eligibleSelf = offered.filter((item) => item.action.satisfyingReplacement);
    const backed = offered.filter((item) => item.action.sourceDurationBacked);
    return {
      affectedDay: dayNumber,
      affectedStopIndexes: indexes,
      offered,
      eligibleReplacementCount: offered.length,
      eligibleSelfSufficientCount: eligibleSelf.length,
      eligibleSubstantialCount: eligibleSubstantial.length,
      supportCount: 0,
      sourceDurationBackedCount: backed.length,
    };
  });
}

function crossDayNames(plan, scope) {
  const affected = new Set(scope?.dayNumbers || []);
  const frozen = new Set(scope?.frozenSiblingStopIds || []);
  const names = [];
  for (const [index, day] of (plan?.days || []).entries()) {
    const dayNumber = Number(day.dayNumber || day.day || index + 1);
    for (const stop of day.stops || []) {
      const id = stop.id || stop.stopId;
      if (!affected.has(dayNumber) || frozen.has(id)) names.push(stop.canonicalPlaceName || stop.name);
    }
  }
  return [...new Set(names.filter(Boolean))];
}

function attempt({ rows, items, support, limit, compact, supportFirst, constraintsActive, plan, scope, userRequest }) {
  const blocks = [];
  const packedIds = new Map();
  let seq = 1;
  const idFor = (item) => {
    if (packedIds.has(item.candidate.placeKey)) return packedIds.get(item.candidate.placeKey);
    const id = `R${seq}`;
    seq += 1;
    packedIds.set(item.candidate.placeKey, id);
    return id;
  };
  const fits = (block) => countPromptTokens([...blocks, block].join('\n\n')) <= limit;
  const header = [`REFINEMENT REPLACEMENTS`,
    `Traveler constraint: ${clean(userRequest)}`,
    `Confirmed stops already used: ${crossDayNames(plan, scope).join('; ') || 'none'}`,
    constraintsActive ? 'Do not treat unresolved exposure as compatible when a confirmed-compatible choice is listed.' : '']
    .filter(Boolean).join('\n');
  blocks.push(header);
  const pending = rows.map((row) => [...row.offered]);
  const packedByRow = rows.map(() => []);
  const pushItem = (rowIndex, item) => {
    const id = idFor(item);
    const text = card(item, id, compact);
    const already = blocks.some((block) => block.startsWith(`[REPLACEMENT ${id}]`));
    if (!already && !fits(text)) return false;
    if (!already) blocks.push(text);
    if (!packedByRow[rowIndex].includes(item)) packedByRow[rowIndex].push(item);
    return true;
  };
  if (!supportFirst) {
    let progressed = true;
    while (progressed) {
      progressed = false;
      pending.forEach((queue, rowIndex) => {
        const self = queue.findIndex((item) => item.action.satisfyingReplacement);
        const next = self >= 0 ? queue.splice(self, 1)[0] : queue.shift();
        if (!next) return;
        if (pushItem(rowIndex, next)) progressed = true;
        else pending[rowIndex] = [];
      });
      if (pending.every((queue) => queue.length === 0)) break;
      if (!progressed) break;
    }
  }
  const supportPacked = [];
  const alreadyReplaced = new Set(packedByRow.flat().map((item) => clean(item.action.canonicalEntity).toLowerCase()));
  if (supportFirst || countPromptTokens(blocks.join('\n\n')) < limit) {
    for (const row of support) {
      const name = clean(row.claim?.normalizedValue?.name || row.topic);
      if (alreadyReplaced.has(name.toLowerCase())) continue;
      const text = `[SUPPORT] ${clip(name, compact ? 8 : 16)}`;
      if (!fits(text)) break;
      blocks.push(text);
      supportPacked.push(row);
    }
  }
  if (supportFirst) {
    pending.forEach((queue, rowIndex) => {
      while (queue.length) {
        const item = queue[0];
        if (!pushItem(rowIndex, item)) { pending[rowIndex] = []; break; }
        queue.shift();
      }
    });
  }
  const diagnostics = rows.map((row, index) => {
    const packed = packedByRow[index];
    return {
      affectedDay: row.affectedDay,
      affectedStopIndexes: row.affectedStopIndexes,
      eligibleReplacementCount: row.eligibleReplacementCount,
      eligibleSelfSufficientCount: row.eligibleSelfSufficientCount,
      packedReplacementCount: packed.length,
      packedSelfSufficientCount: packed.filter((item) => item.action.satisfyingReplacement).length,
      eligibleSubstantialCount: row.eligibleSubstantialCount,
      packedSubstantialCount: packed.filter((item) => item.action.substantial).length,
      supportCount: support.length,
      packedSupportCount: supportPacked.length,
      sourceDurationBackedCount: row.sourceDurationBackedCount,
      packedSourceDurationBackedCount: packed.filter((item) => item.action.sourceDurationBacked).length,
      candidateIds: packed.map((item) => packedIds.get(item.candidate.placeKey)),
    };
  });
  const scopeBlock = diagnostics.map((row) => `Day ${row.affectedDay} stops ${row.affectedStopIndexes.join(',') || '-'}: candidates ${row.candidateIds.join(', ') || 'none'}`).join('\n');
  if (fits(scopeBlock)) blocks.push(scopeBlock);
  return { text: blocks.join('\n\n'), diagnostics, packedIds };
}

function starved(diagnostics) {
  return diagnostics.some((row) => row.eligibleSelfSufficientCount > 0 && row.packedSelfSufficientCount === 0);
}

function supportCrowds(diagnostics) {
  return diagnostics.some((row) => row.eligibleSelfSufficientCount > row.packedSelfSufficientCount
    && row.packedSupportCount > row.packedSelfSufficientCount);
}

function packRefinementEvidence({
  bundle, plan, constraints, userRequest = '', limit = 1400,
} = {}) {
  const scope = resolveRefinementScope({ text: userRequest, priorPlan: plan });
  const constraintsActive = require('../utils/planningInputContract').isAvoidExposureActive(constraints, userRequest);
  const days = scope.dayNumbers || (scope.dayNumber ? [scope.dayNumber] : []);
  const universe = candidateUniverse({
    bundle, plan, constraints, userRequest, targetDayNumbers: days,
  });
  const rows = days.length ? scopeRows({ ...scope, dayNumbers: days }, universe.items, constraintsActive) : [];
  rows.forEach((row) => { row.supportCount = universe.support.length; });
  const run = (options) => attempt({
    rows, items: universe.items, support: universe.support, limit, constraintsActive, plan, scope, userRequest, ...options,
  });
  const probe = run({ compact: false, supportFirst: true });
  let repackOccurred = false;
  let result = probe;
  if (starved(probe.diagnostics) || supportCrowds(probe.diagnostics)) {
    result = run({ compact: true, supportFirst: false });
    repackOccurred = true;
  } else if (probe.diagnostics.some((row) => row.eligibleSelfSufficientCount > 0)) {
    result = run({ compact: false, supportFirst: false });
  }
  const warnings = starved(result.diagnostics) ? ['refinement_evidence_starvation'] : [];
  const structuralCandidates = [...result.packedIds.entries()].map(([placeKey, registryId], index) => {
    const item = universe.items.find((row) => row.candidate.placeKey === placeKey);
    if (!item) return null;
    const crossDay = item.crossDay || item.action.crossDay || null;
    return {
      ref: index + 1,
      registryId,
      placeKey,
      canonicalName: item.candidate.canonicalName,
      canonicalType: item.candidate.canonicalType,
      evidenceIds: item.candidate.evidenceIds,
      entityId: item.candidate.entityId ?? null,
      coordinates: item.candidate.coordinates ?? null,
      maxDurationMinutes: item.candidate.maxDurationMinutes ?? null,
      selfSufficient: item.action.satisfyingReplacement === true,
      conditionalStatus: item.action.conditionalStatus || 'confirmed',
      standalonePrimaryEligible: item.action.standalonePrimaryEligible === true,
      constraintStatus: item.action.constraintStatus,
      executionScope: item.action.executionScope || null,
      accessEligibility: item.candidate.accessEligibility || null,
      structuralSelectable: item.action.structuralSelectable !== false,
      crossDayConflict: Boolean(crossDay?.crossDayConflict),
      crossDayRepetitionStatus: crossDay?.crossDayRepetitionStatus || 'clear',
      revisitClassification: crossDay?.revisitClassification || null,
      conflictingDayNumbers: crossDay?.conflictingDayNumbers || [],
      conflictingExperienceIdentity: crossDay?.conflictingExperienceIdentity || null,
    };
  }).filter(Boolean);
  const refinementPacking = {
    scopes: result.diagnostics,
    repackOccurred,
    packingWarnings: warnings,
    tokenEstimate: countPromptTokens(result.text),
    affectedDays: days,
    affectedStopIndexes: scope.affectedStopIndexes || {},
    frozenSiblingStopIndexes: scope.frozenSiblingStopIndexes || {},
    structuralCandidateCount: structuralCandidates.length,
    structuralSelfSufficientCount: structuralCandidates.filter((c) => c.selfSufficient).length,
  };
  if (warnings.length) {
    const error = new Error('Refinement evidence cannot offer a grounded replacement');
    error.code = 'refinement_evidence_starvation';
    error.packingTelemetry = refinementPacking;
    throw error;
  }
  return {
    text: result.text,
    tokens: refinementPacking.tokenEstimate,
    refinementPacking,
    structuralCandidates,
    includedEvidenceIds: [...result.packedIds.keys()],
    omittedEvidenceIds: [],
  };
}

module.exports = { packRefinementEvidence, starved, supportCrowds };
