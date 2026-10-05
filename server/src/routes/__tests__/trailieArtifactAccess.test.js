'use strict';
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('../../models/User');
const TripPlan = require('../../models/TripPlan');
const AnonymousSession = require('../../models/AnonymousSession');
const { hashPayload } = require('../../utils/canonicalResponse');
const { selectTrailieRuntime } = require('../../config/trailieRuntimeSelection');
const { mintGuestSessionId } = require('../../utils/anonymousIdGenerator');
const mockModel = jest.fn();
const mockExecute = jest.fn();
const mockObserve = jest.fn();
const mockDependencies = jest.fn(() => ({ model: mockModel,
  travelTools: { definitions: [], execute: mockExecute } }));
const app = express(); app.use(express.json()); app.use('/api/ai', require('../modelFirstTrailie').createModelFirstRouter({dependencies:mockDependencies,observe:mockObserve}));
const answer = content => ({ completionStatus: 'completed', outputText: content, toolCalls: [],
  provider: 'openai', model: 'gpt-6-sol', costStatus: 'priced', costUsd: 0 });
const tool = (name, input) => ({ ...answer(''), toolCalls: [{ id: 'tool-1', name, input }] });
const events = res => res.text.split('\n\n').filter(s => s.startsWith('data: ')).map(s => JSON.parse(s.slice(6)));
let token, owner;
beforeEach(async () => {
  process.env.TRAILIE_RUNTIME = 'model_first';
  mockModel.mockReset().mockResolvedValue(answer('A useful answer.'));
  mockExecute.mockReset().mockResolvedValue({ status: 'fulfilled', evidence: [] });
  mockDependencies.mockClear(); mockObserve.mockClear();
  owner = await User.create({ name: 'Offline Cutover', email: `cutover-${new mongoose.Types.ObjectId()}@example.com`, password: 'offline-fixture-only' });
  token = jwt.sign({ id: String(owner._id) }, process.env.JWT_SECRET);
});
afterEach(()=>{delete process.env.TRAILIE_RUNTIME;});
const { createNamedPlaceEvidenceProvider } = require('../../services/providers/namedPlaceEvidenceProvider');
const { createEvidenceBroker } = require('../../services/evidenceBrokerService');
const { createSimpleTravelTools } = require('../../services/trailieTravelData');
const NOW=new Date();
const point=(name,id,types=['park'])=>({name,place_id:id,types,address_components:[{short_name:'US',types:['country']}],formatted_address:'Example County, CO, USA',geometry:{location:{lat:39.8,lng:-105.5}}});
function fixtures(results, options={}) {
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
  const tools=createSimpleTravelTools({broker,now:()=>NOW,destinationResolver:async()=>({entityId:'place:query:area',displayName:'Example foothills, Colorado'})});
  return {lookup,named,route,tools};
}

test.each(['/chat','/chat-anonymous','/chat-stream','/chat-anonymous-stream'])('parity %s',async endpoint=>{
 const fixture=fixtures([point('Cedar Preserve','cedar'),point('Pine Loop','pine'),point('Example Town','town',['locality'])]);
 mockDependencies.mockImplementation(()=>({model:mockModel,travelTools:fixture.tools}));
 const read={destination:'Example foothills, Colorado',question:'Build a day',topics:['activities'],places:['Cedar Preserve','Pine Loop','Example Town'],travelMode:'driving'};
 mockModel.mockResolvedValueOnce(tool('read_travel',read)).mockImplementationOnce(async({input})=>{
  const named=JSON.parse(input.at(-1).output).facts.filter(f=>f.value?.placeKind);
  return tool('propose_trip_update',{response:'Your trip is ready.',memory_updates:[{field:'transportation',value:{rentalCar:true},sourceQuote:'I have a rental car'}],plan:{parkName:read.destination,intro:'A relaxed day',days:[{id:'d1',dayNumber:1,label:'First day',stops:named.map((f,i)=>({id:`s${i}`,order:i+1,type:i===2?'lodging':'viewpoint',name:f.value.name,evidenceRef:f.evidenceId,duration:30,note:'',startTime:''}))}]}});
 });
 let r=request(app).post('/api/ai'+endpoint);
 if(!endpoint.includes('anonymous'))r=r.set('Authorization','Bearer '+token);
 const res=await r.send({message:'Build my trip. I have a rental car',clientTurnId:'parity'});

 expect(res.status).toBe(200);
 const body=endpoint.endsWith('-stream')?events(res).find(e=>e.type==='done'):res.body.data;
 expect(body.presentation.primaryArtifact).toEqual({kind:'itinerary',source:'canonicalPlan'});
 expect(body.canonicalPlan.days[0].stops).toHaveLength(3);
 expect(body.canonicalPlan.days[0].stops.every(s=>s.location.status==='resolved')).toBe(true);
 expect(body.canonicalPlan.days[0].travelEdges).toHaveLength(2);
 expect(fixture.lookup).toHaveBeenCalledTimes(3);expect(fixture.route.fetch).toHaveBeenCalledTimes(2);
 const telemetry=mockObserve.mock.calls.map(c=>c[0]).find(e=>e.runtime==='model_first');
 expect(telemetry.mutationAccepted).toBe(true);
 if(endpoint.includes('anonymous')) {
  const session=await AnonymousSession.findOne({anonymousId:body.anonymousId}).lean();
  const last=session.messages.at(-1);
  expect(last.presentation).toEqual(body.presentation);
  expect(hashPayload(last.canonicalPlan)).toBe(body.itineraryHash);
  const migrated=require('../../utils/guestCanonicalPlanMigration').buildGuestTripMigrationPayload({session,userId:owner._id});
  expect(migrated.plan.itineraryHash).toBe(body.itineraryHash);
  expect(JSON.parse(JSON.stringify(migrated.plan.days))).toEqual(body.canonicalPlan.days);
  expect(migrated.planningState.transportation.rentalCar).toBe(true);
  const saved=await TripPlan.create(migrated);
  expect(saved.plan.itineraryHash).toBe(body.itineraryHash);
 } else {
  const saved=await TripPlan.findById(body.tripId).lean();
  expect(saved.conversation.at(-1).presentation).toEqual(body.presentation);
 }

});
