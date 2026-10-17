'use strict';
const {createNamedPlaceEvidenceProvider}=require('../providers/namedPlaceEvidenceProvider');
const anchor={source:'nps',parkCode:'test',sourceId:'nps:park:test',name:'Test National Park',country:'US',states:['CA']};
const point=(name,id=name,types=['point_of_interest'])=>({name,place_id:id,types,address_components:[{short_name:'US',types:['country']},{short_name:'CA',types:['administrative_area_level_1']}],geometry:{location:{lat:37.7,lng:-119.6}}});
async function resolve(name,results){const p=createNamedPlaceEvidenceProvider({catalog:{},officialLookup:async()=>[],lookup:async()=>results});const q=p.buildRequest({entity:{displayName:name},queryProvenance:{destinationAnchors:[anchor],contextualRegions:[{name:'California'}]}});const r=await p.fetch(q);return {...r,evidence:p.normalize(r.raw,q,r.metadata)};}
test.each([
 ["Cook’s Meadow",[point("Cook's Meadow Loop")]],
 ['Lower Yosemite Falls',[point('Lower Yosemite Fall Trail')]],
 ['Oconaluftee River Trail',[point('Oconaluftee River Trailhead')]],
 ['Lakeview Drive',[point('Fontana Lake Overlook'),point('Lakeview Drive East Parking #4')]],
])('%s returns grounded alternatives without asserting equivalence',async(name,rows)=>{
 const result=await resolve(name,rows);expect(result.raw).toBeNull();expect(result.evidence).toHaveLength(rows.length);
 for(const row of result.evidence){expect(row.claim.normalizedValue.alternativeFor).toBe(name);expect(row.claim.normalizedValue.requestedName).toBeUndefined();expect(row.claim.normalizedValue.name).not.toBe(name);}
});
test('Yosemite Falls ambiguity remains unresolved even with grounded alternatives',async()=>{
 const r=await resolve('Yosemite Falls',[point('Yosemite Falls','upper'),point('Yosemite Falls','lower')]);expect(r.raw).toBeNull();expect(r.metadata.unresolvedReason).toBe('ambiguous_identity');expect(r.evidence).toHaveLength(2);
});
test('Deep Creek mixed types do not turn an unsupported feature into an anchor',async()=>{
 const r=await resolve('Deep Creek',[point('Deep Creek','river',['water']),point('Deep Creek Trailhead','trail')]);expect(r.raw).toBeNull();expect(r.evidence.map(e=>e.claim.normalizedValue.name)).toEqual(['Deep Creek Trailhead']);
});
test('unknown country, wrong region, missing coordinates and partial matches stay unresolved',async()=>{
 const a=point('Trailhead');a.address_components=[];const b=point('Overlook');b.address_components[1].short_name='UT';const c=point('Loop');c.geometry.location.lat=NaN;const d={...point('Entrance'),partial_match:true};const r=await resolve('Trail',[a,b,c,d]);expect(r.raw).toBeNull();expect(r.evidence).toEqual([]);
});
test('exact experience remains exact',async()=>{const r=await resolve("Cook's Meadow Loop",[point("Cook's Meadow Loop")]);expect(r.raw.name).toBe("Cook's Meadow Loop");expect(r.evidence[0].claim.normalizedValue.requestedName).toBe("Cook's Meadow Loop");});
test('only an explicit provider relationship preserves experience name with distinct map anchor',async()=>{
 const {supportedExperienceAnchor}=require('../providers/namedPlaceExperience');
 const place={...point('River Trailhead','nps:place:access'),officialParkCode:'test',officialUrl:'https://www.nps.gov/places/access.htm'};
 expect(supportedExperienceAnchor('River Trail',place,[anchor])).toBeNull();
 place.experienceRelations=[{experience:{id:'nps:experience:river',name:'River Trail'},anchorId:'nps:place:access',relationship:'trailhead_for',sourceRecordId:'nps:place:access',sourceUrl:place.officialUrl}];
 expect(supportedExperienceAnchor('River Trail',place,[anchor])).toMatchObject({experience:{id:'nps:experience:river',name:'River Trail'},mapAnchor:{canonicalPlaceId:'nps:place:access',name:'River Trailhead',relationship:'trailhead_for'}});
 expect(supportedExperienceAnchor('Other Trail',place,[anchor])).toBeNull();
 expect(supportedExperienceAnchor('River Trail',{...place,officialParkCode:null},[anchor])).toBeNull();
 place.experienceRelations[0].anchorId='nps:place:other';expect(supportedExperienceAnchor('River Trail',place,[anchor])).toBeNull();
});

test('supported anchor survives the provider and canonical guard without renaming the activity',async()=>{
 const {normalizeEvidenceLocation}=require('../../utils/trailieCanonicalLocation');
 const {validateSimpleMutation}=require('../trailieSimpleGuard');
 const now=new Date('2026-10-10T12:00:00Z');
 const place={...point('River Trailhead','nps:place:access'),officialParkCode:'test',officialUrl:'https://www.nps.gov/places/access.htm',experienceRelations:[{experience:{id:'nps:experience:river',name:'River Trail'},anchorId:'nps:place:access',relationship:'trailhead_for',sourceRecordId:'nps:place:access',sourceUrl:'https://www.nps.gov/places/access.htm'}]};
 const provider=createNamedPlaceEvidenceProvider({catalog:{},officialLookup:async()=>[place],lookup:jest.fn(),now:()=>now});
 const request=provider.buildRequest({entity:{displayName:'River Trail'},queryProvenance:{destinationAnchors:[anchor]}});
 const result=await provider.fetch(request);
 const normalized=provider.normalize(result.raw,request,result.metadata)[0];
 const row=normalizeEvidenceLocation({...normalized,evidenceId:'link',observation:{observedAt:now.toISOString(),expiresAt:'2026-10-11T12:00:00Z'}});
 const candidate={intro:'A gentle walk.',days:[{id:'d1',dayNumber:1,label:'Walk and rest',stops:[{id:'s1',order:1,type:'walk',name:'River Trail',note:'Walk from the grounded access point.',duration:45,timeWindow:'Morning',evidenceRef:'link'}],dayStructure:{type:'rest',startPeriod:'morning',endPeriod:'evening',summary:'A short walk and rest.',blocks:[{kind:'outing',periods:['morning'],label:'River walk',note:'Enjoy the trail.',stopIds:['s1']},{kind:'downtime',periods:['midday','afternoon','evening'],label:'Rest',note:'Lunch, rest and dinner.',stopIds:[]}]}}]};
 const verdict=validateSimpleMutation({proposal:{response:'A gentle walk.',plan:candidate},message:'Plan a walk',evidence:[row],now});
 expect(verdict.issues).toEqual([]);
 expect(verdict.plan.days[0].stops[0]).toMatchObject({name:'River Trail',canonicalPlaceName:'River Trailhead',canonicalPlaceId:'nps:place:access',experience:{id:'nps:experience:river'},mapAnchor:{relationship:'trailhead_for'},location:{sourceEntity:'nps:place:access'}});
 const alternative=structuredClone(row);
 Object.assign(alternative.claim.normalizedValue,{name:'River Trailhead',alternativeFor:'River Trail'});
 delete alternative.claim.normalizedValue.requestedName; delete alternative.claim.normalizedValue.experience; delete alternative.claim.normalizedValue.mapAnchor;
 expect(validateSimpleMutation({proposal:{response:'A gentle walk.',plan:candidate},message:'Plan a walk',evidence:[alternative],now}).issues).toContain('stop_name_identity_mismatch');
});
