'use strict';
const { executeTrailieTurn } = require('../../../../../src/services/trailieExecutionService');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');
const { TOOL } = require('../../../../../src/utils/focusedTripQualityRepair');
const names=['East Trail','West Trail','North Trail','South Trail','Heritage Hall','Forest Loop','River Loop','Meadow Loop'];
const evidence=names.map(name=>({evidenceId:`ev:${name}`,topic:'activities',evidenceType:'fact',claim:{text:name,normalizedValue:{name,type:name==='Heritage Hall'?'museum':'walk',activityTypes:[name==='Heritage Hall'?'exhibits':'walk']}}}));
const makePlan=(repeated=true)=>({intro:'Visit Heritage Hall every afternoon.',days:names.slice(0,4).map((name,i)=>({id:`d${i+1}`,dayNumber:i+1,label:`Day ${i+1}`,stops:[
 {id:`s${i+1}`,order:1,name,type:'walk',duration:120,note:'Walk the route.',why:'Time outdoors.',timeWindow:'Morning'},
 ...(repeated?[{id:`m${i+1}`,order:2,name:'Heritage Hall',type:'museum',duration:90,note:`Explore exhibits ${i}.`,why:`Views and history ${i}.`,timeWindow:['Afternoon','Sunrise','Evening','Midday'][i]}]:[]),
]}))});
function harness({repeated=true,persistent=false,empty=false}={}) {
 const calls=[];let brokerCalls=0;
 const deps={enabled:true,streamGeneration:false,responseAdapters:{},resolveDeterministicRender:()=>({eligible:false}),detectContradiction:()=>[],
  planRequirements:()=>[{requirementId:'r1',topic:'activities',criticality:'optional'}],
  resolveEvidence:async({requestId,requirements})=>{brokerCalls++;const candidates=empty?evidence.slice(0,5):evidence;return buildEvidenceBundle({requestId,candidates,resolutions:requirements.map(r=>({requirementId:r.requirementId,status:'satisfied_fresh',evidenceIds:candidates.map(e=>e.evidenceId)}))});},
  executeResponses:async request=>{
   calls.push(request);const tool=request.tools?.[0]?.name || request.tools?.[0]?.function?.name;
   let input;
   if(tool===TOOL.name){const ctx=JSON.parse(request.input[0].content);input={replacements:ctx.scope.slice(0,persistent?1:undefined).map((d,i)=>({dayNumber:d.dayNumber,stopIndex:d.weakStopIndexes[0],placeRef:ctx.candidates[i].ref,durationMinutes:120,note:'An unhurried outing.',why:'A different landscape.'}))};}
   else input=makePlan(repeated);
   return {outputText:'',text:'',toolCalls:[{id:'call',name:tool,input,rawArgs:JSON.stringify(input)}],completionStatus:'complete',stopReason:'stop',usage:{inputTokens:1000,outputTokens:300}};
  }};
 return {calls,run:()=>executeTrailieTurn({userMessage:'Give me four days in Canyonlands.',conversationContext:{history:[]},constraints:{dates:{numDays:4}},resolvedContext:{}},deps),brokerCount:()=>brokerCalls};
}

test('I/K: one focused quality repair, frozen first day, canonical narrative and diagnostics',async()=>{
 const h=harness();const r=await h.run();
 expect(r.status).toBe('complete');expect(h.calls).toHaveLength(2);expect(h.brokerCount()).toBe(1);
 expect(r.attempts).toHaveLength(1);expect(r.attempts[0].model).toBe('gpt-6-sol');
 expect(r.telemetrySummary.subDispatches).toHaveLength(1);
 expect(r.telemetrySummary.subDispatches[0]).toMatchObject({kind:'trip_quality_repair',purpose:'trip_quality_repair',mergeStatus:'applied',affectedDays:[2,3,4]});
 expect(r.canonicalPlan.days[0].stops.map(s=>s.name)).toEqual(['East Trail','Heritage Hall']);
 expect(r.canonicalPlan.days.slice(1).every(d=>!d.stops.some(s=>s.name==='Heritage Hall'))).toBe(true);
 expect(r.response.text).not.toMatch(/every afternoon/);expect(r.itineraryHash).toBeTruthy();
 expect(r.telemetrySummary.tripQuality.days).toHaveLength(4);
 expect(r.telemetrySummary.tripQuality.days[0].primaryExperienceIdentities.length).toBeGreaterThan(0);
 expect(JSON.stringify(r.response)).not.toMatch(/PRIMARY_CONFIRMED|REDUNDANT_REPEAT/);
});
test('J: persistent weak trip stops after one quality dispatch, with failure retryability',async()=>{
 const h=harness({persistent:true});const r=await h.run();
 expect(r.status).not.toBe('complete');expect(h.calls).toHaveLength(2);expect(r.attempts).toHaveLength(1);
 expect(r.canonicalPlan).toBeNull();expect(r.attempts[0].retryability).toBeTruthy();expect(r.terminalReason).toBeTruthy();
 expect(r.attempts[0].validationReasonCodes).toContain('excessive_trip_repetition');
});
test('no eligible alternatives means no quality call and no full-plan retry',async()=>{
 const h=harness({empty:true});const r=await h.run();
 expect(r.status).not.toBe('complete');expect(h.calls).toHaveLength(1);
 expect(r.attempts[0].retryability).toBe('evidence_blocker');expect(r.canonicalPlan).toBeNull();
});
test('L: healthy generation saves directly; successful retryability and terminal reason remain null',async()=>{
 const h=harness({repeated:false});const r=await h.run();
 expect(r.status).toBe('complete');expect(h.calls).toHaveLength(1);
 expect(r.attempts[0].retryability).toBeNull();expect(r.terminalReason).toBeNull();
 expect(r.telemetrySummary.subDispatches).toEqual([]);expect(r.telemetrySummary.tripQuality.days).toHaveLength(4);
});
