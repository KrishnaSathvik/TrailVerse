'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepare,requestFor,cost,upperBound,MODELS}=require('./controlled');
test('comparison changes only model in request contract',()=>{
  const p=prepare({scenario_id:'test',task_class:'A',user_request:'Can I drive to Brooks Falls?'});
  const normalized=MODELS.map(m=>{const r=requestFor(p,m);return {...r,model:'hidden'};});
  for(const r of normalized)assert.deepEqual(r,normalized[0]);
});
test('unknown usage is not a free call',()=>{
  assert.equal(cost('gpt-6-sol',null),null);
  assert.equal(cost('gpt-6-sol',{inputTokens:42}),null);
});
test('cache writes and reads are disjoint from uncached input',()=>{
  const actual=cost('gpt-6-sol',{inputTokens:1000,outputTokens:100,cachedInputTokens:400,cacheCreationInputTokens:200});
  assert.ok(Math.abs(actual-(400*2+400*.2+200*2.5+100*10)/1e6)<1e-10);
});
test('reservation bounds uncached maximum output for every model',()=>{
  const p=prepare({scenario_id:'test',task_class:'D',user_request:'Three days in Seattle.'});
  for(const model of MODELS){
    const bytes=Buffer.byteLength(JSON.stringify(requestFor(p,model)))+2048;
    assert.ok(upperBound(p,model)>=cost(model,{inputTokens:bytes,outputTokens:p.maxOutputTokens}));
  }
});
