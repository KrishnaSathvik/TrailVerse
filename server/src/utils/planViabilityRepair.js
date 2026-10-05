'use strict';

const { OPERATORS, STRUCTURAL_REASONS } = require('./repairOperators');
const { projectPlan, candidatePool, replacementStop, dayNumber } = require('./downstreamRepairPlanner');
const { buildEvidenceBoundRepairCandidates } = require('./evidenceBoundRepairCandidates');
const { MAX_STOP_DURATION_MINUTES } = require('./dayContainedCoverageRepair');
const { reconcileRepairDayCopy } = require('./repairCopyDependencies');
const { compactRepairContext } = require('./compactRepairContext');
const { countPromptTokens } = require('./promptTokenAccounting');
const PURPOSE = 'plan_viability_repair';
const TOOL = { name: 'repair_plan_viability', description: 'Resolve all listed structural blockers in one bounded transaction. Unrelated stops and valid days stay frozen.',
  input_schema: { type: 'object', additionalProperties: false, required: ['operations'], properties: {
    operations: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['op','dayNumber','stopIndex','placeRef','durationMinutes','note','why'], properties: {
        op: { type: 'string', enum: ['replace_stop','add_stop','deepen_stop','remove_stop'] },
        dayNumber: { type: 'integer' }, stopIndex: { type: 'integer' },
        placeRef: { type: ['integer','null'] }, durationMinutes: { type: ['integer','null'] },
        note: { type: ['string','null'] }, why: { type: ['string','null'] },
      } } },
    dependentCopyUpdates: require('./focusedTripQualityRepair').TOOL.input_schema.properties.dependentCopyUpdates,
  } } };

function structuralScopes(plan, context, projection = projectPlan(plan, context)) {
  return projection.days.flatMap(d => {
    const reasons = d.codes.filter(c => STRUCTURAL_REASONS.has(c));
    if (!reasons.length || context.touchedDayNumbers && !context.touchedDayNumbers.includes(d.dayNumber)) return [];
    const day = plan.days.find((day,i) => dayNumber(day,i) === d.dayNumber);
    const coverage = reasons.some(c => ['insufficient_day_coverage','missing_experience_anchor','experience_scope_unbound','experience_not_actionable'].includes(c));
    const duplicate = reasons.includes('duplicate_base_experience');
    const weak = new Set(d.qualityWeakStopIndexes);
    d.roles.forEach((role,i) => {
      if (role.reasonCode || coverage && role.role !== 'logistics' && (!d.dayValue?.ok || role.role !== 'primary_experience')) weak.add(i);
      // Cross-day duplicates: experiential stops on the touched day are the
      // replace/remove surface. Frozen days stay out of scope.
      if (duplicate && role.role !== 'logistics') weak.add(i);
    });
    const targets = [...weak].filter(i => day.stops?.[i]).map(stopIndex => ({ dayNumber: d.dayNumber, stopIndex, operation: 'replace_stop' }));
    // Adding an independently grounded primary can restore coverage or robustness
    // without rewriting any existing primary. Removal is only legal for repeats.
    if (coverage || reasons.includes('conditional_primary_unsupported') || duplicate) {
      targets.push({ dayNumber: d.dayNumber, stopIndex: -1, operation: 'add_stop' });
    }
    for (const stopIndex of weak) if (day.stops?.[stopIndex]) {
      targets.push({ dayNumber:d.dayNumber, stopIndex, operation:'deepen_stop' });
      if (d.repeatedStopIndexes.includes(stopIndex) || d.dayValue?.roles?.[stopIndex]?.repeated || duplicate)
        targets.push({ dayNumber:d.dayNumber, stopIndex, operation:'remove_stop' });
    }
    return targets.length ? [{ dayNumber:d.dayNumber, reasons, coverageReasonCode:d.coverageReasonCode,
      weakStopIndexes:[...weak], targets }] : [];
  });
}

