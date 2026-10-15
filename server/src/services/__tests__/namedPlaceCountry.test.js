'use strict';
const { createNamedPlaceEvidenceProvider } = require('../providers/namedPlaceEvidenceProvider');
const country = code => ({ short_name: code, types: ['country'] });
const state = code => ({ short_name: code, types: ['administrative_area_level_1'] });
const place = components => ({ name:'Example Park', place_id:'exact-id', types:['park'],
  formatted_address:'Utah', address_components:components, geometry:{location:{lat:37.3,lng:-113}} });
const request = (p, provenance = { contextualRegions: [{ name: 'Utah' }] }) => p.buildRequest({
  entity: { displayName: 'Example Park' },
  queryProvenance: provenance,
});
async function resolve(row, provenance) {
  const p = createNamedPlaceEvidenceProvider({ catalog: {}, lookup: async () => [row] });
  return p.fetch(request(p, provenance));
}
test('structured country accepts an abbreviated address', async()=>{
 const r=await resolve(place([country('US'),state('UT')]));expect(r.raw.countryCode).toBe('US');
 expect(r.metadata.candidateDiagnostics[0]).toMatchObject({nameMatch:true,regionMatch:true,contextMatch:true,rejectionReason:null});
});
test('missing country stays unresolved',async()=>{
 const r=await resolve({...place([]),formatted_address:'Utah, USA'});
 expect(r.raw).toBeNull();
 expect(r.metadata.candidateDiagnostics[0].rejectionReason).toBe('country_unknown');
});
test('foreign country survives as explicit evidence for the guard',async()=>{
 const r=await resolve(
   {...place([country('CA')]),formatted_address:'Alberta, Canada'},
   { contextualRegions: [] },
 );
 expect(r.raw).not.toBeNull();
 expect(r.raw.countryCode).toBe('CA');
 expect(r.metadata.candidateDiagnostics[0].rejectionReason).toBeNull();
});
test.each([['VI'],['AS'],['PR'],['GU'],['MP']])('U.S. territory country %s is admitted as domestic',async(code)=>{
 const r=await resolve(
   {...place([country(code)]),formatted_address:`Territory ${code}`},
   { contextualRegions: [] },
 );
 expect(r.raw).not.toBeNull();
 expect(r.raw.countryCode).toBe(code);
});
test('structured state handles postal addresses without broadening geography',async()=>{
 const r=await resolve({...place([country('US'),state('UT')]),formatted_address:'Springdale, UT 84767'});expect(r.raw).not.toBeNull();
 const wrong=await resolve({...place([country('US'),state('CO')]),formatted_address:'Colorado'});expect(wrong.raw).toBeNull();expect(wrong.metadata.candidateDiagnostics[0].rejectionReason).toBe('region_mismatch');
});
test('exact matching remains required',async()=>{
 const r=await resolve({...place([country('US')]),name:'Example Park Visitor Center'});expect(r.raw).toBeNull();expect(r.metadata.candidateDiagnostics[0].rejectionReason).toBe('name_mismatch');
});
test('mismatched details identity stays unresolved',async()=>{
 const r=await resolve({...place([country('US')]),detailsIdentityMismatch:true});expect(r.raw).toBeNull();expect(r.metadata.candidateDiagnostics[0].rejectionReason).toBe('details_identity_mismatch');
});

test.each(['Cinnamon Bay', 'Peace Hill'])('%s matches VI region when Google uses St John as admin1', async name => {
  const row = { ...place([country('VI'), state('St John')]), name,
    formatted_address: 'St John, U.S. Virgin Islands', geometry: { location: { lat: 18.35, lng: -64.75 } } };
  const p = createNamedPlaceEvidenceProvider({ catalog: {}, lookup: async () => [row] });
  const resolveRegion = code => p.fetch(p.buildRequest({ entity: { displayName: name },
    queryProvenance: { contextualRegions: [{ code }] } }));
  const result = await resolveRegion('VI');
  expect(result.raw).toMatchObject({ name, countryCode: 'VI', canonicalId: 'google:place:exact-id' });
  expect(result.metadata.candidateDiagnostics[0]).toMatchObject({ regionMatch: true, rejectionReason: null });
  expect((await resolveRegion('PR')).raw).toBeNull();
  expect((await resolveRegion('UT')).raw).toBeNull();
});

test('leading The resolves the museum without accepting other attractions or ambiguous identities', async () => {
  const museum = { ...place([country('US'), state('IL')]), name: 'The Art Institute of Chicago', types: ['museum', 'point_of_interest'] };
  const run = async rows => {
    const p = createNamedPlaceEvidenceProvider({ catalog: {}, lookup: async () => rows });
    return p.fetch(p.buildRequest({ entity: { displayName: 'Art Institute of Chicago' },
      queryProvenance: { contextualRegions: [{ code: 'IL' }] } }));
  };
  expect((await run([museum])).raw?.canonicalId).toBe('google:place:exact-id');
  expect((await run([{ ...museum, name: 'School of the Art Institute of Chicago' }])).raw).toBeNull();
  expect((await run([{ ...museum, name: 'The Art Institute of Chicago Gift Shop' }])).raw).toBeNull();
  expect((await run([museum, { ...museum, place_id: 'different-id' }])).metadata.unresolvedReason).toBe('ambiguous_identity');
  expect((await run([{ ...museum, address_components: [country('US'), state('MO')] }])).raw).toBeNull();
});
