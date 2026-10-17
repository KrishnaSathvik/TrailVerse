'use strict';
const { candidatePool, projectPlan, progress, selectionAllowed } = require('../downstreamRepairPlanner');
const { applyQualityReplacements } = require('../focusedTripQualityRepair');
const { compactRepairContext } = require('../compactRepairContext');
const { createQualificationDispatchPolicy } = require('../qualificationDispatchPolicy');
const ev = (name, extra = {}) => ({ evidenceId: name, topic: 'activities', evidenceType: 'fact', claim: { text: name, normalizedValue: { name, type: 'walk', activityTypes: ['walk'], ...extra } } });
const stop = (name, duration = 120) => ({ name, type: 'walk', duration });
const plan = { days: [{ dayNumber: 1, stops: [stop('Original')] }, { dayNumber: 2, stops: [stop('Other')] }] };
const bundle = { evidence: [ev('Original'), ev('Other'), ev('Brief', { groundedDurationMinutes: 30 }), ev('Full'), ev('Seasonal', { seasonal: true })] };
const candidates = ['Brief','Full','Seasonal'].map((name,i) => ({ref:i+1, canonicalName:name, canonicalType:'walk', evidenceIds:[name], placeKey:name}));
const context = {bundle};
const build = extra => candidatePool({plan, targets:[{dayNumber:1,stopIndex:0}], candidates, context, identity:true, focusedRepairBudgetRemaining:2, coverageAvailable:true, ...extra});
test('A: self-sufficient alternative excludes the thin identity substitute',()=>{
 const pool=build();expect(pool.byScope[0].options[0].repairViability).toBe('REQUIRES_FOLLOWUP_FAMILY');
 expect(pool.byScope[0].eligibleCandidateRefs).toEqual([2]);expect(selectionAllowed(pool,1,0,1)).toBe(false);
});
test('B/C: follow-up requires both another slot and unused coverage family',()=>{
 const pool=build({candidates:candidates.slice(0,1)});expect(pool.ok).toBe(true);
 expect(pool.byScope[0].options[0].expectedFollowupFamily).toBe('coverage');
 expect(build({candidates:candidates.slice(0,1),focusedRepairBudgetRemaining:1}).ok).toBe(false);
 expect(build({candidates:candidates.slice(0,1),coverageAvailable:false}).ok).toBe(false);
});
test('context matters: a brief visit beside a substantial experience is sufficient',()=>{
 const pool=build({plan:{days:[{dayNumber:1,stops:[stop('Original'),stop('Other')]}]}});
 expect(pool.byScope[0].options[0].repairViability).toBe('SELF_SUFFICIENT');
});
test('conditional sole primary and repeated candidate cannot be self-sufficient',()=>{
 const pool=build({candidates:[candidates[2],{...candidates[1],canonicalName:'Other',evidenceIds:['Other']}]});
 expect(pool.byScope[0].options.every(o=>o.repairViability!=='SELF_SUFFICIENT')).toBe(true);
});
test('D/H: complete failure set and local progress while family remains elsewhere',()=>{
 const p={days:[1,2,3,4].map(n=>({dayNumber:n,stops:[stop(`Walk ${n}`,n===1?120:20)]}))};
 const before=projectPlan(p);expect(before.days.filter(d=>d.codes.includes('insufficient_day_coverage')).map(d=>d.dayNumber)).toEqual([2,3,4]);
 const next=JSON.parse(JSON.stringify(p));next.days[1].stops[0].duration=120;
 expect(progress(before,projectPlan(next),[2])).toMatchObject({targetedScopeResolved:true,globalFamilyStillPresent:true,regressions:[]});
});
test('E/I/L: scoped registry, bounded atomic operations, and combination collisions',()=>{
 const p={days:[{dayNumber:1,stops:[stop('Other')]},... [2,3,4].map(n=>({dayNumber:n,stops:[stop(`Weak ${n}`,20)]}))]};
 const cs=['Full','Extra','Last'].map((name,i)=>({...candidates[1],ref:i+1,canonicalName:name,evidenceIds:[name],placeKey:name}));
 const ctx={bundle:{evidence:[...bundle.evidence,ev('Extra'),ev('Last')]}};
 const pool=candidatePool({plan:p,targets:[2,3,4].map(dayNumber=>({dayNumber,stopIndex:0})),candidates:cs,context:ctx});
 const q={affectedDays:[2,3,4],frozenDayNumbers:[1],reasonCodes:['insufficient_day_coverage'],diagnostics:{days:[2,3,4].map(dayNumber=>({dayNumber,weakStopIndexes:[0]}))},candidates:cs,repairPool:pool,projectionContext:ctx};
 const ops=[2,3,4].map((dayNumber,i)=>({dayNumber,stopIndex:0,placeRef:i+1,durationMinutes:120,note:'Walk.',why:'Scenery.'}));
 const result=applyQualityReplacements(p,q,ops);expect(result.ok).toBe(true);expect(result.plan.days[0]).toEqual(p.days[0]);
 expect(applyQualityReplacements(p,q,ops.map(o=>({...o,placeRef:1}))).ok).toBe(false);
 expect(applyQualityReplacements(p,q,ops.slice(0,1)).ok).toBe(false);
 const compact=compactRepairContext({quality:q,plan:p,bundle:ctx.bundle});expect(compact.context.candidates).toHaveLength(3);
 expect(compact.context.candidateEligibility).toHaveLength(3);expect(JSON.stringify(compact.context)).not.toMatch(/EvidenceBundle|normalizedValue/);
});
test('G/M: same family and third family remain prohibited',()=>{
 const p=createQualificationDispatchPolicy();p.authorize({purpose:'primary_generation',model:'gpt-6-sol'});
 p.authorize({purpose:'legal_stop_substitution_repair',model:'gpt-6-sol'});p.authorize({purpose:'insufficient_day_coverage_repair',model:'gpt-6-sol'});
 expect(()=>p.authorize({purpose:'insufficient_day_coverage_repair',model:'gpt-6-sol'})).toThrow();
 expect(()=>p.authorize({purpose:'trip_quality_repair',model:'gpt-6-sol'})).toThrow();expect(p.snapshot().remainingFocusedRepairs).toBe(0);
});
test('F: an omitted day is allowed only when another replacement restores its repetition credit',()=>{
 const p={days:[{dayNumber:1,stops:[stop('Other')]},{dayNumber:2,stops:[stop('Original',20)]},{dayNumber:3,stops:[stop('Original')]}]};
 const pool=candidatePool({plan:p,targets:[{dayNumber:2,stopIndex:0},{dayNumber:3,stopIndex:0}],candidates:[candidates[1]],context});
 const q={affectedDays:[2,3],frozenDayNumbers:[1],reasonCodes:['insufficient_day_coverage'],diagnostics:{days:[2,3].map(dayNumber=>({dayNumber,weakStopIndexes:[0]}))},candidates:[candidates[1]],repairPool:pool,projectionContext:context};
 const result=applyQualityReplacements(p,q,[{dayNumber:2,stopIndex:0,placeRef:2,durationMinutes:120,note:'Walk.',why:'Scenery.'}]);
 expect(result.ok).toBe(true);expect(result.plan.days[2].stops[0].name).toBe('Original');
 expect(projectPlan(result.plan,context).reasonCodes).toEqual([]);
});
test('hard traveler constraints and missing source identity are ineligible before selection',()=>{
 const constraints={planningState:{mobility:{wheelchair:true}}};
 const candidate={...candidates[1],accessEligibility:{bundle,constraints}};
 const pool=build({candidates:[candidate],context:{bundle,constraints}});
 expect(pool.byScope[0].options[0]).toMatchObject({constraintEligible:false,repairViability:'INELIGIBLE'});
 expect(build({candidates:[{...candidates[1],evidenceIds:['missing']}]}).byScope[0].options[0].identityValid).toBe(false);
});
test('final repetition category uses traveler language without internal codes',()=>{
 const {failureCategoryFromCodes,buildArtifactNotAppliedMessage}=require('../../services/artifactFulfillment');
 expect(failureCategoryFromCodes(['excessive_trip_repetition'])).toBe('repetition_unresolved');
 expect(buildArtifactNotAppliedMessage('',{reasonCodes:['excessive_trip_repetition']})).toMatch(/distinct experiences/);
 expect(buildArtifactNotAppliedMessage('',{reasonCodes:['insufficient_day_coverage']})).not.toMatch(/ungrounded|scope_unbound/);
});
