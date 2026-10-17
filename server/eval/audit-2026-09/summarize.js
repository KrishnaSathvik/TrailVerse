'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {bindGeneratedItineraryContract}=require('../../src/utils/generationContractBinding');
const {isValidToolItinerary,diagnoseToolItineraryShape}=require('../../src/utils/itineraryToolSchema');
const OUT=path.resolve(__dirname,'../../../docs/eval/trailie-audit-2026-09-23');
const rows=fs.readFileSync(path.join(OUT,'TRAILIE_MODEL_BENCHMARK_RAW.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const q=(xs,p)=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.ceil(p*a.length)-1)]:null;};
const avg=xs=>{const a=xs.filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null;};
const textOf=r=>[r.answer,r.structured_plan?.intro,...(r.structured_plan?.narrativeSections||[]).map(s=>s.markdown)].filter(Boolean).join('\n');
const derived=rows.map(r=>{
  const normalized=r.structured_plan?bindGeneratedItineraryContract({itineraryData:r.structured_plan}):null;
  const text=textOf(r); const stops=normalized?.days?.flatMap(d=>d.stops||[])||[];
  return {...r,bound_schema_valid:normalized?isValidToolItinerary(normalized):null,bound_schema_diagnostics:normalized?diagnoseToolItineraryShape(normalized):null,empty_days:normalized?.days?.filter(d=>!d.stops?.length).length??null,stops:stops.length,coordinate_stops:stops.filter(s=>Number.isFinite(s.latitude)&&Number.isFinite(s.longitude)).length,drive_stops:stops.filter(s=>Number.isFinite(s.drivingTimeFromPreviousMin)).length,heading_count:(text.match(/^#{1,6}\s/gm)||[]).length,generic_phrase_count:(text.match(/here are some options|based on your preferences|i.d be happy to|would you like me to/gi)||[]).length,refusal_review_needed:!!r.refusal||/\b(?:can.t|cannot|couldn.t|unable to|not able to)\b/i.test(text),display_text_length:text.length};
});
fs.writeFileSync(path.join(OUT,'normalized-analysis.json'),JSON.stringify(derived,null,2));
const groups=new Map();
for(const r of derived){const key=[r.phase,r.task_class,r.model,r.reasoning_effort].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
const summaries=[...groups.values()].map(g=>({mode:'controlled',phase:g[0].phase,task_class:g[0].task_class,model:g[0].model,reasoning_effort:g[0].reasoning_effort,n:g.length,completed:g.filter(r=>!r.error&&r.completion_status==='completed').length,provider_errors:g.filter(r=>r.error).length,structured_n:g.filter(r=>r.structured_output_valid!==null).length,raw_schema_pass:g.filter(r=>r.structured_output_valid===true).length,bound_schema_pass:g.filter(r=>r.bound_schema_valid===true).length,ttft_p50_ms:q(g.map(r=>r.time_to_first_token),.5),ttft_p95_ms:q(g.map(r=>r.time_to_first_token),.95),latency_p50_ms:q(g.map(r=>r.total_latency),.5),latency_p95_ms:q(g.map(r=>r.total_latency),.95),avg_input_tokens:avg(g.map(r=>r.input_tokens)),avg_output_tokens:avg(g.map(r=>r.output_tokens)),cost_usd:g.reduce((a,r)=>a+(r.estimated_model_cost||0),0),unpriced_calls:g.filter(r=>r.estimated_model_cost==null).length,provider_refusals:g.filter(r=>r.refusal).length,refusal_review_candidates:g.filter(r=>r.refusal_review_needed).length,generic_phrase_count:g.reduce((a,r)=>a+r.generic_phrase_count,0),avg_heading_count:avg(g.map(r=>r.heading_count)),retry_count:0,repair_count:0,hard_invariant_pass_rate:null,companion_score:null,adaptive_response_shape_score:null,cost_per_successful_trip:null}));
const cols=Object.keys(summaries[0]||{}),csv=x=>x==null?'':`"${String(x).replace(/"/g,'""')}"`;
fs.writeFileSync(path.join(OUT,'TRAILIE_MODEL_BENCHMARK_SUMMARY.csv'),cols.join(',')+'\n'+summaries.map(r=>cols.map(k=>csv(r[k])).join(',')).join('\n')+'\n');
fs.writeFileSync(path.join(OUT,'refusal-review.json'),JSON.stringify(derived.filter(r=>r.refusal_review_needed).map(r=>({run_id:r.run_id,scenario_id:r.scenario_id,text:textOf(r),appropriate:null,stable_answer_possible:null,only_live_missing:null,provisional_guidance_possible:null,refusal_required:null})),null,2));
// Stable packet once made; never overwrite a reviewer's labels with a new shuffle.
const packetPath=path.join(OUT,'BLINDED_REVIEW_PACKET.json');
if(!fs.existsSync(packetPath)){
 const manifest=JSON.parse(fs.readFileSync(path.join(OUT,'TRAILIE_MODEL_EVAL_CASES.json'))).cases;
 const selected=derived.filter(r=>['gpt-5.6-terra','gpt-6-luna','gpt-6-sol','gpt-6-astra'].includes(r.model)&&((r.phase==='smoke'&&['A01','D02'].includes(r.scenario_id))||(r.phase==='full'&&r.scenario_id==='E01'))&&r.run_id.endsWith('-1'));
 const packet=[],key=[];
 for(const scenario of ['A01','D02','E01']){
  const group=selected.filter(r=>r.scenario_id===scenario).map(r=>({r,k:crypto.randomBytes(8).toString('hex')})).sort((a,b)=>a.k.localeCompare(b.k));
  group.forEach(({r},i)=>{const label=`${scenario}-${String.fromCharCode(65+i)}`;packet.push({label,scenario:manifest.find(c=>c.scenario_id===scenario)?.user_request,trip_context:null,evidence:'Frozen empty evidence bundle: current live facts unverified',output:r.answer,plan:r.structured_plan,deterministic:{bound_schema_valid:r.bound_schema_valid,hard_invariants:'not measured in controlled generation'},scores:null});key.push({label,run_id:r.run_id,model:r.model,latency_ms:r.total_latency,cost_usd:r.estimated_model_cost});});
 }
 fs.writeFileSync(packetPath,JSON.stringify(packet,null,2));fs.writeFileSync(path.join(OUT,'BLINDED_REVIEW_KEY.json'),JSON.stringify(key,null,2));
}
console.log(JSON.stringify({calls:rows.length,cost:rows.reduce((a,r)=>a+(r.estimated_model_cost||0),0),groups:summaries.length,errors:rows.filter(r=>r.error).length,refusal_review:derived.filter(r=>r.refusal_review_needed).length}));
