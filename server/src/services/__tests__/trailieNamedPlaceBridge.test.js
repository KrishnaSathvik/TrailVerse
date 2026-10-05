'use strict';
const { createNamedPlaceEvidenceProvider } = require('../providers/namedPlaceEvidenceProvider');
const { createEvidenceBroker } = require('../evidenceBrokerService');
const { createSimpleTravelTools } = require('../trailieTravelData');
const { createSimpleRuntime } = require('../trailieSimpleRuntime');
const { createSimpleTripStore } = require('../trailieSimpleStore');
const TripPlan = require('../../models/TripPlan');
const mongoose = require('mongoose');
const NOW=new Date('2026-09-30T12:00:00Z');
const point=(name,id,types=['park'])=>({name,place_id:id,types,address_components:[{short_name:'US',types:['country']}],formatted_address:'Example County, CO, USA',geometry:{location:{lat:39.8,lng:-105.5}}});
function fixtures(results, options={}, toolOptions={}) {
  const lookup=jest.fn(async query=>results.filter(p=>query.startsWith(p.name)));
  const named=createNamedPlaceEvidenceProvider({lookup,catalog:{},now:()=>NOW,...options});
  const docs={id:'tavily',supports:r=>['activities','overview'].includes(r.topic),estimateCost:()=>({costStatus:'known',costUsd:0}),
    buildRequest:r=>({provider:'tavily',operation:'search',dedupeKey:r.topic,parameters:{topic:r.topic},publicCanonicalRequest:{topic:r.topic}}),
    fetch:async()=>({raw:[],metadata:{},providerAttempts:0}),
    normalize:(_raw,r)=>[{entityId:'document',topic:r.parameters.topic,evidenceType:'fact',claim:{identity:'doc',normalizedValue:{title:'A beautiful hiking weekend',url:'https://example.org/travel'}},source:{provider:'tavily',sourceClass:'reputable_web'},observedAt:NOW.toISOString()}]};
  const route={id:'google_maps',supports:r=>r.topic==='driving_time',estimateCost:()=>({costStatus:'known',costUsd:0}),
    buildRequest:r=>({provider:'google_maps',operation:'route',dedupeKey:JSON.stringify(r.routeScope),parameters:r.routeScope,publicCanonicalRequest:{}}),
    fetch:jest.fn(async()=>({raw:{},metadata:{},providerAttempts:0})),
    normalize:(_raw,r)=>[{entityId:r.parameters.destination.entityId,topic:'driving_time',evidenceType:'fact',
      claim:{identity:'route',normalizedValue:{durationSeconds:900,distanceMeters:12000}},
      scope:{route:{originEntityId:r.parameters.origin.entityId,destinationEntityId:r.parameters.destination.entityId,travelMode:r.parameters.travelMode}},
      source:{provider:'google_maps',sourceClass:'commercial_structured'},observedAt:NOW.toISOString()}]};
  const broker=createEvidenceBroker({providers:[docs,named,route],now:()=>NOW,refreshHashSecret:'offline-identity-test',recordRefreshEvent:async()=>{},acquireLease:async()=>{throw Error('ephemeral only');},releaseLease:async()=>{throw Error('ephemeral only');}});
  const tools=createSimpleTravelTools({broker,now:()=>NOW,destinationResolver:async()=>({entityId:'place:query:area',displayName:'Example foothills, Colorado'}),...toolOptions});
  return {lookup,named,route,tools};
}
const req={destination:'Example foothills, Colorado',question:'Build a weekend',topics:['activities'],places:['Cedar Preserve','Pine Loop','Example Town'],travelMode:'driving'};
const input={requestId:'bridge',userMessage:'Build a weekend'};
const generation=(tool,input)=>({completionStatus:'completed',model:'gpt-6.1-sol',provider:'openai',toolCalls:[{id:tool,name:tool,input}]});

