'use strict';
const {executeTrailieTurn}=require('../trailieExecutionService');
const {buildEvidenceBundle}=require('../../utils/evidenceBundle');
const {createQualificationDispatchPolicy}=require('../../utils/qualificationDispatchPolicy');
const {TOOL}=require('../../utils/focusedTripQualityRepair');
const ev=(name,type,extra={})=>({evidenceId:`ev:${name}`,topic:'activities',evidenceType:'fact',claim:{text:name,normalizedValue:{name,type,activityTypes:[type],...extra}}});
const baseEvidence=[ev('Garden Loop','walk'),ev('Northern District','area'),ev('Seasonal Hall','museum',{seasonal:true}),ev('River Loop','walk'),ev('Forest Loop','walk'),ev('Meadow Loop','walk')];
const st=(name,type,note)=>({name,type,duration:120,note,why:'An outing.',timeWindow:'Morning'});
function harness({identity=false,empty=false,deny=false,seasonal=true}={}) {
 const calls=[];const policy=createQualificationDispatchPolicy();
 const plan={days:[{dayNumber:1,stops:[st(identity?'Uncatalogued Ridge':'Garden Loop',identity?'viewpoint':'walk','Walk the loop.')]},
  {dayNumber:2,stops:[st('Northern District','area','Explore the area and ask locally where to go.')]},
  {dayNumber:3,stops:[st(seasonal?'Seasonal Hall':'Garden Loop',seasonal?'museum':'walk',seasonal?'Explore exhibits.':'Walk at sunset.')]}]};
 const evidence=empty?baseEvidence.slice(0,3):baseEvidence;
 const deps={enabled:true,enableStopSubstitutionRepair:true,streamGeneration:false,responseAdapters:{},resolveDeterministicRender:()=>({eligible:false}),detectContradiction:()=>[],
  planRequirements:()=>[{requirementId:'r',topic:'activities',criticality:'optional'}],
  resolveEvidence:async({requestId})=>buildEvidenceBundle({requestId,candidates:evidence,resolutions:[{requirementId:'r',status:'satisfied_fresh',evidenceIds:evidence.map(e=>e.evidenceId)}]}),
  executeResponses:async request=>{
   const purpose=request.requestMetadata.purpose;
   if(deny && purpose!=='primary_generation') throw Object.assign(new Error('qualification_harness_block:test'),{code:'qualification_harness_block'});
   policy.authorize({purpose,model:request.model});calls.push(request);
   const name=request.tools?.[0]?.name || request.tools?.[0]?.function?.name;
   let input;
   if(name==='repair_plan_viability') { const response=require('../../../tests/support/viabilityResponse').viabilityResponse(request); return response; }
   if(name===TOOL.name){const c=JSON.parse(request.input[0].content);const target=c.scope[0];input={replacements:[{dayNumber:target.dayNumber,stopIndex:target.weakStopIndexes[0],placeRef:c.candidates[0].ref,durationMinutes:120,note:'Walk the full route.',why:'An unhurried outdoor experience.'}]};}
   else if(name==='substitute_illegal_stops'){
    const text=request.input[0].content;const place=Number([...text.matchAll(/placeRef (\d+) — (.+)/g)].find(m=>m[2].includes('Garden Loop'))?.[1]);
    input={substitutions:[{dayRef:1,stopRef:1,replacement:{placeRef:place,note:'Walk the loop.',why:'An outdoor experience.'}}]};
   }else input=plan;
   return {text:'',outputText:'',toolCalls:[{id:'c',name,input}],completionStatus:'complete',stopReason:'stop',usage:{inputTokens:500,outputTokens:200}};
  }};
 return {calls,policy,run:()=>executeTrailieTurn({userMessage:'Give me three days in Canyonlands.',conversationContext:{history:[]},constraints:{dates:{numDays:3}},resolvedContext:{}},deps)};
}
test('G/K: actionability and seasonal quality coalesce, leaving one slot unused',async()=>{
 const h=harness();const r=await h.run();
 expect(r.status).toBe('complete');expect(h.calls.map(c=>c.requestMetadata.purpose)).toEqual(['primary_generation','plan_viability_repair']);
 expect(r.attempts).toHaveLength(1);expect(r.telemetrySummary.subDispatches).toHaveLength(1);
 expect(r.canonicalPlan.days[0].stops[0].name).toBe('Garden Loop');
 expect(r.canonicalPlan.days[1].stops[0].name).not.toBe('Northern District');
 expect(r.canonicalPlan.days[2].stops[0].name).not.toBe('Seasonal Hall');
 expect(r.response.text).not.toMatch(/ask locally|Seasonal Hall/);
 expect(r.itineraryHash).toBeTruthy();expect(h.policy.snapshot().remainingFocusedRepairs).toBe(1);
});
test('H: no concrete candidate means evidence blocker and zero repairs',async()=>{
 const h=harness({empty:true});const r=await h.run();expect(h.calls).toHaveLength(1);
 expect(r.attempts[0].retryability).toBe('evidence_blocker');expect(r.attempts[0].validationReasonCodes).toContain('experience_not_actionable');expect(r.canonicalPlan).toBeNull();
});
test('J: identity plus combined viability resolves actionability and seasonal weakness in two slots',async()=>{
 const h=harness({identity:true});const r=await h.run();
 expect(h.calls.map(c=>c.requestMetadata.purpose)).toEqual(['primary_generation','legal_stop_substitution_repair','plan_viability_repair']);
 expect(r.status).toBe('complete');expect(r.canonicalPlan).not.toBeNull();
 expect(r.telemetrySummary.finalValidationSnapshot.reasonCodes).toEqual([]);expect(r.attempts).toHaveLength(1);
});
test('M: harness denial propagates distinctly without an external-provider failure',async()=>{
 const h=harness({deny:true});const r=await h.run();expect(h.calls).toHaveLength(1);
 expect(r.attempts[0].retryability).toBe('deterministic_blocker');
 expect(r.attempts[0].validationReasonCodes).toContain('qualification_harness_block');
 expect(r.telemetrySummary.subDispatches[0]).toMatchObject({dispatched:false,mergeStatus:'qualification_harness_block'});
 expect(r.response.text).not.toMatch(/provider|qualification_harness_block/i);
});
