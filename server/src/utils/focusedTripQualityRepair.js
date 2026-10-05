'use strict';

const PURPOSE = 'trip_quality_repair';
const TOOL = { name: 'replace_weak_experiences', description: 'Replace only flagged weak experiences with a meaningful distinct grounded experience. Preserve all other stops and days.',
  input_schema: { type: 'object', additionalProperties: false, required: ['replacements'], properties: { replacements: {
    type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['dayNumber', 'stopIndex', 'placeRef', 'durationMinutes', 'note', 'why'], properties: {
        dayNumber: { type: 'integer' }, stopIndex: { type: 'integer' }, placeRef: { type: 'integer' },
        durationMinutes: { type: 'integer' }, note: { type: 'string' }, why: { type: 'string' },
      } },
  } } } };
TOOL.input_schema.properties.dependentCopyUpdates = { type: ['array','null'], items: {type:'object',additionalProperties:false,required:['dayNumber','stopIndex','contextHash','dependsOn','why','note','label','summary'],properties:{dayNumber:{type:'integer'},stopIndex:{type:['integer','null']},contextHash:{type:'string'},dependsOn:{type:['array','null'],items:{type:'object',additionalProperties:false,required:['stopId','experienceType'],properties:{stopId:{type:'string'},experienceType:{type:'string'}}}},why:{type:['string','null']},note:{type:['string','null']},label:{type:['string','null']},summary:{type:['string','null']}}} };
function applyQualityReplacements(plan, quality, replacements, dependentCopyUpdates = [], bundle = null) {
  const fail = reason => ({ ok: false, reasonCodes: [reason] });
  if (!Array.isArray(replacements) || !replacements.length) return fail('quality_repair_malformed');
  const targets = new Set();const places = new Set();
  const changedDays = new Set();
  const next = JSON.parse(JSON.stringify(plan));
  for (const op of replacements) {
    if (!op || Object.keys(op).some(k => !['dayNumber','stopIndex','placeRef','durationMinutes','note','why'].includes(k))) return fail('quality_repair_malformed');
    const diag = quality.diagnostics.days.find(d => d.dayNumber === op.dayNumber);
    const day = next.days.find((d,i) => Number(d.dayNumber || d.day || i+1) === op.dayNumber);
    const place = quality.candidates.find(c => c.ref === op.placeRef);
    if (!quality.affectedDays.includes(op.dayNumber) || !diag?.weakStopIndexes.includes(op.stopIndex)) return fail('quality_repair_frozen_scope');
    if (!place || (!quality.repairPool && places.has(place.placeKey))) return fail('quality_repair_unknown_or_repeated_candidate');
    if (!Number.isInteger(op.durationMinutes) || op.durationMinutes <= 0 || op.durationMinutes > (place.maxDurationMinutes || 720)
      || typeof op.note !== 'string' || typeof op.why !== 'string') return fail('quality_repair_malformed');
    if (quality.repairPool && (!require('./downstreamRepairPlanner').selectionAllowed(quality.repairPool, op.dayNumber, op.stopIndex, op.placeRef)
      || changedDays.has(op.dayNumber))) return fail('repair_candidate_not_viable');
    changedDays.add(op.dayNumber);
    const target = `${op.dayNumber}:${op.stopIndex}`;
    if (!day?.stops?.[op.stopIndex] || targets.has(target)) return fail('quality_repair_malformed');
    targets.add(target);places.add(place.placeKey);
    const old = day.stops[op.stopIndex];
    // Carry only structure from the removed stop; never inherit its facts,
    // alternatives, identity, or safety claims into the new experience.
    day.stops[op.stopIndex] = { id: old.id, order: old.order, timeWindow: old.timeWindow,
      name: place.canonicalName, type: place.canonicalType, evidenceRef: place.evidenceIds[0],
      ...(place.entityId ? { evidenceEntityId: place.entityId } : {}),
      duration: op.durationMinutes, note: op.note, why: op.why };
  }
  const copy = require('./repairCopyDependencies').reconcileRepairDayCopy({priorPlan:plan,plan:next,affectedDays:quality.affectedDays,updates:dependentCopyUpdates || [],bundle});
  if(!copy.ok)return copy;
  if (quality.repairPool) {
    const planner = require('./downstreamRepairPlanner');
    const before = planner.projectPlan(plan, quality.projectionContext);
    const after = planner.projectPlan(copy.plan, quality.projectionContext);
    if (after.days.some(d => quality.affectedDays.includes(d.dayNumber) && d.codes.length)
      || planner.progress(before, after, quality.affectedDays).regressions.length) return fail('repair_projected_validation_failed');
  }
  return { ok: true, plan: copy.plan, applied: replacements.length, copyDiagnostics:copy.diagnostics };
}
async function dispatchTripQualityRepair({ validation, route, attempt, signal, dispatchIndex,
  createRequest, executeResponses, responseAdapters, priceCall, liveBudget, now, bundle, constraints, repairPlanning, purpose = PURPOSE }) {
  let quality = validation.tripQuality;
  const row = { kind: purpose, action: purpose, purpose, attempt, dispatchIndex,
    affectedDays: quality?.affectedDays || [], repairCandidateCount: quality?.candidates?.length || 0,
    dispatched: false, mergeStatus: 'catalog_declined', reasonCodes: [] };
  if (!quality?.candidates.length || !quality.frozenDayNumbers.length || route.model !== 'gpt-6-sol') return row;
  if (repairPlanning) {
    const repairPool = require('./downstreamRepairPlanner').candidatePool({ plan: validation.candidatePlan,
      targets: quality.diagnostics.days.filter(d => quality.affectedDays.includes(d.dayNumber))
        .flatMap(d => d.weakStopIndexes.map(stopIndex => ({ dayNumber: d.dayNumber, stopIndex }))),
      candidates: quality.candidates, context: repairPlanning.context, ...repairPlanning });
    // A day needs one viable local target, not a replacement for every weak sibling.
    if (quality.affectedDays.some(n => !repairPool.byScope.some(s => s.dayNumber === n && s.eligibleCandidateRefs.length)))
      return { ...row, reasonCodes: ['repair_no_viable_candidate'], candidateViability: repairPool.byScope };
    quality = { ...quality, repairPool, projectionContext: repairPlanning.context, candidates: repairPool.candidates };
    row.candidateViability = repairPool.byScope;
  }
  const compact = require('./compactRepairContext').compactRepairContext({quality,plan:validation.candidatePlan,bundle,constraints});
  const scope = compact.context.scope;
  Object.assign(row,compact.telemetry);
  const request = createRequest({ provider: route.provider, model: route.model,
    instructions: (purpose === 'insufficient_day_coverage_repair'
      ? 'Replace the flagged non-actionable or support-only experience with one meaningful concrete grounded experience. Use only supplied candidates. Prefer one strong replacement over supporting stops, visitor services, logistics or repeated facilities. All other stops and days are frozen.'
      : 'Improve the repeated or conditional days by choosing the most meaningful distinct grounded experience for the traveler where one exists. One strong change is preferable to filler. Replace only flagged stop indexes. Valid days and all other stops are frozen. Never regenerate the trip.') + ' Use per-scope eligibleCandidateRefs exclusively. At most one structural replacement per affected day. Omit a day only if the combined replacements make it deterministically valid. Choose combinations that preserve distinct experience credit under repetition rules. Reconcile sibling note/why and day label/summary on affected days against the replacements in this same response. Use dependentCopyUpdates with the supplied contextHash and dependsOn IDs/types of the resulting stops (replacement type comes from its candidate card); null means no update. Copy updates cannot alter identity, order, duration, time or frozen days. Omitted dependent copy is removed. Describe only the bound entity/facets; prose cannot create extra activities.',
    requestMetadata: { purpose }, input: [{ role: 'user', content: JSON.stringify(compact.context) }], maxOutputTokens: Math.max(640, scope.length * 420), tools: [TOOL], toolChoice: { type: 'tool', name: TOOL.name } });
  row.repairPromptTokens += require('./promptTokenAccounting').countPromptTokens(JSON.stringify(TOOL) + request.instructions);
  row.nonCandidateContextTokens += require('./promptTokenAccounting').countPromptTokens(JSON.stringify(TOOL) + request.instructions);
  if (liveBudget) {
    const verdict = liveBudget.authorize({ provider: route.provider, model: route.model });
    if (!verdict?.ok) return { ...row, mergeStatus: 'budget_refused', reasonCodes: ['budget_refused'] };
    row.budgetTicket = verdict.ticket;
  }
  const start = Date.now();let result;
  try { row.dispatched = true; result = await executeResponses(request, { adapters: responseAdapters, signal }); }
  catch (error) { return { ...row, mergeStatus: 'dispatch_failed', reasonCodes: ['quality_repair_provider_failed'],
    ...require('./qualificationDispatchPolicy').harnessBlockTelemetry(error), dispatchMs: Date.now()-start }; }
  const priced = priceCall({ provider: route.provider, model: route.model, usage: result?.usage, at: now() });
  Object.assign(row, { dispatchMs: Date.now()-start, costUsd: priced?.costUsd ?? null,
    costStatus: priced?.costStatus ?? 'unpriced', costComponents: priced?.components || null,
    cacheWriteTokens: result?.usage?.cacheCreationInputTokens ?? result?.usage?.cacheWriteTokens ?? result?.usage?.input_tokens_details?.cache_write_tokens ?? 0,
    inputTokens: result?.usage?.inputTokens ?? null, outputTokens: result?.usage?.outputTokens ?? null });
  if (liveBudget && row.budgetTicket) liveBudget.record({ ticket: row.budgetTicket, costUsd: row.costUsd, costStatus: row.costStatus });
  let replacements;let dependentCopyUpdates;
  try {
    if (result?.completionStatus === 'incomplete' || result?.toolCalls?.length !== 1) throw new Error('invalid');
    const call = result.toolCalls[0];if (call.name !== TOOL.name) throw new Error('invalid');
    const raw = call.input ?? call.arguments;const payload=typeof raw === 'string' ? JSON.parse(raw) : raw;
    replacements=payload?.replacements;dependentCopyUpdates=payload?.dependentCopyUpdates;
  } catch (_) { return { ...row, mergeStatus: 'artifact_malformed', reasonCodes: ['quality_repair_malformed'] }; }
  const merged = applyQualityReplacements(validation.candidatePlan, quality, replacements, dependentCopyUpdates, bundle);
  return { ...row, mergeStatus: merged.ok ? 'applied' : 'merge_refused', reasonCodes: merged.reasonCodes || [],
    copyReconciled: merged.ok, copyDiagnostics:merged.copyDiagnostics, acceptedOperationCount: merged.applied || 0, frozenDayMutationCount: 0, plan: merged.plan };
}
module.exports = { PURPOSE, TOOL, applyQualityReplacements, dispatchTripQualityRepair };