test('document-only search plus explicit names produces a persisted canonical itinerary in two model calls', async()=>{
  const b=fixtures([point('Cedar Preserve','cedar'),point('Pine Loop','pine'),point('Example Town','town',['locality'])]);
  const model=jest.fn(async()=>generation('read_travel',req));
  model.mockImplementationOnce(async()=>generation('read_travel',req)).mockImplementationOnce(async({input})=>{
    const facts=JSON.parse(input.at(-1).output).facts;
    const named=facts.filter(f=>f.value?.placeKind);
    expect(named).toHaveLength(3);
    return generation('propose_trip_update',{response:'Your weekend is ready.',plan:{parkName:req.destination,intro:'A relaxed weekend',days:[{id:'d1',dayNumber:1,label:'First day',stops:named.map((f,i)=>({id:`s${i}`,order:i+1,type:i===2?'lodging':'viewpoint',name:f.value.name,evidenceRef:f.evidenceId,duration:30,note:'Adapt the loop to conditions.',startTime:''}))}]}});
  });
  const result=await createSimpleRuntime({model,travelTools:b.tools,now:()=>NOW,store:createSimpleTripStore({TripPlan})})({userId:String(new mongoose.Types.ObjectId()),message:'Build a weekend',snapshot:{}});
  expect(result.status).toBe('complete'); expect(model).toHaveBeenCalledTimes(2);
  expect(result.telemetry.mutationAccepted).toBe(true);
  const saved=await TripPlan.findById(result.tripId).lean();
  expect(saved.plan.itineraryHash).toBe(result.response.itineraryHash);
  expect(saved.plan.canonicalContract).toBe('trailie.itinerary.v2');
  expect(saved.plan.days[0].stops.every(s=>s.location.status==='resolved' && s.location.source==='geocoder')).toBe(true);
  expect(saved.plan.days[0].stops[2]).toMatchObject({name:'Example Town',type:'custom',placeKind:'area'});
  expect(saved.plan.days[0].travelEdges).toHaveLength(2);
  // Driving was only a research assumption: no saved car authority was invented.
  expect(saved.plan.days[0].travelEdges.every(e=>e.status==='unverified')).toBe(true);
  expect(b.route.fetch).toHaveBeenCalledTimes(2);
  expect(b.lookup).toHaveBeenCalledTimes(3);
});
test('search titles alone cannot create identities and vague lodging cannot invent a property',async()=>{
  const b=fixtures([point('Example Hotel','hotel',['lodging'])]);
  b.lookup.mockResolvedValue([point('Example Hotel','hotel',['lodging'])]);
  const r=await b.tools.execute('read_travel',{...req,places:['hotel or motel in Example Town','a shorter marked loop']},input);
  expect(r.evidence.some(e=>e.source.provider==='named_place')).toBe(false);
  expect(r.unresolved.filter(u=>u.place)).toHaveLength(2);
  expect(b.route.fetch).not.toHaveBeenCalled();
});
test('ambiguous exact identities remain unresolved rather than selecting the first',async()=>{
  const b=fixtures([point('Pine Loop','one'),point('Pine Loop','two')]);
  const r=await b.tools.execute('read_travel',{...req,places:['Pine Loop']},input);
  expect(r.evidence.some(e=>e.source.provider==='named_place')).toBe(false);
  expect(r.unresolved.some(u=>u.place==='Pine Loop')).toBe(true);
});
test('context geography remains contextual; explicit traveler geography can override it',async()=>{
  const b=fixtures([point('Pine Loop','co'),{...point('Pine Loop','ut'),formatted_address:'Example County, UT, USA'}]);
  const r=await b.tools.execute('read_travel',{...req,places:['Pine Loop'],context:{explicitRegion:'Utah'}},{...input,userMessage:'Pine Loop in Utah'});
  const row=r.evidence.find(e=>e.source.provider==='named_place');
  expect(row.claim.identity).toBe('google:place:ut');
  expect(row.provenance.queryProvenance).toMatchObject({explicitTravelerRegion:{name:'Utah'},contextualRegions:[],destinationNames:['Example foothills, Colorado']});
});
test('invalid coordinates and non-US lookalikes cannot become map identities',async()=>{
  const b=fixtures([{...point('Pine Loop','bad'),geometry:{location:{lat:null,lng:null}}}, {...point('Pine Loop','abroad'),address_components:[{short_name:'GB',types:['country']}],formatted_address:'London, UK'}]);
  const r=await b.tools.execute('read_travel',{...req,places:['Pine Loop']},input);
  expect(r.evidence.some(e=>e.source.provider==='named_place')).toBe(false);
});
test('proposal-selected names resolve without another model research round',async()=>{
  const b=fixtures([point('Cedar Preserve','cedar')]);
  const proposal={response:'Ready',plan:{parkName:req.destination,intro:'A visit',days:[{id:'d',dayNumber:1,label:'Day',stops:[{id:'s',order:1,name:'Cedar Preserve',type:'viewpoint',duration:30,note:'',startTime:''}]}]}};
  const model=jest.fn(async()=>generation('propose_trip_update',proposal));
  const r=await createSimpleRuntime({model,travelTools:b.tools,now:()=>NOW})({message:'Create my trip'});
  expect(r.status).toBe('complete'); expect(model).toHaveBeenCalledTimes(1);
  expect(r.response.itineraryData.days[0].stops[0].canonicalPlaceId).toBe('google:place:cedar');
});

