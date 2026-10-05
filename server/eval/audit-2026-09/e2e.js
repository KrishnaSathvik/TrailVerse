'use strict';
// Real Express routes, real provider/retrieval boundaries, disposable Mongo only.
// The production database URI is never passed to Mongoose.
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const ROOT=path.resolve(__dirname,'../../..');
const OUT=path.join(ROOT,'docs/eval/trailie-audit-2026-09-23');
const executionId=crypto.randomUUID();
const append=row=>fs.appendFileSync(path.join(OUT,'e2e-raw.jsonl'),JSON.stringify({timestamp:new Date().toISOString(),execution_id:executionId,...row})+'\n');
async function main(){
  process.chdir(path.join(ROOT,'server'));
  require('dotenv').config({path:path.join(ROOT,'server/.env')});
  const {MongoMemoryServer}=require('mongodb-memory-server');
  const mongoose=require('mongoose');
  const mongo=await MongoMemoryServer.create({instance:{ip:'127.0.0.1',dbName:'trailie_audit_20260923'}});
  process.env.MONGODB_URI=mongo.getUri();
  process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');
  process.env.TRAILIE_V2_RUNTIME_ENABLED='true';
  process.env.TRAILIE_REVIEW_WORKER_ENABLED='false';
  process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED='false';
  let reserved=0;
  const cap=Number(process.env.TRAILIE_AUDIT_E2E_BUDGET_USD||3);
  if(!Number.isFinite(cap)||cap<=0)throw new Error('invalid_budget');
  const {cost,MODELS}=require('./controlled');
  // Earlier qualification attempts are retained and count toward the same cap.
  const rawFile=path.join(OUT,'e2e-raw.jsonl');
  const prior=fs.existsSync(rawFile)?fs.readFileSync(rawFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  for(let i=0;i<prior.length;i++){
    const r=prior[i];if(r.type!=='provider_dispatch')continue;
    const end=prior.slice(i+1).find(x=>['provider_complete','provider_error','provider_dispatch'].includes(x.type));
    const u=end?.type==='provider_complete'?end.usage:null;
    reserved+=u&&MODELS.includes(r.model)?cost(r.model,{inputTokens:u.input_tokens,outputTokens:u.output_tokens,cachedInputTokens:u.input_tokens_details?.cached_tokens,cacheCreationInputTokens:u.input_tokens_details?.cache_write_tokens}):r.reservation_usd;
  }
  const authFailure=process.argv.includes('--auth-failure');
  append({type:'run_start',schema_version:2,auth_failure:authFailure,prior_cost_or_reserve:reserved,budget:cap});
  // Reserve three attempts for SDK retries, with UTF-8 bytes as the input bound.
  function instrument(klass,method,provider){
    const original=klass.prototype[method];
    klass.prototype[method]=async function(body,...rest){
      if(authFailure)throw Object.assign(new Error('audit_injected_provider_failure'),{code:'audit_injected_provider_failure'});
      const inputTokens=Buffer.byteLength(JSON.stringify(body))+2048;
      const outputTokens=body.max_output_tokens||body.max_tokens||body.max_completion_tokens||8000;
      const upper=3*(MODELS.includes(body.model)?cost(body.model,{inputTokens,outputTokens})*1.25:(inputTokens*15+outputTokens*75)/1e6);
      if(reserved+upper>cap){append({type:'budget_block',provider,model:body.model,reserved,next_reservation:upper});throw Object.assign(new Error('audit_budget_exhausted'),{code:'audit_budget_exhausted'});}
      reserved+=upper; const start=Date.now();
      function settle(usage){if(usage&&MODELS.includes(body.model)){const actual=cost(body.model,{inputTokens:usage.input_tokens,outputTokens:usage.output_tokens,cachedInputTokens:usage.input_tokens_details?.cached_tokens,cacheCreationInputTokens:usage.input_tokens_details?.cache_write_tokens});if(actual!=null)reserved-=upper-actual;}}
      append({type:'provider_dispatch',provider,model:body.model,reasoning:body.reasoning||null,reservation_usd:upper,prompt_hash:crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')});
      try{
        const result=await original.call(this,body,...rest);
        if(result?.[Symbol.asyncIterator]){
          return (async function*(){let usage=null;try{for await(const event of result){if(event.response?.usage)usage=event.response.usage;yield event;}}finally{settle(usage);append({type:'provider_complete',provider,model:body.model,latency_ms:Date.now()-start,usage});}})();
        }
        settle(result?.usage);append({type:'provider_complete',provider,model:body.model,latency_ms:Date.now()-start,usage:result?.usage||null});return result;
      }catch(e){append({type:'provider_error',provider,model:body.model,code:e.code||null,http_status:e.status||null});throw e;}
    };
  }
  instrument(require('openai/resources/responses/responses').Responses,'create','openai');
  instrument(require('openai/resources/chat/completions').Completions,'create','openai');
  instrument(require('@anthropic-ai/sdk/resources/messages').Messages,'create','claude');
  try{
    await mongoose.connect(mongo.getUri());
    const {app,server}=require('../../src/app');
    const request=require('supertest');
    if(authFailure){
      const {emptyPlanningState}=require('../../src/utils/planningState');
      const userId=new mongoose.Types.ObjectId(),tripId=new mongoose.Types.ObjectId();
      await mongoose.connection.collection('users').insertOne({_id:userId,name:'Audit traveler',email:'audit@example.com',role:'user'});
      const state=emptyPlanningState();state.destination.parkCode='zion';
      await mongoose.connection.collection('tripplans').insertOne({_id:tripId,userId,title:'Audit trip',parkCode:'zion',planningState:state,conversation:[]});
      const token=require('jsonwebtoken').sign({id:userId.toString()},process.env.JWT_SECRET,{expiresIn:'5m'});
      const res=await request(app).post('/api/ai/chat').set('Authorization',`Bearer ${token}`).set('User-Agent','TrailieAudit/2026.09').send({messages:[{role:'user',content:'I really want sunrise photography.'}],metadata:{tripId:tripId.toString(),parkCode:'zion'}}).timeout({deadline:180000});
      const saved=await mongoose.connection.collection('tripplans').findOne({_id:tripId});
      append({type:'authenticated_failure_probe',http_status:res.status,response:res.body,persisted_photography:saved.planningState?.activityPreferences?.photographyTiming||null,expected:'sunrise'});
      server.close();return;
    }
    const cases=JSON.parse(fs.readFileSync(path.join(OUT,'TRAILIE_MODEL_EVAL_CASES.json'))).cases;
    const sequence=cases.filter(c=>c.task_class==='F');
    for(let rep=1;rep<=3;rep++){
      const messages=[];let anonymousId=crypto.randomUUID();
      for(const c of sequence){
        messages.push({role:'user',content:c.user_request});
        const started=Date.now();
        const res=await request(app).post('/api/ai/chat-anonymous').set('User-Agent','TrailieAudit/2026.09').send({messages,anonymousId,clientTurnId:crypto.randomUUID(),metadata:{parkCode:'zion',parkName:'Zion National Park'}}).timeout({deadline:180000});
        const body=res.body?.data||res.body;
        anonymousId=body.anonymousId||anonymousId;
        const session=await mongoose.connection.collection('anonymoussessions').findOne({anonymousId});
        append({type:'turn',mode:'e2e_http',run_id:`zion-${rep}-${c.scenario_id}`,scenario_id:c.scenario_id,http_status:res.status,total_latency:Date.now()-started,response:body,saved_state:session?{planningState:session.planningState,messages:session.messages,turns:session.turns}:null});
        if(body.content)messages.push({role:'assistant',content:body.content});
        // Quota/admission rejection is a measured product limit; never bypass it.
        if(res.status===429)break;
      }
    }
    server.close();
  }catch(e){append({type:'e2e_blocked',code:e.code||e.name||'unknown',message:String(e.message).replace(/sk-[\w-]+/g,'[redacted]').slice(0,300)});process.exitCode=1;}
  finally{await mongoose.disconnect();await mongo.stop();}
}
main().then(()=>process.exit(process.exitCode||0)).catch(e=>{append({type:'bootstrap_blocked',code:e.code||e.name||'unknown',message:String(e.message).slice(0,200)});process.exit(1);});