// Shared by candidate projection and transaction application: one source of
// truth for the legal structural mechanics, before semantic validation.
function shapeOperation(plan, scope, operation, candidates) {
  const fail = code => ({ ok:false, reasonCodes:[code] });
  const target = scope.targets.find(t => t.stopIndex === operation.stopIndex && t.operation === operation.op);
  if (!target) return fail('viability_frozen_scope');
  const index = plan.days.findIndex((d,i) => dayNumber(d,i) === scope.dayNumber);
  const day = plan.days[index]; const original = day.stops?.[operation.stopIndex] || {};
  const nextStops = [...(day.stops || [])];
  if (operation.op === 'remove_stop') nextStops.splice(operation.stopIndex,1);
  else {
    const candidate = candidates.find(c => c.ref === operation.placeRef);
    if (!candidate) return fail('viability_unknown_candidate');
    if (!Number.isInteger(operation.durationMinutes) || operation.durationMinutes <= 0
      || operation.durationMinutes > Math.min(candidate.maxDurationMinutes || MAX_STOP_DURATION_MINUTES, MAX_STOP_DURATION_MINUTES)
      || typeof operation.note !== 'string' || typeof operation.why !== 'string') return fail('viability_malformed_operation');
    let shaped = { ...replacementStop(candidate, original, operation.durationMinutes), note:operation.note, why:operation.why };
    if (operation.op === 'deepen_stop') {
      if ((original.canonicalPlaceName || original.name) !== candidate.canonicalName || !(candidate.maxDurationMinutes >= operation.durationMinutes)
        || operation.durationMinutes <= Number(original.duration)) return fail('viability_unsupported_deepening');
      shaped = { ...original, duration:operation.durationMinutes, note:operation.note, why:operation.why };
    } else if (operation.op === 'replace_stop') shaped = { ...shaped, id:original.id, order:original.order };
    if (candidate.accessEligibility && require('./hardConstraintEligibility').evaluateHardAccessEligibility(shaped,candidate.accessEligibility).reasonCodes.length)
      return fail('viability_constraint_ineligible');
    if (operation.op === 'add_stop') nextStops.push(shaped); else nextStops[operation.stopIndex] = shaped;
  }
  return { ok:true, plan:{ ...plan, days:plan.days.map((d,i) => i === index ? {...d,stops:nextStops} : d) } };
}

function transactionProgress(snapshot, after, operations = []) {
  const beforeSet = new Set(snapshot.projection.days.flatMap(d => d.codes.map(c => `${d.dayNumber}:${c}`)));
  const afterSet = new Set(after.days.flatMap(d => d.codes.map(c => `${d.dayNumber}:${c}`)));
  const still = snapshot.scopes.filter(s => after.days.find(d => d.dayNumber === s.dayNumber)?.codes.some(c => STRUCTURAL_REASONS.has(c))).map(s=>s.dayNumber);
  const resolved = snapshot.scopes.map(s=>s.dayNumber).filter(n=>!still.includes(n));
  const changed = new Set(operations.map(o=>o.dayNumber));
  return { scopesRequested:snapshot.scopes.map(s=>s.dayNumber), scopesResolved:resolved,
    scopesIndirectlyResolved:resolved.filter(n=>!changed.has(n)), scopesStillFailing:still,
    newFailures:[...afterSet].filter(k=>!beforeSet.has(k)), regressions:[...afterSet].filter(k=>!beforeSet.has(k)) };
}

function buildPlanViabilitySnapshot({ plan, context = {}, focusedRepairBudgetRemaining = 1, projection = null, existenceOnly = false, candidates = null } = {}) {
  projection ||= projectPlan(plan,context);
  const scopes = structuralScopes(plan,context,projection);
  const catalog = candidates || buildEvidenceBoundRepairCandidates({bundle:context.bundle,constraints:context.constraints,candidatePlan:plan,includeExisting:true,requireExecutablePrimary:true}).candidates
    .filter(c=>!c.evidenceIds.some(id=>(context.excludedEvidenceIds || []).includes(id)));
  const base = { repairOperator:OPERATORS.VIABILITY, reasonCodes:[...new Set(scopes.flatMap(s=>s.reasons))], projection, scopes,
    affectedDays:scopes.map(s=>s.dayNumber), frozenDayNumbers:plan.days.map(dayNumber).filter(n=>!scopes.some(s=>s.dayNumber===n)),
    maxOperationsPerDay:1, focusedRepairBudgetRemaining, projectionContext:context, candidates:catalog };
  const pools=[];const removals=[];
  for (const scope of scopes) {
    let scopeViable=false;
    for (const target of scope.targets) {
      if (target.operation === 'remove_stop') {
        const simulation=shapeOperation(plan,scope,{op:'remove_stop',stopIndex:target.stopIndex},catalog);
        const after=projectPlan(simulation.plan,context);
        const local=after.days.find(d=>d.dayNumber===scope.dayNumber);
        const safe=!local.codes.length && !transactionProgress(base,after).newFailures.length;
        if(safe){removals.push(target);scopeViable=true;}
      } else {
        const available = target.operation === 'deepen_stop' ? catalog.filter(c=>c.canonicalName===(plan.days.find((d,i)=>dayNumber(d,i)===scope.dayNumber).stops[target.stopIndex].canonicalPlaceName || plan.days.find((d,i)=>dayNumber(d,i)===scope.dayNumber).stops[target.stopIndex].name)) : catalog;
        // Preflight needs an existence proof per day, not a Cartesian assignment
        // search. The actual dispatch still receives the complete eligible pools.
        const batches = existenceOnly ? available.map(c=>[c]) : [available];
        for (const batch of batches) {
          const pool=candidatePool({plan,targets:[target],candidates:batch,context,focusedRepairBudgetRemaining,
            simulateReplacement:({candidate,duration})=>shapeOperation(plan,scope,{op:target.operation,stopIndex:target.stopIndex,
              placeRef:candidate.ref,durationMinutes:duration,note:candidate.canonicalName,why:candidate.canonicalName},catalog)});
          pools.push(...pool.byScope);
          if(pool.ok){scopeViable=true;if(existenceOnly)break;}
        }
      }
      if(existenceOnly && scopeViable)break;
    }
    if(existenceOnly && !scopeViable)return {...base,ok:false,unrepairableDays:[scope.dayNumber]};
  }
  const byScope=pools;
  const repairPool={byScope,focusedRepairBudgetRemaining,candidates:catalog.filter(c=>byScope.some(s=>s.eligibleCandidateRefs.includes(c.ref)))};
  const unrepairableDays=scopes.filter(s=>!byScope.some(t=>t.dayNumber===s.dayNumber && t.eligibleCandidateRefs.length) && !removals.some(t=>t.dayNumber===s.dayNumber)).map(s=>s.dayNumber);
  return {...base,ok:scopes.length>0 && !unrepairableDays.length,unrepairableDays,repairPool,removals,
    candidates:repairPool.candidates,diagnostics:{days:scopes}};
}

