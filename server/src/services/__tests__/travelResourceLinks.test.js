'use strict';
const { createTavilyEvidenceProvider } = require('../providers/tavilyEvidenceProvider');
const { createRidbEvidenceProvider } = require('../providers/ridbEvidenceProvider');
const { createEvidenceBroker } = require('../evidenceBrokerService');
const { createSimpleTravelTools } = require('../trailieTravelData');
const { verifiedResourcePage, resourceUrl } = require('../../utils/travelResourceLinks');
const { validateGuidanceLinks, stripUnverifiedLinks } = require('../../utils/itineraryReliability');
const { exportPublicPlan } = require('../../../../shared/publicPlanExport.cjs');
const NOW = new Date('2026-10-17T12:00:00Z');
const cases = [
 ['hotel', 'Harbor Hotel', 'Portland', 'https://harbor.example/reservations'],
 ['campground', 'Cedar Campground', 'Example National Park', 'https://www.recreation.gov/camping/campgrounds/123', 'ridb:facility:123'],
 ['permit', 'Summit Permits', 'Example National Park', 'https://www.recreation.gov/permits/456', 'ridb:facility:456'],
 ['shuttle', 'Valley Shuttle', 'Springdale', 'https://transit.example/schedule'],
 ['rental_car', 'Airport Rentals', 'Las Vegas', 'https://rental.example/reservations'],
 ['restaurant', 'River Cafe', 'Boston', 'https://cafe.example/reservations'],
 ['attraction', 'Harbor Museum', 'Boston', 'https://museum.example/tickets'],
 ['tour', 'Canyon Tours', 'Springdale', 'https://tours.example/book'],
];
function providerFor(resource, url, options = {}) {
 const title = `${resource.name} — ${resource.destination}`;
 const text = `${resource.name} in ${resource.destination}. Book reservations or tickets here. Rates from $180 are examples, not date-specific inventory.`;
 const client = { search: jest.fn(async () => ({ results: [{ title, url, content: text.repeat(4) }] })),
   extract: jest.fn(async () => ({ results: [{ url, raw_content: text }] })) };
 Object.assign(client, options);
 return { client, provider: createTavilyEvidenceProvider({ tavilyClient: client, now: () => NOW, stageRaw: async () => ({}) }) };
}
function request(resource) {
 return { entity: { entityId: 'place:test', displayName: resource.destination }, topic: 'local_business', webScope: { resource } };
}
test.each(cases.map(row => [...row.slice(0, 4), row[4] || null]))('%s exact link survives extraction, evidence, serialization and public export', async (kind, name, destination, url, facilityId) => {
 const resource = { kind, name, destination, facilityId };
 const { provider, client } = providerFor(resource, url);
 const req = provider.buildRequest(request(resource));
 const fetched = await provider.fetch(req);
 const rows = provider.normalize(fetched.raw, req, fetched.metadata);
 expect(rows).toHaveLength(1);
 expect(rows[0].claim.normalizedValue).toMatchObject({ resourceName: name, listingUrl: url, currentAvailability: null, price: null, availabilityDates: null });
 expect(rows[0].claim.normalizedValue.reservationUrl).toBe(kind === 'shuttle' ? null : url);
 expect(client.search).toHaveBeenCalledTimes(1); expect(client.extract).toHaveBeenCalledTimes(1);
 expect(fetched.providerAttempts).toBe(2);
 await provider.fetch(req); expect(client.search).toHaveBeenCalledTimes(1); expect(client.extract).toHaveBeenCalledTimes(1);
 const sections = [{ placement: 'after_plan', heading: 'Things to Know', markdown: `[${name}](${url}) — check availability directly.` }];
 expect(validateGuidanceLinks(sections, rows)).toEqual([]);
 const saved = JSON.parse(JSON.stringify({ days: [{ id: 'day-1', dayNumber: 1, stops: [] }], narrativeSections: sections }));
 expect(exportPublicPlan(saved).narrativeSections).toEqual(sections);
 expect(stripUnverifiedLinks(sections[0].markdown, rows)).toBe(sections[0].markdown);
});
test.each([
 { url: 'https://www.recreation.gov/permits/999' },
 { url: 'https://fake-recreation.gov/permits/456' },
 { url: 'https://www.recreation.gov/camping/campgrounds/456' },
 { _extractedText: 'Summit Permits in Another National Park. Book here.' },
 { _extractedText: 'Other Permits in Example National Park. Book here.' },
 { _extractedText: 'Summit Permits in Example National Park. Page not found.' },
 { extracted: false },
])('rejects mismatched or unverified resource %j', change => {
 const resource = { kind: 'permit', name: 'Summit Permits', destination: 'Example National Park', facilityId: 'ridb:facility:456' };
 expect(verifiedResourcePage({ url: 'https://www.recreation.gov/permits/456', title: 'Summit Permits', extracted: true,
   _extractedText: 'Summit Permits in Example National Park.', ...change }, resource)).toBeNull();
});
test.each(['http://hotel.example/book', 'https://127.0.0.1/book', 'https://user:pass@hotel.example/book', 'https://hotel.internal/book', 'javascript:alert(1)'])('unsafe resource %s cannot be followed', url => expect(resourceUrl(url)).toBeNull());
test('failed extraction does not turn a rich search snippet into a verified link', async () => {
 const resource = { kind: 'hotel', name: 'Harbor Hotel', destination: 'Portland' };
 const { provider } = providerFor(resource, 'https://hotel.example/book', { extract: async () => ({ results: [], failed_results: [{ error: '404' }] }) });
 const req = provider.buildRequest(request(resource));const fetched = await provider.fetch(req);
 expect(provider.normalize(fetched.raw, req, fetched.metadata)).toEqual([]);
});
function travel({ returnedUrl = '', returnedType = 'Campground', badId = false, maxProviderRequests } = {}) {
 const resource = { kind: returnedType === 'Permit' ? 'permit' : 'campground', name: 'Recorded Resource', destination: 'Example National Park' };
 const url = `https://www.recreation.gov/${resource.kind === 'permit' ? 'permits' : 'camping/campgrounds'}/${badId ? '999' : '123'}`;
 const web = providerFor(resource, url);
 const ridbClient = { getRecAreaFacilities: jest.fn(async () => ({ recArea: { RecAreaID: 'area', RecAreaName: resource.destination },
   facilities: [{ FacilityID: '123', FacilityName: resource.name, FacilityTypeDescription: returnedType, FacilityReservationURL: returnedUrl }] })) };
 const broker = createEvidenceBroker({ providers: [createRidbEvidenceProvider({ ridbClient, now: () => NOW }), web.provider], now: () => NOW,
   refreshHashSecret: 'offline-resource', recordRefreshEvent: async () => {}, acquireLease: async () => { throw Error('ephemeral only'); }, releaseLease: async () => {} });
 const tools = createSimpleTravelTools({ broker, now: () => NOW, maxProviderRequests,
   destinationResolver: async name => ({ entityId: 'nps:park:test', displayName: name }) });
 return { resource, web, ridbClient, tools, url };
}
test.each(['Campground', 'Permit'])('missing RIDB %s URL uses one independently extracted matching resource', async returnedType => {
 const h = travel({ returnedType });
 const result = await h.tools.execute('read_travel', { destination: h.resource.destination, question: 'Where do I reserve?', resources: [h.resource, h.resource] }, { requestId: 'test', userMessage: 'Where do I reserve?' });
 expect(result.modelContext.resourceLinks).toHaveLength(1);
 expect(result.modelContext.resourceLinks[0]).toMatchObject({ listingUrl: h.url, facilityId: 'ridb:facility:123', currentAvailability: null });
 expect(h.ridbClient.getRecAreaFacilities).toHaveBeenCalledTimes(1);
 expect(h.web.client.search).toHaveBeenCalledTimes(1); expect(h.web.client.extract).toHaveBeenCalledTimes(1);
 expect(result.providerOutcomes.map(p => p.provider)).toEqual(['ridb', 'tavily']);
});
test('returned RIDB reservation URL wins without a fallback search', async () => {
 const h = travel({ returnedUrl: 'https://www.recreation.gov/exact-returned-resource' });
 const result = await h.tools.execute('read_travel', { destination: h.resource.destination, question: 'Book?', resources: [h.resource] }, { requestId: 'returned', userMessage: 'Book?' });
 expect(result.modelContext.resourceLinks[0].reservationUrl).toBe('https://www.recreation.gov/exact-returned-resource');
 expect(h.web.client.search).not.toHaveBeenCalled();
});
test.each([{ badId: true }, { maxProviderRequests: 1 }])('unresolved fallback stays unknown without extra retries %j', async options => {
 const h = travel(options);
 const result = await h.tools.execute('read_travel', { destination: h.resource.destination, question: 'Book?', resources: [h.resource] }, { requestId: 'missing', userMessage: 'Book?' });
 expect(result.modelContext.resourceLinks).toEqual([]);
 expect(result.unresolved.some(r => r.reasonCode === 'resource_link_unverified')).toBe(true);
 expect(h.web.client.search.mock.calls.length).toBeLessThanOrEqual(1);
});
test('normal itinerary does not trigger resource searches', async () => {
 const h = travel();
 const result = await h.tools.execute('read_travel', { destination: h.resource.destination, question: 'Plan a visit', topics: ['activities'] }, { requestId: 'ordinary', userMessage: 'Plan a visit' });
 expect(result.modelContext.resourceLinks).toBeUndefined(); expect(h.ridbClient.getRecAreaFacilities).not.toHaveBeenCalled(); expect(h.web.client.search).not.toHaveBeenCalled();
});
test('unverified direct-answer hyperlinks are removed without a model repair', () => {
 for (const text of ['[Book](https://fake.example/book)', '<https://fake.example/book>', 'https://fake.example/book']) {
   expect(stripUnverifiedLinks(text, [])).not.toContain('https://fake.example');
 }
});
