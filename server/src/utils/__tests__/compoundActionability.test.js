'use strict';
const {normalizeCompoundVisits,sameAnchorRelationship,areaActionability}=require('../visitExperienceSemantics');
const {resolveStopIdentities}=require('../stopIdentityResolution');
const {evaluateDayValue}=require('../semanticDayValue');
const {classifyStop,evaluateItineraryCompleteness}=require('../itineraryCompleteness');
const {evaluateTripExperienceQuality}=require('../tripExperienceQuality');
const evidence={evidenceId:'hall',topic:'activities',claim:{text:'Heritage Hall has indoor exhibits and views of Eastern Cliffs outside.',normalizedValue:{name:'Heritage Hall',type:'museum',activityTypes:['exhibits']}}};
const bundle={evidence:[evidence]};
const facets=()=>[{id:'inside',name:'Heritage Hall',type:'museum',duration:90,note:'Explore indoor exhibits.',timeWindow:'Morning'},
 {id:'outside',name:'Eastern Cliffs views outside Heritage Hall',type:'viewpoint',duration:30,note:'View Eastern Cliffs outside.',timeWindow:'Late morning'}];
function normalize(stops=facets()) {
 const resolved=resolveStopIdentities({itineraryData:{days:[{dayNumber:1,stops}]},evidenceBundle:bundle});
 return normalizeCompoundVisits({itineraryData:resolved.itineraryData,bundle});
}
test('A/I: supported adjacent interior and exterior facets deterministically become one visit',()=>{
 const n=normalize();const s=n.itineraryData.days[0].stops;
 expect(s).toHaveLength(1);expect(s[0].duration).toBe(120);expect(s[0].compoundVisit.distinctExperienceCount).toBe(1);
 expect(s[0].compoundVisit.facets).toHaveLength(2);
 expect(evaluateItineraryCompleteness({itineraryData:n.itineraryData,evidenceBundle:bundle}).reasonCodes).not.toContain('duplicate_base_experience');
 expect(evaluateTripExperienceQuality({itineraryData:n.itineraryData,bundle}).diagnostics.days[0].primaryExperienceIdentities).toHaveLength(1);
 expect(n.relationships[0].relationship).toBe('COMPOUND_SAME_VISIT');
});
test('B: rewritten copies of the same interior remain redundant',()=>{
 const f=facets();f[1]={...f[0],id:'copy',note:'Browse the exhibits again.'};
 const n=normalize(f);expect(n.itineraryData.days[0].stops).toHaveLength(2);
 expect(n.relationships[0].relationship).toBe('REDUNDANT_DUPLICATE');
 expect(evaluateItineraryCompleteness({itineraryData:n.itineraryData,evidenceBundle:bundle}).reasonCodes).toContain('duplicate_base_experience');
});
test('C: separate supported purpose in a later visit is not merged',()=>{
 const f=facets();f[1].timeWindow='Sunset';const n=normalize(f);
 expect(n.itineraryData.days[0].stops).toHaveLength(2);expect(n.relationships[0].relationship).toBe('DISTINCT_REVISIT');
 expect(sameAnchorRelationship(...n.itineraryData.days[0].stops,{sameDay:false})).toBe('DISTINCT_REVISIT');
 expect(evaluateItineraryCompleteness({itineraryData:n.itineraryData,evidenceBundle:bundle}).reasonCodes).not.toContain('duplicate_base_experience');
});
test('compound visits cannot sum overlapping clock intervals or erase different safety facts',()=>{
 const f=facets();f[0].startTime='09:00';f[1].startTime='10:00';
 expect(normalize(f).itineraryData.days[0].stops[0].duration).toBe(90);
 f[0].exposureLevel='low';f[1].exposureLevel='high';expect(normalize(f).itineraryData.days[0].stops).toHaveLength(2);
});
test('unsupported exterior subjects cannot manufacture compound value',()=>{
 const f=facets();f[1].name='Invented Pinnacles views outside Heritage Hall';
 expect(normalize(f).itineraryData.days[0].stops).toHaveLength(2);
});
const area={name:'Northern District',canonicalPlaceName:'Northern District',type:'area',experienceKind:'area',evidenceRef:'area',duration:180,note:'Explore the area and ask locally where to go.'};
const areaBundle={evidence:[{evidenceId:'area',topic:'activities',claim:{text:'Northern District is a geographic area.',normalizedValue:{name:'Northern District',type:'area'}}}]};
test.each([120,180,600])('D/F: %i minutes cannot rescue vague area planning deferral',duration=>{
 const s={...area,duration};expect(areaActionability(s,areaBundle).reasonCode).toBe('experience_not_actionable');
 const v=evaluateDayValue({day:{stops:[s]},bundle:areaBundle,classifyStop,minimumMinutes:90});expect(v.ok).toBe(false);expect(v.primaryMinutes).toBe(0);
 expect(evaluateItineraryCompleteness({itineraryData:{days:[{dayNumber:1,stops:[s]}]},evidenceBundle:areaBundle}).reasonCodes).toContain('experience_not_actionable');
});
test('E: an evidence-defined district route is a valid broad-area primary',()=>{
 const b=JSON.parse(JSON.stringify(areaBundle));b.evidence[0].claim.normalizedValue.experienceExecution={action:'Walk',scope:'Signed loop between the river and old town walls'};
 const s={...area,note:'Walk the signed loop between the river and old town walls.'};
 expect(areaActionability(s,b)).toMatchObject({actionable:true,executionEvidence:'area'});
 expect(evaluateDayValue({day:{stops:[s]},bundle:b,classifyStop,minimumMinutes:90}).ok).toBe(true);
});

test('captured failure: one compound first-day visit, non-actionable second day, seasonal fourth day',()=>{
 const captured=require('./fixtures/compoundCapturedFailure.json');const b={evidence:captured.evidence};
 const r=resolveStopIdentities({itineraryData:captured.plan,evidenceBundle:b});
 const n=normalizeCompoundVisits({itineraryData:r.itineraryData,bundle:b});
 expect(n.itineraryData.days[0].stops).toHaveLength(1);
 expect(n.itineraryData.days[0].stops[0]).toMatchObject({duration:120,compoundVisit:{distinctExperienceCount:1}});
 expect(areaActionability(n.itineraryData.days[1].stops[1],b).reasonCode).toBe('experience_not_actionable');
 const q=evaluateTripExperienceQuality({itineraryData:n.itineraryData,bundle:b});
 expect(q.reasonCodes).toContain('conditional_primary_unsupported');
 expect(q.diagnostics.days.find(d=>d.dayNumber===4).conditionalStatus).toBe('PRIMARY_CONDITIONAL_UNSUPPORTED');
});

test('area action must follow the source-defined scope, not a fabricated route',()=>{
 const b=JSON.parse(JSON.stringify(areaBundle));b.evidence[0].claim.normalizedValue.experienceExecution={action:'Walk',scope:'Signed riverside loop'};
 expect(areaActionability({...area,note:'Walk the invented mountain traverse.'},b).actionable).toBe(false);
});