function applyPlanViabilityRepair({ plan, snapshot, operations, dependentCopyUpdates = [] }) {
  const fail = (code,extra={}) => ({ok:false,reasonCodes:[code],...extra});
  if(!snapshot?.ok || !Array.isArray(operations) || !operations.length)return fail('viability_malformed_transaction');
  const seen=new Set();let next=plan;
  for(const op of operations){
    if(!op || Object.keys(op).some(k=>!['op','dayNumber','stopIndex','placeRef','durationMinutes','note','why'].includes(k)))return fail('viability_malformed_operation');
    const scope=snapshot.scopes.find(s=>s.dayNumber===op.dayNumber);
    if(!scope)return fail('viability_frozen_scope');
    if(seen.has(op.dayNumber))return fail('viability_operation_budget');seen.add(op.dayNumber);
    const eligible=op.op==='remove_stop' ? snapshot.removals.some(t=>t.dayNumber===op.dayNumber && t.stopIndex===op.stopIndex)
      : snapshot.repairPool.byScope.some(t=>t.dayNumber===op.dayNumber && t.stopIndex===op.stopIndex && t.operation===op.op && t.eligibleCandidateRefs.includes(op.placeRef));
    if(!eligible)return fail('repair_candidate_not_viable');
    const shaped=shapeOperation(next,scope,op,snapshot.candidates);if(!shaped.ok)return shaped;next=shaped.plan;
  }
  const copy=reconcileRepairDayCopy({priorPlan:plan,plan:next,affectedDays:[...seen],updates:dependentCopyUpdates || [],bundle:snapshot.projectionContext.bundle});
  if(!copy.ok)return copy;
  const after=projectPlan(copy.plan,snapshot.projectionContext);const progress=transactionProgress(snapshot,after,operations);
  if(progress.scopesStillFailing.length || progress.newFailures.length)return fail('repair_projected_validation_failed',{progress,projectedReasonCodes:after.reasonCodes});
  return {ok:true,plan:copy.plan,applied:operations.length,progress,copyDiagnostics:copy.diagnostics};
}