test('catalog identities resolve without external lookup and retain catalog provenance',async()=>{
  const b=fixtures([],{catalog:{'cedar preserve':{name:'Cedar Preserve, Colorado',lat:39.8,lon:-105.5}}});
  const r=await b.tools.execute('read_travel',{...req,places:['Cedar Preserve']},input);
  expect(b.lookup).not.toHaveBeenCalled();
  const row=r.evidence.find(e=>e.source.provider==='named_place');
  expect(row.claim.normalizedValue.location).toMatchObject({source:'trailverse_catalog',authority:'trusted_specialist'});
  expect(r.namedPlaceResolutions[0]).toMatchObject({status:'resolved',mapEligible:true});
});

test('an unavailable place resolver remains bounded and returns explicit unresolved identities',async()=>{
  const b=fixtures([]); b.lookup.mockRejectedValue(new Error('offline provider failure'));
  const r=await b.tools.execute('read_travel',{...req,places:['Cedar Preserve']},input);
  expect(b.lookup).toHaveBeenCalledTimes(1);
  expect(r.namedPlaceResolutions).toEqual([expect.objectContaining({requestedName:'Cedar Preserve',status:'unresolved',mapEligible:false})]);
  expect(r.modelContext.facts.length).toBeGreaterThan(0);
});

