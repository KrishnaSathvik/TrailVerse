import { describe, expect, it } from 'vitest';
import { groundedPlaceType, verifiedTransferLabel, withTripRefinements, tripTitle } from '../tripPresentation';
import { buildTripMapModel } from '../itineraryMapStops';
import { assertNoInternalFields } from '../trailieDemoCapture';
import playback from '@/data/trailieDemoPlayback.json';

describe('canonical trip presentation', () => {
  it('requires actual provenance and a known mode before showing duration', () => {
    const edge = { status: 'verified', travelMode: 'driving', durationSeconds: 1440, source: { evidenceId: 'route', provider: 'google_maps' } };
    expect(verifiedTransferLabel(edge)).toBe('24 min by road');
    expect(verifiedTransferLabel({ ...edge, source: null })).toBeNull();
    expect(verifiedTransferLabel({ ...edge, status: 'unverified' })).toBeNull();
    expect(verifiedTransferLabel({ ...edge, durationSeconds: null })).toBeNull();
  });
  it('never infers semantic type from model prose or the legacy custom type', () => {
    expect(groundedPlaceType({ type: 'custom', name: 'A waterfall', note: 'A lovely lake' })).toBeNull();
    expect(groundedPlaceType({ type: 'custom', source: 'user' })).toBe('Custom');
    expect(groundedPlaceType({ canonicalPlaceId: 'nps:place:a', location: { status: 'resolved' }, placeTypes: ['visitor_center'] })).toBe('Visitor center');
  });
  it('uses the destination instead of the old placeholder title', () => {
    expect(tripTitle({ parkName: 'Glacier National Park' }, 'New Trip Plan')).toBe('Glacier National Park');
    expect(tripTitle({}, 'New Trip Plan')).toBe('Your trip');
  });
  it('derives a Day 3 update across the recorded prose-only follow-up without mutating recordings', () => {
    const original = playback.scenarios.find(s => s.id === 'glacier').turns;
    const before = JSON.stringify(original);
    const turns = withTripRefinements(original);
    expect(turns[0].refinement.isRefinement).toBe(false);
    expect(turns[2].refinement).toMatchObject({ isRefinement: true, changedDayNumbers: [3] });
    expect(JSON.stringify(original)).toBe(before);
  });
  it('retains exact canonical identity and coordinates for all captured map pins', () => {
    let pins = 0;
    for (const scenario of playback.scenarios) for (const turn of scenario.turns) {
      if (!turn.plan) continue;
      const map = buildTripMapModel(turn.plan);
      map.days.forEach((day, i) => day.stops.filter(stop => stop.mapped).forEach(stop => {
        const canonical = turn.plan.days[i].stops.find(s => s.id === stop.id);
        expect(stop.canonicalPlaceId).toBe(canonical.canonicalPlaceId);
        expect(stop.latitude).toBe(canonical.location.lat);
        expect(stop.longitude).toBe(canonical.location.lon);
        expect(stop.pinNumber).toBe(turn.plan.days[i].stops.indexOf(canonical) + 1);
        pins += 1;
      }));
    }
    expect(pins).toBeGreaterThan(30);
    expect(assertNoInternalFields(playback)).toEqual([]);
  });
  it('keeps a recorded stop but rejects park-level placeholder coordinates', () => {
    const plan = structuredClone(playback.scenarios.find(s => s.id === 'yellowstone').turns[0].plan);
    const stop = plan.days[0].stops.find(s => s.canonicalPlaceId);
    stop.location = { ...stop.location, lat: 0, lon: 0, sourceEntity: 'nps:park:yell' };
    expect(buildTripMapModel(plan).days[0].stops.find(s => s.id === stop.id).mapped).toBe(false);
  });
  it('allows only public map-provider provenance, never a model provider', () => {
    expect(assertNoInternalFields({ provider: 'google_maps' })).toEqual(['$.provider']);
    expect(assertNoInternalFields({ travelEdges: [{ source: { provider: 'openai' } }] })).toHaveLength(1);
  });
});
