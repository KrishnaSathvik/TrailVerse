'use strict';
jest.mock('../googleMapsTransport', () => ({ getGoogleMaps: jest.fn() }));
jest.mock('../../config/providerTestPolicy', () => ({ recordExternalProviderHttpRequest: jest.fn() }));
const { getGoogleMaps } = require('../googleMapsTransport');
const { createNamedPlaceEvidenceProvider } = require('../providers/namedPlaceEvidenceProvider');
const old = process.env.GMAPS_SERVER_KEY;
beforeEach(() => { process.env.GMAPS_SERVER_KEY='offline-fixture'; getGoogleMaps.mockReset(); });
afterEach(() => { if (old===undefined) delete process.env.GMAPS_SERVER_KEY; else process.env.GMAPS_SERVER_KEY=old; });
const row = { name:'Example Park',place_id:'exact-id',types:['park'],formatted_address:'Utah',geometry:{location:{lat:37,lng:-113}} };
test.each(['exact-id', 'different-id'])('details country belongs only to the requested identity (%s)', async id => {
 getGoogleMaps.mockResolvedValueOnce({status:200,data:{status:'OK',results:[{...row},{...row,name:'Different Park'}]}})
 .mockResolvedValueOnce({status:200,data:{status:'OK',result:{place_id:id,address_components:[{short_name:'US',types:['country']},{short_name:'UT',types:['administrative_area_level_1']}]}}});
 const provider=createNamedPlaceEvidenceProvider({catalog:{}});
 const r=await provider.fetch(provider.buildRequest({entity:{displayName:'Example Park'},queryProvenance:{contextualRegions:[{name:'Utah'}]}}));
 expect(getGoogleMaps).toHaveBeenCalledTimes(2);
 expect(getGoogleMaps.mock.calls[1][1].params).toMatchObject({place_id:'exact-id',fields:'place_id,address_components'});
 expect(r.providerAttempts).toBe(2);
 if(id==='exact-id') expect(r.raw.countryCode).toBe('US');
 else {expect(r.raw).toBeNull();expect(r.metadata.candidateDiagnostics[0].rejectionReason).toBe('details_identity_mismatch');}
});
