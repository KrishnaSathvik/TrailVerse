'use strict';
const { createCollector, completeDays } = require('../trailiePreviewStream');
const { previewEnabled, projectDraftDay } = require('../trailieDraftPreview');
const { createTrailieTransportAdapter } = require('../trailieTransportAdapter');
const { createSimpleModel } = require('../../services/trailieSimpleModel');
const { createSimpleRuntime } = require('../../services/trailieSimpleRuntime');

const day = { dayNumber: 1, id: 'd', label: 'Arrival', stops: [], dayStructure: { type: 'arrival',
  startPeriod: 'afternoon', endPeriod: 'evening', summary: 'Settle in.', blocks: [
    { kind: 'arrival', periods: ['afternoon','evening'], label: 'Arrive', note: 'Rest after travel.', stopIds: [] },
  ] } };
const proposal = { response: 'A plan.', plan: { intro: 'A short trip.', days: [day] } };
function eventsFor(p=proposal) {
 const text=JSON.stringify(p),item={id:'fc',type:'function_call',call_id:'call',name:'propose_trip_update',arguments:text};
 let n=0; return [{type:'response.output_item.added',sequence_number:n++,item:{...item,arguments:''}},
 ...Array.from(text).map(delta=>({type:'response.function_call_arguments.delta',sequence_number:n++,item_id:'fc',delta})),
 {type:'response.function_call_arguments.done',sequence_number:n++,item_id:'fc',arguments:text},
 {type:'response.completed',sequence_number:n++,response:{status:'completed',output:[item],usage:{input_tokens:100,output_tokens:50}}}];
}
test('switch is default off, dual opt-in and impossible in production',()=>{
 const req={get:()=> '1'};
 expect(previewEnabled(req,{})).toBe(false);
 expect(previewEnabled(req,{NODE_ENV:'production',TRAILIE_DRAFT_PREVIEW:'true'})).toBe(false);
 expect(previewEnabled({get:()=>undefined},{NODE_ENV:'development',TRAILIE_DRAFT_PREVIEW:'true'})).toBe(false);
 expect(previewEnabled(req,{NODE_ENV:'development',TRAILIE_DRAFT_PREVIEW:'true'})).toBe(true);
});
test('every prefix is blocked until completion; exactly one complete day callback',()=>{
 const onDay=jest.fn(),c=createCollector({onDay});const events=eventsFor();
 for(const e of events.slice(0,-1)){c.push(e,0);expect(()=>c.finish()).toThrow();}
 c.push(events.at(-1),0);expect(c.finish().status).toBe('completed');expect(onDay).toHaveBeenCalledTimes(1);
 expect(onDay).toHaveBeenCalledWith(day,0);
});
test('escaped braces and nested fields cannot create false day boundaries',()=>{
 const p={plan:{days:[{...day,label:'quoted " ] } \\ café',extra:[{x:'{'}]}]}};const text=JSON.stringify(p);
 for(let i=0;i<=text.length;i++) expect(completeDays(text.slice(0,i)).map(d=>d.day)).toEqual(p.plan.days.slice(0,completeDays(text.slice(0,i)).length));
 expect(completeDays(text)).toHaveLength(1);
});
test.each(['error','response.failed','response.incomplete'])('%s cannot promote full draft',type=>{
 const c=createCollector();for(const e of eventsFor().slice(0,-1))c.push(e,0);c.push({type},0);expect(()=>c.finish()).toThrow();
});
test('final mismatch and reordered events fail closed',()=>{
 const events=eventsFor(),c=createCollector();for(const e of events.slice(0,-1))c.push(e,0);
 events.at(-1).response.output[0].arguments+=' ';c.push(events.at(-1),0);expect(()=>c.finish()).toThrow();
 expect(()=>c.push({type:'response.created',sequence_number:0},0)).toThrow();
});
test('draft projection strips identity, coordinates, evidence and arbitrary fields',()=>{
 expect(projectDraftDay({...day,secret:'private',stops:[{name:'View',note:'Draft only',location:{lat:1},evidenceRef:'secret'}]},0))
  .toEqual({index:0,dayNumber:1,label:'Arrival',summary:'Settle in.',activities:[{name:'View',note:'Draft only'}]});
 expect(projectDraftDay(day,1)).toBeNull();
});
test.each(['legacy','v2'])('transport %s seals late drafts and withdrawal prevents revival',dialect=>{
 const emit=jest.fn(),t=createTrailieTransportAdapter({dialect,emit});
 t.draftDay({day,index:0});expect(emit).not.toHaveBeenCalled();
 t.draftStarted({responseId:'r'});t.draftDay({day,index:0});t.draftWithdrawn();t.draftDay({day,index:0});
 expect(emit.mock.calls.map(c=>c[0].type)).toEqual(['draft_started','draft_day','draft_withdrawn']);
 t.responseFinalized({persisted:true});t.draftDay({day,index:0});expect(emit).toHaveBeenCalledTimes(4);
});
test('model uses same completed argument/usage normalization and no retry',async()=>{
 const create=jest.fn(async()=> (async function*(){yield* eventsFor();})());
 const result=await createSimpleModel({client:{responses:{create}}})({input:[],instructions:'Policy',tools:[],onPreviewDay:jest.fn()});
 expect(result.toolCalls[0].input).toEqual(proposal);expect(result.usage).toMatchObject({inputTokens:100,outputTokens:50});
 expect(create).toHaveBeenCalledTimes(1);expect(create.mock.calls[0][0].stream).toBe(true);expect(create.mock.calls[0][1].maxRetries).toBe(0);
});
test('rejection withdraws draft, never commits it, and invokes no correction when bounded',async()=>{
 const bad=structuredClone(proposal);bad.plan.days[0].dayStructure.type='departure';
 const preview=jest.fn(),store={load:async()=>({}),commit:jest.fn()};
 const run=createSimpleRuntime({store,maxCorrections:0,model:async args=>{
   args.onPreviewDay(bad.plan.days[0],0);return {completionStatus:'completed',toolCalls:[{id:'call',name:'propose_trip_update',input:bad}]};
 },travelTools:{definitions:[],execute:jest.fn(),finalizeProposal:async()=>({evidence:[{evidenceId:'us-base',topic:'destination_identity',claim:{normalizedValue:{countryCode:'US'}},source:{provider:'named_place',sourceClass:'commercial_structured'},observation:{observedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()}}]})}});
 const result=await run({message:'A trip',onPreview:preview});
 expect(result.status).toBe('mutation_rejected');expect(preview).toHaveBeenLastCalledWith({withdrawn:true});
 expect(store.commit).not.toHaveBeenCalled();expect(result.telemetry.corrections).toBe(0);
});
test.each([true,false])('only a complete guarded plan reaches persistence; commit success %s',async ok=>{
 const preview=jest.fn(),commit=jest.fn(async args=>{
   expect(preview).toHaveBeenCalledWith({day,index:0});
   expect(args.mutation.plan.days).toHaveLength(1);
   return {ok,canonicalPlan:args.mutation.plan};
 });
 const run=createSimpleRuntime({store:{load:async()=>({}),commit},maxCorrections:0,
   model:async args=>{args.onPreviewDay(day,0);return {completionStatus:'completed',toolCalls:[{id:'call',name:'propose_trip_update',input:proposal}]};},
   travelTools:{definitions:[],execute:jest.fn(),finalizeProposal:async()=>({evidence:[{evidenceId:'us-base',topic:'destination_identity',claim:{normalizedValue:{countryCode:'US'}},source:{provider:'named_place',sourceClass:'commercial_structured'},observation:{observedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()}}]})}});
 const result=await run({message:'A trip',onPreview:preview});
 expect(commit).toHaveBeenCalledTimes(1);expect(result.persisted).toBe(ok);
 expect(result.status).toBe(ok?'complete':'persistence_failed');
 if(!ok)expect(result.canonicalPlan).toBeFalsy();
});
