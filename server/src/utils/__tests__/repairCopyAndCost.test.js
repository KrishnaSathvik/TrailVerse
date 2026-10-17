'use strict';
const {applyQualityReplacements,dispatchTripQualityRepair,TOOL}=require('../focusedTripQualityRepair');
const {compactRepairContext}=require('../compactRepairContext');
const {copyContextHash,reconcileRepairDayCopy}=require('../repairCopyDependencies');
const {countPromptTokens}=require('../promptTokenAccounting');
const {createResponsesRequest}=require('../../services/responsesAdapter');
const {priceProviderCall}=require('../../services/trailieTurnLedger');
const plan={days:[{dayNumber:1,label:'Museum afternoon',stops:[{id:'desk',name:'Entry Desk',type:'visitor_center',duration:20,note:'Before the museum.',why:'Orientation before the afternoon history visit.'},{id:'main',name:'History Hall',type:'museum',duration:120}]},{dayNumber:2,stops:[{name:'Garden',type:'walk',duration:120}]}]};
const q={reasonCodes:['conditional_primary_unsupported'],affectedDays:[1],frozenDayNumbers:[2],diagnostics:{days:[{dayNumber:1,weakStopIndexes:[1]}]},candidates:[{ref:1,canonicalName:'River Loop',canonicalType:'walk',placeKey:'river',evidenceIds:['river']}]};
const ops=[{dayNumber:1,stopIndex:1,placeRef:1,durationMinutes:120,note:'Walk the loop.',why:'River scenery.'}];
test('H/J: stale sibling rationale and note omitted, frozen day and structural fields preserved',()=>{
 const r=applyQualityReplacements(plan,q,ops);expect(r.ok).toBe(true);expect(r.plan.days[0].stops[0]).toEqual({...plan.days[0].stops[0],note:'',why:''});expect(r.plan.days[1]).toEqual(plan.days[1]);
 expect(r.plan.days[0].label).toBe('');
});
test('I: bounded copy updates are accepted in the same repair, structural mutation refused',()=>{
 const update={dayNumber:1,stopIndex:0,contextHash:copyContextHash(plan.days[0]),dependsOn:[{stopId:'main',experienceType:'walk'}],why:'Orientation before the river walk.'};
 expect(applyQualityReplacements(plan,q,ops,[update]).plan.days[0].stops[0].why).toBe(update.why);
 for(const bad of [{...update,duration:200},{...update,dayNumber:2}]) expect(applyQualityReplacements(plan,q,ops,[bad]).ok).toBe(false);
 for(const stale of [{...update,contextHash:'old'},{...update,why:'Before History Hall.'},{...update,dependsOn:[{stopId:'main',experienceType:'museum'}]}]) {
  const result=applyQualityReplacements(plan,q,ops,[stale]);expect(result.ok).toBe(true);expect(result.plan.days[0].stops[0].why).toBe('');
 }
});
test('source-owned operational fact survives while mixed generated copy is invalidated',()=>{
 const bundle={evidence:[{evidenceId:'desk',claim:{normalizedValue:{name:'Entry Desk',operationalFacts:[{text:'Doors open at 8.',type:'opening_hours'}]}}}]};
 const r=applyQualityReplacements(plan,q,ops,[],bundle);expect(r.plan.days[0].stops[0].note).toBe('Doors open at 8.');
});
test('L: unknown candidate refs cannot bind',()=>{expect(applyQualityReplacements(plan,q,[{...ops[0],placeRef:999}]).ok).toBe(false);});
test('latest saved sibling rationale is invalidated by the actual structural replacement',()=>{
 const f=require('./fixtures/scopeFidelity/captured.json');const r=reconcileRepairDayCopy({priorPlan:f.primaryPlan,plan:f.plan,affectedDays:[1,4],bundle:f.bundle});
 expect(r.plan.days[0].stops[0].why).toBe('');expect(r.plan.days[1]).toEqual(f.plan.days[1]);
});
test('K/M: captured 26-candidate repair sends compact cards, preserves binding and records cost components',async()=>{
 const f=require('./fixtures/scopeFidelity/captured.json');const old=f.repairInput;
 const quality={reasonCodes:old.reasons,candidates:old.candidates,affectedDays:old.scope.map(d=>d.dayNumber),frozenDayNumbers:old.frozenDays,diagnostics:{days:old.scope}};
 const candidatePlan={days:old.scope.map(d=>({dayNumber:d.dayNumber,stops:d.stops}))};
 let request;const result=await dispatchTripQualityRepair({validation:{candidatePlan,tripQuality:quality},route:{provider:'openai',model:'gpt-6-sol'},attempt:1,dispatchIndex:2,bundle:f.bundle,createRequest:createResponsesRequest,
  executeResponses:async r=>{request=r;const tokens=countPromptTokens(r.input[0].content+JSON.stringify(TOOL)+r.instructions);return {completionStatus:'complete',toolCalls:[{name:TOOL.name,input:{replacements:f.selected}}],usage:{inputTokens:tokens,cacheWriteTokens:tokens,outputTokens:417,reasoningTokens:225}};},
  priceCall:priceProviderCall,now:()=>new Date('2026-09-24')});
 expect(result.mergeStatus).toBe('applied');expect(result.repairCandidateCount).toBe(26);
 expect(request.input[0].content).not.toMatch(/accessEligibility|extractorVersion|<ul>|EvidenceBundle/);
 expect(result.repairPromptTokens).toBeLessThan(10000);expect(result.repairPromptTokens).toBeLessThan(countPromptTokens(JSON.stringify(old))/3);
 expect(result.cacheWriteTokens).toBeGreaterThan(0);expect(result.cacheWriteTokens).toBeLessThan(10000);expect(result.costComponents.cacheWrite).toBeGreaterThan(0);
 console.info('SCOPE_STATIC_COST',JSON.stringify({oldProviderInputTokens:37975,legacyLocalTokens:countPromptTokens(JSON.stringify(old)),repairPromptTokens:result.repairPromptTokens,candidateCardTokens:result.candidateCardTokens,nonCandidateContextTokens:result.nonCandidateContextTokens,candidateCount:result.repairCandidateCount,simulatedCacheWriteTokens:result.cacheWriteTokens,simulatedCostUsd:result.costUsd,simulatedCostComponents:result.costComponents,tokenizer:result.repairPromptTokenizer,providerCalls:0}));
 expect(result.plan.days[0].stops[1].evidenceRef).toBe(old.candidates.find(c=>c.ref===15).evidenceIds[0]);
});
