'use strict';

// Isolated model experiment. Imports current prompt/tool contracts without editing them.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildTrailiePromptV2 } = require('../../src/prompts/trailiePromptV2');
const { createResponsesRequest } = require('../../src/services/responsesAdapter');
const { createOpenAIResponsesAdapter } = require('../../src/services/providers/openaiResponsesAdapter');
const { getCreateItineraryTool, isValidToolItinerary } = require('../../src/utils/itineraryToolSchema');
const { __testables } = require('../../src/services/trailieV2ExecutionService');
const { classifyTrailieIntent } = require('../../src/services/trailieIntentClassifier');
const { selectTrailieModelRoute } = require('../../src/config/trailieModelRouter');
const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(ROOT, 'docs/eval/trailie-audit-2026-09-23');
const MODELS = ['gpt-5.6-luna','gpt-5.6-terra','gpt-5.6-sol','gpt-6-luna','gpt-6-sol','gpt-6-astra'];
// Standard USD/MTok, official model pages checked 2026-09-23. Short context only.
const PRICES = [[.2,.02,1.2],[2,.2,12],[4,.4,20],[.1,.01,.5],[2,.2,10],[10,1,50]];
const hash = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rates = m => PRICES[MODELS.indexOf(m)];
function cost(model, u) {
  if (u?.inputTokens == null || u?.outputTokens == null) return null;
  const [input,cached,output] = rates(model);
  const reads = u.cachedInputTokens || 0, writes = u.cacheCreationInputTokens || 0;
  return (Math.max(0,u.inputTokens-reads-writes)*input+reads*cached+writes*input*1.25+u.outputTokens*output)/1e6;
}
function prepare(c) {
  const itinerary = ['D','E','L'].includes(c.task_class) && !/Where should I stop/.test(c.user_request);
  const mode = c.task_class === 'B' ? 'compare' : itinerary ? 'architect' : c.task_class === 'I' ? 'live' : 'buddy';
  const evidence = {bundleId:`audit:${c.scenario_id}`,evidence:[],resolutions:[]};
  // Empty immutable evidence is deliberate: never attach Yosemite facts to another destination.
  const tripState = null;
  const prompt = buildTrailiePromptV2({mode,evidenceBundle:evidence,tripState,userRequest:c.user_request});
  const classification = classifyTrailieIntent({userPrompt:c.user_request});
  const route = selectTrailieModelRoute({intent:classification.primaryIntent,depth:classification.depth,evidenceCompleteness:'partial',tripDays:0,destinationCount:1,verticalCount:1,hardConstraintCount:0});
  const effort = itinerary || c.task_class === 'E' ? 'medium' : 'low';
  const tools = itinerary ? [getCreateItineraryTool({reduced:true,strict:false,bindParkIdentity:false,bindCoordinates:false})] : [];
  const maxOutputTokens = __testables.resolveOutputBudget({itinerary,tier:effort === 'medium' ? 'terra_medium' : 'terra_low'}).requestMaxOutputTokens;
  return {c,itinerary,mode,prompt,evidence,tripState,route,effort,tools,maxOutputTokens,
    input_hash:hash({prompt,tools,tripState,evidence}),prompt_version:hash(prompt)};
}
function requestFor(p, model) {
  return createResponsesRequest({provider:'openai',model,instructions:'',input:[{role:'user',content:p.prompt.privateSuffix}],maxOutputTokens:p.maxOutputTokens,tools:p.tools,reasoning:{effort:p.effort},promptCaching:{mode:'explicit',ttl:'30m',publicPrefix:p.prompt.publicPrefix}});
}
function upperBound(p,model) {
  // UTF-8 byte count bounds prompt tokens conservatively, plus framing allowance.
  const bytes = Buffer.byteLength(JSON.stringify(requestFor(p,model))) + 2048;
  const [input,,output] = rates(model);
  return (bytes*input*1.25+p.maxOutputTokens*output)/1e6;
}
async function main() {
  const phase = process.argv.includes('--full') ? 'full' : 'smoke';
  const live = process.argv.includes('--live');
  const cap = Number(process.env.TRAILIE_AUDIT_BUDGET_USD || 25);
  if (!Number.isFinite(cap) || cap <= 0) throw new Error('invalid_budget');
  const all = JSON.parse(fs.readFileSync(path.join(OUT,'TRAILIE_MODEL_EVAL_CASES.json'))).cases;
  const selected = all.filter(c => phase === 'smoke' ? ['A01','D02'].includes(c.scenario_id) : ['A','B','C','D','E','I','K','L'].includes(c.task_class));
  const prepared = selected.map(prepare);
  const jobs = [];
  for (let rep=1;rep<=3;rep++) for (const p of prepared) for (const model of MODELS) {
    if (phase === 'full' && model === 'gpt-6-astra' && !['D01','E01','E02'].includes(p.c.scenario_id)) continue;
    jobs.push({p,model,rep});
  }
  const rawPath=path.join(OUT,'TRAILIE_MODEL_BENCHMARK_RAW.jsonl');
  const previous=fs.existsSync(rawPath)?fs.readFileSync(rawPath,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  // Charge unknown outcomes at reserved ceiling; do not assume errored calls were free.
  let spent=previous.filter(x=>x.mode==='controlled').reduce((a,r)=>a+(r.estimated_model_cost??r.reserved_cost_usd??0),0);
  const planned=jobs.reduce((a,j)=>a+upperBound(j.p,j.model),0);
  const preflight={phase,jobs:jobs.length,scenarios:selected.length,repetitions:3,conservative_max_usd:planned,budget_usd:cap,previous_reserved_or_measured_usd:spent,live};
  console.log(JSON.stringify(preflight));
  fs.writeFileSync(path.join(OUT,`controlled-${phase}-preflight.json`),JSON.stringify(preflight,null,2));
  if (!live) return;
  require('../../node_modules/dotenv').config({path:path.join(ROOT,'server/.env')});
  const OpenAI=require('openai');
  const adapter=createOpenAIResponsesAdapter({client:new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:90000})});
  let failures=0, reserved=0, cursor=0, stopped=false;
  async function runJob({p,model,rep}) {
    const run_id=`controlled-${phase}-${p.c.scenario_id}-${model}-${rep}`;
    if (previous.some(r=>r.run_id===run_id)) return;
    const reserve=upperBound(p,model);
    if (spent+reserved+reserve>cap) {console.log(JSON.stringify({status:'budget_stop',spent,next_reserve:reserve}));stopped=true;return;}
    reserved+=reserve;
    const started=Date.now(); let ttft=null,result=null,error=null;
    try {result=await adapter.stream(requestFor(p,model),{onEvent:event=>{if(ttft==null && ['text_delta','tool_argument_delta'].includes(event.type))ttft=Date.now()-started;}});} catch(e){error={code:e.code||'provider_error',http_status:e.status||null};}
    const measured=cost(model,result?.usage); reserved-=reserve;spent+=measured??reserve;
    const tool=result?.toolCalls?.find(t=>t.name==='create_itinerary');
    const structured=p.itinerary ? !!tool && isValidToolItinerary(tool.input) : null;
    const row={timestamp:new Date().toISOString(),mode:'controlled',phase,scenario_id:p.c.scenario_id,run_id,conversation_id:null,task_class:p.c.task_class,model,provider:'openai',endpoint:'responses',reasoning_effort:p.effort,prompt_version:p.prompt_version,comparison_input_hash:p.input_hash,baseline_route:p.route,trip_hash_before:null,trip_hash_after:null,input_tokens:result?.usage?.inputTokens??null,cached_input_tokens:result?.usage?.cachedInputTokens??null,cache_write_tokens:result?.usage?.cacheCreationInputTokens??null,reasoning_tokens:result?.usage?.reasoningTokens??null,output_tokens:result?.usage?.outputTokens??null,total_tokens:result?.usage?.inputTokens!=null?result.usage.inputTokens+result.usage.outputTokens:null,estimated_model_cost:measured,reserved_cost_usd:reserve,tool_calls:result?.toolCalls?.length??null,retrieval_calls:0,search_calls:0,time_to_first_token:ttft,total_latency:Date.now()-started,structured_output_valid:structured,retry_count:0,repair_count:0,escalation_count:0,validator_pass:null,validator_failure_codes:[],mutation_requested:false,allowed_mutation_scope:null,actual_mutation_scope:null,scope_violation:null,plan_hash_match:null,map_hash_match:null,route_hash_match:null,warnings_hash_match:null,logistics_hash_match:null,refusal:result?.refusal||null,refusal_reason:result?.refusal||null,answer_length:result?.outputText?.length??null,error,completion_status:result?.completionStatus??null,provider_reported_model:result?.providerReportedModel??null,answer:result?.outputText??null,structured_plan:tool?.input??null,companion_scores:null,adaptive_response_shape_score:null};
    fs.appendFileSync(rawPath,JSON.stringify(row)+'\n');
    console.log(JSON.stringify({run_id,error,completion:row.completion_status,cost:measured,spent}));
    failures=error?failures+1:0;
    if(failures>=3){console.log('stopped_after_three_provider_errors');stopped=true;}
  }
  const concurrency=phase==='full'?4:1;
  await Promise.all(Array.from({length:concurrency},async()=>{while(!stopped&&cursor<jobs.length){await runJob(jobs[cursor++]);}}));
}
if(require.main===module)main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
module.exports={prepare,requestFor,cost,upperBound,MODELS};