test('14+ names are deduped and processed across internal batches',async()=>{
 const names=Array.from({length:16},(_,i)=>`Place ${i}`);
 const b=fixtures(names.map((n,i)=>point(n,String(i))),{}, {placeBatchSize:3});
 const r=await b.tools.execute('read_travel',{...req,travelMode:undefined,places:[...names,' Place 0 ','place 0']},input);
 expect(r.status).toBe('fulfilled');expect(b.lookup).toHaveBeenCalledTimes(16);
 expect(r.evidence.filter(e=>e.source.provider==='named_place')).toHaveLength(16);
 expect(r.namedPlaceDiagnostics).toHaveLength(16);
 expect(r.namedPlaceDiagnostics[0]).toMatchObject({resolutionStatus:'resolved',providerStatus:'fulfilled',candidates:[expect.objectContaining({nameMatch:true,countryEvidence:{countryCode:'US',source:'provider_address_component'}})]});
});
test('turn name budget returns partial results and does not reset during finalization',async()=>{
 const names=Array.from({length:16},(_,i)=>`Place ${i}`);
 const b=fixtures(names.map((n,i)=>point(n,String(i))),{}, {maxNamedPlaces:14});
 const r=await b.tools.execute('read_travel',{...req,travelMode:undefined,places:names},input);
 expect(r.evidence.filter(e=>e.source.provider==='named_place')).toHaveLength(14);
 expect(r.unresolved.filter(u=>u.reasonCode==='named_place_limit_exceeded')).toHaveLength(2);
 await b.tools.finalizeProposal({plan:{days:[{stops:names.map(name=>({name}))}]}},{...input,snapshot:{},evidence:r.evidence});
 expect(b.lookup).toHaveBeenCalledTimes(14);
});
test('provider budget preserves completed identities and reports the remainder',async()=>{
 const b=fixtures([point('Cedar Preserve','cedar'),point('Pine Loop','pine')],{}, {maxProviderRequests:2});
 const r=await b.tools.execute('read_travel',{...req,travelMode:undefined,places:['Cedar Preserve','Pine Loop']},input);
 expect(r.evidence.some(e=>e.source.provider==='named_place')).toBe(true);
 expect(r.unresolved.some(u=>u.reasonCode==='provider_request_budget_exceeded')).toBe(true);
});
test.each(['Zion National Park','Zion National Park and Bryce Canyon National Park'])('destination %s stays separate from administrative geography',async destination=>{
 const p={...point('Springdale','spring',['locality']),formatted_address:'Springdale, UT 84767',address_components:[{short_name:'US',types:['country']},{short_name:'UT',types:['administrative_area_level_1']}]};
 const b=fixtures([p],{}, {destinationResolver:async()=>({entityId:'place:query:trip',displayName:destination,administrativeRegions:[{code:'UT'}]})});
 const r=await b.tools.execute('read_travel',{...req,destination,travelMode:undefined,places:['Springdale']},input);
 expect(r.namedPlaceResolutions[0].status).toBe('resolved');
 expect(r.evidence.find(e=>e.source.provider==='named_place').provenance.queryProvenance).toMatchObject({contextualRegions:[{code:'UT'}],destinationNames:[destination]});
});
test('candidate rejection diagnostics survive to terminal telemetry',async()=>{
 const b=fixtures([{...point('Cedar Preserve','foreign'),address_components:[{short_name:'CA',types:['country']}]}]);
 const model=jest.fn().mockResolvedValueOnce(generation('read_travel',{...req,places:['Cedar Preserve']}))
 .mockResolvedValueOnce({completionStatus:'completed',outputText:'That place remains unverified.',toolCalls:[]});
 const r=await createSimpleRuntime({model,travelTools:b.tools,now:()=>NOW})({message:'Build a trip'});
 expect(r.telemetry.tools[0].namedPlaceDiagnostics[0]).toMatchObject({inputName:'Cedar Preserve',resolutionStatus:'unresolved',candidates:[expect.objectContaining({rejectionReason:'country_mismatch'})]});
});
test('research timeout preserves earlier identities and marks unattempted names',async()=>{
 const b=fixtures([point('Cedar Preserve','cedar')],{}, {placeBatchSize:1,phaseTimeoutMs:60,providerTimeoutMs:1000});
 b.lookup.mockImplementation((query,{signal})=>query.startsWith('Cedar Preserve') ? Promise.resolve([point('Cedar Preserve','cedar')])
  : new Promise((resolve,reject)=>{if(signal.aborted)reject(Error('cancelled'));else signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});}));
 const r=await b.tools.execute('read_travel',{...req,travelMode:undefined,places:['Cedar Preserve','Slow Place','Unattempted Place']},input);
 expect(r.evidence.some(e=>e.claim?.normalizedValue?.name==='Cedar Preserve')).toBe(true);
 expect(r.unresolved.some(u=>u.place==='Unattempted Place' && u.reasonCode==='research_time_budget_exceeded')).toBe(true);
 expect(b.lookup).toHaveBeenCalledTimes(2);
});
