'use strict';
const {createNpsEvidenceProvider}=require('../providers/npsEvidenceProvider');
const {npsSourceDetails,explicitCurrentClosure}=require('../../utils/npsSourceDetails');
const {extractOperationalFacts}=require('../../utils/operationalFactExtraction');
const {validateSimpleMutation}=require('../trailieSimpleGuard');
const {normalizeEvidenceLocation}=require('../../utils/trailieCanonicalLocation');
const {assessPlaceEligibility}=require('../../utils/modelFirstPlaceEligibility');
const {modelEvidenceValue}=require('../../utils/modelEvidenceView');
const corpus=require('./fixtures/nps-source-preservation-zion.json');
const NOW=new Date('2026-10-12T12:00:00Z');
async function normalize(){
 const provider=createNpsEvidenceProvider({npsClient:{getParkActivities:async()=>corpus.thingstodo,getParkPlaces:async()=>corpus.places},now:()=>NOW});
 const req=provider.buildRequest({topic:'activities',entity:{entityId:'nps:park:zion'}}),f=await provider.fetch(req,{});
 return provider.normalize(f.raw,req,{...f.metadata,sourceIngestionComplete:true});
}
test('captured source guidance survives without optional sentence selection',async()=>{
 const rows=await normalize(),value=n=>rows.find(r=>r.source.provider==='nps'&&r.claim.normalizedValue.name===n).claim.normalizedValue;
 expect(value('Lava Point Overlook').sourceDetails.bodyText).toContain('May through September, as weather allows');
 expect(value('Lava Point Overlook').closureStatus).toBe('unknown');
 expect(value('Stargazing in Zion').sourceDetails.longDescription).toContain('Bring jackets and blankets to stay warm');
 expect(value("Pa'rus - Footprints in Time").sourceDetails.bodyText).toContain('staying on designated trails');
 expect(value("Pa'rus - Diversion Dam").sourceDetails.bodyText).toContain('Look at the shoreline');
 const museum=value('Zion Human History Museum');
 expect(museum.sourceDetails.bodyText).toContain('Towers of the Virgin');
 expect(museum.sourceDetails.bodyText).toContain('not considered accessible');
 expect(museum.sourceDetails.bodyText).toContain('way down-canyon');
 expect(museum.currentStatus).toBe('unknown');
});
test('model view omits raw source bodies while retaining extracted restrictions',async()=>{
 const value=(await normalize()).find(r=>r.claim.normalizedValue.name==='Weeping Rock').claim.normalizedValue;
 const modelValue=modelEvidenceValue(value);
 expect(modelValue.sourceDetails).toBeUndefined();
 expect(modelValue.closureStatus).toBe('closed');
 expect(modelValue.operationalFacts).toEqual(expect.arrayContaining([expect.objectContaining({type:'trail_closed'})]));
 expect(value.sourceDetails.locationDescription).toContain('AREA CURRENTLY CLOSED');
});
test('Weeping Rock closure is place-bound and enforced by unchanged guard',async()=>{
 const candidate=(await normalize()).find(r=>r.claim.identity.startsWith('thingstodo:')&&r.claim.normalizedValue.name==='Weeping Rock');
 expect(candidate.claim.normalizedValue).toMatchObject({exposureLevel:'low',closureStatus:'closed'});
 expect(candidate.claim.normalizedValue.operationalFacts).toEqual(expect.arrayContaining([expect.objectContaining({type:'trail_closed',provenance:expect.objectContaining({field:'locationDescription',excerpt:'AREA CURRENTLY CLOSED DUE TO ROCKFALL'})})]));
 // Coordinates isolate closure validation; the saved NPS source lacks them.
 const row=normalizeEvidenceLocation({...candidate,evidenceId:'closed',observation:{observedAt:NOW.toISOString(),expiresAt:new Date(+NOW+86400000).toISOString()},claim:{...candidate.claim,normalizedValue:{...candidate.claim.normalizedValue,latitude:37.2,longitude:-113}}});
 expect(assessPlaceEligibility(row,[row],{avoidExposure:true}).status).toBe('incompatible');
 const proposal={response:'Walk.',plan:{intro:'A walk.',days:[{id:'d',dayNumber:1,label:'Day',stops:[{id:'s',order:1,type:'walk',name:'Weeping Rock',evidenceRef:'closed',duration:30,timeWindow:'Morning',note:''}],dayStructure:{type:'sightseeing',startPeriod:'morning',endPeriod:'evening',summary:'Visit and rest.',blocks:[{kind:'outing',periods:['morning'],label:'Walk',note:'',stopIds:['s']},{kind:'downtime',periods:['midday','evening'],label:'Rest',note:'',stopIds:[]}]}}]}};
 const verdict=validateSimpleMutation({proposal,evidence:[row],snapshot:{},message:'No exposure',turnConstraints:[{avoidExposure:true}],now:NOW});
 expect(verdict.issues).toContain('official_closure_conflict');
});
test.each([
 'The trail may be closed during winter.', 'The trail was closed in 2020.',
 'The trail is not closed.', 'If the trail is closed, turn around.',
 'The trail is closed during winter.', 'The trail will be closed tomorrow.',
 'Other Trail is currently closed due to rockfall.',
])('does not manufacture current closure: %s',text=>{
 expect(explicitCurrentClosure({title:'Main Trail',longDescription:text})).toBeNull();
 expect(npsSourceDetails({longDescription:text}).longDescription).toBe(text);
});
test('missing information and structured public-access flag do not mean open',()=>{
 expect(explicitCurrentClosure({title:'Main Trail',isOpenToPublic:'1'})).toBeNull();
 expect(npsSourceDetails({})).toEqual({});
});
test('a museum is not closed merely because its connecting trail is closed',()=>{
 expect(explicitCurrentClosure({title:'History Museum',bodyText:'The trail is currently closed due to rockfall.'})).toBeNull();
});
test('second destination: requirements in places body retain actual field provenance',()=>{
 const item={id:'maze',title:'Explore the Maze District',url:'https://www.nps.gov/cany/planyourvisit/maze.htm',bodyText:'Access requires a high-clearance four-wheel-drive vehicle. A permit is required for all overnight trips.',seasonDescription:'Roads may be impassable after rain.'};
 const facts=extractOperationalFacts({item,parkCode:'cany',observedAt:NOW.toISOString()});
 expect(facts).toEqual(expect.arrayContaining([expect.objectContaining({type:'vehicle_restriction',provenance:expect.objectContaining({field:'bodyText'})}),expect.objectContaining({type:'reservation_required'})]));
 expect(npsSourceDetails(item).seasonDescription).toBe(item.seasonDescription);
 expect(explicitCurrentClosure(item)).toBeNull();
});
