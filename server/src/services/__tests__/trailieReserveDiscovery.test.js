'use strict';
const { createSimpleTravelTools } = require('../trailieTravelData');
const { createSimpleRuntime } = require('../trailieSimpleRuntime');
const { withDayStructure } = require('../../../tests/helpers/dayStructure');
const NOW = new Date('2026-10-12T12:00:00Z');
const bytes = v => Buffer.byteLength(JSON.stringify(v));
const action = (name, input) => ({completionStatus:'completed',toolCalls:[{name,input,id:name}]});
function setup(park, reserveDiscovery) {
  const rows = Array.from({length:14}, (_, i) => ({topic:'activities',entityId:`nps:park:${park}`,observedAt:NOW.toISOString(),
    claim:{identity:`place:${park}:${i}`,normalizedValue:{name:`${park} Walk ${i}`,latitude:37,longitude:-113,
      exposureLevel:'low',description:'Source practical information. '.repeat(35)}},
    source:{provider:'nps',sourceClass:'official_owner',url:`https://www.nps.gov/${park}/walk${i}.htm`}}));
  const broker={dispatchEphemeral:jest.fn(async ({requirement:r})=>({status:r.topic==='activities'?'fulfilled':'unsupported',
    normalizedCandidates:r.topic==='activities'?rows:[],providerAttemptCount:1}))};
  const tools=createSimpleTravelTools({broker,now:()=>NOW,reserveDiscovery,
    destinationResolver:async()=>({entityId:`nps:park:${park}`,displayName:park,latitude:37,longitude:-113,sourceClass:'official_owner'})});
  const args={destination:park,question:'Easy walks avoiding exposure',topics:['activities'],constraints:{avoidExposure:true}};
  const context={requestId:park,userMessage:'Easy walks avoiding exposure',snapshot:{planningState:{}}};
  return {tools,broker,args,context,rows};
}
for(const park of ['zion','yose']) test(`${park}: reserve visibility preserves authority, provider work, and existing annotations`, async()=>{
  const off=setup(park), on=setup(park,true);
  const a=await off.tools.execute('read_travel',off.args,off.context), b=await on.tools.execute('read_travel',on.args,on.context);
  expect(a.evidenceDelivery.reserveDiscovery).toBe(false);
  expect(a.evidenceDelivery.deliveredReserveRecords).toBe(0);
  expect(b.evidenceDelivery.deliveredReserveRecords).toBeGreaterThan(0);
  expect(b.evidence).toEqual(a.evidence);
  expect(on.broker.dispatchEphemeral.mock.calls.map(([c])=>c.requirement)).toEqual(off.broker.dispatchEphemeral.mock.calls.map(([c])=>c.requirement));
  expect(b.evidenceDelivery.factBytes).toBeLessThanOrEqual(28000);
  expect(b.evidenceDelivery.modelContextBytes).toBe(bytes(b.modelContext));
  for(const f of a.modelContext.facts) expect(b.modelContext.facts.find(v=>v.evidenceId===f.evidenceId)).toEqual(f);
  const reserved=b.modelContext.facts.find(f=>!b.evidence.some(e=>e.evidenceId===f.evidenceId));
  expect(reserved.eligibility.status).toBe('eligible');
  const proposal={plan:withDayStructure({parkName:park,intro:'A walk',days:[{id:'d1',dayNumber:1,label:'Day 1',stops:[{id:'s1',order:1,name:reserved.value.name,type:'walk',duration:30,note:'',why:'Scenery',startTime:'',evidenceRef:reserved.evidenceId}]}]})};
  const callCount=on.broker.dispatchEphemeral.mock.calls.length;
  const grounded=await on.tools.finalizeProposal(proposal,{...on.context,evidence:b.evidence});
  expect(grounded.evidence.some(e=>e.evidenceId===reserved.evidenceId)).toBe(true);
  expect(grounded.evidence.length).toBe(a.evidence.length+1);
  expect(on.broker.dispatchEphemeral).toHaveBeenCalledTimes(callCount);
});
test('visibility does not bulk-copy reserve into correction feedback; full inputs are measured',async()=>{
  const run=async flag=>{
    const b=setup('zion',flag), model=jest.fn()
      .mockResolvedValueOnce(action('read_travel',b.args))
      .mockResolvedValueOnce(action('propose_trip_update',{response:'Ready',memory_updates:[{field:'dates',sourceQuote:'tomorrow',value:{startDate:'invalid'}}]}))
      .mockResolvedValueOnce({completionStatus:'completed',outputText:'The dates remain unconfirmed.',toolCalls:[]});
    const result=await createSimpleRuntime({model,travelTools:b.tools,now:()=>NOW})({message:'tomorrow',responseId:'test'});
    const correction=model.mock.calls[2][0].input.at(-1).output;
    expect(result.telemetry.correctionOutputBytes).toBe(Buffer.byteLength(correction));
    result.telemetry.calls.forEach((c,i)=>{const {signal,...input}=model.mock.calls[i][0];expect(c.modelInputBytes).toBe(bytes(input));});
    return {correction:JSON.parse(correction),result};
  };
  const a=await run(false),b=await run(true);
  expect(b.correction).toEqual(a.correction);
  expect(b.result.telemetry.providerAttempts).toBe(a.result.telemetry.providerAttempts);
});
test('records lacking coordinates stay undiscoverable without additional coordinate work',async()=>{
  const b=setup('zion',true);
  b.rows.slice(8).forEach(r=>{delete r.claim.normalizedValue.latitude;delete r.claim.normalizedValue.longitude;});
  const result=await b.tools.execute('read_travel',b.args,b.context);
  const visible=result.modelContext.facts.filter(f=>!result.evidence.some(e=>e.evidenceId===f.evidenceId));
  expect(visible.every(f=>f.value.location?.status==='resolved')).toBe(true);
  expect(b.broker.dispatchEphemeral.mock.calls.filter(([c])=>c.requirement.topic==='stop_coordinates')).toHaveLength(0);
});
