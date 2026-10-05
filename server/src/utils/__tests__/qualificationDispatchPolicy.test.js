'use strict';
const {createQualificationDispatchPolicy,harnessBlockTelemetry}=require('../qualificationDispatchPolicy');
const primary=p=>p.authorize({model:'gpt-6-sol',purpose:'primary_generation'});
const repair=(p,purpose)=>p.authorize({model:'gpt-6-sol',purpose});
test('J/K: identity and coverage may consume the two distinct family allowances',()=>{
 const p=createQualificationDispatchPolicy();primary(p);repair(p,'legal_stop_substitution_repair');
 expect(repair(p,'insufficient_day_coverage_repair').remainingFocusedRepairs).toBe(0);
 expect(()=>repair(p,'trip_quality_repair')).toThrow('qualification_harness_block:focused_repair_cap');
});
test('coverage and quality aliases cannot dispatch the same operator twice',()=>{
 const p=createQualificationDispatchPolicy();primary(p);repair(p,'insufficient_day_coverage_repair');expect(()=>repair(p,'trip_quality_repair')).toThrow('same_operator_repeat');
});
test.each(['primary_generation','retry','unknown','insufficient_day_coverage_repair'])('blocks regeneration, unknown purpose or repeated family: %s',purpose=>{
 const p=createQualificationDispatchPolicy();primary(p);repair(p,'insufficient_day_coverage_repair');expect(()=>repair(p,purpose)).toThrow('qualification_harness_block');
});
test('L/M: harness denial is deterministic, never a provider outage or sent request',()=>{
 const p=createQualificationDispatchPolicy();primary(p);let sent=0;
 try {p.authorize({model:'gpt-6-astra',purpose:'trip_quality_repair'});sent++;}catch(e){expect(harnessBlockTelemetry(e)).toMatchObject({dispatched:false,mergeStatus:'qualification_harness_block',retryability:'deterministic_blocker'});}
 expect(sent).toBe(0);expect(harnessBlockTelemetry(new Error('provider failed'))).toBeNull();
});
