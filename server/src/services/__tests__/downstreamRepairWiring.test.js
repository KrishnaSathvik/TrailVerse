'use strict';
const { executeTrailieTurn } = require('../trailieExecutionService');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');
const { createQualificationDispatchPolicy } = require('../../utils/qualificationDispatchPolicy');
const { TOOL } = require('../../utils/focusedTripQualityRepair');
function harness({ omit = false, identity = false, support = true, selfSufficient = false, deadEnd = false } = {}) {
 const calls=[];const policy=createQualificationDispatchPolicy();
 const evidence=['Main Loop','Short Loop','East Loop','West Loop','South Loop','North Loop'].map(name=>({evidenceId:name,topic:'activities',evidenceType:'fact',claim:{text:name,normalizedValue:{name,type:'walk',activityTypes:['walk']}}}));
 evidence.push({evidenceId:'desk',topic:'visitor_services',evidenceType:'fact',claim:{text:'Orientation Desk',normalizedValue:{name:'Orientation Desk',type:'visitor_center'}}});
 const stop=(name,duration=120,type='walk')=>({name,type,duration,note:'Explore.',why:'Scenery.'});
 const plan={days:[{dayNumber:1,stops:[stop('Main Loop')]},{dayNumber:2,stops:[stop(support?'Orientation Desk':'Short Loop',30,support?'visitor_center':'walk')]},{dayNumber:3,stops:[stop(identity?'Uncatalogued Ridge':'Short Loop',30,identity?'viewpoint':'walk')]},{dayNumber:4,stops:[stop('Main Loop')]}]};
 if(selfSufficient)plan.days=['Main Loop','East Loop','Uncatalogued Ridge','West Loop'].map((name,i)=>({dayNumber:i+1,stops:[stop(name,120,name==='Uncatalogued Ridge'?'viewpoint':'walk')]}));
 if(deadEnd)for(const e of evidence)e.claim.normalizedValue.maxVisitDurationMinutes=20;
 const deps={classifyIntent:()=>({version:'trailie-intent-v2.0.0',source:'deterministic',primaryIntent:'full_trip',verticals:['itinerary'],depth:'planning',freshness:'stable',actionability:'planning',scope:'single_destination',entities:[],confidence:1,reasonCodes:[],structurePolicy:'required',travelerJob:null}),enabled:true,enableStopSubstitutionRepair:true,streamGeneration:false,responseAdapters:{},resolveDeterministicRender:()=>({eligible:false}),detectContradiction:()=>[],
 planRequirements:()=>[{requirementId:'r',topic:'activities',criticality:'optional'}],resolveEvidence:async({requestId})=>buildEvidenceBundle({requestId,candidates:evidence,resolutions:[{requirementId:'r',status:'satisfied_fresh',evidenceIds:evidence.map(e=>e.evidenceId)}]}),
 executeResponses:async request=>{
   policy.authorize({purpose:request.requestMetadata.purpose,model:request.model});calls.push(request);
   const name=request.tools?.[0]?.name || request.tools?.[0]?.function?.name;let input=plan;
   if(name==='repair_plan_viability') { const response=require('../../../tests/support/viabilityResponse').viabilityResponse(request); if(omit) response.toolCalls[0].input.operations=response.toolCalls[0].input.operations.slice(0,1); return response; }
   if(name===TOOL.name){const c=JSON.parse(request.input[0].content);const used=new Set();input={replacements:c.scope.slice(0,omit?1:undefined).map(d=>{
    const eligible=c.candidateEligibility.find(t=>t.dayNumber===d.dayNumber && t.eligibleCandidateRefs.some(ref=>!used.has(ref)));
    const ref=eligible.eligibleCandidateRefs.find(ref=>!used.has(ref));used.add(ref);
    return {dayNumber:d.dayNumber,stopIndex:eligible.stopIndex,placeRef:ref,durationMinutes:120,note:'Walk the route.',why:'Distinct scenery.'};})};}
   if(name==='substitute_illegal_stops') {const text=request.input[0].content;const scope=JSON.parse(text.split('Per-target eligibility (mandatory): ')[1].split('\nProjection fields: ')[0])[0];input={substitutions:[{dayRef:scope.dayNumber,stopRef:scope.stopIndex+1,replacement:{placeRef:scope.eligibleCandidateRefs[0],note:'Walk.',why:'Scenery.'}}]};}
   return {text:'',outputText:'',toolCalls:[{id:'c',name,input}],completionStatus:'complete',stopReason:'stop',usage:{inputTokens:100,outputTokens:100}};
 }};
 return {calls,policy,run:()=>executeTrailieTurn({userMessage:`Give me ${plan.days.length} days in Example Reserve.`,metadata:{resolvedPlaceName:'Example Reserve'},conversationContext:{history:[]},constraints:{dates:{numDays:plan.days.length}},resolvedContext:{}},deps)};
}
test('D/E: one viability dispatch covers every currently failing day and freezes the valid day',async()=>{
 const h=harness();const r=await h.run();expect(r.status).toBe('complete');
 expect(h.calls.map(c=>c.requestMetadata.purpose)).toEqual(['primary_generation','plan_viability_repair']);
 expect(r.telemetrySummary.subDispatches[0].affectedDays).toEqual([2,3,4]);
 expect(r.canonicalPlan.days[0].stops[0].name).toBe('Main Loop');
});
test('B/J/K/M: identity plus viability, authoritative final snapshot and versioned history',async()=>{
 const h=harness({identity:true});const r=await h.run();expect(r.status).toBe('complete');
 expect(h.calls.map(c=>c.requestMetadata.purpose)).toEqual(['primary_generation','legal_stop_substitution_repair','plan_viability_repair']);
 expect(r.telemetrySummary.subDispatches[0].expectedFollowupFamily).toBe('coverage');
 expect(r.telemetrySummary.subDispatches[0].progress.targetedScopeResolved).toBe(true);
 const history=r.telemetrySummary.validationHistory;expect(history.map(s=>s.validationSequence)).toEqual([1,2,3]);
 expect(new Set(history.map(s=>s.planRevisionHash)).size).toBe(3);
 expect(r.telemetrySummary.finalValidationSnapshot).toMatchObject({reasonCodes:[],afterRepairFamily:'plan_viability_repair',repairBudgetRemaining:0});
});
test('G: missing still-invalid scopes reject the whole set with no same-family second call',async()=>{
 const h=harness({omit:true});const r=await h.run();expect(r.status).toBe('failed');expect(h.calls).toHaveLength(2);
 expect(r.telemetrySummary.subDispatches[0]).toMatchObject({mergeStatus:'merge_refused',reasonCodes:['repair_projected_validation_failed']});
 expect(r.canonicalPlan).toBeNull();expect(r.telemetrySummary.finalValidationSnapshot.reasonCodes).toContain('insufficient_day_coverage');
});
test('J/K: terminal failure uses latest coverage state after identity was resolved',async()=>{
 const h=harness({identity:true,support:false,omit:true});const r=await h.run();
 expect(r.status).toBe('failed');expect(r.terminalReason).toBe('insufficient_day_coverage');
 const latest=r.telemetrySummary.finalValidationSnapshot;
 expect(latest.reasonCodes).toContain('insufficient_day_coverage');expect(latest.reasonCodes).not.toContain('stop_identity_unresolved');
 expect(r.validation.finalValidationSnapshot).toEqual(latest);expect(r.validation.reasonCodes).toEqual(latest.reasonCodes);
 expect(r.telemetrySummary.validationHistory[0].reasonCodes).toContain('stop_identity_unresolved');
 expect(r.telemetrySummary.experienceDiagnostics).toBeNull();
 expect(r.response.text).not.toMatch(/ungrounded|identity|experience_scope_unbound/);
 expect(latest.repairBudgetRemaining).toBe(0);expect(h.calls).toHaveLength(3);
});

test('E: a self-sufficient identity candidate needs no structural dispatch',async()=>{
 const h=harness({selfSufficient:true});const r=await h.run();
 expect(r.status).toBe('complete');expect(h.calls.map(c=>c.requestMetadata.purpose)).toEqual(['primary_generation','legal_stop_substitution_repair']);
 expect(r.telemetrySummary.finalReasonCodes).toEqual([]);expect(h.policy.snapshot().remainingFocusedRepairs).toBe(1);
});
test('F: missing second-stage universe blocks identity before dispatch',async()=>{
 const h=harness({identity:true,deadEnd:true});const r=await h.run();
 expect(r.status).toBe('evidence_incomplete');expect(h.calls).toHaveLength(1);expect(r.canonicalPlan).toBeNull();
 expect(r.telemetrySummary.subDispatches).toHaveLength(0);
 expect(r.attempts[0].retryability).toBe('evidence_blocker'); // actual universe is checked before scheduling
});
