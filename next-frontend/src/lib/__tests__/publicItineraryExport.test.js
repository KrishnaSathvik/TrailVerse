import { describe, expect, it } from 'vitest';
import { buildPublicSample, exportPublicPlan, REVIEW_CHECKS } from '../publicItineraryExport.mjs';
import { buildTripMapModel } from '../itineraryMapStops';
import { verifiedTransferLabel } from '../tripPresentation';

const location = { lat: 44.46, lon: -110.82, source: 'trailverse_catalog', authority: 'official_owner', status: 'resolved', sourceRef: 'https://www.nps.gov/yell/', sourceEntity: 'nps:place:geyser' };
const plan = {
  userId: 'PRIVATE', itineraryHash: 'PRIVATE', parkName: 'Yellowstone National Park', parkCode: 'yell',
  tripGuidance: [{ text: 'Check road conditions.', source: 'https://www.nps.gov/yell/', diagnostics: 'PRIVATE' }],
  days: [{ dayNumber: 1, label: 'Geyser basins', overnightLocation: 'Old Faithful',
    stops: [{ id: 'stop-a', name: 'Old Faithful', type: 'viewpoint', canonicalPlaceId: 'nps:place:geyser', location: { ...location, userId: 'PRIVATE' }, requirements: [{ title: 'Boardwalks', requirement: 'Stay on the boardwalk.', telemetry: 'PRIVATE' }] },
      { id: 'stop-b', name: 'Geyser basin', type: 'viewpoint', canonicalPlaceId: 'nps:place:geyser', location }],
    travelEdges: [{ sourceStopId: 'stop-a', targetStopId: 'stop-b', status: 'verified', durationSeconds: 600, travelMode: 'walking', source: { provider: 'google_maps', evidenceId: 'route', token: 'PRIVATE' }, operationalAccess: { status: 'allowed', sources: ['https://www.nps.gov/yell/'], diagnostic: 'PRIVATE' } }],
  }],
};
const concept = { slug: 'yellowstone-test', title: 'Yellowstone', prompt: 'Plan Yellowstone', days: 1, tags: ['Geysers'] };
const capture = { plan, saved: true, tripId: 'PRIVATE', itineraryHash: 'hash', prompt: concept.prompt, response: 'Here is your trip.', mapCoverage: { mapped: 2, missing: 0 }, images: [{ url: 'https://www.nps.gov/image.jpg', alt: 'Geyser', verified: true }] };
const review = { itineraryHash: 'hash', description: 'A day among geysers.', checks: Object.fromEntries(REVIEW_CHECKS.map(key => [key, true])) };

describe('public itinerary export boundary', () => {
  it('preserves an experience and its separately supported map anchor', () => {
    const input = structuredClone(plan);
    Object.assign(input.days[0].stops[0], { name: 'River Trail', canonicalPlaceName: 'River Trailhead',
      experience: { id: 'nps:experience:river', name: 'River Trail', userId: 'PRIVATE' },
      mapAnchor: { canonicalPlaceId: 'nps:place:geyser', name: 'River Trailhead', relationship: 'trailhead_for', sourceUrl: 'https://www.nps.gov/places/access.htm', debug: 'PRIVATE' } });
    const output = exportPublicPlan(input);
    expect(output.days[0].stops[0].experience).toEqual({ id: 'nps:experience:river', name: 'River Trail' });
    expect(output.days[0].stops[0].mapAnchor.name).toBe('River Trailhead');
    expect(JSON.stringify(output)).not.toContain('PRIVATE');
    const mapped = buildTripMapModel(output).days[0].stops[0];
    expect(mapped.name).toBe('River Trail');
    expect(mapped.mapAnchor.name).toBe('River Trailhead');
    expect(mapped.mapped).toBe(true);
  });
  it('strips private nested fields while preserving map pins, route labels and requirements', () => {
    const before = JSON.stringify(plan);
    const exported = exportPublicPlan(plan);
    expect(JSON.stringify(exported)).not.toContain('PRIVATE');
    expect(JSON.stringify(plan)).toBe(before);
    const coordinates = value => buildTripMapModel(value).days.flatMap(day => day.stops.map(stop => [stop.id, stop.mapped, stop.latitude, stop.longitude]));
    expect(coordinates(exported)).toEqual(coordinates(plan));
    expect(verifiedTransferLabel(exported.days[0].travelEdges[0])).toBe(verifiedTransferLabel(plan.days[0].travelEdges[0]));
    expect(exported.days[0].stops[0].requirements[0].requirement).toBe('Stay on the boardwalk.');
    expect(exported.tripGuidance[0].text).toBe('Check road conditions.');
    expect(exported.days[0].travelEdges[0].source.evidenceId).toMatch(/^public-evidence-/);
  });
  it('rejects HTTP-success captures without saved identity, hash, mapping or review', () => {
    for (const change of [{ saved: false }, { sourceResponseId: 'new-response', plan: { ...plan, responseId: 'older-response' } }, { response: 'Your saved trip remains unchanged.' }, { itineraryHash: null }, { mapCoverage: { mapped: 1, missing: 1 } }, { images: [] }, { response: 'This partial itinerary has central stops outside the saved trip.' }]) {
      expect(() => buildPublicSample({ ...capture, ...change }, concept, review)).toThrow();
    }
    expect(() => buildPublicSample(capture, concept, { ...review, checks: {} })).toThrow('Review required');
    expect(() => buildPublicSample(capture, concept, { ...review, itineraryHash: 'different' })).toThrow('Review does not match');
  });
  it('exports only the reviewed traveler-facing sample without capture identifiers', () => {
    const sample = buildPublicSample(capture, concept, review);
    expect(sample.response).toBe(capture.response);
    expect(sample.slug).toBe(concept.slug);
    expect(sample.images[0]).not.toHaveProperty('verified');
    expect(JSON.stringify(sample)).not.toMatch(/PRIVATE|itineraryHash|tripId|checks|latencyMs/);
  });
});
