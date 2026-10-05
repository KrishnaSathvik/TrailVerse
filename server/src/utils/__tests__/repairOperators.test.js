'use strict';
const {buildPlanViabilitySnapshot,applyPlanViabilityRepair,shapeOperation}=require('../planViabilityRepair');
const {candidatePool}=require('../downstreamRepairPlanner');
const {createQualificationDispatchPolicy}=require('../qualificationDispatchPolicy');
const {OPERATORS}=require('../repairOperators');
const {compactRepairContext}=require('../compactRepairContext');
const ev=(name,type='walk',extra={})=>({evidenceId:name,topic:'activities',evidenceType:'fact',claim:{text:name,normalizedValue:{name,type,activityTypes:[type],...extra}}});
const stop=(name,type='walk',duration=120,extra={})=>({name,type,duration,...extra});
const bundle={evidence:[ev('Seasonal Hall','museum',{seasonal:true}),ev('Service Desk','visitor_center'),ev('Brief Route','walk',{maxVisitDurationMinutes:30}),...['East Route','West Route','North Route','South Route','Long Route'].map(n=>ev(n,'walk',{maxVisitDurationMinutes:180}))]};
const plan={days:[{dayNumber:1,stops:[stop('Seasonal Hall','museum')]},{dayNumber:2,stops:[stop('Service Desk','visitor_center',30)]},{dayNumber:3,stops:[stop('Brief Route','walk',30)]},{dayNumber:4,stops:[stop('Seasonal Hall','museum')]}]};
const context={bundle};
const snapshot=()=>buildPlanViabilitySnapshot({plan,context});
function selectDistinct(s){const used=new Set();return s.scopes.map(scope=>{const target=s.repairPool.byScope.find(t=>t.dayNumber===scope.dayNumber && t.operation==='replace_stop' && t.eligibleCandidateRefs.some(r=>!used.has(r)));const ref=target.eligibleCandidateRefs.find(r=>!used.has(r));used.add(ref);const c=s.candidates.find(c=>c.ref===ref);return {op:'replace_stop',dayNumber:scope.dayNumber,stopIndex:target.stopIndex,placeRef:ref,durationMinutes:c.maxDurationMinutes,note:'Walk the route.',why:'Time outdoors.'};});}
test('A/B/C: independent reasons coalesce into one operator with legal bounded targets',()=>{
 const s=snapshot();expect(s.ok).toBe(true);expect(s.repairOperator).toBe(OPERATORS.VIABILITY);expect(s.affectedDays).toEqual([1,2,3,4]);
 expect(s.reasonCodes).toEqual(expect.arrayContaining(['conditional_primary_unsupported','insufficient_day_coverage']));
 expect(s.scopes.find(d=>d.dayNumber===4).coverageReasonCode).toBe('repetitive_experience');
 const r=applyPlanViabilityRepair({plan,snapshot:s,operations:selectDistinct(s)});expect(r.ok).toBe(true);expect(r.applied).toBe(4);expect(r.progress.scopesStillFailing).toEqual([]);
});
test('H/I: incomplete scopes and cross-scope collisions reject the entire transaction',()=>{
 const s=snapshot();const operations=selectDistinct(s);const frozen=JSON.stringify(plan);
 expect(applyPlanViabilityRepair({plan,snapshot:s,operations:operations.slice(0,2)})).toMatchObject({ok:false,reasonCodes:['repair_projected_validation_failed']});
 expect(applyPlanViabilityRepair({plan,snapshot:s,operations:operations.map(o=>({...o,placeRef:operations[0].placeRef}))}).ok).toBe(false);
 expect(JSON.stringify(plan)).toBe(frozen);
});
test('one operation per day, unrelated valid stops and valid days are frozen',()=>{
 const p={days:[...plan.days,{dayNumber:5,stops:[stop('Long Route')]}]};const s=buildPlanViabilitySnapshot({plan:p,context});const ops=selectDistinct(s);
 expect(applyPlanViabilityRepair({plan:p,snapshot:s,operations:[...ops,ops[0]]}).reasonCodes).toContain('viability_operation_budget');
 expect(applyPlanViabilityRepair({plan:p,snapshot:s,operations:[{...ops[0],dayNumber:5}]}).reasonCodes).toContain('viability_frozen_scope');
 const r=applyPlanViabilityRepair({plan:p,snapshot:s,operations:ops});expect(r.ok).toBe(true);expect(r.plan.days[4]).toEqual(p.days[4]);
});
test('G: changing an earlier thin stop restores independent value and conditional robustness elsewhere',()=>{
 const p={days:[{dayNumber:1,stops:[stop('East Route','walk',20)]},{dayNumber:2,stops:[stop('Long Route')]},{dayNumber:3,stops:[stop('Seasonal Hall','museum'),stop('East Route')]}]};
 const s=buildPlanViabilitySnapshot({plan:p,context});expect(s.affectedDays).toEqual([1,3]);
 const t=s.repairPool.byScope.find(t=>t.dayNumber===1 && t.operation==='replace_stop' && t.eligibleCandidateRefs.length);
 const used=new Set(p.days.flatMap(d=>d.stops.map(s=>s.name)));
 const c=s.candidates.find(c=>t.eligibleCandidateRefs.includes(c.ref) && !used.has(c.canonicalName));
 const r=applyPlanViabilityRepair({plan:p,snapshot:s,operations:[{op:t.operation,dayNumber:1,stopIndex:t.stopIndex,placeRef:c.ref,durationMinutes:c.maxDurationMinutes,note:'Walk.',why:'Scenery.'}]});
 expect(r.ok).toBe(true);expect(r.progress.scopesIndirectlyResolved).toEqual([3]);expect(r.plan.days[2]).toEqual(p.days[2]);
});
test('J: shared candidate ref is legal when existing grounded distinct-revisit semantics prove both uses',()=>{
 const b={evidence:[ev('River Path','walk',{maxVisitDurationMinutes:180,experienceSubjects:[{name:'River birds',activityType:'photography',timeContexts:['sunset']}]})]};
 const p={days:[{dayNumber:1,stops:[stop('River Path','walk',20,{timeWindow:'Morning',evidenceRef:'River Path'})]},{dayNumber:2,stops:[stop('River Path','photography',20,{timeWindow:'Evening',timeContext:'sunset',evidenceRef:'River Path',subjectEvidenceRef:'River Path',experienceSubject:'River birds',resolutionStatus:'resolved'})]}]};
 const s=buildPlanViabilitySnapshot({plan:p,context:{bundle:b}});expect(s.ok).toBe(true);
 const ops=[1,2].map(dayNumber=>{const t=s.repairPool.byScope.find(t=>t.dayNumber===dayNumber && t.operation==='deepen_stop');return {op:'deepen_stop',dayNumber,stopIndex:0,placeRef:t.eligibleCandidateRefs[0],durationMinutes:180,note:'Explore.',why:'An outing.'};});
 expect(ops[0].placeRef).toBe(ops[1].placeRef);expect(applyPlanViabilityRepair({plan:p,snapshot:s,operations:ops}).ok).toBe(true);
});
test('F: identity does not spend into a second-stage universe with no eligible completion',()=>{
 const b={evidence:[ev('Short View','viewpoint',{maxVisitDurationMinutes:20}),ev('Other Short View','viewpoint',{maxVisitDurationMinutes:20})]};
 const p={days:[{dayNumber:1,stops:[stop('Unknown View','viewpoint',20)]},{dayNumber:2,stops:[stop('Other Short View','viewpoint',20)]}]};
 const c={ref:1,canonicalName:'Short View',canonicalType:'viewpoint',evidenceIds:['Short View']};
 const pool=candidatePool({plan:p,targets:[{dayNumber:1,stopIndex:0}],candidates:[c],context:{bundle:b},identity:true,viabilityAvailable:true,focusedRepairBudgetRemaining:2,
 followupPossible:(plan,projection)=>buildPlanViabilitySnapshot({plan,projection,context:{bundle:b},existenceOnly:true})});
 expect(pool.ok).toBe(false);expect(pool.byScope[0].options[0].followupUniverseAvailable).toBe(false);
});
test('K: compact shared registry has one card per ref and reason-specific scopes',()=>{
 const s=snapshot();const c=compactRepairContext({quality:s,plan,bundle});
 expect(new Set(c.context.candidates.map(c=>c.ref)).size).toBe(c.context.candidates.length);
 expect(c.context.candidateEligibility.every(t=>Array.isArray(t.eligibleCandidateRefs))).toBe(true);
 expect(JSON.stringify(c.context)).not.toMatch(/normalizedValue|accessEligibility|EvidenceBundle/);
});
test('D/L/M: aliases share one operator allowance; unknown, repeated, third, regeneration and Astra denied',()=>{
 const p=createQualificationDispatchPolicy();p.authorize({model:'gpt-6-sol',purpose:'primary_generation'});p.authorize({model:'gpt-6-sol',purpose:'legal_stop_substitution_repair'});p.authorize({model:'gpt-6-sol',purpose:'plan_viability_repair'});
 expect(p.snapshot().repairOperators).toEqual([OPERATORS.IDENTITY,OPERATORS.VIABILITY]);expect(p.snapshot().remainingFocusedRepairs).toBe(0);
 for(const purpose of ['trip_quality_repair','plan_viability_repair','unknown','primary_generation'])expect(()=>p.authorize({model:'gpt-6-sol',purpose})).toThrow();
 const q=createQualificationDispatchPolicy();q.authorize({model:'gpt-6-sol',purpose:'primary_generation'});q.authorize({model:'gpt-6-sol',purpose:'insufficient_day_coverage_repair'});
 expect(q.snapshot().remainingFocusedRepairs).toBe(1);expect(()=>q.authorize({model:'gpt-6-sol',purpose:'trip_quality_repair'})).toThrow('same_operator_repeat');expect(()=>q.authorize({model:'gpt-6-astra',purpose:'plan_viability_repair'})).toThrow();
});

test('evidence duration cannot raise the shared structural stop-duration ceiling',()=>{
 const max=require('../dayContainedCoverageRepair').MAX_STOP_DURATION_MINUTES;
 const s=snapshot();const c={...s.candidates[0],maxDurationMinutes:max+1};
 const result=shapeOperation(plan,s.scopes[0],{op:'replace_stop',stopIndex:0,placeRef:c.ref,durationMinutes:max+1,note:'Walk.',why:'Scenery.'},[c]);
 expect(result).toMatchObject({ok:false,reasonCodes:['viability_malformed_operation']});
});
