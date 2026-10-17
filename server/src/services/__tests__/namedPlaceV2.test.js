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
test('verified park qualifiers work on either side without weakening identity or geography',()=>{
 expect(matchName('Bryce Canyon Sunrise Point',point('Sunrise Point'),[anchor]).type).toBe('contextual_exact');
 expect(matchName('Sunrise Point Bryce Canyon National Park',point('Sunrise Point'),[anchor]).type).toBe('contextual_exact');
 expect(matchName('Bryce Canyon Sunrise Point',point('Sunrise Point'),[]).type).toBe('none');
 expect(matchName('Bryce Canyon Sunrise Point',point('Sunrise Point','id','CA'),[anchor]).type).toBe('none');
 expect(matchName('Bryce Canyon Sunrise Point',point('Sunrise Point Trailhead'),[anchor]).type).toBe('none');
 expect(matchName('Sunrise Point and Sunset Point',point('Sunrise Point'),[anchor]).type).toBe('none');
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
 const service={getParkPlacesEvidence:jest.fn(async()=>({observedAt:new Date().toISOString(),data:{thingstodo:[{id:'article',title:'Sunrise Point',latitude:'37',longitude:'-112'}],places:[{id:'real',title:'Sunrise Point',latitude:'37',longitude:'-112',url:'https://www.nps.gov/places/sunrise.htm'},{id:'missing',title:'A place'}]}}))};
 const lookup=createOfficialRecordsLookup({service:()=>service});
 const rows=await lookup([anchor]);expect(rows).toHaveLength(1);expect(rows[0].place_id).toBe('nps:place:real');
});
test('unverified anchor cannot establish contextual equivalence through resolver',async()=>{
 const p=createNamedPlaceEvidenceProvider({catalog:{},officialLookup:jest.fn(),lookup:async()=>[point('Bryce Canyon National Park Sunrise Point')]});
 const r=await p.fetch(p.buildRequest({entity:{displayName:'Sunrise Point'},queryProvenance:{destinationAnchors:[{...anchor,source:'model'}]}}));
 expect(r.raw).toBeNull();expect(r.metadata.candidateDiagnostics[0].nameMatchType).toBe('none');
});
describe('official aspect records recover a named area without guessing',()=>{
 const yell={source:'nps',parkCode:'yell',sourceId:'nps:park:yell',name:'Yellowstone National Park',shortName:'Yellowstone',country:'US',states:['WY','MT','ID']};
 const official=(title,id,lat,lng)=>({name:title,place_id:`nps:place:${id}`,types:['point_of_interest'],officialParkCode:'yell',officialUrl:`https://www.nps.gov/places/${id}.htm`,
  address_components:[{short_name:'US',types:['country']}],geometry:{location:{lat,lng}},formatted_address:'WY, MT, ID'});
 const lamar=[official('Lamar Valley - Wildlife Watching','ww',44.914485,-110.268815),official('Lamar Valley - Wolf Watching','wolf',44.869164,-110.166472),
  official('Lamar Valley at Crystal Creek','cc',44.911769,-110.327838),official('Lamar River Bridge','bridge',44.91541,-110.322483)];
 test('clustered "<name> - aspect" records resolve to the official record nearest their centre',async()=>{
  const lookup=jest.fn();const p=createNamedPlaceEvidenceProvider({catalog:{},lookup,officialLookup:async()=>lamar});
  const r=await p.fetch(p.buildRequest({entity:{displayName:'Lamar Valley'},queryProvenance:{destinationAnchors:[yell]}}));
  expect(lookup).not.toHaveBeenCalled();
  expect(r.raw).toMatchObject({name:'Lamar Valley',source:'nps',canonicalId:'nps:place:ww',sourceUrl:'https://www.nps.gov/places/ww.htm'});
  const [row]=p.normalize(r.raw,p.buildRequest({entity:{displayName:'Lamar Valley'}}),r.metadata);
  expect(row.source.sourceClass).toBe('official_owner');expect(row.claim.normalizedValue.requestedName).toBe('Lamar Valley');
 });
 test('aspect records spread far apart stay unresolved',async()=>{
  const lookup=jest.fn(async()=>[]);const far=[official('Lamar Valley - North','n',44.9,-110.2),official('Lamar Valley - South','s',44.2,-110.9)];
  const p=createNamedPlaceEvidenceProvider({catalog:{},lookup,officialLookup:async()=>far});
  const r=await p.fetch(p.buildRequest({entity:{displayName:'Lamar Valley'},queryProvenance:{destinationAnchors:[yell]}}));
  expect(r.raw).toBeNull();
 });
 test('a longer name that merely starts with the request is not an aspect',async()=>{
  const lookup=jest.fn(async()=>[]);const p=createNamedPlaceEvidenceProvider({catalog:{},lookup,officialLookup:async()=>[official('Lamar River Bridge','bridge',44.91541,-110.322483)]});
  const r=await p.fetch(p.buildRequest({entity:{displayName:'Lamar River'},queryProvenance:{destinationAnchors:[yell]}}));
  expect(r.raw).toBeNull();
 });
});
describe('a named feature and a same-name town at the same spot are one place, not ambiguity',()=>{
 const glac={source:'nps',parkCode:'glac',sourceId:'nps:park:glac',name:'Glacier National Park',shortName:'Glacier',country:'US',states:['MT']};
 const g=(name,id,types,lat,lng)=>({name,place_id:id,types,address_components:[{short_name:'US',types:['country']},{short_name:'MT',types:['administrative_area_level_1']}],geometry:{location:{lat,lng}},formatted_address:'Montana'});
 test('the natural feature wins over a co-located locality of the same name',async()=>{
  const lookup=jest.fn(async()=>[g('Lake McDonald','lake',['establishment','natural_feature'],48.5832,-113.9256),g('Lake McDonald','town',['locality','political'],48.5787,-113.9226)]);
  const p=createNamedPlaceEvidenceProvider({catalog:{},lookup,officialLookup:async()=>[]});
  const r=await p.fetch(p.buildRequest({entity:{displayName:'Lake McDonald'},queryProvenance:{destinationAnchors:[glac],contextualRegions:[{code:'MT'}]}}));
  expect(r.raw).toMatchObject({canonicalId:'google:place:lake'});
 });
 test('two distinct features of the same name stay ambiguous',async()=>{
  const lookup=jest.fn(async()=>[g('Lake McDonald','a',['natural_feature'],48.58,-113.92),g('Lake McDonald','b',['natural_feature'],48.59,-113.93)]);
  const p=createNamedPlaceEvidenceProvider({catalog:{},lookup,officialLookup:async()=>[]});
  const r=await p.fetch(p.buildRequest({entity:{displayName:'Lake McDonald'},queryProvenance:{destinationAnchors:[glac],contextualRegions:[{code:'MT'}]}}));
  expect(r.raw).toBeNull();expect(r.metadata.unresolvedReason).toBe('ambiguous_identity');
 });
 test('a feature and a same-name town far apart stay ambiguous',async()=>{
  const lookup=jest.fn(async()=>[g('Lake McDonald','lake',['natural_feature'],48.58,-113.92),g('Lake McDonald','town',['locality','political'],47.0,-110.0)]);
  const p=createNamedPlaceEvidenceProvider({catalog:{},lookup,officialLookup:async()=>[]});
  const r=await p.fetch(p.buildRequest({entity:{displayName:'Lake McDonald'},queryProvenance:{destinationAnchors:[glac],contextualRegions:[{code:'MT'}]}}));
  expect(r.raw).toBeNull();
 });
});
