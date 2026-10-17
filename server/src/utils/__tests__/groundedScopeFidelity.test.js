'use strict';
const {experienceRole,evaluateDayValue}=require('../semanticDayValue');
const {classifyStop,evaluateItineraryCompleteness}=require('../itineraryCompleteness');
const {__testables}=require('../../services/trailieExecutionService');
const {resolveStopIdentities}=require('../stopIdentityResolution');
const {normalizeCompoundVisits}=require('../visitExperienceSemantics');
const ev=(name,type,extra={})=>({evidenceId:name,topic:'activities',claim:{text:name,normalizedValue:{name,type,category:type,activityTypes:[type],...extra}}});
const facility={name:'Orientation House',type:'visitor_center',duration:180,evidenceRef:'Orientation House'};
const bundle={evidence:[ev('Orientation House','visitor_center',{activityTypes:['exhibits','orientation']}),ev('History Hall','museum'),ev('River Loop','walk')]};
const role=s=>experienceRole(s,{bundle,classifyStop});
test('A/B/G/N: model prose and long duration cannot promote a service facility',()=>{
 for(const note of ['Visit the desk, then explore the surrounding region for two hours.','Explore exhibits and landscape.','Enjoy a full museum experience.','']) {
  const r=role({...facility,note,why:note});expect(r.role).toBe('supporting_experience');expect(r.creditedMinutes).toBe(0);expect(r.roleSource).toBe('source_entity_semantics');
  const v=evaluateItineraryCompleteness({itineraryData:{days:[{dayNumber:1,stops:[{...facility,note}]}]},evidenceBundle:bundle});
  expect(v.ok).toBe(false);expect(v.reasonCodes).toContain('experience_scope_unbound');
 }
});
test('C: authoritative cultural semantics can support primary independently of prose',()=>{
 for(const note of ['','Explore a museum','Information desk']) {
  expect(role({name:'History Hall',type:'visitor_center',duration:120,note})).toMatchObject({role:'primary_experience',roleSource:'source_entity_semantics',groundedExecutionScope:'FACILITY_BOUNDED'});
 }
});
test('D: source-grounded interior and exterior facets remain one compound visit',()=>{
 const b={evidence:[ev('History Hall','museum',{description:'Indoor exhibits and views of Eastern Cliffs outside.'})]};
 const p=resolveStopIdentities({evidenceBundle:b,itineraryData:{days:[{stops:[{name:'History Hall',type:'museum',duration:90,note:'Explore exhibits',timeWindow:'Morning'},{name:'Eastern Cliffs views outside History Hall',type:'viewpoint',duration:30,note:'Views outside.',timeWindow:'Morning'}]}]}});
 expect(normalizeCompoundVisits({itineraryData:p.itineraryData,bundle:b}).itineraryData.days[0].stops).toHaveLength(1);
});
test('E: grounded allocation cannot credit unbound minutes or unrelated refs',()=>{
 const b={evidence:[ev('History Hall','museum',{groundedDurationMinutes:30}),ev('Distant Route','scenic_drive')]};
 const s={name:'History Hall',type:'museum',duration:120,note:'Spend ninety more minutes exploring the region.'};
 expect(experienceRole(s,{bundle:b,classifyStop}).creditedMinutes).toBe(30);
 const bad=experienceRole({...s,executionBindings:[{evidenceRef:'Distant Route',durationMinutes:90}]},{bundle:b,classifyStop});
 expect(bad.reasonCode).toBe('experience_scope_unbound');expect(bad.creditedMinutes).toBe(0);
});
test('F/N: a source-linked route binding or separate route earns grounded credit',()=>{
 const b={evidence:[ev('Orientation House','visitor_center',{experienceRefs:['River Loop']}),ev('River Loop','walk')]};
 const r=experienceRole({...facility,executionBindings:[{evidenceRef:'River Loop',durationMinutes:90}]},{bundle:b,classifyStop});
 expect(r).toMatchObject({role:'primary_experience',roleSource:'grounded_experience_facet',creditedMinutes:90,experienceFacetRefs:['River Loop']});
 expect(experienceRole({name:'River Loop',type:'walk',duration:120},{bundle:b,classifyStop}).roleSource).not.toBe('model_prose');
});
test('latest accepted capture now fails day 3 before quality; actual role diagnostics for all days',async()=>{
 const f=require('./fixtures/scopeFidelity/captured.json');
 const result=await __testables.validateGeneration({output:{itineraryData:f.plan,structuredStatus:'complete',text:''},itinerary:true,bundle:f.bundle,constraints:{tripDays:4},userPrompt:'Give me four days in Zion.',detectContradiction:()=>[],finalizeItinerary:require('../finalizeItinerary').finalizeStructuredItinerary});
 expect(result.status).toBe('fail');expect(result.stage).toBe('itinerary_completeness');expect(result.reasonCodes).toContain('experience_scope_unbound');
 expect(result.actionability.affectedDays).toContain(3);expect(result.retryability).toBe('model_fixable');
 const days=result.experienceDiagnostics.actionability;
 expect(days[0].entries.map(e=>e.role)).toEqual(['supporting_experience','primary_experience']);
 expect(days[1].entries[0].groundedExecutionScope).toBe('ROUTE_BOUNDED');
 expect(days[2].entries[0].creditedMinutes).toBe(0);
 expect(days[3].entries.every(e=>e.role==='primary_experience')).toBe(true);
 expect(days.flatMap(d=>d.entries).every(e=>e.roleSource!=='model_prose')).toBe(true);
 console.info('SCOPE_CAPTURE_REPLAY',JSON.stringify({status:result.status,stage:result.stage,reasonCodes:result.reasonCodes,retryability:result.retryability,affectedDays:result.actionability.affectedDays,candidateCount:result.eligibleCandidateCount,days}));
});
