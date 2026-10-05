'use strict';
const {createNamedPlaceEvidenceProvider}=require('../providers/namedPlaceEvidenceProvider');
const {matchName}=require('../providers/namedPlaceEquivalence');
const anchor={source:'nps',parkCode:'brca',sourceId:'nps:park:brca',name:'Bryce Canyon National Park',shortName:'Bryce Canyon',country:'US',states:['UT']};
const point=(name,id='id',state='UT')=>({name,place_id:id,types:['point_of_interest'],address_components:[{short_name:'US',types:['country']},{short_name:state,types:['administrative_area_level_1']}],geometry:{location:{lat:37.6,lng:-112.2}},formatted_address:'Utah'});
test('verified qualifier is exact equivalence, not fuzzy similarity',()=>{
 expect(matchName('Sunrise Point',point('Bryce Canyon National Park Sunrise Point'),[anchor]).type).toBe('contextual_exact');
 expect(matchName('Bryce Canyon Visitor Center',point('Bryce Canyon National Park Visitor Center'),[anchor]).type).toBe('contextual_exact');
 expect(matchName('Sunrise Point',point('Bryce Canyon National Park Sunrise Point'),[]).type).toBe('none');
 expect(matchName('Sunrise Point',point('Bryce Canyon National Park Sunrise Point','id','CA'),[anchor]).type).toBe('none');
 expect(matchName('Sunrise Point',point('Sunrise Viewpoint'),[anchor]).type).toBe('none');
});
test('harmless apostrophe differences normalize exactly',()=>{
 expect(matchName('Pa’rus Trail',point("Pa'rus Trail"),[]).type).toBe('normalized_exact');
});
test('trip prose is never appended to the identity search',()=>{
 const p=createNamedPlaceEvidenceProvider();
 expect(p.buildRequest({entity:{displayName:'Springdale'},queryProvenance:{destinationNames:['Zion and Bryce via Las Vegas'],contextualRegions:[{name:'Utah'}]}}).parameters.query).toBe('Springdale');
});
test.each(['a short loop near the visitor center','a hotel in Springdale','a nice lunch stop','scenic area near Bryce'])('vague instruction stays unresolved: %s',async name=>{
 const lookup=jest.fn();const p=createNamedPlaceEvidenceProvider({catalog:{},lookup});
 const r=await p.fetch(p.buildRequest({entity:{displayName:name}}));
 expect(r.raw).toBeNull();expect(r.metadata.unresolvedReason).toBe('descriptive_place_instruction');expect(lookup).not.toHaveBeenCalled();
});
test('official structured identity wins before Google',async()=>{
 const lookup=jest.fn();const officialLookup=jest.fn(async()=>[{...point('Bryce Canyon National Park Sunrise Point','nps:place:123'),officialParkCode:'brca',officialUrl:'https://www.nps.gov/places/example.htm'}]);
 const p=createNamedPlaceEvidenceProvider({catalog:{},lookup,officialLookup});
 const r=await p.fetch(p.buildRequest({entity:{displayName:'Sunrise Point'},queryProvenance:{destinationAnchors:[anchor]}}));
 expect(r.raw).toMatchObject({canonicalId:'nps:place:123',source:'nps'});expect(lookup).not.toHaveBeenCalled();
 expect(p.normalize(r.raw,p.buildRequest({entity:{displayName:'Sunrise Point'}}),r.metadata)[0].source.sourceClass).toBe('official_owner');
});
test('two official exact identities remain ambiguous',async()=>{
 const lookup=jest.fn();const p=createNamedPlaceEvidenceProvider({catalog:{},lookup,officialLookup:async()=>['a','b'].map(id=>({...point('Sunrise Point',id),officialParkCode:'brca'}))});
 const r=await p.fetch(p.buildRequest({entity:{displayName:'Sunrise Point'},queryProvenance:{destinationAnchors:[anchor]}}));
 expect(r.raw).toBeNull();expect(r.metadata.unresolvedReason).toBe('ambiguous_identity');expect(lookup).not.toHaveBeenCalled();
});
test('official corpus admits places with owned coordinates, not activity/article titles',async()=>{
 const {createOfficialRecordsLookup}=require('../providers/namedPlaceOfficialRecords');
 const service={getParkNamedActivitiesEvidence:jest.fn(async()=>({observedAt:new Date().toISOString(),data:{thingstodo:[{id:'article',title:'Sunrise Point',latitude:'37',longitude:'-112'}],places:[{id:'real',title:'Sunrise Point',latitude:'37',longitude:'-112',url:'https://www.nps.gov/places/sunrise.htm'},{id:'missing',title:'A place'}]}}))};
 const lookup=createOfficialRecordsLookup({service:()=>service});
 const rows=await lookup([anchor]);expect(rows).toHaveLength(1);expect(rows[0].place_id).toBe('nps:place:real');
});
test('unverified anchor cannot establish contextual equivalence through resolver',async()=>{
 const p=createNamedPlaceEvidenceProvider({catalog:{},officialLookup:jest.fn(),lookup:async()=>[point('Bryce Canyon National Park Sunrise Point')]});
 const r=await p.fetch(p.buildRequest({entity:{displayName:'Sunrise Point'},queryProvenance:{destinationAnchors:[{...anchor,source:'model'}]}}));
 expect(r.raw).toBeNull();expect(r.metadata.candidateDiagnostics[0].nameMatchType).toBe('none');
});
