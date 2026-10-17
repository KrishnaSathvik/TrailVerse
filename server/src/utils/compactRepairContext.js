'use strict';
const { countPromptTokens, PROMPT_TOKENIZER_ID } = require('./promptTokenAccounting');
const { copyContextHash } = require('./repairCopyDependencies');
const clip = (text, size=240) => String(text || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,size);
function candidateCard(candidate, bundle) {
  const evidence=(bundle?.evidence || candidate.accessEligibility?.bundle?.evidence || []).filter(r=>(candidate.evidenceIds || []).includes(r.evidenceId));
  const values=evidence.map(r=>r.claim?.normalizedValue || {});
  const facts=values.flatMap(v=>v.operationalFacts || []);
  return {ref:candidate.ref,canonicalName:candidate.canonicalName,canonicalType:candidate.canonicalType,
    scope:candidate.canonicalType, maxDurationMinutes:candidate.maxDurationMinutes,
    coordinates:candidate.coordinates || null,
    sourceDurationRanges:values.map(v=>require('./evidenceActivityDuration').activityDurationRange(v.duration)).filter(Boolean),
    semantics:[...new Set(values.flatMap(v=>[v.semanticCategory,v.category,...(v.activityTypes || [])]).filter(Boolean))],
    execution:values.map(v=>v.experienceExecution || v.execution).filter(Boolean).map(e=>({action:e.action,scope:e.scope})),
    hardConstraints:values.map(v=>Object.fromEntries(['difficulty','exposureLevel','walkingDistanceMiles','walkingDistanceQualifier','walkingDistanceConflict','wheelchairAccessible','avoidStairs','closureStatus','currentStatus'].filter(k=>v[k]!=null).map(k=>[k,v[k]]))).filter(v=>Object.keys(v).length),
    dependencies:values.map(v=>Object.fromEntries(['seasonal','seasonalStatus','operatingMonths','permitRequired','reservationRequired'].filter(k=>v[k]!=null).map(k=>[k,v[k]]))).filter(v=>Object.keys(v).length),
    operationalFacts:facts.map(f=>({type:f.type,status:f.status,value:f.value,text:clip(f.text)})),
    evidenceSummary:[...new Set(evidence.map(r=>clip(r.claim?.text)).filter(Boolean))].slice(0,2),
  };
}
function compactRepairContext({quality,plan,bundle,constraints={}}) {
  const scope=quality.diagnostics.days.filter(d=>quality.affectedDays.includes(d.dayNumber)).map(d=>{
    const day=plan.days.find((day,i)=>Number(day.dayNumber || day.day || i+1)===d.dayNumber);
    return {dayNumber:d.dayNumber,weakStopIndexes:d.weakStopIndexes,contextHash:copyContextHash(day),stops:(day.stops || []).map(s=>({id:s.id,name:s.canonicalPlaceName || s.name,type:s.type,duration:s.duration,timeWindow:s.timeWindow,note:s.note,why:s.why}))};
  });
  const candidates=quality.candidates.map(c=>candidateCard(c,bundle));
  const context={reasons:quality.reasonCodes,scope,candidates,
    ...(quality.repairPool ? {candidateEligibility:require('./downstreamRepairPlanner').compactScopes(quality.repairPool),viabilityFields:require('./downstreamRepairPlanner').VIABILITY_FIELDS,focusedRepairBudgetRemaining:quality.repairPool.focusedRepairBudgetRemaining} : {}),frozenDays:quality.frozenDayNumbers,
    constraints:Object.fromEntries(['mobility','exposure','avoidExposure','maxWalkingDistanceMiles','activityPreferences','dates','maxDailyDrivingHours'].filter(k=>constraints[k]!=null).map(k=>[k,constraints[k]])),
    usedExperiences:(plan.days || []).flatMap(d=>(d.stops || []).map(s=>({name:s.canonicalPlaceName || s.name,type:s.type}))) };
  // Combined operators have several legal targets per day; identical projected
  // outcomes are shared by index rather than repeated for every operation.
  if (quality.repairOperator === 'PLAN_VIABILITY_EDIT' && context.candidateEligibility) {
    const registry=[];const refs=new Map();
    context.candidateEligibility=context.candidateEligibility.map(({projections,...target})=>({...target,
      projectionRefs:projections.map(row=>{const key=JSON.stringify(row);if(!refs.has(key)){refs.set(key,registry.length);registry.push(row);}return refs.get(key);})}));
    context.projectedOutcomes=registry;
  }
  const runtime=require('./canonicalRuntimeProjection');
  const mobility=Object.fromEntries(Object.entries(runtime.resolveRuntimeMobility(constraints)).filter(([,v])=>v!=null));
  if(Object.keys(mobility).length)context.constraints.mobility=mobility;
  const fitness=runtime.resolveRuntimeFitness(constraints);
  if(fitness!=null)context.constraints.fitnessLevel=fitness;
  if(require('./planningInputContract').isAvoidExposureActive(constraints))context.constraints.avoidExposure=true;
  const candidateCardTokens=countPromptTokens(JSON.stringify(candidates));
  return {context,telemetry:{repairPromptTokens:countPromptTokens(JSON.stringify(context)),candidateCardTokens,
    nonCandidateContextTokens:countPromptTokens(JSON.stringify(context))-candidateCardTokens,repairCandidateCount:candidates.length,
    repairPromptTokenizer:PROMPT_TOKENIZER_ID,repairPromptTokensEstimated:true}};
}
module.exports={candidateCard,compactRepairContext};
