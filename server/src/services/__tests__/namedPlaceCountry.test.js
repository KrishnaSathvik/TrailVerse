'use strict';
const { createNamedPlaceEvidenceProvider } = require('../providers/namedPlaceEvidenceProvider');
const country = code => ({ short_name: code, types: ['country'] });
const state = code => ({ short_name: code, types: ['administrative_area_level_1'] });
const place = components => ({ name:'Example Park', place_id:'exact-id', types:['park'],
  formatted_address:'Utah', address_components:components, geometry:{location:{lat:37.3,lng:-113}} });
const request = p => p.buildRequest({entity:{displayName:'Example Park'},queryProvenance:{contextualRegions:[{name:'Utah'}]}});
async function resolve(row) { const p=createNamedPlaceEvidenceProvider({catalog:{},lookup:async()=>[row]});return p.fetch(request(p)); }
test('structured country accepts an abbreviated address', async()=>{
 const r=await resolve(place([country('US'),state('UT')]));expect(r.raw.countryCode).toBe('US');
 expect(r.metadata.candidateDiagnostics[0]).toMatchObject({nameMatch:true,regionMatch:true,contextMatch:true,rejectionReason:null});
});
test.each([[[], 'country_unknown'],[[country('CA')],'country_mismatch']])('missing or foreign country stays unresolved',async(components,reason)=>{
 const r=await resolve({...place(components),formatted_address:'Utah, USA'});expect(r.raw).toBeNull();expect(r.metadata.candidateDiagnostics[0].rejectionReason).toBe(reason);
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