async function dispatchPlanViabilityRepair({validation,repairPlanning,route,attempt,dispatchIndex,signal,createRequest,executeResponses,responseAdapters,priceCall,liveBudget,now}) {
  const snapshot=validation.viabilitySnapshot || buildPlanViabilitySnapshot({plan:validation.candidatePlan,context:repairPlanning.context,focusedRepairBudgetRemaining:repairPlanning.focusedRepairBudgetRemaining});
  const row={kind:PURPOSE,action:PURPOSE,purpose:PURPOSE,repairOperator:OPERATORS.VIABILITY,attempt,dispatchIndex,affectedDays:snapshot.affectedDays,
    validatorReasonCodes:snapshot.reasonCodes,scopeCount:snapshot.scopes.length,candidateRegistryCount:snapshot.candidates.length,
    operationBudgetPerDay:1,operationBudgetTotal:snapshot.scopes.length,dispatched:false,acceptedOperationCount:0,mergeStatus:'catalog_declined',reasonCodes:[]};
  if(!snapshot.ok)return {...row,reasonCodes:['repair_no_viable_candidate'],unrepairableDays:snapshot.unrepairableDays};
  const compact=compactRepairContext({quality:snapshot,plan:validation.candidatePlan,bundle:repairPlanning.context.bundle,constraints:repairPlanning.context.constraints});
  compact.context.repairOperator=OPERATORS.VIABILITY;
  compact.context.scope=compact.context.scope.map(s=>({...s,reasons:snapshot.scopes.find(d=>d.dayNumber===s.dayNumber).reasons}));
  compact.context.removals=snapshot.removals;
  const instructions='Resolve every listed structural blocker in one transaction using eligible candidates and operations. At most one structural operation per affected day. Unrelated stops and valid days are frozen. Omit a scope only when other operations make it valid indirectly. Prefer self-sufficient grounded experiences and the smallest necessary change; never maximize stop count. Repetition is judged by grounded experience semantics, not universal place uniqueness. For add_stop use stopIndex -1. Deepening must respect the evidence duration maximum. Reconcile dependent copy in this response; omitted dependent copy is removed. Never author identity, execution facts, or unsupported activities in prose.';
  const request=createRequest({provider:route.provider,model:route.model,instructions,requestMetadata:{purpose:PURPOSE,repairOperator:OPERATORS.VIABILITY},input:[{role:'user',content:JSON.stringify(compact.context)}],tools:[TOOL],toolChoice:{type:'tool',name:TOOL.name},maxOutputTokens:Math.max(640,snapshot.scopes.length*420)});
  Object.assign(row,compact.telemetry);
  row.repairPromptTokens=countPromptTokens(instructions+JSON.stringify(request.input)+JSON.stringify(request.tools));
  row.nonCandidateContextTokens=row.repairPromptTokens-row.candidateCardTokens;
  if(liveBudget){const v=liveBudget.authorize({provider:route.provider,model:route.model});if(!v?.ok)return {...row,mergeStatus:'budget_refused',reasonCodes:['budget_refused']};row.budgetTicket=v.ticket;}
  const start=Date.now();let result;
  try{row.dispatched=true;result=await executeResponses(request,{adapters:responseAdapters,signal});}
  catch(error){return {...row,mergeStatus:'dispatch_failed',reasonCodes:['viability_repair_provider_failed'],...require('./qualificationDispatchPolicy').harnessBlockTelemetry(error),dispatchMs:Date.now()-start};}
  const priced=priceCall({provider:route.provider,model:route.model,usage:result?.usage,at:now()});
  Object.assign(row,{dispatchMs:Date.now()-start,costUsd:priced?.costUsd ?? null,costStatus:priced?.costStatus ?? 'unpriced',costComponents:priced?.components || null,
    inputTokens:result?.usage?.inputTokens ?? null,outputTokens:result?.usage?.outputTokens ?? null,reasoningTokens:result?.usage?.reasoningTokens ?? null,
    cacheWriteTokens:result?.usage?.cacheCreationInputTokens ?? result?.usage?.cacheWriteTokens ?? result?.usage?.input_tokens_details?.cache_write_tokens ?? 0});
  if(liveBudget && row.budgetTicket)liveBudget.record({ticket:row.budgetTicket,costUsd:row.costUsd,costStatus:row.costStatus});
  let payload;
  try{if(result?.refusal || !['complete','completed'].includes(result?.completionStatus) || result.toolCalls?.length!==1 || result.toolCalls[0].name!==TOOL.name)throw Error('invalid');const raw=result.toolCalls[0].input ?? result.toolCalls[0].arguments;payload=typeof raw==='string'?JSON.parse(raw):raw;}
  catch(_){return {...row,mergeStatus:'artifact_malformed',reasonCodes:['viability_repair_malformed']};}
  const merged=applyPlanViabilityRepair({plan:validation.candidatePlan,snapshot,operations:payload?.operations,dependentCopyUpdates:payload?.dependentCopyUpdates});
  return {...row,mergeStatus:merged.ok?'applied':'merge_refused',reasonCodes:merged.reasonCodes || [],progress:merged.progress,
    projectedReasonCodes:merged.projectedReasonCodes,copyReconciled:merged.ok,copyDiagnostics:merged.copyDiagnostics,
    acceptedOperationCount:merged.applied || 0,frozenDayMutationCount:0,plan:merged.plan};
}
module.exports={PURPOSE,TOOL,structuralScopes,buildPlanViabilitySnapshot,shapeOperation,applyPlanViabilityRepair,transactionProgress,dispatchPlanViabilityRepair};
