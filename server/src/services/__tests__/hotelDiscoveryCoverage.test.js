'use strict';
const {createSerperEvidenceProvider} = require('../providers/serperEvidenceProvider');
const {createTavilyEvidenceProvider} = require('../providers/tavilyEvidenceProvider');
const {selectResourceUrls} = require('../../utils/travelResourceLinks');
const {createEvidenceBroker} = require('../evidenceBrokerService');
const {createSimpleTravelTools} = require('../trailieTravelData');
const NOW=new Date('2026-10-17T12:00:00Z');
function fixture(places) {
 const client={searchPlaces:jest.fn(async()=>({places}))};
 const provider=createSerperEvidenceProvider({serperClient:client,now:()=>NOW,stageRaw:async()=>({})});
 return {client,provider};
}
function req(provider,destination) {return provider.buildRequest({topic:'lodging_strategy',entity:{entityId:'place:test',displayName:destination}});}
test.each(['Springdale','Boston','Portland'])('preserves %s structured identities without inventing links',async destination=>{
 const {provider,client}=fixture([{title:'Harbor Hotel',address:`12 Main Street, ${destination}, US`,cid:'123'},
  {title:'Other Hotel',address:'12 Main Street, Other City',website:'https://other.example/book'},
  {title:'Unknown Hotel',website:'https://unknown.example/book'}]);
 const request=req(provider,destination);const fetched=await provider.fetch(request);const rows=provider.normalize(fetched.raw,request,fetched.metadata);
 expect(rows).toHaveLength(1);expect(rows[0].claim.normalizedValue).toMatchObject({title:'Harbor Hotel',placeId:null,cid:'123',listingUrl:null,reservationUrl:null,currentAvailability:null,price:null,linkStatus:'unresolved'});
 expect(rows[0].source.url).toBeNull();expect(rows[0].claim.qualifiers).toContain('resource_link_unverified');
 expect(fetched.metadata.discoveryDiagnostics).toMatchObject({upstreamCount:3,retainedCount:1,missingUrlCount:1,destinationMismatchCount:1,identityMissingCount:1});
 const cached=await provider.fetch(request);expect(cached.metadata.discoveryDiagnostics).toEqual(fetched.metadata.discoveryDiagnostics);expect(client.searchPlaces).toHaveBeenCalledTimes(1);
 expect(JSON.stringify(fetched.metadata.discoveryDiagnostics)).not.toContain(destination);
});
test('upstream empty is distinguishable from filtering all records',async()=>{
 for (const [places,reason] of [[[],{upstreamCount:0,retainedCount:0}],[ [{title:'Wrong Place',address:'Other City'}],{upstreamCount:1,retainedCount:0,destinationMismatchCount:1}]]) {
 const {provider}=fixture(places);expect((await provider.fetch(req(provider,'Springdale'))).metadata.discoveryDiagnostics).toMatchObject(reason);
 }
});
test('address grounds a hotel without destination in its title; returned URL preference and null inventory survive',async()=>{
 const {provider}=fixture([{title:'Harbor Hotel',address:'1 Main Street, Boston, MA',placeId:'p1',website:'https://harbor.example/',link:'https://listing.example/hotel',price:'$180',availability:'available'}]);
 const request=req(provider,'Boston');const fetched=await provider.fetch(request);const [row]=provider.normalize(fetched.raw,request,fetched.metadata);
 expect(row.claim.normalizedValue).toMatchObject({listingUrl:'https://harbor.example/',reservationUrl:null,price:null,currentAvailability:null});
});
test.each(['javascript:alert(1)','http://hotel.example/book','https://127.0.0.1/book'])('unsupported URL %s cannot become a booking link',async website=>{
 const {provider}=fixture([{title:'Harbor Hotel',address:'1 Main Street, Boston',website}]);const request=req(provider,'Boston');const fetched=await provider.fetch(request);
 expect(provider.normalize(fetched.raw,request,fetched.metadata)[0].source.url).toBeNull();expect(fetched.metadata.discoveryDiagnostics.unsupportedUrlCount).toBe(1);
});
test('bounded discovery does not process additional records',async()=>{
 const {provider}=fixture(Array.from({length:9},(_,i)=>({title:`Hotel ${i}`,address:'Boston'})));const fetched=await provider.fetch(req(provider,'Boston'));
 expect(fetched.raw.results).toHaveLength(6);expect(fetched.metadata.discoveryDiagnostics.truncatedCount).toBe(3);
});
test.each([
 ['Desert Pearl Inn','Springdale','https://www.desertpearl.com/'],
 ['Harbor Hotel','Boston','https://harborhotel.example/'],
 ['Forest Lodge','Portland','https://forestlodge.example/'],
])('prioritizes exact property %s at rank three while extracting at most two pages',async(name,destination,url)=>{
 const resource={kind:'hotel',name,destination};
 const results=[{title:`${name} reviews`,url:'https://reviews.example/hotel',content:destination},
  {title:`${name} rates`,url:'https://listings.example/hotel',content:destination},
  {title:`${name} official website`,url,content:destination},
  {title:'Unrelated Hotel',url:'https://unrelated.example',content:destination}];
 const client={search:jest.fn(async()=>({results})),extract:jest.fn(async urls=>({results:urls.map(url=>({url,raw_content:`${name} in ${destination}. Reserve directly.`}))}))};
 const provider=createTavilyEvidenceProvider({tavilyClient:client,stageRaw:async()=>({}),now:()=>NOW});
 const request=provider.buildRequest({topic:'local_business',entity:{entityId:'place:test',displayName:destination},webScope:{resource}});
 const fetched=await provider.fetch(request);
 expect(client.extract.mock.calls[0][0]).toEqual([url,'https://reviews.example/hotel']);
 expect(client.search).toHaveBeenCalledTimes(1);expect(client.extract).toHaveBeenCalledTimes(1);
 expect(provider.normalize(fetched.raw,request,fetched.metadata).some(row=>row.source.url===url)).toBe(true);
});
test('ranking does not admit HTTP or bypass extraction identity checks',async()=>{
 const resource={kind:'hotel',name:'Harbor Hotel',destination:'Boston'};
 const results=[{title:'Harbor Hotel',url:'http://harborhotel.example',content:'Boston'},
 {title:'Harbor Hotel',url:'https://harborhotel.example',content:'Boston'}];
 expect(selectResourceUrls(results,resource)).toEqual(['https://harborhotel.example']);
 const provider=createTavilyEvidenceProvider({tavilyClient:{search:async()=>({results}),extract:async()=>({results:[{url:results[1].url,raw_content:'Harbor Hotel in Another City.'}]})},stageRaw:async()=>({}),now:()=>NOW});
 const request=provider.buildRequest({topic:'local_business',entity:{entityId:'place:test',displayName:'Boston'},webScope:{resource}});const fetched=await provider.fetch(request);
 expect(provider.normalize(fetched.raw,request,fetched.metadata)).toEqual([]);
});
test('URL-less hotel discovery survives broker normalization into model context',async()=>{
 const {provider}=fixture([{title:'Harbor Hotel',address:'1 Main Street, Boston',cid:'123'}]);
 const broker=createEvidenceBroker({providers:[provider],now:()=>NOW,refreshHashSecret:'offline',recordRefreshEvent:async()=>{},acquireLease:async()=>{throw Error('ephemeral only');},releaseLease:async()=>{}});
 const tools=createSimpleTravelTools({broker,now:()=>NOW,destinationResolver:async name=>({entityId:'place:test',displayName:name})});
 const result=await tools.execute('read_travel',{destination:'Boston',question:'Where to stay?',topics:['lodging_strategy']},{requestId:'hotels',userMessage:'Where to stay?'});
 expect(result.evidence.some(row=>row.claim.normalizedValue.title==='Harbor Hotel'&&row.source.url===null)).toBe(true);
 expect(JSON.stringify(result.modelContext)).toContain('Harbor Hotel');
});
test('captured Desert Pearl search now considers the official candidate without another search',()=>{
 const capture=require('../../../../docs/audits/trailie-link-live-acceptance-2026-10-17.json');
 const item=capture.searchDiagnostics.find(item=>item.resource.name==='Desert Pearl Inn');
 expect(item.candidates[2].url).toBe('https://www.desertpearl.com');
 expect(selectResourceUrls(item.candidates,item.resource)[0]).toBe(item.candidates[2].url);
 expect(selectResourceUrls(item.candidates,item.resource)).toHaveLength(2);
});
